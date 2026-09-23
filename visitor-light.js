/** Local light scenes share one backing-pixel budget and the existing lifecycle API. */
export function createVisitorLight({ motionAllowed, introCovering }) {
  const stage = document.querySelector('[data-visitor-stage]');
  if (!stage) return { refresh() {}, dispose() {} };
  const frames = [...(stage.querySelectorAll?.('[data-visitor-light-scene]') || [])];
  const sources = frames.length ? frames.map(scene => ({ scene, card: scene.querySelector('[data-visitor-light-card]'),
    canvas: scene.querySelector('.visitor-light'), observationTarget: scene })) : [{
    scene: stage.querySelector('.visitor-scene'), card: stage.querySelector('.welcome-strip'),
    canvas: stage.querySelector('.visitor-light'), observationTarget: stage,
  }];
  const active = new Set();
  const controllers = sources.map((source, index) => createLightScene({ ...source, stage, motionAllowed, introCovering,
    pixelBudget: 1600000 / sources.length,
    activity(running) {
      if (running) active.add(index); else active.delete(index);
      if (active.size) stage.classList.add('visitor-light-active');
      else stage.classList.remove('visitor-light-active');
    },
  }));
  return { refresh() { controllers.forEach(controller => controller.refresh()); },
    dispose() { controllers.forEach(controller => controller.dispose()); } };
}

