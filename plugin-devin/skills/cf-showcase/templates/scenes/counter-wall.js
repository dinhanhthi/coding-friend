/* Scene "counter-wall": an animated counter on a card over a tilted wall of real names,
   rows scrolling in opposite directions (seamless loop, pure function of lt).
   Key = filename: TIMELINE uses { scene: "counter-wall" }. Load after the engine defines SCENES.
   Natural length ~3 s. opts (defaults: env.str.wall): count, suffix, sep (thousands
   separator), label, names[]. Count and names must come from the fact sheet; a decimal count
   (99.9) animates with the same number of decimals. */
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
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
  }
  function fit(ctx, s, font, max, maxW) {
    ctx.font = font(max);
    const w = ctx.measureText(s).width;
    return w <= maxW ? max : Math.floor((max * maxW) / w);
  }
  /* n with `dec` decimals; separators go into the integer part only. The decimal mark is
     "," when sep is "." (for example vi), "." otherwise. */
  function num(n, dec, sep) {
    const [i, f] = n.toFixed(dec).split(".");
    const int = i.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
    return f ? int + (sep === "." ? "," : ".") + f : int;
  }

  SCENES["counter-wall"] = {
    draw(ctx, lt, opts, env) {
      const { W, H, ease, spring, brand, fonts } = env;
      const c = brand.colors;
      const d = env.str.wall || {};
      const pick = (k, f) =>
        opts[k] !== undefined ? opts[k] : d[k] !== undefined ? d[k] : f;
      const count = Number(pick("count", 0)) || 0;
      const suffix = pick("suffix", "");
      const sep = pick("sep", ",");
      const label = pick("label", "");
      const names = pick("names", []);
      const u = Math.min(W, H) / 1080;

      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, rgba(c.accent, 1));
      g.addColorStop(1, c.bg);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      /* wall: rotated rows covering the whole frame diagonal */
      if (names.length) {
        const D = Math.hypot(W, H);
        const rowH = 84 * u,
          ph = 60 * u,
          gap = 24 * u;
        const nf = `600 ${Math.round(26 * u)}px ${fonts.sans}`;
        ctx.font = nf;
        const widths = names.map((s) => ctx.measureText(s).width + 50 * u);
        const period = widths.reduce((a, b) => a + b + gap, 0);
        const rows = Math.ceil(D / rowH) + 1;
        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.rotate(-0.18);
        ctx.textAlign = "center";
        for (let r = 0; r < rows; r++) {
          const dir = r % 2 ? 1 : -1;
          const y = -D / 2 + r * rowH;
          const shift = (r * 5) % names.length;
          const off =
            (((dir * lt * (60 + (r % 4) * 12) * u + r * 311 * u) % period) +
              period) %
            period;
          const a = ease.expoOut(
            seg(lt, 0.05 + (r % 6) * 0.04, 0.8 + (r % 6) * 0.04),
          );
          let x = -D / 2 - period + off;
          let k = 0;
          while (x < D / 2) {
            const i = (k + shift) % names.length;
            const w = widths[i];
            if (x + w > -D / 2) {
              ctx.globalAlpha = 0.16 * a;
              rr(ctx, x, y, w, ph, ph / 2);
              ctx.fillStyle = "#fff";
              ctx.fill();
              ctx.globalAlpha = 0.6 * a;
              ctx.font = nf;
              ctx.fillText(names[i], x + w / 2, y + ph / 2 + 9 * u);
            }
            x += w + gap;
            k++;
          }
        }
        ctx.restore();
        ctx.globalAlpha = 1;
      }

      /* counter card: size measured from the final number and the label */
      const p = spring(lt - 0.3, { stiffness: 1.7, damping: 0.5 });
      if (p <= 0) return;
      const dec = (String(count).split(".")[1] || "").length;
      const final = num(count, dec, sep) + suffix;
      const nfont = (s) => `800 ${s}px ${fonts.sans}`;
      const ns = fit(ctx, final, nfont, 190 * u, W * 0.72);
      const lf = (s) => `600 ${s}px ${fonts.sans}`;
      const ls = label ? fit(ctx, label, lf, 38 * u, W * 0.72) : 0;
      ctx.font = nfont(ns);
      const nw = ctx.measureText(final).width;
      ctx.font = lf(ls);
      const lw = label ? ctx.measureText(label).width : 0;
      const pad = 64 * u;
      const cw = Math.min(W * 0.9, Math.max(nw, lw) + 2 * pad);
      const ch = pad * 1.4 + ns * 0.9 + (label ? ls * 1.8 : 0);
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(p, p);
      ctx.shadowColor = "rgba(0,0,0,0.4)";
      ctx.shadowBlur = 80 * u;
      ctx.shadowOffsetY = 30 * u;
      rr(ctx, -cw / 2, -ch / 2, cw, ch, 36 * u);
      ctx.fillStyle = c.panel;
      ctx.fill();
      ctx.shadowColor = "transparent";
      const shown =
        lt > 1.9
          ? final
          : num(count * ease.expoOut(seg(lt, 0.5, 1.9)), dec, sep);
      ctx.font = nfont(ns);
      ctx.fillStyle = c.fg;
      ctx.textAlign = "center";
      const top = -ch / 2 + pad * 0.7;
      ctx.fillText(shown, 0, top + ns * 0.8);
      if (label) {
        ctx.globalAlpha = ease.expoOut(seg(lt, 0.8, 1.4));
        ctx.font = lf(ls);
        ctx.fillStyle = c.mute;
        ctx.fillText(label, 0, top + ns * 0.9 + ls * 1.3);
      }
      ctx.restore();
    },
  };
})();
