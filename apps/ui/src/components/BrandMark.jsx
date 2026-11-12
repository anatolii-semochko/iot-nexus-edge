import React from 'react'

import mark from '../assets/brand/mark-3d.png'

/**
 * The Nexus Edge mark ("Nexus node", the site's logo), rendered in 3D (iot/images/dashboard/v2
 * make_folder_renders.py, scene `logo-single`): the yellow hub, three blue nodes, white connectors
 * darkening to their ends - one image for a light and a dark ground alike (2026-11-12).
 */
const BrandMark = ({ size, className = '' }) => (
  <img src={mark} alt="" width={size} height={size} className={className} />
)

export default BrandMark
