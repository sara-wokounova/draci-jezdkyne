#!/usr/bin/env bash
# The deployed music (D25, D29): every track made from its original in art/music/, 9 dB quieter, at the original's bit
# rate; battle.mp3 is battle_01 + battle_02 joined at 128 kbps. -vn -map_metadata -1 keep cover art, text tags and the
# originals' C2PA provenance out of the deployed files. The committed files were made with ffmpeg 8.1 (another build
# makes the same audio but not the same bytes). A new track: its original in art/music/ and a line here.
#   bash scripts/build-music.sh
set -euo pipefail
cd "$(dirname "$0")/.."
E='-vn -map_metadata -1 -c:a libmp3lame -fflags +bitexact'
ffmpeg -y -i art/music/battle_01.mp3 -i art/music/battle_02.mp3 -filter_complex "[0:a][1:a]concat=n=2:v=0:a=1,volume=-9dB" $E -b:a 128k public/assets/music/battle.mp3
ffmpeg -y -i art/music/village_day.mp3 -af volume=-9dB $E -b:a 192k public/assets/music/village_day.mp3
ffmpeg -y -i art/music/dragon_flight_above_the_green_sea.mp3 -af volume=-9dB $E -b:a 192k public/assets/music/dragon_flight_above_the_green_sea.mp3
ffmpeg -y -i art/music/forest_ground_whispering_trees.mp3 -af volume=-9dB $E -b:a 192k public/assets/music/forest_ground_whispering_trees.mp3
