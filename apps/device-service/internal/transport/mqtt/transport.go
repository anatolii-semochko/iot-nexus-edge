// Package mqtt implements the NexusEdge PhysicalTransport interface over
// MQTT, for network nodes (WiFi/Ethernet) - the second transport after CAN
// (AGENTS.md section 79). It holds one shared connection to the device
// broker (NOT EdgeX's own internal message-bus broker), keeps the latest
// `state` payload of every device it sees, and publishes writes to the
// device's `set` topic. Physical/virtual switching and simulation stay in
// internal/driver, untouched - an MQTT device is just another physical
// backend.
package mqtt

import (
	"fmt"
	"net/http"
	"sync"
	"time"

	paho "github.com/eclipse/paho.mqtt.golang"
	"github.com/edgexfoundry/go-mod-core-contracts/v4/clients/logger"
	"github.com/edgexfoundry/go-mod-core-contracts/v4/models"

	sdkModels "github.com/edgexfoundry/device-sdk-go/v4/pkg/models"

	"github.com/anatolii-semochko/iot-nexus-edge/apps/device-service/internal/transport"
)

const (
	// qos 1 (at least once) for both directions: a state/set payload is a
	// whole value, so a rare duplicate delivery is harmless, a lost one is not.
	qos = 1
	// publishTimeout bounds how long a write waits for the broker's ack.
	publishTimeout = 5 * time.Second
)

// binding is the EdgeX device a state topic's pushes are delivered as
// (see Bind, AGENTS.md section 80).
type binding struct {
	deviceName   string
	resourceName string
	valueType    string
	// mediaExt is set for a media resource (media.go): the payload is a
	// file to upload, and the device's value is the returned Media Store id.
	mediaExt string
}

// sample is the latest payload received on one device's state topic.
type sample struct {
	payload    []byte
	receivedAt time.Time
}

// Transport is the MQTT implementation of transport.PhysicalTransport.
type Transport struct {
	lc     logger.LoggingClient
	cfg    serviceConfig
	client paho.Client
	http   *http.Client

	mu       sync.RWMutex
	latest   map[string]sample  // state topic -> latest payload
	bindings map[string]binding // state topic -> EdgeX device it pushes as
	topics   map[string]string  // EdgeX device name -> its state topic
	sink     func(*sdkModels.AsyncValues)
}

var _ transport.Pusher = (*Transport)(nil)

// New creates the MQTT Transport and starts connecting to the device broker
// in the background. The connection retries on its own (paho's
// ConnectRetry/AutoReconnect), so a broker that starts after this service,
// or restarts later, never needs this service restarted - reads simply
// report "no data received yet" until the first state payload arrives.
func New(lc logger.LoggingClient) (*Transport, error) {
	cfg, err := serviceConfigFromEnv()
	if err != nil {
		return nil, err
	}
	t := &Transport{
		lc:       lc,
		cfg:      cfg,
		http:     &http.Client{},
		latest:   make(map[string]sample),
		bindings: make(map[string]binding),
		topics:   make(map[string]string),
	}

	opts := paho.NewClientOptions().
		AddBroker(cfg.BrokerURL).
		SetClientID(cfg.ClientID).
		SetCleanSession(true).
		SetConnectRetry(true).
		SetAutoReconnect(true).
		SetOrderMatters(false).
		// Subscribing in OnConnect (not once after the first connect)
		// restores the subscription after every reconnect, since a clean
		// session drops it broker-side.
		SetOnConnectHandler(t.onConnect).
		SetConnectionLostHandler(func(_ paho.Client, err error) {
			lc.Warnf("MQTT transport: connection to %s lost: %s", cfg.BrokerURL, err.Error())
		})
	t.client = paho.NewClient(opts)
	t.client.Connect() // non-blocking with ConnectRetry; onConnect fires once up
	return t, nil
}

