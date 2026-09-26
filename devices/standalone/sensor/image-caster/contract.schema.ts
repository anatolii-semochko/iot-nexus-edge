/**
 * Image caster - atomic sensor, independent Library Device type (AGENTS.md
 * section 7/30/32), added 2026-09-26 for the AI Analyzing Camera
 * (AGENTS_TO_DO.md 2026-09-24/26). The device sends a whole image on its
 * own (e.g. when a camera's shutter button is pressed); the gateway stores
 * it in the Media Store (AGENTS.md section 81) and the device's single
 * String value becomes that frame's Media Store id. The blob itself never
 * travels through EdgeX, so the device stays atomic.
 *
 * Event-driven, not polled: every new image is a push (AGENTS.md section
 * 80), so a process reacts to each frame via its onDeviceEvent hook.
 * `capabilities.media: true` on the Device row tells the UI to show a
 * preview (and, when simulated, a file upload) instead of a text value.
 */
export const imageCasterContract = {
  deviceType: 'image-caster',
  readOnly: true,
  valueType: 'String',
  units: null,
  media: true,
  description: 'Latest image sent by the device, as its Media Store id',
}
