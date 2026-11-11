/**
 * Result receiver - atomic writable Device type (AGENTS.md section
 * 7/30/32), added 2026-09-26 for the AI Analyzing Camera (AGENTS_TO_DO.md
 * 2026-09-24/26). NexusEdge writes one result to the node as a single JSON
 * string - e.g. `{"imageId": "...", "text": "A cat on a sofa", "found":
 * true}` from the AI Analyzer process. One value rather than one Device
 * per field on purpose: two separate writes aren't atomic, so the node
 * could briefly see a new text with an old `found` flag. The JSON shape is
 * the writing process's contract with the node's firmware, not this
 * device type's - this type only guarantees "one string, written whole".
 */
export const resultReceiverContract = {
  deviceType: 'result-receiver',
  readOnly: false,
  valueType: 'String',
  units: null,
  description: 'Latest result written by NexusEdge, one JSON string',
}
