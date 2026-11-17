#!/usr/bin/env bash
# The badger rescue's sound effects (D45), made from Sára's picks among the Runway variants in
# art/minigames/badger-rescue/sfx/variants/ (<sound>_<a|b|c>.mp3, committed as downloaded): mono, leading silence trimmed (S),
# cut to the sound's target length with a 50 ms fade-out, trailing silence trimmed (T), a gain to an RMS target of
# −14 dBFS (measured on the same chain up to T: gain = −14 − mean_volume; `--measure` prints it for every variant),
# peaks limited to −1 dBFS (L), 96 kbps, no metadata (E), into public/assets/minigames/badger-rescue/sfx/<sound>.mp3.
# Its own script, not a section of build-sfx.sh (D45): that one's check rebuilds it on a copy without these inputs.
# After the picks: set PICK, run it, then point DEFAULTS.sounds in badgerRules.js at the six files.
#   bash scripts/build-badger-sfx.sh            (refuses while a pick is "?")
#   bash scripts/build-badger-sfx.sh --measure  (the gains of every variant, for GAIN below)
set -euo pipefail
cd "$(dirname "$0")/.."
A=art/minigames/badger-rescue/sfx/variants; P=public/assets/minigames/badger-rescue/sfx
SOUNDS=(dive splash bump caught mother lost)
# Sára's pick per sound: a, b or c.
declare -A PICK=([dive]='c' [splash]='c' [bump]='c' [caught]='a' [mother]='b' [lost]='c')
# Each sound's target length in s (D45: short, so the files stay ≤ 20 KB and the dives' stack shallow).
declare -A LEN=([dive]=0.6 [splash]=0.8 [bump]=0.8 [caught]=1.0 [mother]=1.2 [lost]=1.5)
# The gain in dB per variant (`--measure`, ffmpeg 8.1).
declare -A GAIN=(
  [dive_a]=4.4 [dive_b]=1.8 [dive_c]=2.4
  [splash_a]=18.6 [splash_b]=0.7 [splash_c]=7.1
  [bump_a]=13.4 [bump_b]=1.6 [bump_c]=3.4
  [caught_a]=1.7 [caught_b]=5.5 [caught_c]=8.0
  [mother_a]=2.2 [mother_b]=9.4 [mother_c]=1.7
  [lost_a]=8.2 [lost_b]=17.4 [lost_c]=4.4
)
# T, L and E are build-sfx.sh's (keep them the same); S trims the leading silence too.
S='silenceremove=start_periods=1:start_duration=0.02:start_threshold=-45dB:start_silence=0.02'
T='areverse,silenceremove=start_periods=1:start_duration=0.02:start_threshold=-45dB:start_silence=0.02,afade=t=in:d=0.02,areverse'
L='alimiter=limit=0.891:attack=1:release=30:level=disabled'
E='-vn -map_metadata -1 -c:a libmp3lame -b:a 96k -fflags +bitexact'
chain() { # the chain up to T for a sound
  echo "pan=mono|c0=0.5*c0+0.5*c1,$S,atrim=0:${LEN[$1]},afade=t=out:st=$(awk "BEGIN{print ${LEN[$1]} - 0.05}"):d=0.05,$T"
}
if [[ "${1:-}" == "--measure" ]]; then
  for s in "${SOUNDS[@]}"; do
    for v in a b c; do
      mean=$(ffmpeg -hide_banner -nostats -i "$A/${s}_$v.mp3" -af "$(chain "$s"),volumedetect" -f null - 2>&1 | sed -n 's/.*mean_volume: \(-*[0-9.]*\) dB/\1/p')
      echo "[${s}_$v]=$(awk "BEGIN{printf \"%.1f\", -14 - ($mean)}")"
    done
  done
  exit 0
fi
for s in "${SOUNDS[@]}"; do
  [[ "${PICK[$s]}" =~ ^[abc]$ ]] || { echo "no pick for $s yet: set PICK in $0" >&2; exit 1; }
done
mkdir -p "$P"
for s in "${SOUNDS[@]}"; do
  v="${s}_${PICK[$s]}"
  ffmpeg -y -i "$A/$v.mp3" -af "$(chain "$s"),volume=${GAIN[$v]}dB,$L" $E "$P/$s.mp3"
done
