#!/usr/bin/env bash
# Full pipeline: music -> photo plates -> 60fps frames -> loudness-normalised MP4s.
# Expects the 12 source photos in private/photos/ (see PHOTOS in src/film.js for the file names).
set -euo pipefail
cd "$(dirname "$0")"
B=private/build
mkdir -p "$B" out
python3 tools/music.py "$B"
python3 tools/prep_images.py private/photos "$B/img"
rm -rf "$B/frames"
NODE_PATH="${NODE_PATH:-$(npm root -g)}" node tools/render.cjs frames "$B/frames" 60 4
M=$(ffmpeg -hide_banner -i "$B/music.wav" -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/{/,/}/p')
LN=$(echo "$M" | python3 -c "import json,sys; d=json.load(sys.stdin); print(f\"measured_I={d['input_i']}:measured_TP={d['input_tp']}:measured_LRA={d['input_lra']}:measured_thresh={d['input_thresh']}:offset={d['target_offset']}\")")
ffmpeg -hide_banner -y -i "$B/music.wav" -af "loudnorm=I=-14:TP=-1.5:LRA=11:$LN:linear=true" -ar 48000 "$B/music_norm.wav"
COMMON=(-map 0:v -map 1:a -tune film -pix_fmt yuv420p -profile:v high -colorspace bt709 -color_primaries bt709 -color_trc bt709 -ar 48000 -shortest -movflags +faststart)
ffmpeg -hide_banner -y -framerate 60 -i "$B/frames/f_%05d.jpg" -i "$B/music_norm.wav" "${COMMON[@]}" -c:v libx264 -preset slow -crf 20 -level 4.2 -c:a aac -b:a 256k out/Habiba-Birthday-Film.mp4
ffmpeg -hide_banner -y -framerate 60 -i "$B/frames/f_%05d.jpg" -i "$B/music_norm.wav" "${COMMON[@]}" -vf fps=30 -c:v libx264 -preset slow -crf 24 -level 4.1 -c:a aac -b:a 192k out/Habiba-Birthday-Film-whatsapp.mp4
