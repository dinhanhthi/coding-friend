#!/usr/bin/env python3
"""Soundtrack for a showcase film, derived from its timeline.

    python3 audio.py --timeline timeline.json --out audio.wav [--mood upbeat|calm] [--seed N] [--lufs -16]

timeline.json comes from `node capture.mjs --mode timeline` and looks like
{"duration": 30, "fps": 60, "timeline": [{"scene", "start", "dur", "opts"}]}.

Cues:
- whoosh just before every scene start after the first (the shared transition)
- pop at every scene start
- opts.events = [{"t": 1.2, "kind": "pop|click|tick|chord"}], t in seconds LOCAL to the scene start
- a final chord at the last scene start (the end card)
plus a music bed following a chord progression, chosen with --mood:
- upbeat (default): plucked arpeggio, bass and light drums. Each run draws a variation
  (key, tempo 112-128 bpm, progression, arpeggio, lead sound, drum, hat and bass patterns)
  from --seed; without --seed a random seed is drawn and printed, so any track can be rebuilt
- calm: slow sustained pads and bass, no drums

Loudness: the gain targets --lufs with an RMS approximation (no K-weighting, no gating).
The real check is ffmpeg's ebur128 filter (scripts/verify-video.sh in the skill folder).
Needs python3 + numpy only.
"""
import argparse
import json
import random
import sys
import wave

import numpy as np

SR = 48000
rng = np.random.default_rng(3)  # noise for cues; the upbeat variation comes from --seed


def parse_args():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--timeline", required=True, help="timeline.json from capture.mjs --mode timeline")
    p.add_argument("--out", default="audio.wav")
    p.add_argument("--mood", choices=("upbeat", "calm"), default="upbeat", help="music bed style")
    p.add_argument("--seed", type=int, help="upbeat variation seed (default: random, printed)")
    p.add_argument("--lufs", type=float, default=-16.0, help="target integrated loudness (approx), -14..-20")
    return p.parse_args()


# ---------- synthesis helpers ----------
def env(n, a=0.002, d=0.2):
    t = np.arange(n) / SR
    return np.minimum(t / a, 1) * np.exp(-t / d)


def lowpass(x, a):
    """One-pole low-pass; only used on short cues (a per-sample loop)."""
    y = np.empty_like(x)
    acc = 0.0
    for k in range(len(x)):
        acc += a * (x[k] - acc)
        y[k] = acc
    return y


def tone(f, dur, dec, g=1.0, harm=(1, 0.4, 0.15), a=0.004):
    n = int(SR * dur)
    t = np.arange(n) / SR
    return sum(h * np.sin(2 * np.pi * f * (i + 1) * t) for i, h in enumerate(harm)) * env(n, a, dec) * g


def pop(g=0.4, f0=500, f1=1100):
    n = int(SR * 0.12)
    t = np.arange(n) / SR
    f = f0 + (f1 - f0) * np.minimum(t / 0.05, 1)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.002, 0.04) * g


def click(g=0.5):
    n = int(SR * 0.025)
    x = rng.standard_normal(n)
    x = x - lowpass(x, 0.2)
    return x * env(n, 0.0003, 0.005) * g


def tick(g=0.05):
    return tone(1500, 0.05, 0.015, g, (1,))


def whoosh(dur=0.6, g=0.5):
    n = int(SR * dur)
    x = rng.standard_normal(n)
    tt = np.linspace(0, 1, n)
    out = np.empty(n)
    acc = 0.0
    for k in range(n):
        acc += (0.01 + 0.2 * tt[k]) * (x[k] - acc)
        out[k] = acc
    return out * np.sin(np.pi * tt) ** 2 * 3 * g


def chord(freqs, dur=3.0, g=0.12):
    return sum(tone(f, dur, dur * 0.4, g, (1, 0.35, 0.1), a=0.02) for f in freqs)


def kick(g=0.5):
    n = int(SR * 0.22)
    t = np.arange(n) / SR
    f = 50 + 100 * np.exp(-t / 0.03)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.08) * g


def noise_hit(dur, dec, a, g):
    """High-passed noise burst (hat when a is small, clap-ish when larger)."""
    n = int(SR * dur)
    x = rng.standard_normal(n)
    return (x - lowpass(x, a)) * env(n, 0.001, dec) * g


def pad(freqs, dur, g):
    n = int(SR * dur)
    t = np.arange(n) / SR
    e = np.minimum(t / 0.4, 1) * np.clip(np.minimum((dur - t) / 0.5, 1), 0, 1)
    s = sum(np.sin(2 * np.pi * f * t + 0.3 * np.sin(2 * np.pi * 0.4 * t)) + 0.3 * np.sin(2 * np.pi * 2 * f * t) for f in freqs)
    return s * e * g / len(freqs)


