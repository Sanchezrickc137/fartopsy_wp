import { createStars, stepStar } from "./starfield-model.js";

// Glow is rasterized once; animation frames only composite these tiny sprites.
function createSprites() {
  return ["#fff0bc", "#d4b9fa", "#ffd4ba"].flatMap((color) => [false, true].map((sparkle) => {
    const sprite = document.createElement("canvas");
    sprite.width = sprite.height = 64;
    const ctx = sprite.getContext("2d");
    if (!ctx) return null;
    ctx.scale(2, 2);
    const glow = ctx.createRadialGradient(16, 16, 0, 16, 16, 12);
    glow.addColorStop(0, `${color}b0`);
    glow.addColorStop(.23, `${color}30`);
    glow.addColorStop(1, `${color}00`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = color;
    ctx.beginPath();
    if (sparkle) {
      ctx.moveTo(16, 11);
      ctx.quadraticCurveTo(16.8, 15.2, 21, 16);
      ctx.quadraticCurveTo(16.8, 16.8, 16, 21);
      ctx.quadraticCurveTo(15.2, 16.8, 11, 16);
      ctx.quadraticCurveTo(15.2, 15.2, 16, 11);
    } else ctx.arc(16, 16, 2, 0, Math.PI * 2);
    ctx.fill();
    return sprite;
  }));
}

export function createStarfield({ motionAllowed, introCovering }) {
  const fallback = { refresh() {}, dispose() {} };
  const sky = document.querySelector(".sky");
  if (!sky) return fallback;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return fallback;
  const sprites = createSprites();
  if (sprites.some((sprite) => !sprite)) return fallback;
  canvas.className = "starfield";
  canvas.setAttribute("aria-hidden", "true");
  sky.after(canvas);

  const finePointer = window.matchMedia("(any-hover: hover) and (any-pointer: fine)");
  const listeners = [];
  let stars = [], pointer = null, frame = 0, disposed = false;
  let width = 0, height = 0, ratio = 0, sizeDirty = true;
  let lastTime = null, clock = 0;
  const allowed = () => !disposed && motionAllowed() && !document.hidden && !introCovering();
  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  }
  function measure() {
    sizeDirty = false;
    const nextWidth = Math.max(1, document.documentElement.clientWidth);
    const nextHeight = Math.max(1, window.innerHeight);
    const nextRatio = Math.min(window.devicePixelRatio || 1, 1.75, Math.sqrt(3000000 / (nextWidth * nextHeight)));
    if (width === nextWidth && height === nextHeight && ratio === nextRatio) return;
    width = nextWidth; height = nextHeight; ratio = nextRatio;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    stars = createStars(width, height);
    if (pointer && (pointer.x > width || pointer.y > height)) pointer = null;
  }
  function paint(dt = 0, animate = false) {
    ctx.clearRect(0, 0, width, height);
    let settling = false;
    for (const star of stars) {
      const point = animate ? stepStar(star, pointer, clock, dt) :
        { x: star.x, y: star.y, scale: 1, alpha: star.alpha };
      const perspective = 400 / (400 - (point.z || 0));
      const size = star.radius * point.scale * perspective * 16;
      ctx.globalAlpha = point.alpha;
      ctx.drawImage(sprites[star.color * 2 + Number(star.sparkle)], point.x - size / 2, point.y - size / 2, size, size);
      if (star.amount > 0) settling = true;
    }
    ctx.globalAlpha = 1;
    return settling;
  }
  function requestFrame() {
    if (!frame && !disposed) frame = window.requestAnimationFrame(render);
  }
  function stop() {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    lastTime = null;
    pointer = null;
    for (const star of stars) star.amount = 0;
  }
  function render(timestamp) {
    frame = 0;
    if (disposed) return;
    if (sizeDirty) measure();
    if (!allowed() || !finePointer.matches) { stop(); paint(); return; }
    const dt = lastTime === null ? 1 / 60 : Math.min(.05, Math.max(0, (timestamp - lastTime) / 1000));
    lastTime = timestamp;
    clock += dt;
    const settling = paint(dt, true);
    if (pointer || settling) requestFrame();
    else lastTime = null;
  }
  function refresh() {
    if (disposed) return;
    // Intro unlock and route changes can add a scrollbar without window resize.
    // This cached check runs on lifecycle events, never on ordinary orbit frames.
    measure();
    if (!allowed() || !finePointer.matches) { stop(); paint(); return; }
    if (pointer || stars.some((star) => star.amount > 0)) requestFrame();
    else paint();
  }
  function release() {
    pointer = null;
    if (allowed() && stars.some((star) => star.amount > 0)) requestFrame();
  }
  function point(event) {
    if (event.pointerType === "touch") { release(); return; }
    if (!allowed() || !finePointer.matches) return;
    pointer = { x: event.clientX, y: event.clientY };
    requestFrame();
  }
  listen(window, "pointermove", point, { passive: true });
  listen(window, "pointercancel", release, { passive: true });
  listen(document.documentElement, "pointerleave", release, { passive: true });
  listen(window, "blur", release);
  listen(window, "resize", () => { sizeDirty = true; requestFrame(); }, { passive: true });
  listen(document, "visibilitychange", refresh);
  listen(finePointer, "change", refresh);
  refresh();
  return {
    refresh,
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      listeners.forEach((remove) => remove());
      canvas.remove();
      stars = [];
    },
  };
}
