const BRAND_PADDING = 26;
const BRAND_POINT_LIMIT = 1500;
const BRAND_COLORS = [
  "#9976bd", "#b398d0", "#8265a6",
  "#efa77f", "#ffc595", "#eab494",
  "#fff0bd", "#fff6d8", "#ffe3aa",
];

// A fixed hash gives every grain its own position and tone without random idle noise.
function grainNoise(index, salt = 0) {
  let value = Math.imul(index + 1, 374761393) + Math.imul(salt + 1, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

// Exact critically damped spring integration, stable across display refresh rates.
function spring(value, position, velocity, target, dt, epsilon = .012) {
  const omega = 18, delta = value[position] - target;
  const impulse = value[velocity] + omega * delta, decay = Math.exp(-omega * dt);
  value[position] = target + (delta + impulse * dt) * decay;
  value[velocity] = (value[velocity] - omega * impulse * dt) * decay;
  if (Math.abs(value[position] - target) < epsilon && Math.abs(value[velocity]) < epsilon * 5) {
    value[position] = target; value[velocity] = 0;
    return false;
  }
  return true;
}

export function createParticleBrand({ motionAllowed, introCovering }) {
  const fallback = { refresh() {}, dispose() {} };
  const root = document.querySelector(".particle-wordmark");
  const label = root?.querySelector(".brand-name"), canvas = root?.querySelector(".brand-particles");
  if (!root || !label || !canvas) return fallback;
  let ctx, mask, maskContext;
  try {
    ctx = canvas.getContext("2d");
    mask = document.createElement("canvas");
    maskContext = mask.getContext("2d", { willReadFrequently: true });
  } catch { return fallback; }
  if (!ctx || !maskContext || !document.fonts) return fallback;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const forced = window.matchMedia("(forced-colors: active)");
  const listeners = [], tilt = { x: 0, y: 0, vx: 0, vy: 0 };
  let particles = [], batches = [], pointer = null, rect = null, frame = 0, lastTime = null;
  let width = 0, height = 0, ratio = 1, signature = "", dirty = false;
  let disposed = false, intersecting = true, enhanced = false;
  const allowed = () => !disposed && motionAllowed() && !introCovering() && !document.hidden &&
    !reduced.matches && !forced.matches && intersecting && !root.closest("[hidden]");

  function listen(target, type, callback, options) {
    target.addEventListener(type, callback, options);
    listeners.push(() => target.removeEventListener(type, callback, options));
  }
  function stop() {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0; lastTime = null; pointer = null;
    tilt.x = tilt.y = tilt.vx = tilt.vy = 0;
    for (const point of particles) point.x = point.y = point.vx = point.vy = 0;
  }
  function showFallback() {
    stop(); enhanced = false;
    root.classList.remove("particle-brand-ready");
    ctx.clearRect(0, 0, width + BRAND_PADDING * 2, height + BRAND_PADDING * 2);
  }
  function sample(font, spacing, fontSize) {
    const scale = 2;
    mask.width = Math.ceil(width * scale); mask.height = Math.ceil(height * scale);
    maskContext.setTransform(scale, 0, 0, scale, 0, 0);
    maskContext.font = font;
    maskContext.textBaseline = "alphabetic";
    maskContext.fillStyle = "#fff";
    const text = label.textContent.trim(), metrics = maskContext.measureText(text);
    const ascent = metrics.fontBoundingBoxAscent || fontSize * .83;
    const descent = metrics.fontBoundingBoxDescent || fontSize * .22;
    const advance = [...text].reduce((sum, glyph) => sum + maskContext.measureText(glyph).width, 0) + Math.max(0, text.length - 1) * spacing;
    let x = Math.max(0, (width - advance) / 2);
    const baseline = (height - ascent - descent) / 2 + ascent;
    for (const glyph of text) {
      maskContext.fillText(glyph, x, baseline);
      x += maskContext.measureText(glyph).width + spacing;
    }
    const pixels = maskContext.getImageData(0, 0, mask.width, mask.height).data;
    const candidates = [], step = Math.max(1.05, Math.sqrt(width * height / 9000));
    let index = 0;
    for (let y = step / 2; y < height; y += step) for (let x = step / 2; x < width; x += step) {
      const nx = x + (grainNoise(index, 1) - .5) * step * .64;
      const ny = y + (grainNoise(index, 2) - .5) * step * .64;
      const alpha = pixels[(Math.floor(ny * scale) * mask.width + Math.floor(nx * scale)) * 4 + 3];
      if (alpha > 80) candidates.push({ bx: nx, by: ny, seed: grainNoise(index, 3), radius: step * (.36 + grainNoise(index, 4) * .19) });
      index++;
    }
    if (!candidates.length) return false;
    const count = Math.min(BRAND_POINT_LIMIT, candidates.length);
    // Uniform subsampling preserves the entire word if text size grows at browser zoom.
    const grainScale = Math.sqrt(candidates.length / count);
    batches = BRAND_COLORS.map(() => []);
    for (let layer = 0; layer < 3; layer++) for (let i = 0; i < count; i++) {
      const grain = candidates[Math.floor(i * candidates.length / count)];
      const color = layer * 3 + Math.min(2, Math.floor(grain.seed * 3));
      batches[color].push({ ...grain, radius: grain.radius * grainScale, depth: (2 - layer) * 2.3,
        x: 0, y: 0, vx: 0, vy: 0 });
    }
    particles = batches.flat();
    return true;
  }
  function measure() {
    rect = label.getBoundingClientRect();
    const anchor = root.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1 || rect.bottom <= 0 || rect.right <= 0 ||
        rect.top >= window.innerHeight || rect.left >= window.innerWidth) return false;
    const style = window.getComputedStyle(label);
    const font = `${style.fontStyle || "normal"} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    if (!document.fonts.check(font, label.textContent)) return false;
    const nextWidth = rect.width, nextHeight = rect.height;
    // Extremely large accessibility text remains ordinary text instead of allocating a huge mask.
    if (nextWidth * nextHeight > 160000) return false;
    const nextRatio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(320000 / ((nextWidth + BRAND_PADDING * 2) * (nextHeight + BRAND_PADDING * 2))));
    const nextSignature = [nextWidth, nextHeight, nextRatio, font, style.letterSpacing, label.textContent].join("|");
    canvas.style.left = `${rect.left - anchor.left - BRAND_PADDING}px`;
    canvas.style.top = `${rect.top - anchor.top - BRAND_PADDING}px`;
    if (nextSignature === signature && particles.length) return true;
    signature = ""; width = nextWidth; height = nextHeight; ratio = nextRatio;
    canvas.width = Math.floor((width + BRAND_PADDING * 2) * ratio);
    canvas.height = Math.floor((height + BRAND_PADDING * 2) * ratio);
    canvas.style.width = `${width + BRAND_PADDING * 2}px`;
    canvas.style.height = `${height + BRAND_PADDING * 2}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    try {
      if (!sample(font, parseFloat(style.letterSpacing) || 0, parseFloat(style.fontSize))) return false;
    } catch { return false; }
    signature = nextSignature;
    return true;
  }
  function paint() {
    ctx.clearRect(0, 0, width + BRAND_PADDING * 2, height + BRAND_PADDING * 2);
    const cosY = Math.cos(tilt.x), sinY = Math.sin(tilt.x), cosX = Math.cos(tilt.y), sinX = Math.sin(tilt.y);
    for (let i = 0; i < batches.length; i++) {
      ctx.fillStyle = BRAND_COLORS[i];
      ctx.beginPath();
      for (const point of batches[i]) {
        const x = point.bx - width / 2 + point.x + point.depth * .62;
        const y = point.by - height / 2 + point.y + point.depth * .58;
        const rotatedX = x * cosY + point.depth * sinY;
        const z = point.depth * cosY - x * sinY;
        const perspective = 480 / (480 + z * cosX + y * sinX);
        const px = BRAND_PADDING + width / 2 + rotatedX * perspective;
        const py = BRAND_PADDING + height / 2 + (y * cosX - z * sinX) * perspective;
        const radius = point.radius * perspective;
        ctx.moveTo(px + radius, py);
        ctx.arc(px, py, radius, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }
  function requestFrame() {
    if (!frame && !disposed) frame = window.requestAnimationFrame(render);
  }
  function render(time) {
    frame = 0;
    if (!allowed()) { showFallback(); return; }
    if (dirty) { refresh(); return; }
    if (!enhanced) return;
    const dt = lastTime === null ? 1 / 60 : Math.max(0, Math.min(.05, (time - lastTime) / 1000));
    lastTime = time;
    let moving = spring(tilt, "x", "vx", pointer ? (pointer.x / width - .5) * .16 : 0, dt, .0001);
    moving = spring(tilt, "y", "vy", pointer ? (pointer.y / height - .5) * -.12 : 0, dt, .0001) || moving;
    const radius = Math.max(24, Math.min(38, height * .64));
    for (const point of particles) {
      let tx = 0, ty = 0;
      if (pointer) {
        const dx = point.bx + point.depth * .62 - pointer.x;
        const dy = point.by + point.depth * .58 - pointer.y;
        const distance = Math.hypot(dx, dy);
        if (distance < radius) {
          const angle = (distance > .1 ? Math.atan2(dy, dx) : point.seed * Math.PI * 2) + (point.seed - .5) * .65;
          const push = (1 - distance / radius) ** 1.35 * (15 + point.seed * 9);
          tx = Math.cos(angle) * push; ty = Math.sin(angle) * push;
        }
      }
      moving = spring(point, "x", "vx", tx, dt) || moving;
      moving = spring(point, "y", "vy", ty, dt) || moving;
    }
    paint();
    if (moving) requestFrame();
    else lastTime = null;
  }
  function refresh() {
    if (disposed) return;
    stop(); dirty = false;
    if (!allowed() || !measure()) { showFallback(); return; }
    paint(); enhanced = true;
    // The HTML glyph is hidden only after the complete particle word has been painted.
    root.classList.add("particle-brand-ready");
  }
  function move(event) {
    if (event.pointerType === "touch") return;
    if (!allowed() || !enhanced || !rect) return;
    pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    requestFrame();
  }
  function release() {
    pointer = null;
    if (!allowed()) { showFallback(); return; }
    if (enhanced && (tilt.x || tilt.y || particles.some(point => point.x || point.y || point.vx || point.vy))) requestFrame();
    else if (frame) { window.cancelAnimationFrame(frame); frame = 0; lastTime = null; }
  }
  function geometryChanged() {
    if (!allowed()) { showFallback(); return; }
    dirty = true; pointer = null; requestFrame();
  }
  listen(root, "pointerenter", event => { if (event.pointerType !== "touch" && allowed()) { refresh(); move(event); } });
  listen(root, "pointermove", move);
  for (const type of ["pointerleave", "pointercancel", "blur"]) listen(root, type, release);
  listen(window, "blur", release);
  listen(window, "resize", geometryChanged, { passive: true });
  listen(window, "scroll", geometryChanged, { passive: true });
  listen(document, "visibilitychange", refresh);
  listen(reduced, "change", refresh);
  listen(forced, "change", refresh);
  const fontChanged = () => { if (!disposed) { signature = ""; refresh(); } };
  listen(document.fonts, "loadingdone", fontChanged);
  document.fonts.ready.then(fontChanged, () => {});
  const intersectionObserver = typeof IntersectionObserver === "function" ? new IntersectionObserver(entries => {
    if (disposed) return;
    intersecting = entries[0]?.isIntersecting !== false && entries[0]?.intersectionRatio !== 0;
    refresh();
  }) : null;
  intersectionObserver?.observe(root);
  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(geometryChanged) : null;
  resizeObserver?.observe(label);
  refresh();

  return {
    refresh,
    dispose() {
      if (disposed) return;
      disposed = true; showFallback();
      listeners.forEach(remove => remove());
      intersectionObserver?.disconnect(); resizeObserver?.disconnect();
      for (const property of ["width", "height", "left", "top"]) canvas.style.removeProperty(property);
      canvas.width = canvas.height = 1;
      particles = []; batches = [];
    },
  };
}
