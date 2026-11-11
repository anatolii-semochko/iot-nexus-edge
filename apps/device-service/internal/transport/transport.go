// Package transport defines the boundary every physical bus/protocol
// backend must implement. CAN (package transport/can) and MQTT (package
// transport/mqtt) implement it today; RS485, Modbus etc. are meant to
// satisfy the same interface later without touching internal/driver.
package transport

import (
	"github.com/edgexfoundry/go-mod-core-contracts/v4/models"

	sdkModels "github.com/edgexfoundry/device-sdk-go/v4/pkg/models"
)

// PhysicalTransport is one physical bus/protocol a device can be bound to.
// A device names which transport serves it via its `transport.type`
// protocol property (see internal/driver/backend.go); the remaining
// properties in that same block (e.g. CAN's `bus`) are opaque to the driver
// core and interpreted only by the matching PhysicalTransport - each
// transport owns its own resource-to-wire addressing scheme (CAN:
// arbitration ID + byte offset; Modbus: register address; MQTT: topic;
// ...), which cannot be meaningfully unified beyond this Read/Write
// boundary.
type PhysicalTransport interface {
	// Name is the `transport.type` value that selects this transport,
	// e.g. "can".
	Name() string

	// Read and Write serve one device's commands. props is the device's
	// `transport` protocol properties block.
	Read(deviceName string, props models.ProtocolProperties, reqs []sdkModels.CommandRequest) ([]*sdkModels.CommandValue, error)
	Write(deviceName string, props models.ProtocolProperties, reqs []sdkModels.CommandRequest, params []*sdkModels.CommandValue) error

	// Close releases any resources (e.g. open bus connections) shared
	// across every device bound to this transport.
	Close() error
}

// PushTag is the EdgeX event tag every pushed (not polled) reading carries,
// so the Device API's EdgeX-bus bridge (AGENTS.md section 80) can tell a
// device's own push apart from the events EdgeX also emits for every
// ordinary core-command read/write - those already reach the Device API
// through its own read path and must not be processed twice.
const PushTag = "nexusPush"

// Pusher is implemented by a transport whose devices publish values on
// their own (MQTT today), rather than only answering Read. The driver
// keeps each transport's bindings in step with EdgeX's device list, and
// hands it a sink that forwards pushed values to the SDK as async readings
// (AGENTS.md section 80).
type Pusher interface {
	// Bind (re)associates an EdgeX device with its transport properties and
	// the one resource its pushes map to (every NexusEdge device is atomic),
	// including that resource's profile attributes (transport-specific
	// options, e.g. MQTT's `mqttPayload: media`).
	Bind(deviceName string, props models.ProtocolProperties, resourceName, valueType string, attributes map[string]any) error
	// Unbind forgets a device - removed, or no longer physical on this transport.
	Unbind(deviceName string)
	// SetPushSink sets where pushed values go. Called once, before any Bind.
	SetPushSink(sink func(*sdkModels.AsyncValues))
}
