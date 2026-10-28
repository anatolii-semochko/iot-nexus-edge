#!/bin/sh
set -e
apt-get update -qq >/dev/null && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq imagemagick potrace >/dev/null 2>&1
# run in a throwaway container: docker run --rm -v <dir with src.png>:/w ubuntu:24.04 /w/trace.sh
cd /w
# name x y w h (source pixels; rows 3..547 - inside the picture's frame lines)
# the turbine: the rotor (2nd) and the tower (3rd); the 4th - the assembled one, to check them against
for spec in "pv 10 3 356 545" "rotor 366 3 382 545" "tower 876 3 152 545" "turbine 1135 3 382 545"; do
  set -- $spec
  convert src.png -crop ${4}x${5}+${2}+${3} +repage -colorspace gray -resize 400% -blur 0x1.2 -threshold 50% $1.pbm
  potrace -s --turdsize 60 --alphamax 1.0 --opttolerance 0.3 -o $1.svg $1.pbm
done
ls -la *.svg
