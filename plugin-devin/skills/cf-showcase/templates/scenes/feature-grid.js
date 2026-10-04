/* Scene "feature-grid": up to 6 tiles with a staggered reveal. Each tile has its own
   deterministic micro-animation keyed by index: pulse, orbit dot, bar fill, check draw,
   wave, blink. Grid is 3x2 in landscape/square and 2x3 in portrait.
   Key = filename: TIMELINE uses { scene: "feature-grid" }. Load after the engine defines SCENES.
   Natural length ~4 s. opts (defaults: env.str.grid): heading, features [{ title, desc, icon? }]
   where icon is a short glyph drawn in the middle of the tile art. */
(function () {
  const TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const lerp = (a, b, t) => a + (b - a) * t;
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
  /* Wrap to at most maxLines; the last kept line gets an ellipsis if text was cut. */
  function wrap(ctx, s, font, maxW, maxLines) {
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
    if (lines.length > maxLines) {
      let l = lines[maxLines - 1];
      while (l.length > 1 && ctx.measureText(l + "…").width > maxW)
        l = l.slice(0, -1);
      lines.length = maxLines;
      lines[maxLines - 1] = l + "…";
    }
    return lines;
  }

  /* micro-animations: v = seconds since the tile appeared; box = art area */
  const ART = [
    function pulse(ctx, b, v, c, u) {
      const cx = b.x + b.w / 2,
        cy = b.y + b.h / 2,
        R = Math.min(b.w, b.h) * 0.42;
      for (let k = 0; k < 3; k++) {
        const p = (((v * 0.7 + k / 3) % 1) + 1) % 1;
        ctx.strokeStyle = rgba(c.accent, 0.6 * (1 - p));
        ctx.lineWidth = 3 * u;
        ctx.beginPath();
        ctx.arc(cx, cy, R * (0.25 + 0.75 * p), 0, TAU);
        ctx.stroke();
      }
      ctx.fillStyle = c.accent;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.22 * (1 + 0.08 * Math.sin(v * 6)), 0, TAU);
      ctx.fill();
    },
    function orbitDot(ctx, b, v, c, u) {
      const cx = b.x + b.w / 2,
        cy = b.y + b.h / 2,
        R = Math.min(b.w, b.h) * 0.36;
      ctx.strokeStyle = rgba(c.fg, 0.15);
      ctx.lineWidth = 2 * u;
      ctx.beginPath();
      ctx.ellipse(cx, cy, R * 1.4, R * 0.7, 0, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = rgba(c.accent, 0.9);
      ctx.beginPath();
      ctx.arc(cx, cy, R * 0.3, 0, TAU);
      ctx.fill();
      for (let k = 0; k < 2; k++) {
        const a = v * 2.2 + k * Math.PI;
        ctx.fillStyle = k ? c.accent2 : c.fg;
        ctx.beginPath();
        ctx.arc(
          cx + Math.cos(a) * R * 1.4,
          cy + Math.sin(a) * R * 0.7,
          8 * u,
          0,
          TAU,
        );
        ctx.fill();
      }
    },
    function barFill(ctx, b, v, c, u, hash) {
      const n = 6,
        gap = b.w * 0.03,
        bw = (b.w * 0.7 - gap * (n - 1)) / n,
        x0 = b.x + b.w * 0.15;
      for (let k = 0; k < n; k++) {
        const target = 0.3 + 0.7 * hash(k, 3, 17);
        const p = 1 - Math.pow(1 - seg(v, 0.1 + k * 0.08, 0.8 + k * 0.08), 3);
        const h = b.h * 0.75 * target * p;
        rr(ctx, x0 + k * (bw + gap), b.y + b.h * 0.88 - h, bw, h, 6 * u);
        ctx.fillStyle = k === n - 1 ? c.accent2 : c.accent;
        ctx.fill();
      }
    },
    function checkDraw(ctx, b, v, c, u) {
      const cx = b.x + b.w / 2,
        cy = b.y + b.h / 2,
        R = Math.min(b.w, b.h) * 0.34;
      const p = seg(v, 0.1, 0.7),
        q = seg(v, 0.6, 1.1);
      ctx.strokeStyle = c.accent;
      ctx.lineWidth = 6 * u;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + TAU * p);
      ctx.stroke();
      if (q > 0) {
        const P = [
          [-0.45, 0.02],
          [-0.12, 0.34],
          [0.5, -0.32],
        ];
        const a = clamp(q * 2),
          bb = clamp(q * 2 - 1);
        ctx.strokeStyle = c.accent2;
        ctx.beginPath();
        ctx.moveTo(cx + P[0][0] * R, cy + P[0][1] * R);
        ctx.lineTo(
          cx + lerp(P[0][0], P[1][0], a) * R,
          cy + lerp(P[0][1], P[1][1], a) * R,
        );
        if (bb > 0)
          ctx.lineTo(
            cx + lerp(P[1][0], P[2][0], bb) * R,
            cy + lerp(P[1][1], P[2][1], bb) * R,
          );
        ctx.stroke();
      }
    },
    function wave(ctx, b, v, c, u) {
      const cy = b.y + b.h / 2,
        amp = b.h * 0.22;
      [c.accent, c.accent2].forEach((col, k) => {
        ctx.strokeStyle = col;
        ctx.lineWidth = (4 - k) * u;
        ctx.beginPath();
        for (let i = 0; i <= 60; i++) {
          const f = i / 60,
            x = b.x + b.w * (0.1 + 0.8 * f);
          const env2 = Math.sin(f * Math.PI);
          const y =
            cy + Math.sin(f * 9 + v * (4 + k) + k) * amp * env2 * (k ? 0.6 : 1);
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      });
    },
    function blink(ctx, b, v, c, u, hash) {
      const cols = 7,
        rows = 3,
        s = Math.min((b.w * 0.7) / cols, (b.h * 0.7) / rows);
      const x0 = b.x + (b.w - s * cols) / 2,
        y0 = b.y + (b.h - s * rows) / 2;
      for (let r = 0; r < rows; r++)
        for (let k = 0; k < cols; k++) {
          const phase = hash(k, r, 5);
          const on = Math.floor(v * 3 + phase * 6) % 3 === 0;
          ctx.fillStyle = on ? c.accent2 : rgba(c.fg, 0.12);
          ctx.beginPath();
          ctx.arc(x0 + (k + 0.5) * s, y0 + (r + 0.5) * s, s * 0.3, 0, TAU);
          ctx.fill();
        }
    },
  ];

  SCENES["feature-grid"] = {
    draw(ctx, lt, opts, env) {
      const { W, H, ease, spring, brand, fonts, hash } = env;
      const c = brand.colors;
      const d = env.str.grid || {};
      const heading =
        opts.heading !== undefined ? opts.heading : d.heading || "";
      const feats = (opts.features || d.features || []).slice(0, 6);
      const u = Math.min(W, H) / 1080;
      ctx.fillStyle = c.bg;
      ctx.fillRect(0, 0, W, H);

      const mx = W * 0.07,
        my = H * 0.06;
      const hf = (s) => `800 ${s}px ${fonts.sans}`;
      const hs = heading ? fit(ctx, heading, hf, 72 * u, W - 2 * mx) : 0;
      if (heading) {
        const p = ease.expoOut(seg(lt, 0.05, 0.7));
        ctx.globalAlpha = p;
        ctx.font = hf(hs);
        ctx.fillStyle = c.fg;
        ctx.textAlign = "center";
        ctx.fillText(heading, W / 2, my + hs + 30 * u * (1 - p));
        ctx.globalAlpha = 1;
      }

      const cols = W / H >= 0.9 ? 3 : 2;
      const rows = Math.max(1, Math.ceil(feats.length / cols));
      const gap = 32 * u;
      const top = my + (heading ? hs * 1.6 : 0);
      const areaH = H - top - my;
      const tw = (W - 2 * mx - gap * (cols - 1)) / cols;
      const th = Math.min((areaH - gap * (rows - 1)) / rows, tw * 1.1);
      const y0 = top + (areaH - (th * rows + gap * (rows - 1))) / 2;
      const pad = 28 * u;
      const tf = (s) => `600 ${s}px ${fonts.sans}`;
      const ts = Math.min(
        34 * u,
        ...feats.map((f) => fit(ctx, f.title || "", tf, 34 * u, tw - 2 * pad)),
      );
      const ds = Math.round(22 * u);
      const df = `400 ${ds}px ${fonts.sans}`;
      const textH = ts * 1.4 + ds * 1.4 * 2 + pad * 1.6;

      feats.forEach((f, k) => {
        const col = k % cols,
          row = Math.floor(k / cols);
        const inRow = Math.min(cols, feats.length - row * cols);
        const rowX = mx + ((cols - inRow) * (tw + gap)) / 2;
        const x = rowX + col * (tw + gap),
          y = y0 + row * (th + gap);
        const t0 = 0.35 + k * 0.1;
        const p = spring(lt - t0, { stiffness: 1.8, damping: 0.5 });
        if (p <= 0) return;
        ctx.save();
        ctx.globalAlpha = clamp(p * 2);
        ctx.translate(x + tw / 2, y + th / 2 + 60 * u * (1 - Math.min(1, p)));
        ctx.scale(0.88 + 0.12 * p, 0.88 + 0.12 * p);
        ctx.translate(-(x + tw / 2), -(y + th / 2));
        ctx.shadowColor = "rgba(0,0,0,0.3)";
        ctx.shadowBlur = 30 * u;
        ctx.shadowOffsetY = 12 * u;
        rr(ctx, x, y, tw, th, 22 * u);
        ctx.fillStyle = c.panel;
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.strokeStyle = rgba(c.fg, 0.08);
        ctx.lineWidth = 1.5 * u;
        ctx.stroke();
        const art = {
          x: x + pad,
          y: y + pad,
          w: tw - 2 * pad,
          h: Math.max(20 * u, th - textH - pad),
        };
        ctx.save();
        rr(ctx, art.x, art.y, art.w, art.h, 14 * u);
        ctx.fillStyle = rgba(c.fg, 0.03);
        ctx.fill();
        ctx.clip();
        ART[k % ART.length](ctx, art, lt - t0 - 0.15, c, u, hash);
        if (f.icon) {
          const is = Math.min(art.h, art.w) * 0.35;
          ctx.font = `600 ${is}px ${fonts.sans}`;
          ctx.fillStyle = c.fg;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(f.icon, art.x + art.w / 2, art.y + art.h / 2);
          ctx.textBaseline = "alphabetic";
        }
        ctx.restore();
        ctx.textAlign = "left";
        ctx.font = tf(ts);
        ctx.fillStyle = c.fg;
        const ty = art.y + art.h + pad * 0.6 + ts;
        ctx.fillText(f.title || "", x + pad, ty);
        ctx.fillStyle = c.mute;
        wrap(ctx, f.desc || "", df, tw - 2 * pad, 2).forEach((l, i) =>
          ctx.fillText(l, x + pad, ty + ts * 0.4 + ds * 1.4 * (i + 1)),
        );
        ctx.restore();
      });
    },
  };
})();
