/** Smooth cubic sine segments, with arc lengths used to keep the final phrase in view. */
export function buildFooterWaveCurve({ width, height, textLength, progress }) {
  const p = Math.max(0, Math.min(1, progress));
  const wavelength = Math.max(440, Math.min(1050, width * .62));
  const amplitude = Math.max(48, Math.min(112, width * .075));
  const center = height * .47, wave = Math.PI * 2 / wavelength, phase = .3 + p * Math.PI * 2.7;
  const start = -textLength - width, end = textLength + width * 2, step = wavelength / 8;
  const positions = [start, 0, width, end];
  for (let x = start + step; x < end; x += step) positions.push(x);
  positions.sort((a, b) => a - b);
  const y = x => center + Math.sin(x * wave + phase) * amplitude;
  const derivative = x => Math.cos(x * wave + phase) * amplitude * wave;
  const speed = x => Math.sqrt(1 + derivative(x) ** 2);
  const number = value => Number(value.toFixed(3));
  let d = `M ${number(start)} ${number(y(start))}`, length = 0, leftArc = 0, rightArc = 0;
  for (let i = 1; i < positions.length; i++) {
    const x1 = positions[i - 1], x2 = positions[i], span = x2 - x1;
    if (span < .001) continue;
    d += ` C ${number(x1 + span / 3)} ${number(y(x1) + derivative(x1) * span / 3)} ${number(x2 - span / 3)} ${number(y(x2) - derivative(x2) * span / 3)} ${number(x2)} ${number(y(x2))}`;
    length += span / 6 * (speed(x1) + 4 * speed((x1 + x2) / 2) + speed(x2));
    if (x2 === 0) leftArc = length;
    if (x2 === width) rightArc = length;
  }
  const visibleLength = rightArc - leftArc;
  const distance = Math.max(0, textLength - visibleLength * .78);
  const offset = leftArc + visibleLength * .10 - distance * p;
  return { d, offset, distance, leftArc, rightArc, visibleLength };
}

/** Native sticky travel with a reversible, event-driven SVG ribbon. No wheel interception. */
export function createFooterWave({ motionAllowed = () => true, introCovering = () => false } = {}) {
  const root = document.querySelector('[data-footer-wave]');
  const visual = root?.querySelector('[data-footer-wave-window]');
  const svg = root?.querySelector('[data-footer-wave-svg]');
  const path = root?.querySelector('[data-footer-wave-path]');
  const text = root?.querySelector('[data-footer-wave-text]');
  const textPath = root?.querySelector('[data-footer-wave-text-path]');
  if (!root || !visual || !svg || !path || !text || !textPath) return { refresh() {}, dispose() {} };

  const listeners = [], reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let disposed = false, frame = 0, dirty = true, geometry = null, previousProgress = null;
  const clamp = value => Math.max(0, Math.min(1, value));
  const motion = () => motionAllowed() && !reduced?.matches;
  const visible = () => !document.hidden && !root.closest('[hidden]') && !introCovering();
  const listen = (target, type, handler, options) => {
    if (!target?.addEventListener) return;
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  };
  function set(element, name, value) {
    if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value);
  }
  function stop() {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
  }
  function reset() {
    stop(); geometry = null; previousProgress = null;
    root.classList.remove('footer-wave-active');
    ['--footer-wave-travel', '--footer-wave-view', '--footer-wave-progress', '--footer-wave-font', '--footer-wave-band']
      .forEach(name => root.style.removeProperty(name));
    visual.style.removeProperty('--footer-wave-entry');
  }
  function measure() {
    const width = root.clientWidth, height = window.innerHeight || 0;
    if (!width || !height) return false;
    const fontSize = Math.max(28, Math.min(60, width * .04));
    set(root, '--footer-wave-view', `${height}px`);
    set(root, '--footer-wave-font', `${fontSize}px`);
    set(root, '--footer-wave-band', `${Math.max(76, fontSize * 2.2)}px`);
    root.classList.add('footer-wave-active');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    // A font-ready refresh measures the real glyph advances; the estimate only covers
    // a temporarily unavailable SVG measurement, not the normal scroll calculation.
    const textLength = text.getComputedTextLength?.() || text.textContent.length * fontSize * .56;
    const curve = buildFooterWaveCurve({ width, height, textLength, progress: 0 });
    const travel = Math.round(Math.max(height * 1.6, Math.min(height * 2.8, curve.distance * .55)) * 100) / 100;
    set(root, '--footer-wave-travel', `${travel.toFixed(2)}px`);
    const top = root.getBoundingClientRect().top + (window.scrollY || 0);
    geometry = { width, height, textLength, travel, top };
    previousProgress = null;
    return true;
  }
  function render() {
    frame = 0;
    if (disposed) return;
    if (!motion()) { reset(); return; }
    if (!visible()) return;
    if (dirty) {
      dirty = false;
      if (!measure()) { reset(); return; }
    }
    if (!geometry) return;
    const { width, height, textLength, top, travel } = geometry, scroll = window.scrollY || 0;
    const progress = clamp((scroll - top) / travel);
    const entering = clamp((scroll - top + height * .85) / (height * .85));
    const entry = entering * entering * (3 - entering * 2);
    set(root, '--footer-wave-progress', progress.toFixed(4));
    set(visual, '--footer-wave-entry', entry.toFixed(4));
    if (progress !== previousProgress) {
      const curve = buildFooterWaveCurve({ width, height, textLength, progress });
      path.setAttribute('d', curve.d);
      textPath.setAttribute('startOffset', curve.offset.toFixed(3));
      previousProgress = progress;
    }
  }
  function schedule() {
    if (disposed) return;
    if (!motion()) { reset(); return; }
    // Keep the existing height while a tab is hidden: collapsing a sticky scene here
    // would change scroll position before the user returned to it.
    if (!visible()) { stop(); return; }
    if (!frame) frame = window.requestAnimationFrame(render);
  }
  function refresh() {
    if (disposed) return;
    dirty = true; schedule();
  }
  listen(window, 'scroll', schedule, { passive: true });
  listen(window, 'resize', refresh, { passive: true });
  listen(window, 'hashchange', refresh);
  listen(window, 'pageshow', refresh);
  listen(window, 'load', refresh);
  listen(document, 'visibilitychange', refresh);
  listen(document, 'fartopsy:intro-ready', refresh);
  listen(document, 'fartopsy:welcome-unlocked', refresh);
  listen(reduced, 'change', refresh);
  listen(document.fonts, 'loadingdone', refresh);
  document.fonts?.ready?.then(refresh, () => {});
  const resize = window.ResizeObserver ? new window.ResizeObserver(refresh) : null;
  resize?.observe(root);
  if (document.body) resize?.observe(document.body);
  refresh();
  return {
    refresh,
    dispose() {
      if (disposed) return;
      disposed = true; reset(); resize?.disconnect(); listeners.forEach(remove => remove());
    },
  };
}
