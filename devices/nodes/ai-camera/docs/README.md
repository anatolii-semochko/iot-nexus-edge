# AI Analyzing Camera (node)

Experimental WiFi camera for demonstrating visual AI analysis and
wireless nodes (AGENTS_TO_DO.md 2026-09-24/26). Specification, decisions
and Q&A: AGENTS_TO_DO.md, "AI Analyzing Camera - технічне завдання".

## Devices

| Device | Type | Direction | Value |
|---|---|---|---|
| `image-caster` | `devices/standalone/sensor/image-caster` | node -> NE | Media Store id of the latest frame (the frame itself is the MQTT payload) |
| `result-receiver` | `devices/standalone/indicator/result-receiver` | NE -> node | `{"imageId", "text", "found"}` JSON string |

Both bound with `transport: {type: mqtt, node: <node id>, device:
image-caster|result-receiver}`; topics
`nexus/<node>/image-caster/state` (frame, **not retained**, one message)
and `nexus/<node>/result-receiver/set`.

## Flow

shutter -> frame -> `image-caster` (MQTT) -> gateway -> Media Store + push
-> AI Analyzer process (`devices/processes/ai-analyzer`) -> OpenAI ->
result -> `result-receiver` -> MQTT -> camera display/LEDs/buzzer.

The camera accepts a result only while it is Processing (the frame's id is
assigned by NexusEdge, so the camera can't match `imageId` itself); the
AI request timeout on NexusEdge (25 s) is shorter than the camera's own
(30 s), so the answer always arrives first - see `../firmware/README.md`.

## Camera behaviour (firmware, not Devices)

| State | Display | Green | Red | Buzzer | Button |
|---|---|---|---|---|---|
| Ready (after init) | "Ready" | on | - | - | enabled |
| Frame taken | "Processing..." | blinking | off | 1 short | disabled |
| Result, no targets | AI text | on | - | - | enabled |
| Result, 1+ targets | AI text blinking (1) / "Found Objects" blinking (2+) | on | blinking | 5 long | enabled |
| Error (NE/AI error or timeout) | "Error" | off | on | - | enabled |

- Blinking lasts until the next shutter press or 10 s.
- Leaving Error: a shutter press clears it (green on) without taking a
  frame; the next press takes one.
- Result timeout: 30 s (provisioning config) -> Error.
- Text: one line in large font (~10 chars) or up to 4 lines small (~21
  chars each); results are always English (the OLED font has no Cyrillic).
- The flash (GPIO4) is used for captures.

## Provisioning

Captive portal (WiFiManager) on first boot / unreachable network / shutter
held at power-up: SSID and password, NexusEdge (broker) address, node id,
stored in NVS. Automatic NE discovery (mDNS) and node credentials come
later with the platform-wide authorization task.

## Hardware

See `wiring.md`. Firmware: `../firmware/` - PlatformIO + Arduino,
MQTT via `esp-mqtt` (large single messages); compiles, not yet flashed.