/** A canvas behind one opaque card; geometry stays local through parent transforms. */
function createLightScene({ stage, scene, card, canvas, observationTarget, pixelBudget, activity, motionAllowed, introCovering }) {
  let ctx;
  try { ctx = canvas?.getContext('2d', { alpha: true }); } catch { return { refresh() {}, dispose() {} }; }
  if (!ctx || !scene || !card) return { refresh() {}, dispose() {} };
  const listeners = [], reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0, dirty = true, disposed = false, inView = false, last = 0, clock = 0;
  let width = 0, height = 0, cardTop = 0, cardBottom = 0, cardWidth = 0;
  let pointer = 0, target = 0;
  const visible = () => !disposed && !document.hidden && !stage.closest('[hidden]') && !scene.closest?.('[hidden]') && !introCovering();
  const allowed = () => visible() && inView && motionAllowed() && !reduced.matches;
  const listen = (el, type, handler, options) => {
    el.addEventListener(type, handler, options);
    listeners.push(() => el.removeEventListener(type, handler, options));
  };
  function measure() {
    // Local layout coordinates stay stable while the depth wrapper transforms.
    width = scene.clientWidth; height = scene.clientHeight;
    if (!width || !height) return false;
    cardTop = card.offsetTop; cardBottom = cardTop + card.offsetHeight; cardWidth = card.offsetWidth;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(pixelBudget / (width * height)));
    canvas.width = Math.max(1, Math.floor(width * ratio)); canvas.height = Math.max(1, Math.floor(height * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    dirty = false;
    return true;
  }
  function ribbon(start, end, time, bottom, thickness, color) {
    const left = [], right = [], steps = 36;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, near = bottom ? 1 - t : t;
      const y = start + (end - start) * t;
      const wave = Math.sin(t * 6.5 - time * 1.1) * 5 + Math.sin(t * 13 + time * .8) * 2.5;
      const x = width / 2 + wave * Math.sin(t * Math.PI) + pointer * Math.sin(t * Math.PI);
      const spread = 2.5 + Math.pow(near, 4) * Math.min(66, cardWidth * .15);
      const radius = (spread + Math.sin(t * 17 - time * 1.6) * 1.3) * thickness;
      left.push([x - radius, y]); right.push([x + radius, y]);
    }
    const gradient = ctx.createLinearGradient(0, start, 0, end);
    gradient.addColorStop(0, bottom ? color : 'rgba(173,126,246,0)');
    gradient.addColorStop(bottom ? .28 : .72, color);
    gradient.addColorStop(1, bottom ? 'rgba(173,126,246,0)' : color);
    ctx.fillStyle = gradient;
    ctx.beginPath(); ctx.moveTo(...left[0]);
    for (const point of left.slice(1)) ctx.lineTo(...point);
    for (const point of right.reverse()) ctx.lineTo(...point);
    ctx.closePath(); ctx.fill();
  }
  function atmosphere(x, y, radius, color) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, color); glow.addColorStop(1, 'rgba(123,65,200,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  function paint(time) {
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'lighter';
    const center = width / 2;
    for (const [edge, room] of [[cardTop, cardTop], [cardBottom, height - cardBottom]]) {
      // Each halo dies inside its ray space instead of being cut by the canvas.
      const radius = Math.max(0, Math.min(width * .42, room * .85, 150));
      if (!radius) continue;
      atmosphere(center, edge, radius, 'rgba(153,94,243,.22)');
      atmosphere(center + Math.sin(time * .5) * Math.min(16, width * .035), edge, radius * .62, 'rgba(255,206,153,.19)');
    }
    // Several moving soft layers form the haze around a narrower warm core.
    for (const [scale, tint] of [[5, 'rgba(119,64,238,.055)'], [3.1, 'rgba(169,100,248,.09)'],
      [1.9, 'rgba(198,134,255,.22)'], [1, 'rgba(229,179,255,.65)'], [.42, 'rgba(255,238,201,.95)'], [.13, 'rgba(255,251,230,1)']]) {
      ribbon(0, cardTop + 3, time, false, scale, tint);
      ribbon(cardBottom - 3, height, time + 1.7, true, scale, tint);
    }
    for (let i = 0; i < 32; i++) {
      const side = i % 2, span = side ? height - cardBottom : cardTop;
      const cycle = (i * .6180339 + time * (.025 + i % 4 * .009)) % 1;
      const y = side ? cardBottom + cycle * span : cardTop - cycle * span;
      const x = center + Math.sin(i * 7.13) * (12 + (1 - cycle) * 65) + Math.sin(time + i) * 5;
      const opacity = Math.sin(cycle * Math.PI) * (.25 + i % 3 * .13);
      ctx.fillStyle = `rgba(255,226,183,${opacity.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(x, y, i % 6 === 0 ? 1.6 : .8, 0, Math.PI * 2); ctx.fill();
    }
    // Additive flares can reach the bounds of narrow cards. Fade existing alpha,
    // rather than painting a backdrop, so the canvas never reveals its rectangle.
    ctx.globalCompositeOperation = 'destination-in';
    for (const horizontal of [true, false]) {
      // The entire exposed ray tapers from the card to transparent at its tip.
      // Use independent spans so unequal top/bottom padding remains seamless.
      const near = horizontal ? .18 : Math.max(0, Math.min(.5, cardTop / height));
      const far = horizontal ? .82 : Math.max(.5, Math.min(1, cardBottom / height));
      const mask = ctx.createLinearGradient(0, 0, horizontal ? width : 0, horizontal ? 0 : height);
      mask.addColorStop(0, 'rgba(0,0,0,0)');
      mask.addColorStop(near, 'rgba(0,0,0,1)');
      mask.addColorStop(far, 'rgba(0,0,0,1)');
      mask.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = mask; ctx.fillRect(0, 0, width, height);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  function stop() {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0; last = 0;
    activity(false);
  }
  function render(time) {
    frame = 0;
    if (!allowed()) { stop(); return; }
    if (dirty && !measure()) { stop(); return; }
    const dt = Math.min(.05, last ? Math.max(0, time - last) / 1000 : 1 / 60);
    last = time; clock += dt;
    pointer += (target - pointer) * (1 - Math.exp(-dt * 7));
    paint(clock);
    frame = window.requestAnimationFrame(render);
  }
  function refresh() {
    if (disposed) return;
    dirty = true;
    if (!visible()) { stop(); return; }
    if (!motionAllowed() || reduced.matches || !window.IntersectionObserver) {
      stop(); target = pointer = 0;
      if (measure()) paint(0);
      return;
    }
    if (!allowed()) { stop(); return; }
    activity(true);
    if (!frame) frame = window.requestAnimationFrame(render);
  }
  listen(scene, 'pointermove', event => {
    if (!allowed() || event.pointerType === 'touch') return;
    // Pointer geometry is only read on interaction, never in animation frames.
    const rect = scene.getBoundingClientRect();
    target = rect.width ? Math.max(-10, Math.min(10, (event.clientX - rect.left - rect.width / 2) / rect.width * 20)) : 0;
  }, { passive: true });
  listen(scene, 'pointerleave', () => { target = 0; });
  listen(window, 'resize', refresh, { passive: true });
  listen(document, 'visibilitychange', refresh);
  listen(document, 'fartopsy:intro-ready', refresh);
  listen(reduced, 'change', refresh);
  const resize = window.ResizeObserver ? new window.ResizeObserver(refresh) : null;
  resize?.observe(scene); resize?.observe(card);
  const intersection = window.IntersectionObserver ? new window.IntersectionObserver(entries => {
    inView = entries.some(entry => entry.isIntersecting); refresh();
  }, { threshold: 0 }) : null;
  if (intersection) intersection.observe(observationTarget);
  refresh();
  return {
    refresh,
    dispose() {
      if (disposed) return;
      disposed = true; stop();
      resize?.disconnect(); intersection?.disconnect(); listeners.forEach(remove => remove());
      ctx.clearRect(0, 0, width, height);
    },
  };
}
