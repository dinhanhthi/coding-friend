/* Scene "reveal": logo springs in with squash & stretch, or (no logo) the wordmark with a
   seeded particle burst; tagline underneath.
   Key = filename: TIMELINE uses { scene: "reveal" }. Load after the engine defines SCENES.
   Natural length ~4 s. opts: logo (a loaded HTMLImageElement; the host awaits it before
   ready), wordmark, tagline, particles (count, default 56). Defaults: env.str / env.brand. */
(function () {
  const TAU = Math.PI * 2;
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

  SCENES["reveal"] = {
    draw(ctx, lt, opts, env) {
      const { W, H, ease, spring, brand, fonts } = env;
      const c = brand.colors;
      const str = env.str;
      const u = Math.min(W, H) / 1080;
      const logo = loaded(opts.logo) ? opts.logo : null;
      const word = opts.wordmark || str.wordmark || brand.name;
      const tagline =
        opts.tagline || (str.reveal && str.reveal.tagline) || str.tagline || "";

      ctx.fillStyle = c.bg;
      ctx.fillRect(0, 0, W, H);
      const glow = ctx.createRadialGradient(
        W / 2,
        H * 0.45,
        0,
        W / 2,
        H * 0.45,
        Math.max(W, H) * 0.6,
      );
      glow.addColorStop(0, rgba(c.accent, 0.3 * seg(lt, 0, 0.8)));
      glow.addColorStop(1, rgba(c.accent, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      /* layout: [logo] + wordmark + tagline, stacked and centered as one group */
      const wmFont = (s) => `800 ${s}px ${fonts.sans}`;
      const wmSize = fit(ctx, word, wmFont, (logo ? 120 : 180) * u, W * 0.84);
      const tgFont = `600 ${Math.round(40 * u)}px ${fonts.sans}`;
      const tgLines = tagline ? wrap(ctx, tagline, tgFont, W * 0.8) : [];
      const tglh = 40 * u * 1.35;
      const logoS = logo ? Math.min(W, H) * 0.28 : 0;
      const gapA = logo ? 48 * u : 0;
      const gapB = 44 * u;
      const total =
        logoS +
        gapA +
        wmSize +
        (tgLines.length ? gapB + tgLines.length * tglh : 0);
      let y = (H - total) / 2;

      if (logo) {
        /* squash & stretch from the spring's velocity; anchored at the logo's base */
        const k = { stiffness: 1.7, damping: 0.42 };
        const p = spring(lt - 0.1, k);
        const v = (p - spring(lt - 0.12, k)) / 0.02;
        const st = clamp(v * 0.05, -0.22, 0.22);
        const base = y + logoS;
        ctx.save();
        ctx.translate(W / 2, base);
        ctx.scale(Math.max(0, p) * (1 - st * 0.6), Math.max(0, p) * (1 + st));
        ctx.shadowColor = "rgba(0,0,0,0.35)";
        ctx.shadowBlur = 40 * u;
        ctx.shadowOffsetY = 18 * u;
        ctx.drawImage(logo, -logoS / 2, -logoS, logoS, logoS);
        ctx.restore();
        y = base + gapA;
      }

      /* wordmark */
      const wp = logo
        ? ease.backOut(seg(lt, 0.45, 1.05), 1.6)
        : spring(lt - 0.15, { stiffness: 1.8, damping: 0.45 });
      const cy = y + wmSize * 0.5;
      if (!logo) {
        /* particle burst: env.rand is re-seeded every frame, so a fixed call order is stable */
        const n = opts.particles || 56;
        const bp = seg(lt, 0.25, 1.9);
        for (let i = 0; i < n; i++) {
          const a = env.rand() * TAU;
          const d = (0.25 + env.rand() * 0.75) * Math.min(W, H) * 0.42;
          const r = (3 + env.rand() * 7) * u;
          const col = env.rand() < 0.5 ? c.accent : c.accent2;
          if (bp <= 0 || bp >= 1) continue;
          const e = ease.expoOut(bp);
          ctx.fillStyle = rgba(col, 1 - bp);
          ctx.beginPath();
          ctx.arc(
            W / 2 + Math.cos(a) * d * e,
            cy + Math.sin(a) * d * e * 0.8,
            r * (1 - bp * 0.6),
            0,
            TAU,
          );
          ctx.fill();
        }
        const rp = seg(lt, 0.2, 0.9);
        if (rp > 0 && rp < 1) {
          ctx.strokeStyle = rgba(c.accent, 1 - rp);
          ctx.lineWidth = 6 * u * (1 - rp);
          ctx.beginPath();
          ctx.arc(W / 2, cy, Math.min(W, H) * 0.45 * ease.expoOut(rp), 0, TAU);
          ctx.stroke();
        }
      }
      if (wp > 0) {
        ctx.save();
        ctx.globalAlpha = clamp(wp * 1.6);
        ctx.translate(W / 2, cy);
        ctx.scale(wp, wp);
        ctx.font = wmFont(wmSize);
        ctx.fillStyle = c.fg;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.letterSpacing = -wmSize * 0.03 + "px";
        ctx.fillText(word, 0, 0);
        ctx.letterSpacing = "0px";
        ctx.restore();
      }

      /* tagline, line by line */
      y += wmSize + gapB;
      ctx.font = tgFont;
      ctx.fillStyle = c.mute;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      tgLines.forEach((line, i) => {
        const p = seg(lt, 1.1 + i * 0.12, 1.8 + i * 0.12);
        if (p <= 0) return;
        ctx.globalAlpha = p;
        ctx.fillText(
          line,
          W / 2,
          y + (i + 0.8) * tglh + 30 * u * (1 - ease.expoOut(p)),
        );
      });
      ctx.globalAlpha = 1;
    },
  };
})();
