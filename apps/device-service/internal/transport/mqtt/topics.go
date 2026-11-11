package mqtt

import "strings"

// Topic convention for network nodes (AGENTS.md section 79):
//
//	<root>/<node>/<device>/state   device -> NE, the device's current value
//	<root>/<node>/<device>/set     NE -> device, a value to apply
//	<root>/<node>/<device>/event   device -> NE, events (push path, later stage)
//	<root>/<node>/status           node online/offline (Last Will, later stage)
//
// Devices should publish `state` retained, so this service gets the last
// value immediately after its own (re)connect instead of waiting for the
// device's next publish.
const (
	suffixState = "state"
	suffixSet   = "set"
)

func deviceTopic(root string, dev deviceConfig, suffix string) string {
	return strings.Join([]string{root, dev.Node, dev.Device, suffix}, "/")
}

// stateSubscription is the one wildcard subscription that feeds the
// latest-value cache for every device on the broker.
func stateSubscription(root string) string {
	return root + "/+/+/" + suffixState
}
