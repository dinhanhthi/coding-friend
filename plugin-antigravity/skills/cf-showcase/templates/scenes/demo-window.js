/* Scene "demo-window": a realistic OS window. The cursor selects text, triggers an action,
   the result streams into a floating panel (clamped inside the window), then gets applied.
   Key = filename: TIMELINE uses { scene: "demo-window" }. Load after the engine defines SCENES.
   Natural length ~9 s. opts (defaults: env.str.demo): window (title), body, select (a phrase
   of body), action, result, apply, done, chip, caption, and cursor: keyframes
   [{ t, at, down?, up?, click? }] where at is [fx, fy] (fractions of the window) or an anchor
   name: "selStart" | "selEnd" | "action" | "apply". The first down/up drags the selection,
   the first click on "action" opens the result, the first click on "apply" applies it.
   Replace the sample document with the real UI from the fact sheet. */
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
  function ellipsize(ctx, s, maxW) {
    if (ctx.measureText(s).width <= maxW) return s;
    let t = s;
    while (t.length > 1 && ctx.measureText(t + "…").width > maxW)
      t = t.slice(0, -1);
    return t + "…";
  }
  /* Word layout: [{ s, x, y, w }] with y = line index, x relative to the left edge. */
  function layoutWords(ctx, s, font, maxW) {
    ctx.font = font;
    const sp = ctx.measureText(" ").width;
    const out = [];
    let x = 0,
      y = 0;
    for (const word of s.split(/\s+/).filter(Boolean)) {
      const w = ctx.measureText(word).width;
      if (x > 0 && x + w > maxW) {
        x = 0;
        y++;
      }
      out.push({ s: word, x, y, w });
      x += w + sp;
    }
    return out;
  }
  function findRange(words, phrase) {
    const p = (phrase || "").split(/\s+/).filter(Boolean);
    for (let i = 0; p.length && i + p.length <= words.length; i++)
      if (p.every((w, k) => words[i + k].s === w)) return [i, i + p.length];
    const a = Math.min(2, Math.max(0, words.length - 1));
    return [a, Math.min(words.length, a + 3)];
  }
  function lines(ctx, s, font, maxW) {
    const ws = layoutWords(ctx, s, font, maxW);
    const out = [];
    ws.forEach(
      (w) => (out[w.y] = out[w.y] === undefined ? w.s : out[w.y] + " " + w.s),
    );
    return out;
  }
  function cursor(ctx, x, y, s, press, beam) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s * (1 - 0.12 * press), s * (1 - 0.12 * press));
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    if (beam) {
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-5, -14);
      ctx.quadraticCurveTo(0, -12, 0, -9);
      ctx.lineTo(0, 9);
      ctx.quadraticCurveTo(0, 12, -5, 14);
      ctx.moveTo(5, -14);
      ctx.quadraticCurveTo(0, -12, 0, -9);
      ctx.moveTo(0, 9);
      ctx.quadraticCurveTo(0, 12, 5, 14);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 25);
      ctx.lineTo(6.5, 19);
      ctx.lineTo(11, 29);
      ctx.lineTo(15, 27.2);
      ctx.lineTo(10.6, 17.6);
      ctx.lineTo(19, 17.6);
      ctx.closePath();
      ctx.fillStyle = "#0B0B0B";
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.8;
      ctx.lineJoin = "round";
      ctx.stroke();
    }
    ctx.restore();
  }
  function check(ctx, x, y, r, color, p = 1) {
    ctx.strokeStyle = color;
    ctx.lineWidth = r * 0.28;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    const pts = [
      [-0.5, 0],
      [-0.15, 0.35],
      [0.55, -0.4],
    ];
    ctx.moveTo(x + pts[0][0] * r, y + pts[0][1] * r);
    const a = clamp(p * 2),
      b = clamp(p * 2 - 1);
    ctx.lineTo(
      x + lerp(pts[0][0], pts[1][0], a) * r,
      y + lerp(pts[0][1], pts[1][1], a) * r,
    );
    if (b > 0)
      ctx.lineTo(
        x + lerp(pts[1][0], pts[2][0], b) * r,
        y + lerp(pts[1][1], pts[2][1], b) * r,
      );
    ctx.stroke();
  }

  /* Static layout: depends on env + opts only, never on time. */
  function layout(ctx, env, T) {
    const { W, H } = env;
    const u = Math.min(W, H) / 1080;
    const land = W / H > 1.2;
    const capH = 130 * u;
    const ww = land ? Math.min(W * 0.8, (H - capH) * 1.8) : W * 0.9;
    const wh = land
      ? Math.min(H - capH - 70 * u, ww * 0.6)
      : Math.min(H * 0.56, ww * 1.1);
    const wx = (W - ww) / 2;
    const wy = (H - capH - wh) / 2 + capH;
    const bar = 52 * u;
    const content = {
      x: wx + 64 * u,
      y: wy + bar + 56 * u,
      w: ww - 128 * u,
      h: wh - bar - 112 * u,
    };
    const size = Math.round((land ? 36 : 40) * u);
    const font = `400 ${size}px ${env.fonts.sans}`;
    const lh = size * 1.6;
    const words = layoutWords(ctx, T.body, font, content.w);
    const range = findRange(words, T.select);
    const replaced = T.body.includes(T.select)
      ? T.body.replace(T.select, T.result)
      : T.body;
    const words2 = layoutWords(ctx, replaced, font, content.w);
    const resStart = T.body.includes(T.select)
      ? T.body.slice(0, T.body.indexOf(T.select)).split(/\s+/).filter(Boolean)
          .length
      : -1;
    const range2 = [
      resStart,
      resStart + T.result.split(/\s+/).filter(Boolean).length,
    ];
    const pos = (w) => [content.x + w.x, content.y + w.y * lh + size];
    const first = words[range[0]] || { x: 0, y: 0, w: 0 };
    const last = words[range[1] - 1] || first;
    const selStart = [pos(first)[0] - 2 * u, pos(first)[1] - size * 0.35];
    const selEnd = [pos(last)[0] + last.w + 2 * u, pos(last)[1] - size * 0.35];

    /* floating panel: toolbar with the action, grows into a result card */
    const bfont = `600 ${Math.round(24 * u)}px ${env.fonts.sans}`;
    ctx.font = bfont;
    const bh = 48 * u;
    const bw = ctx.measureText(T.action).width + 76 * u;
    const aw = ctx.measureText(T.apply).width + 56 * u;
    const pw = Math.min(content.w + 64 * u, 640 * u);
    const rsize = Math.round(28 * u);
    const rfont = `400 ${rsize}px ${env.fonts.sans}`;
    const rlh = rsize * 1.5;
    const rlines = lines(ctx, T.result, rfont, pw - 56 * u);
    const ph =
      16 * u + bh + 24 * u + rlines.length * rlh + 24 * u + bh + 20 * u;
    const inner = {
      x: wx + 16 * u,
      y: wy + bar + 12 * u,
      r: wx + ww - 16 * u,
      b: wy + wh - 16 * u,
    };
    let px = clamp(selEnd[0] - pw * 0.35, inner.x, inner.r - pw);
    /* below the whole paragraph so no body text is covered; above the selection if no room */
    const lastLine = words.length ? words[words.length - 1].y : 0;
    let py = content.y + lastLine * lh + size + size * 0.7;
    if (py + ph > inner.b) py = pos(first)[1] - size - 16 * u - ph;
    py = clamp(py, inner.y, inner.b - ph);
    const action = [px + 16 * u + bw / 2, py + 16 * u + bh / 2];
    const apply = [px + pw - 24 * u - aw / 2, py + ph - 20 * u - bh / 2];
    return {
      u,
      land,
      wx,
      wy,
      ww,
      wh,
      bar,
      content,
      size,
      font,
      lh,
      words,
      range,
      words2,
      range2,
      pos,
      selStart,
      selEnd,
      bfont,
      bh,
      bw,
      aw,
      pw,
      ph,
      px,
      py,
      rfont,
      rlh,
      rlines,
      action,
      apply,
    };
  }

  function keyframes(opts) {
    if (Array.isArray(opts.cursor) && opts.cursor.length) return opts.cursor;
    return [
      { t: 0, at: [0.9, 0.92] },
      { t: 0.9, at: "selStart" },
      { t: 1.1, at: "selStart", down: true },
      { t: 2.0, at: "selEnd", up: true },
      { t: 2.7, at: "action", click: true },
      { t: 3.4, at: [0.88, 0.2] },
      { t: 5.8, at: [0.8, 0.3] },
      { t: 6.4, at: "apply", click: true },
      { t: 7.4, at: [0.9, 0.92] },
    ];
  }

  SCENES["demo-window"] = {
    draw(ctx, lt, opts, env) {
      const { W, H, ease, spring, brand, fonts } = env;
      const c = brand.colors;
      const d = env.str.demo || {};
      const T = {};
      for (const k of [
        "window",
        "body",
        "select",
        "action",
        "result",
        "apply",
        "done",
        "chip",
        "caption",
      ])
        T[k] = opts[k] !== undefined ? opts[k] : d[k] || "";
      const L = layout(ctx, env, T);
      const u = L.u;
      const kf = keyframes(opts);
      const at = (a) =>
        Array.isArray(a)
          ? [L.wx + a[0] * L.ww, L.wy + a[1] * L.wh]
          : L[a] || [W / 2, H / 2];
      const tDown = (kf.find((k) => k.down) || { t: 1e9 }).t;
      const tUp = (kf.find((k) => k.up) || { t: tDown }).t;
      const tAction = (
        kf.find((k) => k.click && k.at === "action") || { t: 1e9 }
      ).t;
      const tApply = (kf.find((k) => k.click && k.at === "apply") || { t: 1e9 })
        .t;

      /* wallpaper */
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, rgba(c.accent, 1));
      g.addColorStop(1, c.bg);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      [
        [
          W * 0.2 + W * 0.03 * Math.sin(lt * 0.3),
          H * 0.2,
          Math.max(W, H) * 0.35,
          c.accent2,
          0.25,
        ],
        [
          W * 0.85,
          H * 0.8 + H * 0.03 * Math.cos(lt * 0.25),
          Math.max(W, H) * 0.4,
          c.bg,
          0.5,
        ],
      ].forEach(([x, y, r, col, a]) => {
        const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, rgba(col, a));
        rg.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, W, H);
      });

      /* caption: chip + line, measured, shrunk to fit */
      const cp = ease.expoOut(seg(lt, 0.3, 0.9));
      if (cp > 0 && (T.caption || T.chip)) {
        const cf = (s) => `600 ${s}px ${fonts.sans}`;
        ctx.font = cf(26 * u);
        const chipW = T.chip ? ctx.measureText(T.chip).width + 40 * u : 0;
        const room = W * 0.9 - chipW - 20 * u;
        const cs = fit(ctx, T.caption, cf, 36 * u, room);
        ctx.font = cf(cs);
        const lw = ctx.measureText(T.caption).width;
        const total = chipW + (chipW ? 20 * u : 0) + lw;
        const x0 = W / 2 - total / 2;
        const y = L.wy - 56 * u + 20 * u * (1 - cp);
        ctx.globalAlpha = cp;
        if (T.chip) {
          rr(ctx, x0, y - 34 * u, chipW, 46 * u, 23 * u);
          ctx.fillStyle = c.fg;
          ctx.fill();
          ctx.font = cf(26 * u);
          ctx.fillStyle = c.bg;
          ctx.textAlign = "center";
          ctx.fillText(T.chip, x0 + chipW / 2, y - 2 * u);
        }
        ctx.font = cf(cs);
        ctx.fillStyle = c.fg;
        ctx.textAlign = "left";
        ctx.fillText(T.caption, x0 + chipW + (chipW ? 20 * u : 0), y);
        ctx.globalAlpha = 1;
      }

      /* window */
      const wp = spring(lt, { stiffness: 1.5, damping: 0.6 });
      ctx.save();
      ctx.globalAlpha = clamp(wp * 2);
      const sc = 0.94 + 0.06 * Math.min(1, wp);
      ctx.translate(W / 2, L.wy + L.wh / 2);
      ctx.scale(sc, sc);
      ctx.translate(-W / 2, -(L.wy + L.wh / 2));
      ctx.shadowColor = "rgba(0,0,0,0.45)";
      ctx.shadowBlur = 60 * u;
      ctx.shadowOffsetY = 24 * u;
      rr(ctx, L.wx, L.wy, L.ww, L.wh, 18 * u);
      ctx.fillStyle = c.panel;
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.save();
      rr(ctx, L.wx, L.wy, L.ww, L.wh, 18 * u);
      ctx.clip();
      ctx.fillStyle = rgba(c.fg, 0.05);
      ctx.fillRect(L.wx, L.wy, L.ww, L.bar);
      ctx.fillStyle = rgba(c.fg, 0.1);
      ctx.fillRect(L.wx, L.wy + L.bar - 1, L.ww, 1);
      ["#FF5F57", "#FEBC2E", "#28C840"].forEach((col, i) => {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(L.wx + 28 * u + i * 26 * u, L.wy + L.bar / 2, 8 * u, 0, TAU);
        ctx.fill();
      });
      ctx.font = `600 ${Math.round(22 * u)}px ${fonts.sans}`;
      ctx.fillStyle = c.mute;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        ellipsize(ctx, T.window, L.ww - 240 * u),
        W / 2,
        L.wy + L.bar / 2,
      );
      ctx.textBaseline = "alphabetic";

      /* document: before apply = original with selection, after = replaced text */
      const ap = ease.cubicInOut(seg(lt, tApply + 0.25, tApply + 0.6));
      const drawDoc = (words, range, alpha, mark, hl) => {
        ctx.font = L.font;
        ctx.textAlign = "left";
        words.forEach((w, i) => {
          const [x, y] = L.pos(w);
          const inSel = i >= range[0] && i < range[1];
          if (inSel && mark > 0) {
            const k = i - range[0];
            const f = clamp(mark * (range[1] - range[0]) - k);
            if (f > 0) {
              const tail = i < range[1] - 1 ? ctx.measureText(" ").width : 0;
              ctx.fillStyle = rgba(mark >= 2 ? c.accent2 : c.accent, 0.35 * hl);
              const lead =
                k === 0
                  ? 2 * u
                  : 0; /* no overlap between word rects: no seams */
              const end = i === range[1] - 1 ? 2 * u : 0;
              ctx.fillRect(
                x - lead,
                y - L.size * 0.95,
                (w.w + tail + lead + end) * f,
                L.size * 1.3,
              );
            }
          }
          ctx.fillStyle = rgba(c.fg, alpha);
          ctx.fillText(w.s, x, y);
        });
      };
      const selP = lt < tDown ? 0 : lt < tUp ? seg(lt, tDown, tUp) : 1;
      if (ap < 1) drawDoc(L.words, L.range, 1 - ap, selP, 1 - ap);
      if (ap > 0) {
        const flash = 1 - seg(lt, tApply + 1.2, tApply + 2.2);
        drawDoc(L.words2, L.range2, ap, 2, ap * flash);
      }

      /* floating panel (inside the window clip, so it can never leave it) */
      const tb = ease.backOut(seg(lt, tUp + 0.1, tUp + 0.45), 1.8);
      const out = ease.expoIn(seg(lt, tApply + 0.1, tApply + 0.4));
      if (tb > 0 && out < 1) {
        const open = ease.expoOut(seg(lt, tAction + 0.1, tAction + 0.5));
        const w = lerp(L.bw + 32 * u, L.pw, open);
        const h = lerp(L.bh + 32 * u, L.ph, open);
        ctx.save();
        ctx.globalAlpha = clamp(tb) * (1 - out);
        ctx.translate(L.px, L.py);
        ctx.scale(0.9 + 0.1 * tb, 0.9 + 0.1 * tb);
        ctx.shadowColor = "rgba(0,0,0,0.4)";
        ctx.shadowBlur = 36 * u;
        ctx.shadowOffsetY = 14 * u;
        rr(ctx, 0, 0, w, h, 16 * u);
        ctx.fillStyle = c.bg;
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.strokeStyle = rgba(c.fg, 0.14);
        ctx.lineWidth = 1.5 * u;
        ctx.stroke();
        rr(ctx, 16 * u, 16 * u, L.bw, L.bh, L.bh / 2);
        const pressed = lt >= tAction && lt < tAction + 0.15;
        ctx.fillStyle = pressed ? rgba(c.accent, 0.75) : c.accent;
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        const sx = 16 * u + 30 * u,
          sy = 16 * u + L.bh / 2,
          sr = 10 * u;
        ctx.moveTo(sx, sy - sr);
        ctx.quadraticCurveTo(sx, sy, sx + sr, sy);
        ctx.quadraticCurveTo(sx, sy, sx, sy + sr);
        ctx.quadraticCurveTo(sx, sy, sx - sr, sy);
        ctx.quadraticCurveTo(sx, sy, sx, sy - sr);
        ctx.fill();
        ctx.font = L.bfont;
        ctx.textAlign = "left";
        ctx.fillText(T.action, 16 * u + 50 * u, 16 * u + L.bh / 2 + 8 * u);
        if (open > 0) {
          ctx.save();
          rr(ctx, 0, 0, w, h, 16 * u);
          ctx.clip();
          ctx.globalAlpha *= open;
          const s0 = tAction + 0.4;
          const all = L.rlines.join("\n");
          const sd = Math.min(2.4, all.length * 0.035);
          let n = Math.floor(all.length * seg(lt, s0, s0 + sd));
          ctx.font = L.rfont;
          ctx.fillStyle = c.fg;
          let y = 16 * u + L.bh + 24 * u;
          let endX = 28 * u,
            endY = y;
          for (const line of L.rlines) {
            if (n <= 0) break;
            const s = line.slice(0, n);
            n -= line.length + 1;
            ctx.fillText(s, 28 * u, y + L.rlh * 0.75);
            endX = 28 * u + ctx.measureText(s).width;
            endY = y;
            y += L.rlh;
          }
          if (lt < s0 + sd + 0.4 && Math.floor(lt * 3) % 2 === 0) {
            ctx.fillStyle = c.accent;
            ctx.fillRect(endX + 3 * u, endY + L.rlh * 0.15, 3 * u, L.rlh * 0.7);
          }
          const apP = ease.backOut(seg(lt, s0 + sd + 0.1, s0 + sd + 0.4), 2);
          if (apP > 0) {
            const ax = L.apply[0] - L.px,
              ay = L.apply[1] - L.py;
            ctx.save();
            ctx.translate(ax, ay);
            ctx.scale(apP, apP);
            rr(ctx, -L.aw / 2, -L.bh / 2, L.aw, L.bh, L.bh / 2);
            ctx.fillStyle =
              lt >= tApply && lt < tApply + 0.15
                ? rgba(c.accent2, 0.7)
                : c.accent2;
            ctx.fill();
            ctx.font = L.bfont;
            ctx.fillStyle = c.bg;
            ctx.textAlign = "center";
            ctx.fillText(T.apply, 0, 8 * u);
            ctx.restore();
          }
          ctx.restore();
        }
        ctx.restore();
      }

      /* toast after apply */
      const tp = ease.backOut(seg(lt, tApply + 0.5, tApply + 0.9), 1.6);
      if (tp > 0 && T.done) {
        ctx.font = L.bfont;
        const tw = ctx.measureText(T.done).width + 90 * u;
        const tx = W / 2 - tw / 2,
          ty = L.wy + L.wh - 40 * u - L.bh;
        ctx.save();
        ctx.globalAlpha = clamp(tp);
        ctx.translate(0, 20 * u * (1 - tp));
        rr(ctx, tx, ty, tw, L.bh, L.bh / 2);
        ctx.fillStyle = c.fg;
        ctx.fill();
        check(
          ctx,
          tx + 32 * u,
          ty + L.bh / 2,
          22 * u,
          c.accent,
          seg(lt, tApply + 0.6, tApply + 1),
        );
        ctx.fillStyle = c.bg;
        ctx.textAlign = "left";
        ctx.fillText(T.done, tx + 56 * u, ty + L.bh / 2 + 8 * u);
        ctx.restore();
      }
      ctx.restore(); /* window clip */
      ctx.restore(); /* window transform */

      /* click ripples + cursor, on top of everything */
      kf.forEach((k) => {
        if (!k.click && !k.down) return;
        const p = seg(lt, k.t, k.t + 0.45);
        if (p <= 0 || p >= 1) return;
        const [x, y] = at(k.at);
        ctx.strokeStyle = rgba(c.accent, 0.7 * (1 - p));
        ctx.lineWidth = 3 * u;
        ctx.beginPath();
        ctx.arc(x, y, (10 + 40 * ease.expoOut(p)) * u, 0, TAU);
        ctx.stroke();
      });
      let i = 0;
      while (i < kf.length - 1 && lt >= kf[i + 1].t) i++;
      const a = at(kf[i].at),
        b = at(kf[Math.min(i + 1, kf.length - 1)].at);
      const nextT = kf[Math.min(i + 1, kf.length - 1)].t;
      const dragging = lt >= tDown && lt < tUp;
      const p =
        i === kf.length - 1
          ? 1
          : dragging
            ? seg(lt, kf[i].t, nextT)
            : ease.cubicInOut(seg(lt, kf[i].t, nextT));
      const lift = dragging
        ? 0
        : Math.sin(p * Math.PI) *
          Math.min(60 * u, Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.1);
      const press = dragging
        ? 1
        : kf.some((k) => k.click && lt >= k.t && lt < k.t + 0.14)
          ? 1
          : 0;
      cursor(
        ctx,
        lerp(a[0], b[0], p),
        lerp(a[1], b[1], p) - lift,
        1.4 * u,
        press,
        lt >= tDown - 0.3 && lt < tUp + 0.1,
      );
    },
  };
})();
