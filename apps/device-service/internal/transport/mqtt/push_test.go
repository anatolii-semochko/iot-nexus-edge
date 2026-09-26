package mqtt

import (
	"testing"

	"github.com/edgexfoundry/go-mod-core-contracts/v4/clients/logger"
	"github.com/edgexfoundry/go-mod-core-contracts/v4/common"
	"github.com/edgexfoundry/go-mod-core-contracts/v4/models"

	sdkModels "github.com/edgexfoundry/device-sdk-go/v4/pkg/models"

	"github.com/anatolii-semochko/iot-nexus-edge/apps/device-service/internal/transport"
)

// fakeMessage is the minimal paho.Message onState reads.
type fakeMessage struct {
	topic    string
	payload  []byte
	retained bool
}

func (m fakeMessage) Duplicate() bool   { return false }
func (m fakeMessage) Qos() byte         { return qos }
func (m fakeMessage) Retained() bool    { return m.retained }
func (m fakeMessage) Topic() string     { return m.topic }
func (m fakeMessage) MessageID() uint16 { return 0 }
func (m fakeMessage) Payload() []byte   { return m.payload }
func (m fakeMessage) Ack()              {}

func newTestTransport() *Transport {
	return &Transport{
		lc:       logger.NewMockClient(),
		cfg:      serviceConfig{TopicRoot: "nexus"},
		latest:   make(map[string]sample),
		bindings: make(map[string]binding),
		topics:   make(map[string]string),
	}
}

func TestPushBoundState(t *testing.T) {
	tr := newTestTransport()
	var got []*sdkModels.AsyncValues
	tr.SetPushSink(func(v *sdkModels.AsyncValues) { got = append(got, v) })

	props := models.ProtocolProperties{"type": "mqtt", "node": "bench"}
	if err := tr.Bind("probe-button", props, "Button", common.ValueTypeBool, nil); err != nil {
		t.Fatal(err)
	}

	// Two pushes in quick succession - both must arrive, not just the last.
	tr.onState(nil, fakeMessage{topic: "nexus/bench/probe-button/state", payload: []byte("true")})
	tr.onState(nil, fakeMessage{topic: "nexus/bench/probe-button/state", payload: []byte("false")})
	if len(got) != 2 {
		t.Fatalf("want 2 pushes, got %d", len(got))
	}
	cv := got[0].CommandValues[0]
	if got[0].DeviceName != "probe-button" || got[0].SourceName != "Button" || cv.Value != true {
		t.Fatalf("unexpected push %+v / %+v", got[0], cv)
	}
	if cv.Tags[transport.PushTag] != "true" {
		t.Fatalf("push must carry the %s tag", transport.PushTag)
	}

	// Unbound topics, invalid payloads and cleared retained messages push nothing.
	tr.onState(nil, fakeMessage{topic: "nexus/bench/other/state", payload: []byte("true")})
	tr.onState(nil, fakeMessage{topic: "nexus/bench/probe-button/state", payload: []byte("maybe")})
	tr.onState(nil, fakeMessage{topic: "nexus/bench/probe-button/state", payload: nil})
	tr.Unbind("probe-button")
	tr.onState(nil, fakeMessage{topic: "nexus/bench/probe-button/state", payload: []byte("true")})
	if len(got) != 2 {
		t.Fatalf("want no further pushes, got %d total", len(got))
	}

	// Read keeps working from the cache regardless of binding.
	if _, ok := tr.latest["nexus/bench/probe-button/state"]; !ok {
		t.Fatal("state must still be cached for Read")
	}
}

func TestBindRejectsSharedTopic(t *testing.T) {
	tr := newTestTransport()
	props := models.ProtocolProperties{"type": "mqtt", "node": "bench", "device": "same"}
	if err := tr.Bind("a", props, "X", common.ValueTypeBool, nil); err != nil {
		t.Fatal(err)
	}
	if err := tr.Bind("b", props, "X", common.ValueTypeBool, nil); err == nil {
		t.Fatal("two devices on one state topic must be rejected")
	}
	// Re-binding the same device to a new topic releases the old one.
	if err := tr.Bind("a", models.ProtocolProperties{"type": "mqtt", "node": "bench", "device": "moved"}, "X", common.ValueTypeBool, nil); err != nil {
		t.Fatal(err)
	}
	if err := tr.Bind("b", props, "X", common.ValueTypeBool, nil); err != nil {
		t.Fatalf("old topic should be free after re-bind: %v", err)
	}
}
