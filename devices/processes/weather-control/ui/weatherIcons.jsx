import React from 'react'

// The weather's small pictures (the card picture's, 2026-10-25; shared with the scene 2026-10-30): a
// drop (the humidity), a cloud with rain (grey dry, blue wet), a thermometer.

const ICON = 34

export const DropIcon = ({ size = ICON }) => (
  <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
    <path d="M17 4 C12 12 8 17 8 22 a9 9 0 0 0 18 0 C26 17 22 12 17 4 Z" fill="#4dabf7" />
    <path
      d="M13 22 a4 4 0 0 0 4 4"
      fill="none"
      stroke="#fff"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
)

export const RainIcon = ({ size = ICON, wet = false }) => (
  <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
    <path
      d="M9 18 a6 6 0 0 1 2-11.6 a8 8 0 0 1 15 2.6 a5 5 0 0 1 0 9 Z"
      fill="var(--wx-cloud, #e9eef3)"
      stroke="var(--wx-cloud-edge, #9aa8b6)"
      strokeWidth="1.5"
    />
    {[11, 17, 23].map((x) => (
      <line
        key={x}
        x1={x}
        y1="22"
        x2={x - 2}
        y2="29"
        stroke={wet ? '#339af0' : '#a3adb8'}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    ))}
  </svg>
)

export const ThermoIcon = ({ size = ICON }) => (
  <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
    <rect
      x="13.5"
      y="4"
      width="7"
      height="19"
      rx="3.5"
      fill="none"
      stroke="#868e96"
      strokeWidth="2"
    />
    <circle cx="17" cy="25" r="5.5" fill="#e8590c" />
    <rect x="15.5" y="11" width="3" height="13" fill="#e8590c" />
  </svg>
)
