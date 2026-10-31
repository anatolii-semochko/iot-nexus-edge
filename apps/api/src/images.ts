// Image resizing for media consumers (AGENTS.md section 82) - thumbnails
// for tables, and a smaller copy for AI analysis (the stored original stays
// untouched). `sharp`, which ships prebuilt binaries for linux x64/arm64
// (musl included), so the Alpine image and a Raspberry Pi both work
// without a toolchain.

import sharp from "sharp";

/** A JPEG no larger than `maxSide` on its longest side (never upscaled). */
export async function resizeJpeg(image: Buffer, maxSide: number, quality = 85): Promise<Buffer> {
  return sharp(image)
    .rotate() // honour EXIF orientation before the pixels are resized
    .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality })
    .toBuffer();
}

export interface FitLimits {
  maxBytes: number;
  maxSide: number;
  /** the WebP qualities tried in turn until the image fits `maxBytes` */
  qualities: number[];
}

/**
 * An uploaded picture made to fit its store (the user, 2026-10-31 - a 1.6 MB render was refused): one
 * already within `maxBytes` and `maxSide` stays as it is; a larger one is shrunk to `maxSide` on its
 * longest side and re-encoded as WebP (the alpha kept), the quality stepping down until it fits. A GIF
 * stays as it is (its animation). The caller checks the result's size.
 */
export async function fitImage(image: Buffer, mime: string, limits: FitLimits): Promise<{ data: Buffer; mime: string }> {
  if (mime === "image/gif") return { data: image, mime };
  const meta = await sharp(image).metadata();
  const side = Math.max(meta.width ?? 0, meta.height ?? 0);
  if (image.length <= limits.maxBytes && side <= limits.maxSide) return { data: image, mime };
  let data = image;
  for (const quality of limits.qualities) {
    data = await sharp(image)
      .rotate()
      .resize({ width: limits.maxSide, height: limits.maxSide, fit: "inside", withoutEnlargement: true })
      .webp({ quality, alphaQuality: Math.max(quality, 80) })
      .toBuffer();
    if (data.length <= limits.maxBytes) break;
  }
  return { data, mime: "image/webp" };
}
