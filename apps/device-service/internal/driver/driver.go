// Package driver implements the EdgeX ProtocolDriver interface for the
// NexusEdge device-service. It does not, itself, know how to talk to any
// specific kind of device; per device it dispatches read/write commands to
// one of two backends (see backend.go):
//
//   - modePhysical: whichever PhysicalTransport (see internal/transport) is
//     named by the device's `transport.type` protocol property: CAN
//     (internal/transport/can) always, MQTT (internal/transport/mqtt) when
//     a device broker is configured.
//   - modeVirtual: the generic Virtual Node Runtime (package virtual).
//
// See AGENTS.md section 6 for why the physical/virtual switch lives here
// rather than in EdgeX itself, and why it is config-time only (no live UI
// hot-swap).
package driver

import (
	"fmt"

	"github.com/edgexfoundry/go-mod-core-contracts/v4/clients/logger"
	"github.com/edgexfoundry/go-mod-core-contracts/v4/models"

	"github.com/edgexfoundry/device-sdk-go/v4/pkg/interfaces"
	sdkModels "github.com/edgexfoundry/device-sdk-go/v4/pkg/models"

	"github.com/anatolii-semochko/iot-nexus-edge/apps/device-service/internal/transport"
	"github.com/anatolii-semochko/iot-nexus-edge/apps/device-service/internal/transport/can"
	"github.com/anatolii-semochko/iot-nexus-edge/apps/device-service/internal/transport/mqtt"
	"github.com/anatolii-semochko/iot-nexus-edge/apps/device-service/internal/virtual"
)

// NexusDriver is the NexusEdge ProtocolDriver implementation.
type NexusDriver struct {
	lc  logger.LoggingClient
	sdk interfaces.DeviceServiceSDK

	virtual *virtual.Runtime

	// transports is populated once, in Initialize, and read-only
	// afterwards - no locking needed for lookups.
	transports map[string]transport.PhysicalTransport
}

// New creates a NexusDriver. Actual initialization happens in Initialize,
// once the SDK hands over a DeviceServiceSDK instance.
func New() *NexusDriver {
	return &NexusDriver{virtual: virtual.NewRuntime()}
}

// Initialize performs protocol-specific initialization for the device
// service, including registering every known PhysicalTransport.
func (d *NexusDriver) Initialize(sdk interfaces.DeviceServiceSDK) error {
	d.lc = sdk.LoggingClient()
	d.sdk = sdk

	canTransport := can.New(d.lc)
	d.transports = map[string]transport.PhysicalTransport{
		canTransport.Name(): canTransport,
	}

	// MQTT (network nodes, AGENTS.md section 79) only when a device broker
	// is configured - a stack without one keeps behaving exactly as before,
	// and an mqtt-bound device then fails validation with "unknown
	// transport" instead of hanging on a broker that doesn't exist.
	if mqtt.Enabled() {
		mqttTransport, err := mqtt.New(d.lc)
		if err != nil {
			return err
		}
		d.transports[mqttTransport.Name()] = mqttTransport
	}

	// Pushed values become EdgeX async readings (AGENTS.md section 80).
	// Without async readings enabled the SDK never creates the channel -
	// pushes are then simply not forwarded (Read still works), instead of
	// blocking forever on a nil channel.
	if sdk.AsyncReadingsEnabled() {
		ch := sdk.AsyncValuesChannel()
		for _, t := range d.transports {
			if p, ok := t.(transport.Pusher); ok {
				p.SetPushSink(func(v *sdkModels.AsyncValues) { ch <- v })
			}
		}
	} else {
		d.lc.Warn("async readings disabled (Device.EnableAsyncReadings) - device pushes will not be forwarded")
	}
	return nil
}

// syncPushBinding keeps every push-capable transport's bindings in step
// with one EdgeX device: bound on the transport it is physically on (with
// its profile's single resource), unbound everywhere else - so a device
// switched to virtual, or to another transport, stops pushing.
func (d *NexusDriver) syncPushBinding(deviceName string, protocols map[string]models.ProtocolProperties, profileName string) {
	b, err := backendFor(protocols)
	for name, t := range d.transports {
		p, ok := t.(transport.Pusher)
		if !ok {
			continue
		}
		if err != nil || b.Mode != modePhysical || b.TransportName != name {
			p.Unbind(deviceName)
			continue
		}
		profile, perr := d.sdk.GetProfileByName(profileName)
		if perr != nil {
			d.lc.Errorf("device %s: push binding skipped, profile %s: %s", deviceName, profileName, perr.Error())
			continue
		}
		if len(profile.DeviceResources) != 1 {
			d.lc.Errorf("device %s: push binding skipped, profile %s has %d resources (a NexusEdge device is atomic - exactly one)",
				deviceName, profileName, len(profile.DeviceResources))
			continue
		}
		res := profile.DeviceResources[0]
		if berr := p.Bind(deviceName, protocols[protocolTransport], res.Name, res.Properties.ValueType, res.Attributes); berr != nil {
			d.lc.Errorf("device %s: push binding: %s", deviceName, berr.Error())
		}
	}
}

