#!/usr/bin/env bash
# The wisent song's sound effects (D46), made from Sára's picks among the Runway variants in
# art/minigames/zubr/sfx/variants/ (<sound>_<a|b|c>.mp3, committed as downloaded): mono, leading silence trimmed (S),
# cut to the sound's target length with a 50 ms fade-out, trailing silence trimmed (T), a gain to an RMS target of
# −14 dBFS (measured on the same chain up to T: gain = −14 − mean_volume; `--measure` prints it for every variant),
# peaks limited to −1 dBFS (L), 96 kbps, no metadata (E), into public/assets/minigames/zubr/sfx/<sound>.mp3.
# Its own script, not a section of build-sfx.sh (D45): that one's check rebuilds it on a copy without these inputs.
# Sára's picks are in PICK (2026-11-18); DEFAULTS.sounds in zubrRules.js names the three files. A new pick: set PICK, run.
#   bash scripts/build-zubr-sfx.sh            (refuses while a pick is "?")
#   bash scripts/build-zubr-sfx.sh --measure  (the gains of every variant, for GAIN below)
set -euo pipefail
cd "$(dirname "$0")/.."
A=art/minigames/zubr/sfx/variants; P=public/assets/minigames/zubr/sfx
SOUNDS=(snort charge clear)
# Sára's pick per sound: a, b or c ("?" until she has picked: the script refuses to build).
declare -A PICK=([snort]='b' [charge]='b' [clear]='c')
# Each sound's target length in s (charge ≤ 1.5 s keeps it ≤ 20 KB at 96 kbps).
declare -A LEN=([snort]=0.9 [charge]=1.5 [clear]=1.5)
# The gain in dB per variant (`--measure`, ffmpeg 8.1).
declare -A GAIN=(
  [snort_a]=1.9 [snort_b]=4.9 [snort_c]=10.0
  [charge_a]=-3.9 [charge_b]=6.0 [charge_c]=4.7
  [clear_a]=12.5 [clear_b]=13.9 [clear_c]=12.8
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
# Never into art/ (the originals), also through a link at the output folder (as the other asset scripts, D23, D42);
# checked before anything is made. (Untested in the repo; tried by hand on 2026-11-18 with a junction into art/.)
case "$(realpath -m "$P")/" in "$(realpath art)/"*) echo "refusing: $P leads into art/" >&2; exit 1 ;; esac
mkdir -p "$P"
for s in "${SOUNDS[@]}"; do
  v="${s}_${PICK[$s]}"
  rm -f "$P/$s.mp3" # a link there is removed, never written through (into art/)
  ffmpeg -y -i "$A/$v.mp3" -af "$(chain "$s"),volume=${GAIN[$v]}dB,$L" $E "$P/$s.mp3"
done
