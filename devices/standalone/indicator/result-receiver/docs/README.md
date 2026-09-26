# Result receiver

Atomic writable device: NexusEdge writes one result to a node as a single
JSON string. Added 2026-09-26 for the AI Analyzing Camera
(AGENTS_TO_DO.md) - the AI Analyzer process writes
`{"imageId", "text", "found"}` here and the camera shows `text` on its
display.

## Behavior

- Single value, `String`, written whole - never split across several
  devices (two writes aren't atomic; the node could see a new text with
  an old flag).
- The JSON shape belongs to the writing process and the node firmware,
  not to this device type.
- Over MQTT (AGENTS.md section 79) a write is published to
  `<root>/<node>/<device>/set`, QoS 1, not retained - a node that was
  off when the result was written simply doesn't get it (by design for
  the camera: the result is visible in the UI anyway).

## Simulation

A `backend: virtual` instance is a normal virtual device: the value can
also be set by hand from the Devices page (e.g. to send a test result to a
real camera).