// syncPushBindingByName resolves a device's profile from the SDK's own
// cache - the Add/UpdateDevice callbacks only hand over its protocols.
func (d *NexusDriver) syncPushBindingByName(deviceName string, protocols map[string]models.ProtocolProperties) {
	dev, err := d.sdk.GetDeviceByName(deviceName)
	if err != nil {
		d.lc.Errorf("device %s: push binding skipped: %s", deviceName, err.Error())
		return
	}
	d.syncPushBinding(deviceName, protocols, dev.ProfileName)
}

// Start runs after the SDK is fully initialized. Bus connections are
// opened lazily by each transport; the only work here is binding every
// already-known device for push - AddDevice only fires for devices new to
// EdgeX metadata this run, not ones that existed before.
func (d *NexusDriver) Start() error {
	for _, dev := range d.sdk.Devices() {
		d.syncPushBinding(dev.Name, dev.Protocols, dev.ProfileName)
	}
	return nil
}

// Stop closes every registered transport.
func (d *NexusDriver) Stop(force bool) error {
	for name, t := range d.transports {
		if err := t.Close(); err != nil {
			d.lc.Errorf("closing transport %s: %s", name, err.Error())
		}
	}
	return nil
}

// AddDevice is invoked when a new device bound to this service is added.
func (d *NexusDriver) AddDevice(deviceName string, protocols map[string]models.ProtocolProperties, adminState models.AdminState) error {
	b, err := backendFor(protocols)
	if err != nil {
		return fmt.Errorf("device %s: %w", deviceName, err)
	}

	defer d.syncPushBindingByName(deviceName, protocols)

	if b.Mode == modeVirtual {
		d.virtual.EnsureDefault(deviceName, virtualSeedFrom(protocols))
		return nil
	}

	_, err = d.transportFor(b.TransportName)
	if err != nil {
		return fmt.Errorf("device %s: %w", deviceName, err)
	}
	return nil
}

// UpdateDevice is invoked when a device bound to this service is updated.
// Since the physical/virtual backend and transport are config-time only
// (see AGENTS.md section 6), this simply re-validates exactly as AddDevice
// does; it never migrates in-flight state between backends.
func (d *NexusDriver) UpdateDevice(deviceName string, protocols map[string]models.ProtocolProperties, adminState models.AdminState) error {
	return d.AddDevice(deviceName, protocols, adminState)
}

// RemoveDevice is invoked when a device bound to this service is removed.
func (d *NexusDriver) RemoveDevice(deviceName string, protocols map[string]models.ProtocolProperties) error {
	d.virtual.Remove(deviceName)
	for _, t := range d.transports {
		if p, ok := t.(transport.Pusher); ok {
			p.Unbind(deviceName)
		}
	}
	return nil
}

// HandleReadCommands dispatches a read to the device's configured backend.
func (d *NexusDriver) HandleReadCommands(deviceName string, protocols map[string]models.ProtocolProperties, reqs []sdkModels.CommandRequest) ([]*sdkModels.CommandValue, error) {
	b, err := backendFor(protocols)
	if err != nil {
		return nil, fmt.Errorf("device %s: %w", deviceName, err)
	}

	if b.Mode == modeVirtual {
		// Lazily ensured here (not only in AddDevice): the SDK only calls
		// AddDevice for devices new to EdgeX metadata this run, not ones
		// that already existed from a previous run - the virtual runtime
		// must still work for those without relying on that callback.
		d.virtual.EnsureDefault(deviceName, virtualSeedFrom(protocols))
		return d.readVirtual(deviceName, reqs)
	}

	t, err := d.transportFor(b.TransportName)
	if err != nil {
		return nil, fmt.Errorf("device %s: %w", deviceName, err)
	}
	return t.Read(deviceName, protocols[protocolTransport], reqs)
}

// HandleWriteCommands dispatches a write to the device's configured backend.
func (d *NexusDriver) HandleWriteCommands(deviceName string, protocols map[string]models.ProtocolProperties, reqs []sdkModels.CommandRequest, params []*sdkModels.CommandValue) error {
	b, err := backendFor(protocols)
	if err != nil {
		return fmt.Errorf("device %s: %w", deviceName, err)
	}

	if b.Mode == modeVirtual {
		d.virtual.EnsureDefault(deviceName, virtualSeedFrom(protocols))
		return d.writeVirtual(deviceName, reqs, params)
	}

	t, err := d.transportFor(b.TransportName)
	if err != nil {
		return fmt.Errorf("device %s: %w", deviceName, err)
	}
	return t.Write(deviceName, protocols[protocolTransport], reqs, params)
}

// Discover is not supported: device discovery is disabled in
// res/configuration.yaml (Device.Discovery.Enabled: false).
func (d *NexusDriver) Discover() error {
	return nil
}

// ValidateDevice rejects a device whose protocol properties do not resolve
// to a valid backend and (for physical devices) a registered transport,
// before it is added to EdgeX. Transport-specific properties (e.g. CAN's
// "bus") are validated by the transport itself on first use, not here.
func (d *NexusDriver) ValidateDevice(device models.Device) error {
	b, err := backendFor(device.Protocols)
	if err != nil {
		return err
	}
	if b.Mode == modePhysical {
		if _, err := d.transportFor(b.TransportName); err != nil {
			return err
		}
	}
	return nil
}

func (d *NexusDriver) transportFor(name string) (transport.PhysicalTransport, error) {
	t, ok := d.transports[name]
	if !ok {
		return nil, fmt.Errorf("unknown transport %q", name)
	}
	return t, nil
}
