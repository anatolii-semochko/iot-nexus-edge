import React from 'react'

// The Weather component's Dashboard avatar (dashboardRegistry.js
// `avatars`, 2026-10-16): a static picture - the sun behind a cloud, rain,
// a thermometer - on a transparent background, filling the card's picture
// block (scaled with it, centered).
const WeatherAvatar = () => (
  <svg
    viewBox="0 0 200 120"
    width="100%"
    height="100%"
    preserveAspectRatio="xMidYMid meet"
    role="img"
    aria-label="Weather"
  >
    {/* the sun with its rays */}
    <g stroke="#f6b100" strokeWidth="4" strokeLinecap="round">
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4
        return (
          <line
            key={i}
            x1={70 + Math.cos(a) * 25}
            y1={42 + Math.sin(a) * 25}
            x2={70 + Math.cos(a) * 34}
            y2={42 + Math.sin(a) * 34}
          />
        )
      })}
    </g>
    <circle cx="70" cy="42" r="19" fill="#ffc927" />
    {/* the cloud */}
    <path
      d="M58 86 h64 a18 18 0 0 0 0 -36 a26 26 0 0 0 -49 -6 a20 20 0 0 0 -15 42 z"
      fill="#eef2f7"
      stroke="#a9b6c6"
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
    {/* rain */}
    <g stroke="#3d8fe0" strokeWidth="4" strokeLinecap="round">
      <line x1="72" y1="95" x2="67" y2="108" />
      <line x1="90" y1="95" x2="85" y2="108" />
      <line x1="108" y1="95" x2="103" y2="108" />
    </g>
    {/* the thermometer */}
    <g transform="translate(160 18)">
      <rect
        x="-6"
        y="0"
        width="12"
        height="62"
        rx="6"
        fill="#ffffff"
        stroke="#8a97a8"
        strokeWidth="2.5"
      />
      <rect x="-2.5" y="24" width="5" height="44" rx="2.5" fill="#e55353" />
      <circle cx="0" cy="74" r="11" fill="#e55353" stroke="#8a97a8" strokeWidth="2.5" />
      <g stroke="#8a97a8" strokeWidth="2">
        <line x1="8" y1="12" x2="14" y2="12" />
        <line x1="8" y1="24" x2="14" y2="24" />
        <line x1="8" y1="36" x2="14" y2="36" />
        <line x1="8" y1="48" x2="14" y2="48" />
      </g>
    </g>
  </svg>
)

export default WeatherAvatar