func (t *Transport) onConnect(c paho.Client) {
	t.lc.Infof("MQTT transport: connected to %s", t.cfg.BrokerURL)
	topic := stateSubscription(t.cfg.TopicRoot)
	token := c.Subscribe(topic, qos, t.onState)
	go func() {
		if token.Wait() && token.Error() != nil {
			t.lc.Errorf("MQTT transport: subscribing to %s: %s", topic, token.Error().Error())
		}
	}()
}

// onState caches every state payload (for Read) and, for a topic bound to
// an EdgeX device, pushes it on as an async reading straight away - so two
// changes inside one orchestrator tick both arrive, instead of a poll
// seeing only the last one (AGENTS.md section 80). A retained payload
// re-delivered on (re)subscribe is pushed too - the Device API treats it
// like any other reading.
func (t *Transport) onState(_ paho.Client, msg paho.Message) {
	payload := append([]byte(nil), msg.Payload()...)
	receivedAt := time.Now()

	t.mu.RLock()
	b, bound := t.bindings[msg.Topic()]
	t.mu.RUnlock()

	if bound && b.mediaExt != "" {
		t.onMedia(msg, b, payload, receivedAt)
		return
	}

	t.mu.Lock()
	t.latest[msg.Topic()] = sample{payload: payload, receivedAt: receivedAt}
	sink := t.sink
	t.mu.Unlock()

	if !bound || sink == nil || len(payload) == 0 {
		// Empty = a retained message being cleared, not a value.
		return
	}
	t.push(msg.Topic(), b, payload, receivedAt, sink)
}

// onMedia handles a media device's payload: upload it, then cache and push
// the Media Store id as the device's value. A retained media payload is
// ignored - it is a frame already uploaded in an earlier session, and
// re-uploading it on every reconnect would duplicate it (media nodes should
// not publish retained at all).
func (t *Transport) onMedia(msg paho.Message, b binding, payload []byte, receivedAt time.Time) {
	if msg.Retained() || len(payload) == 0 {
		return
	}
	mediaID, err := t.uploadMedia(b.deviceName, b.mediaExt, payload)
	if err != nil {
		t.lc.Errorf("MQTT transport: media from %s dropped (%d bytes): %s", msg.Topic(), len(payload), err.Error())
		return
	}
	value := []byte(mediaID)

	t.mu.Lock()
	t.latest[msg.Topic()] = sample{payload: value, receivedAt: receivedAt}
	sink := t.sink
	t.mu.Unlock()

	if sink != nil {
		t.push(msg.Topic(), b, value, receivedAt, sink)
	}
}

// push forwards one value of a bound device to the SDK as an async reading.
func (t *Transport) push(topic string, b binding, payload []byte, receivedAt time.Time, sink func(*sdkModels.AsyncValues)) {
	value, err := decodePayload(b.valueType, payload)
	if err != nil {
		t.lc.Warnf("MQTT transport: push from %s dropped: %s", topic, err.Error())
		return
	}
	cv, err := sdkModels.NewCommandValueWithOrigin(b.resourceName, b.valueType, value, receivedAt.UnixNano())
	if err != nil {
		t.lc.Warnf("MQTT transport: push from %s dropped: %s", topic, err.Error())
		return
	}
	cv.Tags[transport.PushTag] = "true"
	sink(&sdkModels.AsyncValues{DeviceName: b.deviceName, SourceName: b.resourceName, CommandValues: []*sdkModels.CommandValue{cv}})
}

// Bind implements transport.Pusher.
func (t *Transport) Bind(deviceName string, props models.ProtocolProperties, resourceName, valueType string, attributes map[string]any) error {
	dev, err := deviceConfigFrom(deviceName, props)
	if err != nil {
		return err
	}
	mediaExt, err := mediaExtensionFrom(attributes)
	if err != nil {
		return err
	}
	topic := deviceTopic(t.cfg.TopicRoot, dev, suffixState)

	t.mu.Lock()
	defer t.mu.Unlock()
	if old, ok := t.topics[deviceName]; ok && old != topic {
		delete(t.bindings, old)
	}
	if other, ok := t.bindings[topic]; ok && other.deviceName != deviceName {
		return fmt.Errorf("MQTT topic %s is already bound to device %s", topic, other.deviceName)
	}
	t.bindings[topic] = binding{deviceName: deviceName, resourceName: resourceName, valueType: valueType, mediaExt: mediaExt}
	t.topics[deviceName] = topic
	if mediaExt != "" {
		// A raw frame cached before this binding existed (e.g. a retained
		// one delivered on subscribe, ahead of Start's binding pass) must
		// never be served by Read as if it were the device's text value.
		delete(t.latest, topic)
	}
	return nil
}

