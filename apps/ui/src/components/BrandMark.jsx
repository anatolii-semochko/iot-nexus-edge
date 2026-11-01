import React from 'react'

import markOnDark from '../assets/brand/mark-3d-light.png'
import markOnLight from '../assets/brand/mark-3d-dark.png'

/**
 * The Nexus Edge mark ("Nexus node", the site's logo - 2026-11-01), rendered in 3D
 * (iot/images/logo/make_logo_3d.py). Light nodes on a dark ground, dark nodes on a light one:
 * `ground` - "dark" (the sidebar - always dark) or "theme" (follows the interface's theme).
 */
const BrandMark = ({ size, ground = 'theme', className = '' }) =>
  ground === 'dark' ? (
    <img src={markOnDark} alt="" width={size} height={size} className={className} />
  ) : (
    <>
      <img
        src={markOnLight}
        alt=""
        width={size}
        height={size}
        className={`brand-mark-on-light ${className}`}
      />
      <img
        src={markOnDark}
        alt=""
        width={size}
        height={size}
        className={`brand-mark-on-dark ${className}`}
      />
    </>
  )

export default BrandMark
