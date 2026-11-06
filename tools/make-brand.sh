#!/usr/bin/env bash
# Regenerates the raster brand icons from the same geometry as LogoMark
# (40x40 viewBox, scaled 25.6x to a 1024px working canvas).
# Usage: tools/make-brand.sh
set -euo pipefail
out="$(dirname "$0")/../public/brand"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
S=1024

# ink tile
convert -size ${S}x${S} radial-gradient:'#171512'-'#0b0b0c' "$tmp/bg.png"
convert -size ${S}x${S} xc:none -fill white -draw "roundrectangle 0,0 $((S-1)),$((S-1)) 256,256" "$tmp/mask.png"
convert "$tmp/bg.png" "$tmp/mask.png" -alpha off -compose CopyOpacity -composite "$tmp/base.png"

# the mark: bone → brass, following the logo path (two rounded corners)
convert -size ${S}x${S} xc: -sparse-color barycentric '527,87 #F6E7C4 1024,522 #8A6520' "$tmp/grad.png"
convert -size ${S}x${S} xc:none -fill white -draw \
  "path 'M 527.4,87 h 215.04 a 194.56,194.56 0 0 1 194.56,194.56 v 240.64 h -215.04 a 194.56,194.56 0 0 1 -194.56,-194.56 Z'" \
  "$tmp/markmask.png"
convert "$tmp/grad.png" "$tmp/markmask.png" -alpha off -compose CopyOpacity -composite "$tmp/mark.png"

convert "$tmp/base.png" \
  "$tmp/mark.png" -composite \
  -fill '#D9A441' -draw "roundrectangle 189,696 450,804 54,54" \
  -fill '#F3F0E9' -draw "circle 512,512 512,571" \
  -stroke 'rgba(255,255,255,0.16)' -strokewidth 24 -fill none -draw "roundrectangle 12,12 1011,1011 244,244" \
  "$tmp/icon.png"

convert "$tmp/icon.png" -resize 512x512 -depth 8 "$out/icon-512.png"
convert "$tmp/icon.png" -resize 192x192 -depth 8 "$out/icon-192.png"
convert "$tmp/icon.png" -resize 180x180 -depth 8 "$out/apple-touch-icon.png"
echo "brand icons written to $out"
