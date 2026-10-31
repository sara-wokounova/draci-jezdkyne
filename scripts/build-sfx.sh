#!/usr/bin/env bash
# The minigame's sound effects (D29), made from Sára's picks in art/minigames/dragon-attack/sfx/: mono, trailing silence
# trimmed (T), a gain measured beforehand to an RMS target of −14 dBFS (the same chain up to T, then volumedetect:
# gain = −14 − mean_volume), peaks limited to −1 dBFS (L), 96 kbps, no metadata (E). Bezzubka's shot drops its
# 0.50–0.75 s pause (Sára's "a1"); the cry starts with 150 ms of silence (her stagger after the hit), the log has none.
# The committed files were made with ffmpeg 8.1.
#   bash scripts/build-sfx.sh
set -euo pipefail
cd "$(dirname "$0")/.."
A=art/minigames/dragon-attack/sfx; P=public/assets/minigames/dragon-attack/sfx
T='pan=mono|c0=0.5*c0+0.5*c1,areverse,silenceremove=start_periods=1:start_duration=0.02:start_threshold=-45dB:start_silence=0.02,afade=t=in:d=0.02,areverse'
L='alimiter=limit=0.891:attack=1:release=30:level=disabled'
E='-vn -map_metadata -1 -c:a libmp3lame -b:a 96k -fflags +bitexact'
ffmpeg -y -i $A/bezzubka_shot_a.mp3 -filter_complex "[0:a]asplit[x][y];[x]atrim=0:0.50,afade=t=out:st=0.495:d=0.005[a];[y]atrim=start=0.75,asetpts=PTS-STARTPTS,afade=t=in:d=0.005[b];[a][b]concat=n=2:v=0:a=1,$T,volume=-3.3dB,$L" $E $P/bezzubka_shot.mp3
ffmpeg -y -i $A/fireball_hit_a.mp3 -af "$T,volume=-0.2dB,$L" $E $P/fireball_hit.mp3
ffmpeg -y -i $A/beaver_cry_b.mp3 -af "$T,volume=0.1dB,$L,adelay=150,asetpts=N/SR/TB" $E $P/beaver_cry.mp3
# The log's thud alone, played by the game when the log lands (D31): its creak (the first 0.245 s) and its delay go. The
# gain stays the 5.8 dB Sára heard (the recipe on the trimmed clip would give +2.0 dB, 3.8 dB quieter).
ffmpeg -y -i $A/log_drop_a.mp3 -af "atrim=start=0.245,asetpts=PTS-STARTPTS,afade=t=in:d=0.005,$T,volume=5.8dB,$L" $E $P/log_land.mp3
ffmpeg -y -i $A/emma_shot_c.mp3 -af "$T,volume=1.4dB,$L" $E $P/emma_shot.mp3
ffmpeg -y -i $A/emma_hit_c.mp3 -af "$T,volume=3.0dB,$L" $E $P/emma_hit.mp3
ffmpeg -y -i $A/anna_shot_a.mp3 -af "$T,volume=-0.8dB,$L" $E $P/anna_shot.mp3
ffmpeg -y -i $A/anna_hit_b.mp3 -af "$T,volume=6.9dB,$L" $E $P/anna_hit.mp3