# ---------- mixing ----------
class Mix:
    def __init__(self, duration):
        self.n = int(SR * duration)
        self.L = np.zeros(self.n)
        self.R = np.zeros(self.n)

    def add(self, sig, t, g=1.0, pan=0.0):
        i = int(max(0.0, t) * SR)
        if i >= self.n:
            return
        j = min(self.n, i + len(sig))
        s = sig[: j - i] * g
        self.L[i:j] += s * min(1, 1 - pan)
        self.R[i:j] += s * min(1, 1 + pan)


def feedback_delay(x, delay_s, feedback):
    """y[n] = x[n] + feedback * y[n - d], vectorized in blocks of d samples."""
    d = int(SR * delay_s)
    y = x.copy()
    for k in range(d, len(y), d):
        end = min(len(y), k + d)
        y[k:end] += feedback * y[k - d : end - d]
    return y


def reverb(x, wet=0.18):
    taps = ((0.0297, 0.6), (0.0371, 0.55), (0.0411, 0.5), (0.0437, 0.45))
    tail = sum(feedback_delay(x, d, fb) for d, fb in taps) / len(taps) - x
    return x + tail * wet


def approx_lufs(L, R):
    """Ungated, un-weighted approximation of integrated loudness for a stereo pair."""
    power = np.mean(L ** 2) + np.mean(R ** 2)
    return -0.691 + 10 * np.log10(max(power, 1e-12))