// Unbind implements transport.Pusher.
func (t *Transport) Unbind(deviceName string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if topic, ok := t.topics[deviceName]; ok {
		delete(t.bindings, topic)
		delete(t.topics, deviceName)
	}
}

// SetPushSink implements transport.Pusher.
func (t *Transport) SetPushSink(sink func(*sdkModels.AsyncValues)) {
	t.mu.Lock()
	t.sink = sink
	t.mu.Unlock()
}

// Name implements transport.PhysicalTransport.
func (t *Transport) Name() string {
	return "mqtt"
}

// Read implements transport.PhysicalTransport: the latest value the device
// published on its state topic, with that payload's receipt time as origin
// (same staleness contract as the CAN transport - a device that stopped
// publishing must read as old, not freshly read).
func (t *Transport) Read(deviceName string, props models.ProtocolProperties, reqs []sdkModels.CommandRequest) ([]*sdkModels.CommandValue, error) {
	dev, err := deviceConfigFrom(deviceName, props)
	if err != nil {
		return nil, err
	}
	topic := deviceTopic(t.cfg.TopicRoot, dev, suffixState)

	t.mu.RLock()
	s, ok := t.latest[topic]
	t.mu.RUnlock()

	results := make([]*sdkModels.CommandValue, 0, len(reqs))
	for _, req := range reqs {
		if !ok {
			return nil, fmt.Errorf("resource %s: no data received yet on %s", req.DeviceResourceName, topic)
		}
		value, err := decodePayload(req.Type, s.payload)
		if err != nil {
			return nil, fmt.Errorf("resource %s: %w", req.DeviceResourceName, err)
		}
		cv, err := sdkModels.NewCommandValueWithOrigin(req.DeviceResourceName, req.Type, value, s.receivedAt.UnixNano())
		if err != nil {
			return nil, fmt.Errorf("resource %s: %w", req.DeviceResourceName, err)
		}
		results = append(results, cv)
	}
	return results, nil
}

// Write implements transport.PhysicalTransport: publishes the value to the
// device's set topic, not retained - the orchestrator re-asserts outputs
// every tick anyway, and a retained command could re-apply a stale value
// to a device reconnecting much later.
func (t *Transport) Write(deviceName string, props models.ProtocolProperties, reqs []sdkModels.CommandRequest, params []*sdkModels.CommandValue) error {
	dev, err := deviceConfigFrom(deviceName, props)
	if err != nil {
		return err
	}
	if !t.client.IsConnectionOpen() {
		return fmt.Errorf("MQTT transport: not connected to %s", t.cfg.BrokerURL)
	}
	topic := deviceTopic(t.cfg.TopicRoot, dev, suffixSet)

	for i, req := range reqs {
		payload, err := encodePayload(req.Type, params[i].Value)
		if err != nil {
			return fmt.Errorf("resource %s: %w", req.DeviceResourceName, err)
		}
		token := t.client.Publish(topic, qos, false, payload)
		if !token.WaitTimeout(publishTimeout) {
			return fmt.Errorf("resource %s: publish to %s timed out", req.DeviceResourceName, topic)
		}
		if err := token.Error(); err != nil {
			return fmt.Errorf("resource %s: publish to %s: %w", req.DeviceResourceName, topic, err)
		}
	}
	return nil
}

// Close implements transport.PhysicalTransport.
func (t *Transport) Close() error {
	t.client.Disconnect(250)
	return nil
}
