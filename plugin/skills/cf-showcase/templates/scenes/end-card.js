/* Scene "end-card": logo or wordmark, tagline, CTA button (width measured from its text),
   URL and a platform/license line. Every animation lands by SETTLE seconds and nothing moves
   afterwards, so a 3 s slot holds still for the last ~1.5 s.
   Key = filename: TIMELINE uses { scene: "end-card" }. Load after the engine defines SCENES.
   opts (defaults: env.str.end / env.str): logo (a loaded HTMLImageElement, optional),
   wordmark, tagline, cta, url, meta. */
(function () {
  const SETTLE = 1.5;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  /* BRAND colors must be #RGB, #RRGGBB or #RRGGBBAA (AA multiplies a); anything else throws. */
  function rgba(hex, a) {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex);
    if (!m)
      throw new Error(
        `BRAND color must be #RGB, #RRGGBB or #RRGGBBAA, got "${hex}"`,
      );
    const h = m[1].length === 3 ? m[1].replace(/./g, "$&$&") : m[1];
    const n = parseInt(h.slice(0, 6), 16);
    const k = h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1;
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a * k})`;
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
  }
  function fit(ctx, s, font, max, maxW) {
    ctx.font = font(max);
    const w = ctx.measureText(s).width;
    return w <= maxW ? max : Math.floor((max * maxW) / w);
  }
  function wrap(ctx, s, font, maxW) {
    ctx.font = font;
    const cjk = !/\s/.test(s);
    const units = cjk ? [...s] : s.split(/\s+/);
    const sp = cjk ? "" : " ";
    const lines = [];
    let cur = "";
    for (const u of units) {
      const next = cur ? cur + sp + u : u;
      if (cur && ctx.measureText(next).width > maxW) {
        lines.push(cur);
        cur = u;
      } else cur = next;
    }
    if (cur) lines.push(cur);
    return lines;
  }
  const loaded = (img) => Boolean(img && img.complete && img.naturalWidth > 0);

  SCENES["end-card"] = {
    draw(ctx, lt, opts, env) {
      const { W, H, ease, spring, brand, fonts } = env;
      const c = brand.colors;
      const d = env.str.end || {};
      const pick = (k, f) =>
        opts[k] !== undefined ? opts[k] : d[k] !== undefined ? d[k] : f;
      const logo = loaded(opts.logo) ? opts.logo : null;
      const word = pick("wordmark", env.str.wordmark || brand.name);
      const tagline = pick("tagline", env.str.tagline || "");
      const cta = pick("cta", "");
      const url = pick("url", "");
      const meta = pick("meta", "");
      const u = Math.min(W, H) / 1080;
      /* after SETTLE every progress value is exactly 1: a truly still hold */
      const t = lt >= SETTLE ? 1e3 : lt;
      const done = (p) => (lt >= SETTLE ? 1 : p);

      ctx.fillStyle = c.bg;
      ctx.fillRect(0, 0, W, H);
      const glow = ctx.createRadialGradient(
        W / 2,
        H * 0.42,
        0,
        W / 2,
        H * 0.42,
        Math.max(W, H) * 0.55,
      );
      glow.addColorStop(0, rgba(c.accent, 0.28));
      glow.addColorStop(1, rgba(c.accent, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      /* measure the stack */
      const maxW = W * 0.84;
      const logoS = logo ? Math.min(W, H) * 0.22 : 0;
      const wf = (s) => `800 ${s}px ${fonts.sans}`;
      const ws = fit(ctx, word, wf, (logo ? 120 : 150) * u, maxW);
      const tf = `600 ${Math.round(38 * u)}px ${fonts.sans}`;
      const tl = tagline ? wrap(ctx, tagline, tf, maxW) : [];
      const tlh = 38 * u * 1.35;
      const bf = (s) => `600 ${s}px ${fonts.sans}`;
      const bs = cta ? fit(ctx, cta, bf, 30 * u, maxW - 96 * u) : 0;
      ctx.font = bf(bs);
      const bw = cta ? ctx.measureText(cta).width + 96 * u : 0;
      const bh = bs * 2.6;
      const uf = (s) => `500 ${s}px ${fonts.mono}`;
      const us = url ? fit(ctx, url, uf, 28 * u, maxW) : 0;
      const mf = (s) => `400 ${s}px ${fonts.mono}`;
      const ms = meta ? fit(ctx, meta, mf, 22 * u, maxW) : 0;
      const g1 = 40 * u,
        g2 = 36 * u,
        g3 = 48 * u,
        g4 = 30 * u,
        g5 = 22 * u;
      const total =
        (logo ? logoS + g1 : 0) +
        ws +
        (tl.length ? g2 + tl.length * tlh : 0) +
        (cta ? g3 + bh : 0) +
        (url ? g4 + us : 0) +
        (meta ? g5 + ms : 0);
      let y = (H - total) / 2;
      ctx.textAlign = "center";

      if (logo) {
        const p = done(spring(t - 0.05, { stiffness: 1.8, damping: 0.55 }));
        const s = logoS * p;
        if (s > 1) {
          ctx.save();
          ctx.shadowColor = "rgba(0,0,0,0.35)";
          ctx.shadowBlur = 40 * u;
          ctx.shadowOffsetY = 16 * u;
          ctx.drawImage(logo, W / 2 - s / 2, y + logoS - s, s, s);
          ctx.restore();
        }
        y += logoS + g1;
      }

      /* wordmark rises out of a clip band */
      const wp = done(ease.backOut(seg(t, 0.2, 0.75), 1.6));
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, y - ws * 0.2, W, ws * 1.45);
      ctx.clip();
      ctx.font = wf(ws);
      ctx.fillStyle = c.fg;
      ctx.letterSpacing = -ws * 0.03 + "px";
      ctx.fillText(word, W / 2, y + ws * 0.85 + ws * 1.2 * (1 - wp));
      ctx.letterSpacing = "0px";
      ctx.restore();
      y += ws;

      if (tl.length) {
        y += g2;
        ctx.font = tf;
        ctx.fillStyle = c.mute;
        tl.forEach((line, i) => {
          const p = done(ease.expoOut(seg(t, 0.45 + i * 0.1, 1.0 + i * 0.1)));
          ctx.globalAlpha = p;
          ctx.fillText(line, W / 2, y + (i + 0.8) * tlh + 20 * u * (1 - p));
        });
        ctx.globalAlpha = 1;
        y += tl.length * tlh;
      }

      if (cta) {
        y += g3;
        const p = done(ease.backOut(seg(t, 0.7, 1.15), 2));
        if (p > 0) {
          ctx.save();
          ctx.translate(W / 2, y + bh / 2);
          ctx.scale(p, p);
          ctx.shadowColor = rgba(c.accent, 0.45);
          ctx.shadowBlur = 30 * u;
          ctx.shadowOffsetY = 10 * u;
          rr(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2);
          ctx.fillStyle = c.accent;
          ctx.fill();
          ctx.shadowColor = "transparent";
          ctx.font = bf(bs);
          ctx.fillStyle = "#fff";
          ctx.textBaseline = "middle";
          ctx.fillText(cta, 0, 0);
          ctx.textBaseline = "alphabetic";
          ctx.restore();
        }
        y += bh;
      }

      const tail = done(ease.expoOut(seg(t, 0.95, 1.45)));
      ctx.globalAlpha = tail;
      if (url) {
        y += g4;
        ctx.font = uf(us);
        ctx.fillStyle = c.fg;
        ctx.fillText(url, W / 2, y + us * 0.85);
        y += us;
      }
      if (meta) {
        y += g5;
        ctx.font = mf(ms);
        ctx.fillStyle = c.mute;
        ctx.fillText(meta, W / 2, y + ms * 0.85);
      }
      ctx.globalAlpha = 1;
    },
  };
})();