def master(L, R, target, ceiling=0.95):
    fi, fo = int(SR * 0.02), min(len(L) // 2, int(SR * 1.2))
    fade = np.ones(len(L))
    fade[:fi] = np.linspace(0, 1, fi)
    fade[len(L) - fo :] = np.linspace(1, 0, fo)
    L, R = L * fade, R * fade
    for _ in range(3):  # gain to target, soft-limit, repeat (the limiter lowers loudness a little)
        g = 10 ** ((target - approx_lufs(L, R)) / 20)
        L = ceiling * np.tanh(L * g / ceiling)
        R = ceiling * np.tanh(R * g / ceiling)
    return L, R


# ---------- score ----------
# Progression I - V - vi - IV in C (pads), bass an octave below the root.
CHORDS = [(261.6, 329.6, 392.0), (196.0, 246.9, 293.7), (220.0, 261.6, 329.6), (174.6, 220.0, 261.6)]
BASS = [65.4, 49.0, 55.0, 43.65]
FINAL = (130.8, 196.0, 261.6, 329.6, 392.0, 523.3)
BAR = 2.4  # calm: seconds per chord (100 bpm, 4 beats)

# upbeat variations; patterns are per 8th note over one bar of 4 beats
TRIADS = {  # C major, same register as CHORDS: (chord tones, bass root)
    "I": ((261.6, 329.6, 392.0), 65.4),
    "ii": ((293.7, 349.2, 440.0), 73.4),
    "IV": ((174.6, 220.0, 261.6), 43.65),
    "V": ((196.0, 246.9, 293.7), 49.0),
    "vi": ((220.0, 261.6, 329.6), 55.0),
}
KEYS = {"Bb": -2, "B": -1, "C": 0, "D": 2, "Eb": 3, "F": 5}  # semitones from C
PROGRESSIONS = (
    ("I", "V", "vi", "IV"),
    ("I", "IV", "V", "IV"),
    ("I", "vi", "IV", "V"),
    ("vi", "IV", "I", "V"),
    ("I", "IV", "vi", "V"),
    ("I", "ii", "IV", "V"),
)
ARPS = (  # chord-tone index; 3 = root an octave up
    (0, 1, 2, 1, 0, 1, 2, 3),
    (0, 2, 1, 2, 3, 2, 1, 2),
    (0, 1, 2, 3, 2, 1, 0, 1),
    (2, 1, 0, 1, 2, 3, 2, 1),
    (0, 0, 2, 1, 3, 1, 2, 1),
)
LEADS = {  # harmonics, decay (s)
    "mallet": ((1, 0.5, 0.25, 0.1), 0.1),
    "glass": ((1, 0.2, 0, 0.35), 0.16),
    "chip": ((1, 0, 0.33, 0, 0.2), 0.08),
}
DRUMS = {  # kick gains; claps always on beats 2 and 4
    "backbeat": (1, 0, 0.6, 0, 1, 0, 0.6, 0),
    "four-on-floor": (1, 0, 1, 0, 1, 0, 1, 0),
    "bouncy": (1, 0, 0, 0.7, 1, 0, 0, 0),
}
HATS = {"offbeat": (0, 1, 0, 1, 0, 1, 0, 1), "eighths": (0.5, 1, 0.5, 1, 0.5, 1, 0.5, 1)}
BASSLINES = {  # multiple of the root per 8th
    "octave": (1, 2, 1, 2, 1, 2, 1, 2),
    "root-fifth": (1, 1, 1.5, 1, 1, 1, 1.5, 2),
    "driving": (1, 1, 1, 1, 1, 1, 1, 1),
}


def pick_upbeat(seed):
    r = random.Random(seed)
    key = r.choice(list(KEYS))
    return {
        "seed": seed,
        "key": key,
        "k": 2 ** (KEYS[key] / 12),
        "bpm": r.randrange(112, 129, 2),
        "prog": r.choice(PROGRESSIONS),
        "arp": r.randrange(len(ARPS)),
        "lead": r.choice(list(LEADS)),
        "drums": r.choice(list(DRUMS)),
        "hats": r.choice(list(HATS)),
        "bass": r.choice(list(BASSLINES)),
    }


def describe(v):
    return (f"key {v['key']}, {v['bpm']} bpm, {'-'.join(v['prog'])}, arp {v['arp'] + 1}, lead {v['lead']}, "
            f"drums {v['drums']}, hats {v['hats']}, bass {v['bass']}")


def bed_calm(mix, bed_end):
    t, bar = 0.0, 0
    while t < bed_end - 0.05:
        dur = min(BAR, bed_end - t) + 0.3
        mix.add(pad(CHORDS[bar % 4], dur, 0.16), t)
        mix.add(tone(BASS[bar % 4] * 2, dur, dur * 0.5, 0.12, (1, 0.5, 0.2), a=0.05), t)
        t += BAR
        bar += 1


def bed_upbeat(mix, bed_end, v):
    k, h, c = kick(0.5), noise_hit(0.05, 0.012, 0.6, 0.06), noise_hit(0.12, 0.035, 0.25, 0.12)
    eighth = 30 / v["bpm"]
    arp, (harm, dec) = ARPS[v["arp"]], LEADS[v["lead"]]
    kicks, hats, bassline = DRUMS[v["drums"]], HATS[v["hats"]], BASSLINES[v["bass"]]
    n = 0
    while n * eighth < bed_end - 0.05:
        at, step = n * eighth, n % 8
        ch, root = TRIADS[v["prog"][(n // 8) % 4]]
        ch, root = [f * v["k"] for f in ch], root * v["k"]
        if step == 0:
            mix.add(pad([f * 2 for f in ch], min(8 * eighth, bed_end - at) + 0.2, 0.05), at)
        if kicks[step]:
            mix.add(k, at, kicks[step])
        if step in (2, 6):
            mix.add(c, at, pan=-0.1)
        if hats[step]:
            mix.add(h, at, hats[step], pan=0.3)
        idx = arp[step]
        f = ch[0] * 4 if idx == 3 else ch[idx] * 2
        mix.add(tone(f, 0.3, dec, 0.09, harm, a=0.002), at, pan=0.25 if step % 2 else -0.25)
        mix.add(tone(root * 2 * bassline[step], 0.22, 0.09, 0.14, (1, 0.6, 0.3), a=0.003), at)
        n += 1


def score(data, mood="upbeat", v=None):
    timeline = sorted(data.get("timeline", []), key=lambda e: e["start"])
    if not timeline:
        sys.exit("audio.py: timeline is empty")
    duration = float(data.get("duration") or max(e["start"] + e["dur"] for e in timeline))
    mix = Mix(duration)
    last = timeline[-1]["start"]

    # music bed until the end card, then the final chord rings out
    bed_end = last + 0.2 if len(timeline) > 1 else duration
    k = v["k"] if mood == "upbeat" else 1.0
    if mood == "upbeat":
        bed_upbeat(mix, bed_end, v)
    else:
        bed_calm(mix, bed_end)

    for i, e in enumerate(timeline):
        start = e["start"]
        if i > 0:
            mix.add(whoosh(0.6, 0.45), start - 0.15)
        mix.add(pop(0.35, 420, 900), start)
        for ev in (e.get("opts") or {}).get("events", []):
            at, kind = start + float(ev.get("t", 0)), ev.get("kind", "pop")
            if kind == "click":
                mix.add(click(0.6), at)
            elif kind == "tick":
                mix.add(tick(), at, pan=0.2)
            elif kind == "chord":
                mix.add(chord([f * k for f in CHORDS[0]], 1.2, 0.08), at)
            else:
                mix.add(pop(0.35), at)
    mix.add(chord([f * k for f in FINAL], max(1.0, duration - last), 0.12), last)
    return mix


def write_wav(path, L, R):
    st = (np.stack([L, R], 1) * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(st.tobytes())


def main():
    args = parse_args()
    with open(args.timeline, encoding="utf-8") as f:
        data = json.load(f)
    v = None
    if args.mood == "upbeat":
        v = pick_upbeat(args.seed if args.seed is not None else random.randrange(1_000_000))
        print(f"upbeat seed {v['seed']}: {describe(v)} (rerun with --seed {v['seed']} for this track)")
    mix = score(data, args.mood, v)
    L, R = master(reverb(mix.L), reverb(mix.R), args.lufs)
    write_wav(args.out, L, R)
    print(f"audio ({args.mood}): {len(L) / SR:.2f}s, approx {approx_lufs(L, R):.1f} LUFS (check with ebur128) -> {args.out}")


if __name__ == "__main__":
    main()
