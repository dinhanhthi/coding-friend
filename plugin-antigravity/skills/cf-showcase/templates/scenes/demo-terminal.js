/* Scene "demo-terminal": a terminal window types real commands and prints their real output.
   Use it for CLIs and libraries. Key = filename: TIMELINE uses { scene: "demo-terminal" }.
   Load after the engine defines SCENES. Natural length: set by the lines (~9 s for 5 lines).
   opts (defaults: env.str.terminal): window (title), prompt, chip, caption,
   lines: [{ cmd } | { out }], typeSpeed (seconds per character, default 0.045).
   Copy commands and output verbatim from the docs; never invent output. */
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
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
  }
  function fit(ctx, s, font, max, maxW) {
    ctx.font = font(max);
    const w = ctx.measureText(s).width;
    return w <= maxW ? max : Math.floor((max * maxW) / w);
  }
  function ellipsize(ctx, s, maxW) {
    if (ctx.measureText(s).width <= maxW) return s;
    let t = s;
    while (t.length > 1 && ctx.measureText(t + "…").width > maxW)
      t = t.slice(0, -1);
    return t + "…";
  }
  /* Pure schedule: when each line starts and how long it takes. */
  function schedule(lines, speed) {
    let t = 0.7;
    return lines.map((l) => {
      if (l.cmd !== undefined) {
        const typing = Math.min(2.2, l.cmd.length * speed);
        const e = { ...l, t0: t + 0.35, t1: t + 0.35 + typing };
        t = e.t1 + 0.3;
        return e;
      }
      const e = { ...l, t0: t, t1: t };
      t += 0.14;
      return e;
    });
  }

  SCENES["demo-terminal"] = {
    draw(ctx, lt, opts, env) {
      const { W, H, ease, spring, brand, fonts } = env;
      const c = brand.colors;
      const d = env.str.terminal || {};
      const pick = (k, f) =>
        opts[k] !== undefined ? opts[k] : d[k] !== undefined ? d[k] : f;
      const lines = pick("lines", []);
      const prompt = pick("prompt", "$");
      const u = Math.min(W, H) / 1080;
      const land = W / H > 1.2;

      /* background */
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, c.bg);
      g.addColorStop(1, rgba(c.accent, 1));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      /* layout */
      const capH = 130 * u;
      const ww = land ? Math.min(W * 0.78, (H - capH) * 1.9) : W * 0.9;
      const wh = land
        ? Math.min(H - capH - 80 * u, ww * 0.58)
        : Math.min(H * 0.5, ww * 1.05);
      const wx = (W - ww) / 2;
      const wy = (H - capH - wh) / 2 + capH;
      const bar = 50 * u;
      const pad = 44 * u;
      const cw = ww - 2 * pad;
      const mono = (s) => `400 ${s}px ${fonts.mono}`;
      const longest = lines
        .map((l) => (l.cmd !== undefined ? `${prompt} ${l.cmd}` : l.out || ""))
        .reduce((a, b) => (b.length > a.length ? b : a), "");
      const size = Math.max(
        16 * u,
        Math.min(30 * u, fit(ctx, longest + "  ", mono, 30 * u, cw)),
      );
      const lh = size * 1.6;

      /* caption */
      const chip = pick("chip", ""),
        caption = pick("caption", "");
      const cp = ease.expoOut(seg(lt, 0.3, 0.9));
      if (cp > 0 && (chip || caption)) {
        const cf = (s) => `600 ${s}px ${fonts.sans}`;
        ctx.font = cf(26 * u);
        const chipW = chip ? ctx.measureText(chip).width + 40 * u : 0;
        const gap = chip ? 20 * u : 0;
        const cs = fit(ctx, caption, cf, 36 * u, W * 0.9 - chipW - gap);
        ctx.font = cf(cs);
        const x0 = W / 2 - (chipW + gap + ctx.measureText(caption).width) / 2;
        const y = wy - 56 * u + 20 * u * (1 - cp);
        ctx.globalAlpha = cp;
        if (chip) {
          rr(ctx, x0, y - 34 * u, chipW, 46 * u, 23 * u);
          ctx.fillStyle = c.fg;
          ctx.fill();
          ctx.font = cf(26 * u);
          ctx.fillStyle = c.bg;
          ctx.textAlign = "center";
          ctx.fillText(chip, x0 + chipW / 2, y - 2 * u);
        }
        ctx.font = cf(cs);
        ctx.fillStyle = c.fg;
        ctx.textAlign = "left";
        ctx.fillText(caption, x0 + chipW + gap, y);
        ctx.globalAlpha = 1;
      }

      /* window */
      const wp = spring(lt, { stiffness: 1.5, damping: 0.6 });
      ctx.save();
      ctx.globalAlpha = clamp(wp * 2);
      const sc = 0.94 + 0.06 * Math.min(1, wp);
      ctx.translate(W / 2, wy + wh / 2);
      ctx.scale(sc, sc);
      ctx.translate(-W / 2, -(wy + wh / 2));
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 60 * u;
      ctx.shadowOffsetY = 24 * u;
      rr(ctx, wx, wy, ww, wh, 16 * u);
      ctx.fillStyle = "#0B0D12";
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1.5 * u;
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.save();
      rr(ctx, wx, wy, ww, wh, 16 * u);
      ctx.clip();
      ctx.fillRect(wx, wy, ww, bar);
      ["#FF5F57", "#FEBC2E", "#28C840"].forEach((col, i) => {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(wx + 28 * u + i * 26 * u, wy + bar / 2, 8 * u, 0, TAU);
        ctx.fill();
      });
      ctx.font = `500 ${Math.round(20 * u)}px ${fonts.mono}`;
      ctx.fillStyle = "#8A90A8";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        ellipsize(ctx, pick("window", ""), ww - 240 * u),
        wx + ww / 2,
        wy + bar / 2,
      );
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";

      /* rows: visible lines so far, scrolled so the newest row stays inside the window */
      const sched = schedule(lines, pick("typeSpeed", 0.045));
      const rows = [];
      let caretRow = -1,
        typing = false;
      sched.forEach((l, i) => {
        if (l.cmd !== undefined) {
          if (lt < l.t0 - 0.35) return;
          const n = Math.floor(l.cmd.length * seg(lt, l.t0, l.t1));
          rows.push({ cmd: true, s: l.cmd.slice(0, n) });
          if (lt < l.t1 + 0.3 || i === sched.length - 1) {
            caretRow = rows.length - 1;
            typing = lt >= l.t0 && lt < l.t1;
          }
        } else if (lt >= l.t0) {
          rows.push({ cmd: false, s: l.out || "", t0: l.t0 });
          caretRow = -1;
        }
      });
      const last = sched[sched.length - 1];
      const idle = !last || lt > last.t1 + 0.3;
      if (idle && (!last || last.cmd === undefined)) {
        rows.push({ cmd: true, s: "" });
        caretRow = rows.length - 1;
      }
      const top = wy + bar + pad * 0.8;
      const fitRows = Math.max(1, Math.floor((wh - bar - pad * 1.6) / lh));
      const scroll = Math.max(0, rows.length - fitRows);
      ctx.font = mono(size);
      const pw = ctx.measureText(prompt + " ").width;
      rows.slice(scroll).forEach((r, k) => {
        const y = top + k * lh + size;
        const x = wx + pad;
        if (r.cmd) {
          ctx.fillStyle = c.accent2;
          ctx.fillText(prompt, x, y);
          ctx.fillStyle = "#F3F5FA";
          ctx.fillText(r.s, x + pw, y);
        } else {
          ctx.globalAlpha = seg(lt, r.t0, r.t0 + 0.12);
          ctx.fillStyle = "#A9B0C6";
          ctx.fillText(r.s, x, y);
          ctx.globalAlpha = 1;
        }
        /* block caret: solid while typing, blinks (derived from lt) when idle */
        if (
          scroll + k === caretRow &&
          (typing || Math.floor(lt * 2) % 2 === 0)
        ) {
          ctx.fillStyle = rgba(c.accent2, 0.85);
          ctx.fillRect(
            x + pw + ctx.measureText(r.s).width + 2 * u,
            y - size * 0.82,
            size * 0.58,
            size * 1.05,
          );
        }
      });
      ctx.restore();
      ctx.restore();
    },
  };
})();
