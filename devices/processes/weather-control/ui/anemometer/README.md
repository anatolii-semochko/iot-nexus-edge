# The anemometer's frames

`AnemometerIcon` (the weather's wind picture) turns a cup anemometer by the
frames of `anemometer-sprite.webp` - made from the user's animation
`images/Anemometer_Animation.gif` (red cups) the way the approved
`images/Anemometer_Animation_grey.gif` was (iot AGENTS_TO_DO.md
2026-10-24), only sharper:

1. The original: 25 frames of 135 x 135, transparent background; frame 25
   repeats frame 1 (ImageMagick `compare -metric RMSE`), so frames 1-24 are
   one third of a turn (the three cups look the same every 120 degrees).
2. The cups recoloured dark grey (a reddish pixel -> `g + (r - g) * 0.4`, so
   the shading and the light highlights stay); the outer ring of opaque
   pixels given its inner neighbours' colour (the GIF's dithered white
   matte - a halo on a dark background).
3. Each frame 4x up (Lanczos on premultiplied colour; the 1-bit alpha
   blurred and re-sharpened - a smooth 1-2 px edge), cropped top and bottom
   to the cups' highest and lowest points over all the frames.
4. Squashed evenly by 20 % in height (the user's choice, 2026-10-24) and
   down to 270 x 186 a frame - twice the usual 93 px height, sharp up to a
   widget's full height.
5. Frames 1-24 side by side - `anemometer-sprite.webp` (6480 x 186, lossy
   q90 with lossless alpha).

The script: Python with Pillow + numpy (`uv run --with pillow --with
numpy`); recolour, edge fix, 4x and crop as above, then ImageMagick
`-resize 270x186!` per frame and `+append`.

The component shows the frames in turn with a CSS `steps(24)` animation: 60
degrees per second per m/s of wind (a turn in 2 s at 3 m/s), one third of a
turn in 1/3 s at the quickest; still under 0.3 m/s.
