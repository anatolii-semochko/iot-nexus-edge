import React from 'react'

/**
 * A green dot that pulses once per beat (the header's system tick - SystemTickIndicator; the control
 * node's Pulse device in the Devices list - every write of it, the user 2026-11-17: "the same look as the
 * header's"). `beat` - anything that changes on every beat (a counter, a timestamp): the span is keyed by
 * it, so React remounts it and the CSS animation (`.system-tick-pulse`, style.scss) restarts from its
 * first frame - it pulses only on a real beat and sits dim between them (an `infinite` animation would
 * go on blinking after the beats stopped). No beat yet - dim, no pulse.
 */
const PulseDot = ({ beat, label }) => (
  <span
    key={beat ?? 'idle'}
    className={
      beat === undefined || beat === null ? 'system-tick-dot' : 'system-tick-dot system-tick-pulse'
    }
    role="status"
    aria-label={label}
    title={label}
  />
)

export default PulseDot
