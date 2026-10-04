/* Scene "hook": numbered pain steps appear, get struck through, then one question.
   Key = filename: TIMELINE uses { scene: "hook" }. Load after the engine defines SCENES.
   Natural length ~4 s. opts: steps[], question (default: env.str.hook), strikeColor. */
(function () {
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
  function fit(ctx, s, font, max, maxW) {
    ctx.font = font(max);
    const w = ctx.measureText(s).width;
    return w <= maxW ? max : Math.floor((max * maxW) / w);
  }
  /* Greedy word wrap; no spaces (CJK) wraps per character. */
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

  SCENES["hook"] = {
    draw(ctx, lt, opts, env) {
      const { W, H, ease, brand, fonts } = env;
      const c = brand.colors;
      const str = env.str.hook || {};
      const steps = opts.steps || str.steps || [];
      const question = opts.question || str.question || "";
      const u = Math.min(W, H) / 1080;
      ctx.fillStyle = c.bg;
      ctx.fillRect(0, 0, W, H);

      const mx = W * 0.1;
      const gutter = 90 * u;
      const maxW = W - 2 * mx - gutter;
      const big = (s) => `800 ${s}px ${fonts.sans}`;
      const size = Math.min(
        ...steps.map((s) => fit(ctx, s, big, 84 * u, maxW)),
        84 * u,
      );
      const lh = size * 1.35;
      const x0 = mx + gutter;
      const y0 = H / 2 - ((steps.length - 1) * lh) / 2 + size * 0.35;
      const gap = Math.min(0.42, 1.7 / Math.max(1, steps.length));
      const strike = 0.25 + steps.length * gap + 0.35;
      const out = ease.expoInOut(seg(lt, strike + 0.45, strike + 0.95));

      ctx.save();
      ctx.translate(-W * 0.14 * out, 0);
      ctx.globalAlpha = 1 - out;
      steps.forEach((line, i) => {
        const t0 = 0.15 + i * gap;
        const p = seg(lt, t0, t0 + 0.5);
        if (p <= 0) return;
        const y = y0 + i * lh;
        const dim = seg(lt, strike + i * 0.05, strike + 0.3 + i * 0.05);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, y - lh * 0.85, W, lh);
        ctx.clip();
        ctx.textBaseline = "alphabetic";
        ctx.textAlign = "left";
        ctx.font = `500 ${Math.round(24 * u)}px ${fonts.mono}`;
        ctx.fillStyle = rgba(c.mute, 1 - 0.6 * dim);
        ctx.fillText(
          String(i + 1).padStart(2, "0"),
          mx,
          y - size * 0.1 + lh * (1 - ease.expoOut(p)),
        );
        ctx.font = big(size);
        ctx.fillStyle = rgba(c.fg, 1 - 0.7 * dim);
        ctx.fillText(line, x0, y + lh * (1 - ease.backOut(p, 1.4)));
        ctx.restore();
        const s = ease.expoInOut(dim);
        if (s > 0) {
          ctx.font = big(size);
          const w = ctx.measureText(line).width;
          ctx.fillStyle = opts.strikeColor || "#FF5A5A";
          ctx.fillRect(
            x0 - 10 * u,
            y - size * 0.32,
            (w + 20 * u) * s,
            Math.max(4, size * 0.08),
          );
        }
      });
      const shown = steps.filter((_, i) => lt > 0.15 + i * gap).length;
      ctx.font = `500 ${Math.round(24 * u)}px ${fonts.mono}`;
      ctx.fillStyle = c.mute;
      ctx.textAlign = "right";
      ctx.fillText(
        `${String(shown).padStart(2, "0")} / ${String(steps.length).padStart(2, "0")}`,
        W - mx,
        mx * 0.9,
      );
      ctx.restore();

      /* the question: word by word, wrapped to the frame */
      const q0 = strike + 0.6;
      if (lt < q0 || !question) return;
      const qFont = (s) => `800 ${s}px ${fonts.sans}`;
      const qSize = Math.round(104 * u);
      const lines = wrap(ctx, question, qFont(qSize), W * 0.82);
      const qs = Math.min(
        qSize,
        ...lines.map((l) => fit(ctx, l, qFont, qSize, W * 0.86)),
      );
      const qlh = qs * 1.2;
      ctx.font = qFont(qs);
      ctx.textAlign = "left";
      ctx.fillStyle = c.fg;
      const spW = ctx.measureText(" ").width;
      let k = 0;
      lines.forEach((line, li) => {
        const words = line.split(" ");
        const widths = words.map((w) => ctx.measureText(w).width);
        let x =
          W / 2 -
          (widths.reduce((a, b) => a + b, 0) + spW * (words.length - 1)) / 2;
        const y = H / 2 + (li - (lines.length - 1) / 2) * qlh + qs * 0.35;
        words.forEach((w, wi) => {
          const p = seg(lt, q0 + k * 0.07, q0 + k * 0.07 + 0.6);
          k++;
          if (p > 0) {
            ctx.globalAlpha = clamp(p * 2);
            ctx.fillText(w, x, y + qs * 0.8 * (1 - ease.expoOut(p)));
          }
          x += widths[wi] + spW;
        });
      });
      ctx.globalAlpha = 1;
    },
  };
})();
