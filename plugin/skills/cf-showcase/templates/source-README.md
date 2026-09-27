# Showcase source

Everything in this folder re-renders the showcase assets. The film is one deterministic canvas function, `render(t)`, in `video.html`. All copy lives in the `STR` table (one entry per language, selected with `?lang=xx`); timing lives in `TIMELINE`; colors and fonts in `BRAND`.

Settings used for this showcase (update when they change):

- Length: `<s>` s · fps: `<180|60>` · aspect: `<16x9|1x1|9x16>` · languages: `<en, vi>`

`<name>` is the project slug, `<xx>` a language code. Run every command from this folder.

## Setup

```bash
npm install
```

`capture.mjs` drives the Chrome already installed on this machine (Chrome, Chromium, Chrome Canary or Edge). If it is somewhere unusual, set `CHROME_PATH=/path/to/chrome`. ffmpeg must be on `PATH`; audio needs python3 with numpy. Fonts come from Google Fonts, so rendering needs network access; capture aborts when a font fails to load instead of rendering in a fallback font.

## Build and preview

```bash
node inline-assets.mjs --src video.html --out dist/video.html
open dist/video.html   # Linux: xdg-open
```

Local asset refs must resolve inside `--root` (default: the git toplevel, or this folder outside git). Pass `--root <dir>` to allow assets from a wider folder.

The preview page has play/pause, replay, a scrubber, chapter buttons and a language toggle.

## Contact sheet (per language)

```bash
node capture.mjs --mode sheet --src dist/video.html --lang <xx> --out sheet-<xx>.jpg
```

`--frames N` changes the number of sampled frames (default 30).

## Capture (per language, one at a time)

```bash
# length ≤ 45 s: 180 fps blended to 60 fps with tmix=frames=3,fps=60 (real motion blur)
node capture.mjs --mode video --src dist/video.html --lang <xx> --fps 180 --out <name>-intro-<xx>.mp4
# length > 45 s: capture 60 fps directly (180 fps triples render time for long films)
node capture.mjs --mode video --src dist/video.html --lang <xx> --fps 60 --out <name>-intro-<xx>.mp4
```

Add `--aspect 16x9|1x1|9x16` (or `--size WxH`) for a non-default aspect. `--duration S` renders only the first S seconds (quick smoke test). Frames are piped straight into ffmpeg (`-f image2pipe`), encoded with `-c:v libx264 -crf 19 -preset slow -pix_fmt yuv420p -movflags +faststart`.

## Audio

```bash
node capture.mjs --mode timeline --src dist/video.html --out timeline.json
python3 audio.py --timeline timeline.json --out audio.wav --mood upbeat   # or calm
ffmpeg -i <name>-intro-<xx>.mp4 -i audio.wav -map 0:v -map 1:a -c:v copy \
  -c:a aac -b:a 192k -shortest -movflags +faststart <name>-intro-<xx>.muxed.mp4
mv <name>-intro-<xx>.muxed.mp4 <name>-intro-<xx>.mp4
```

`audio.py` adds a whoosh at every scene change, a pop at every scene start, cues from `opts.events` in `TIMELINE` (`[{t, kind: pop|click|tick|chord}]`, `t` local to the scene start) and a final chord on the last scene, over a music bed picked with `--mood` (`upbeat` by default: 120 bpm arpeggio, bass and light drums; `calm`: slow pads). `--lufs` sets the target (default −16, keep it within −14..−20); the value is an RMS approximation, so measure the real loudness with verify-video.sh. One `audio.wav` serves every language while `TIMELINE` is shared.

If a file ends up over its size budget (50 MB by default; GitHub rejects pushes above 100 MB), re-encode with a higher CRF (22–26):

```bash
ffmpeg -i <file> -c:v libx264 -crf 23 -preset slow -pix_fmt yuv420p -c:a copy -movflags +faststart <file>.tmp.mp4 && mv <file>.tmp.mp4 <file>
```

## Verify

`verify-video.sh` lives in the cf-showcase skill folder of your Coding Friend install (`scripts/verify-video.sh`):

```bash
bash "<skill folder>/scripts/verify-video.sh" <file> --duration <s> --fps 60 --size <WxH> --max-mb 50   # raise for a longer film the user accepted
```

It checks duration, resolution, fps, the audio stream, black frames (`blackdetect`), loudness (`ebur128`) and file size. Non-zero exit means something needs fixing.

## Poster frame

```bash
ffmpeg -ss <t> -i ../<name>-intro.mp4 -frames:v 1 -q:v 2 ../<name>-intro-poster.jpg
```

## Poster

```bash
node inline-assets.mjs --src poster.html --out dist/poster.html
node capture.mjs --mode poster --src dist/poster.html --lang <xx> --size <A4|A3|letter|1080x1080|1200x630|1080x1920|1920x1080> --format png --out ../<name>-poster-<xx>.png
node capture.mjs --mode poster --src dist/poster.html --lang <xx> --size <A4|A3|letter|WxH> --format pdf --out ../<name>-poster-<xx>.pdf
```

PNG renders at 2× the CSS size; PDF pages use the exact paper size.

## Final names

The first language ends as `../<name>-intro.mp4`, extra languages as `../<name>-intro-<xx>.mp4`. Move the finished files out of `source/` after verifying.
