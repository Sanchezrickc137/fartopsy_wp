/** Each article owns a single entrance; the outer scene keeps its scroll-depth transform. */
export function createVisitorCards({ motionAllowed = () => true, introCovering = () => false } = {}) {
  const fallback = { refresh() {}, dispose() {} };
  const stage = document.querySelector('.visitor-stats[data-visitor-stage]');
  const cards = [...(stage?.querySelectorAll('[data-stat-card]') || [])];
  if (!stage || !cards.length || !window.IntersectionObserver) return fallback;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const played = new Set(), animations = new Map(), listeners = [];
  let disposed = false, inView = false;
  const visible = () => !document.hidden && !introCovering() && !stage.closest('[hidden]');
  function listen(target, type, callback) {
    target?.addEventListener?.(type, callback);
    listeners.push(() => target?.removeEventListener?.(type, callback));
  }
  function stop() {
    animations.forEach(animation => animation.cancel());
    animations.clear();
  }
  function enter(card, index) {
    if (played.has(card)) return;
    played.add(card);
    if (typeof card.animate !== 'function') return;
    try {
      const animation = card.animate([
        { opacity: 0, transform: 'translate3d(0,28px,0) rotate(-3deg) scale(.88)', offset: 0 },
        { opacity: 1, transform: 'translate3d(0,-7px,0) rotate(1deg) scale(1.04)', offset: .62 },
        { opacity: 1, transform: 'translate3d(0,3px,0) rotate(-.6deg) scale(.985)', offset: .82 },
        { opacity: 1, transform: 'translate3d(0,0,0) rotate(0deg) scale(1)', offset: 1 },
      ], { duration: 620, delay: index * 120, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' });
      animations.set(card, animation);
      animation.finished.then(() => {
        if (disposed || animations.get(card) !== animation) return;
        animations.delete(card); animation.cancel();
      }, () => {
        if (animations.get(card) === animation) animations.delete(card);
      });
    } catch {
      // Ordinary visible article content remains when animation is unavailable.
    }
  }
  function refresh() {
    if (disposed) return;
    if (!visible() || !inView) { stop(); return; }
    if (!motionAllowed() || reduced?.matches) {
      stop(); cards.forEach(card => played.add(card));
      return;
    }
    cards.forEach(enter);
  }
  // Observe the stable section, not an article translated by its own entrance.
  const observer = new window.IntersectionObserver(entries => {
    if (disposed) return;
    for (const entry of entries) if (entry.target === stage) inView = entry.isIntersecting;
    refresh();
  }, { threshold: 0, rootMargin: '0px 0px -12% 0px' });
  observer.observe(stage);
  listen(document, 'visibilitychange', refresh);
  listen(document, 'fartopsy:intro-ready', refresh);
  listen(document, 'fartopsy:welcome-unlocked', refresh);
  listen(window, 'hashchange', refresh);
  listen(window, 'pageshow', refresh);
  listen(reduced, 'change', refresh);
  refresh();
  return {
    refresh,
    dispose() {
      if (disposed) return;
      disposed = true; stop(); observer.disconnect(); listeners.forEach(remove => remove());
    },
  };
}
