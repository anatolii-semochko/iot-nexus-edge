package mqtt

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/edgexfoundry/go-mod-core-contracts/v4/models"
)

// Environment variables configuring the one broker connection this
// transport shares across every MQTT-bound device (AGENTS.md section 79).
// Values come from the project's own .env via docker-compose - nothing is
// hardcoded here beyond the variable names themselves.
const (
	// envBrokerURL is the device broker's URL, e.g.
	// "tcp://device-mqtt-broker:1883". Unset = transport not registered at
	// all (see Enabled), so a stack without a device broker behaves exactly
	// as before.
	envBrokerURL = "DEVICE_MQTT_BROKER_URL"
	// envTopicRoot is the first topic level every device topic lives under.
	envTopicRoot = "DEVICE_MQTT_TOPIC_ROOT"
	// envClientID is this service's own MQTT client id on the device broker.
	envClientID = "DEVICE_MQTT_CLIENT_ID"
	// envMediaUploadURL is the Devices API's internal media upload route
	// base, e.g. "http://api:3001/media/edgex" (AGENTS.md section 81).
	// Unset = media devices' payloads are dropped with a warning.
	envMediaUploadURL = "DEVICE_MEDIA_UPLOAD_URL"
	// envMediaUploadTimeout bounds one media upload, in seconds.
	envMediaUploadTimeout = "DEVICE_MEDIA_UPLOAD_TIMEOUT_SECONDS"
	// envServiceAPIToken is the internal services' token the Devices API
	// accepts instead of a user's session (header X-Service-Token).
	envServiceAPIToken = "SERVICE_API_TOKEN"
)

// serviceConfig is the broker connection this transport shares across
// every device bound to it.
type serviceConfig struct {
	BrokerURL string
	TopicRoot string
	ClientID  string

	MediaUploadURL     string
	MediaUploadTimeout time.Duration
	ServiceAPIToken    string
}

// Enabled reports whether a device broker is configured for this service.
// driver.Initialize registers the MQTT transport only when it is.
func Enabled() bool {
	return strings.TrimSpace(os.Getenv(envBrokerURL)) != ""
}

func serviceConfigFromEnv() (serviceConfig, error) {
	cfg := serviceConfig{
		BrokerURL: strings.TrimSpace(os.Getenv(envBrokerURL)),
		TopicRoot: strings.Trim(strings.TrimSpace(os.Getenv(envTopicRoot)), "/"),
		ClientID:  strings.TrimSpace(os.Getenv(envClientID)),
	}
	for name, value := range map[string]string{envBrokerURL: cfg.BrokerURL, envTopicRoot: cfg.TopicRoot, envClientID: cfg.ClientID} {
		if value == "" {
			return serviceConfig{}, fmt.Errorf("MQTT transport requires %s to be set", name)
		}
	}
	cfg.MediaUploadURL = strings.TrimRight(strings.TrimSpace(os.Getenv(envMediaUploadURL)), "/")
	cfg.ServiceAPIToken = strings.TrimSpace(os.Getenv(envServiceAPIToken))
	cfg.MediaUploadTimeout = 30 * time.Second
	if raw := strings.TrimSpace(os.Getenv(envMediaUploadTimeout)); raw != "" {
		seconds, err := strconv.Atoi(raw)
		if err != nil || seconds <= 0 {
			return serviceConfig{}, fmt.Errorf("%s must be a positive integer, got %q", envMediaUploadTimeout, raw)
		}
		cfg.MediaUploadTimeout = time.Duration(seconds) * time.Second
	}
	return cfg, nil
}

// deviceConfig is one device's MQTT-specific transport properties -
// `protocols.transport` for a device whose `transport.type` is "mqtt":
//
//	transport:
//	  type: "mqtt"
//	  node: "ai-camera-01"      # required - the node's own topic segment
//	  device: "image-caster"    # optional - defaults to the EdgeX device name
//
// Every NexusEdge device is atomic (exactly one resource, one value), so
// topics are per device, not per resource: see topics.go.
type deviceConfig struct {
	Node   string
	Device string
}

func deviceConfigFrom(deviceName string, props models.ProtocolProperties) (deviceConfig, error) {
	node := strings.TrimSpace(fmt.Sprintf("%v", props["node"]))
	if props["node"] == nil || node == "" {
		return deviceConfig{}, fmt.Errorf("MQTT transport is missing required %q property", "node")
	}
	device := deviceName
	if raw, ok := props["device"]; ok && raw != nil {
		if s := strings.TrimSpace(fmt.Sprintf("%v", raw)); s != "" {
			device = s
		}
	}
	for label, segment := range map[string]string{"node": node, "device": device} {
		if strings.ContainsAny(segment, "/+#") {
			return deviceConfig{}, fmt.Errorf("MQTT %s %q must not contain '/', '+' or '#'", label, segment)
		}
	}
	return deviceConfig{Node: node, Device: device}, nil
}
