# Image caster

Atomic sensor device that sends an image to NexusEdge on its own - e.g. a
camera node when its shutter button is pressed. Added 2026-09-26 for the
AI Analyzing Camera (AGENTS_TO_DO.md).

## Behavior

- Single value, `String`: the **Media Store id** of the latest image
  (`20260926T071234Z_a1b2c3`), not the image itself. The image is stored
  by the Devices API (AGENTS.md section 81) under this Device and served
  at `GET /devices/:id/media/:mediaId`.
- Read-only from the platform's perspective, **event-driven**: every new
  image is pushed (AGENTS.md section 80), so a process reacts to each one
  through its `onDeviceEvent` hook instead of polling.
- Device row: `capabilities: { edgexResource: "Image", readOnly: true,
  media: true }` - `media` makes the UI show a preview and, when
  simulated, a file upload.

## Physical mapping (MQTT)

The node publishes the image file as the raw payload of
`<root>/<node>/<device>/state` (one message per image, **not retained**),
e.g. `nexus/ai-camera-01/image-caster/state`. The gateway uploads it to
the Media Store and pushes the returned id as the device's value.
Device instance protocols:

```yaml
protocols:
  backend:
    mode: "physical"
  transport:
    type: "mqtt"
    node: "ai-camera-01"
    device: "image-caster"
```

## Simulation

A `backend: virtual` instance (or a node switched to simulated mode) is
fed from the UI: uploading a file stores it and sets its id as the value
(`POST /devices/:id/media/simulate`) - processes can't tell it from a real
capture.
