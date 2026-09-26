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
