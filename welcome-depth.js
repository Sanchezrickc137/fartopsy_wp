/** Reversible scroll depth, measured from layout wrappers rather than animated children. */
export function createWelcomeDepth({ motionAllowed, introCovering }) {
  const intro = document.querySelector('[data-depth-intro]');
  const stage = document.querySelector('[data-visitor-stage]');
  const hero = intro?.querySelector('.hero');
  const scene = stage?.querySelector('.visitor-scene');
  const greeting = intro?.querySelector('[data-welcome-reveal]');
  const hanging = intro?.querySelector('[data-hanging-scene]');
  if (!intro || !stage || !hero || !scene) return { refresh() {}, dispose() {} };

  const listeners = [], reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let disposed = false, active = false, frame = 0, dirty = true, geometry = null;
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = value => value * value * (3 - 2 * value);
  const allowed = () => !disposed && motionAllowed() && !introCovering() && !document.hidden &&
    !reduced?.matches && !intro.closest('[hidden]') && !stage.closest('[hidden]');

  function listen(target, type, handler, options) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  }
  function reset() {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    if (!active) return;
    intro.classList.remove('welcome-depth-active');
    stage.classList.remove('welcome-depth-active');
    hero.style.removeProperty('--welcome-depth-progress');
    scene.style.removeProperty('--welcome-depth-progress');
    active = false;
  }
  // Offset geometry ignores both this parent effect and the child's text reveal.
  function layoutTop(element) {
    let top = 0;
    for (let current = element; current; current = current.offsetParent) top += current.offsetTop || 0;
    return top;
  }
  function measure(scroll) {
    const introRect = intro.getBoundingClientRect(), stageRect = stage.getBoundingClientRect();
    const viewport = window.innerHeight || 1;
    const scrollHeight = document.documentElement?.scrollHeight || document.body?.scrollHeight || viewport;
    const available = Math.max(0, scrollHeight - viewport);
    if (!introRect.height || !stageRect.height || !available) { geometry = null; return; }
    const introTop = introRect.top + scroll, stageTop = stageRect.top + scroll;
    let revealEnd, readingHold;
    if (hanging) {
      const hangingTop = introTop + layoutTop(hanging) - layoutTop(intro);
      const hangingHeight = hanging.clientHeight || hanging.offsetHeight || introRect.height;
      // Match hanging-mascot's scroll reveal, then leave the fully revealed message
      // and settled character at full size before the depth departure can begin.
      const revealStart = Math.max(0, hangingTop - viewport * .72);
      const end = Math.min(available, hangingTop + Math.min(hangingHeight * .3, viewport * .3) - viewport * .4);
      revealEnd = end > revealStart ? end : 0;
      readingHold = viewport * .16;
    } else {
      const gutter = Math.min(32, viewport * .04);
      const greetingTop = greeting ? introTop + layoutTop(greeting) - layoutTop(intro) : introTop;
      const greetingHeight = greeting?.offsetHeight || introRect.height * .4;
      const revealStart = Math.max(0, greetingTop - viewport * .85);
      revealEnd = greetingHeight > viewport - gutter * 2
        ? Math.max(0, greetingTop + greetingHeight - viewport * .72)
        : Math.min(available, greetingTop - gutter,
          Math.max(revealStart + 120, greetingTop + greetingHeight - viewport * .72));
      readingHold = viewport * .035;
    }
    const exitStart = Math.max(0, revealEnd + readingHold, introTop - viewport * .1);
    const exitEnd = Math.min(available, introTop + introRect.height - viewport * .2);
    const enterStart = Math.max(0, stageTop - viewport * .94);
    const enterEnd = Math.min(available, stageTop + Math.min(stageRect.height / 2, viewport * .45) - viewport * .56);
    geometry = { exitStart, exitEnd, enterStart, enterEnd };
  }
  function progress(scroll, start, end, fallback) {
    return end > start ? smooth(clamp((scroll - start) / (end - start))) : fallback;
  }
  function setProgress(element, value) {
    const next = value.toFixed(4);
    if (element.style.getPropertyValue('--welcome-depth-progress') !== next)
      element.style.setProperty('--welcome-depth-progress', next);
  }
  function render() {
    frame = 0;
    if (!allowed()) { reset(); return; }
    const scroll = window.scrollY || 0;
    if (dirty) { measure(scroll); dirty = false; }
    if (!geometry) { reset(); return; }
    const { exitStart, exitEnd, enterStart, enterEnd } = geometry;
    setProgress(hero, progress(scroll, exitStart, exitEnd, 0));
    setProgress(scene, progress(scroll, enterStart, enterEnd, 1));
    intro.classList.add('welcome-depth-active');
    stage.classList.add('welcome-depth-active');
    active = true;
  }
  function schedule() {
    if (disposed) return;
    if (!allowed()) { reset(); return; }
    if (!frame) frame = window.requestAnimationFrame(render);
  }
  function refresh() {
    if (disposed) return;
    dirty = true;
    schedule();
  }

  listen(window, 'scroll', schedule, { passive: true });
  listen(window, 'resize', refresh, { passive: true });
  listen(window, 'pageshow', refresh);
  listen(window, 'load', refresh);
  listen(document, 'visibilitychange', refresh);
  listen(document, 'fartopsy:intro-ready', refresh);
  listen(reduced, 'change', refresh);
  listen(document.fonts, 'loadingdone', refresh);
  document.fonts?.ready?.then(refresh, () => {});
  const observer = window.ResizeObserver ? new window.ResizeObserver(refresh) : null;
  observer?.observe(intro);
  observer?.observe(stage);
  if (greeting) observer?.observe(greeting);
  if (hanging) observer?.observe(hanging);
  if (document.body) observer?.observe(document.body);
  function dispose() {
    if (disposed) return;
    disposed = true;
    reset();
    observer?.disconnect();
    listeners.forEach(remove => remove());
  }
  refresh();
  return { refresh, dispose };
}
