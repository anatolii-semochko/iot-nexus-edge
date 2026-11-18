import React from 'react'
import picture from './factory-shop.webp'

// The shop's card picture on the Dashboard - the plan itself, filling the block.
const MetalShopAvatar = () => (
  <img
    src={picture}
    alt=""
    style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
  />
)

export default MetalShopAvatar
