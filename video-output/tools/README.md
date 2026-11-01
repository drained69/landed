# Demo video pipeline

Rebuilds `LANDED-demo-wide-final.mp4` (1920×1080) and
`LANDED-demo-vertical-final.mp4` (1080×1920) — 11 slides keyed 1:1 to the
narration segments.

## Layout

- `deck.mjs` — renders slide PNGs (wide 1920×1080 / vertical 1080×1920 @2×)
  from HTML templates using the app's real fonts and tokens, with UI captures
  from `../audit/*.png`; writes `../assets/deck-manifest.json`.
- `tts.py` — generates the narration segments to `../assets/vo/*.mp3`
  (edge-tts, en-US-AvaNeural) and records durations to `durations.json`.
- `assemble.mjs` — crossfades the slides with the narration, loudness-normalizes
  to −16 LUFS, and writes the two finals to `../`.
- `capture*.mjs` / `fetch-decisions.mjs` — headless-Chrome captures of the live
  app into `../audit/` for grounding slide claims.

## Rebuild

Deck and assembler want the root Chrome binary and ffmpeg; TTS needs edge-tts:

```sh
# test client deps (Node 20+), fonts already in ../assets/fonts
node deck.mjs            # ~22 PNGs, few minutes

# optional narration re-record
python3 -m venv venv && venv/bin/pip install edge-tts && venv/bin/python tts.py

node assemble.mjs        # ~2 encodes, few minutes
```

Paths inside the scripts are absolute to this repo layout
(`/Users/uba/projects/landed/video-output`); adjust `ROOT`/`OUT` constants if
cloning elsewhere. `../audit/` captures and `../assets/slides*/` PNGs are
regenerable intermediates (gitignored). The committed inputs are the voiceover
MP3s, fonts, durations and manifest; the committed outputs are the two finals
plus `../narration.txt` (final script + timecodes).
