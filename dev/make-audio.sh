#!/usr/bin/env bash
# DEVELOPMENT ONLY. Generates the test tones the stand-in catalog serves.
# File names carry their length in seconds: a1_6.mp3 is six seconds long.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p audio/short audio/long

make() { # folder index seconds frequency
  ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=$4:duration=$3" -af "volume=0.2" -ac 1 -ar 22050 -b:a 32k "audio/$1/a$2_$3.mp3"
}

i=1
for spec in "6 220" "8 262" "10 294" "12 330" "15 392" "20 440"; do
  set -- $spec; make short $i "$1" "$2"; i=$((i+1))
done

i=1
for spec in "185 220" "201 262" "214 294" "238 330" "262 392" "305 440"; do
  set -- $spec; make long $i "$1" "$2"; i=$((i+1))
done

ls -la audio/short audio/long
