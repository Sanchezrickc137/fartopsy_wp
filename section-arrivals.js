/** One-shot arrivals. Layout is read only at entry; the browser runs the motion. */
export function createSectionArrivals({ motionAllowed = () => true, introCovering = () => false } = {}) {
  const folders = [...document.querySelectorAll(".journeys .journey-reveal")];
  const applause = [...document.querySelectorAll(".applause-studio")];
  const items = [
    ...folders.map((el, index) => ({ el, side: -1, delay: index * 100 })),
    ...applause.map(el => ({ el, side: 1, delay: 0 })),
  ].map(item => ({ ...item, done: false, animation: null }));
  const folderItems = items.filter(item => item.side < 0);
  const heading = document.querySelector("[data-shortcuts-heading]");
  const inks = [...(heading?.querySelectorAll(".credit-handwriting-ink") || [])];
  let headingDone = false, headingAnimations = [];
  const byElement = new Map(items.map(item => [item.el, item]));
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const listeners = [], queued = new Set();
  let frame = 0, disposed = false, observer = null, observerHeight = 0, entryLine = 0;
  const canClip = window.CSS?.supports?.("overflow-x", "clip") !== false;
  const allowed = () => !disposed && canClip && motionAllowed() && !reduced?.matches && !document.hidden && !introCovering();
  const visible = item => !item.el.hidden && !item.el.closest("[hidden], dialog:not([open])");
  const focused = item => item.el.contains(document.activeElement);
  function listen(target, type, handler, options) {
    target?.addEventListener?.(type, handler, options);
    listeners.push(() => target?.removeEventListener?.(type, handler, options));
  }
  function clipping() {
    document.documentElement.classList.toggle("section-arrivals-clipping", items.some(item => item.animation));
  }
  function settleHeading(complete = true) {
    const animations = headingAnimations; headingAnimations = [];
    animations.forEach(animation => animation.cancel());
    heading?.classList.remove("shortcuts-heading-waiting", "shortcuts-heading-running");
    if (complete) headingDone = true;
  }
  function writeHeading() {
    if (!heading || headingDone || headingAnimations.length || !folderItems.length || !folderItems.every(item => item.done && !item.animation)) return;
    if (!allowed() || !visible({ el: heading }) || !heading.animate || !inks.length || inks.some(ink => !ink.animate)) { settleHeading(); return; }
    heading.classList.remove("shortcuts-heading-waiting");
    heading.classList.add("shortcuts-heading-running");
    try {
      headingAnimations.push(heading.animate([
        { transform: "translateY(9px) scale(.98)" },
        { transform: "translateY(-4px) scale(1.015)", offset: .58 },
        { transform: "translateY(1px) scale(.997)", offset: .82 },
        { transform: "none" },
      ], { duration: 640, easing: "cubic-bezier(.2,.75,.25,1)", fill: "both" }));
      for (const ink of inks) {
        const value = name => ink.style.getPropertyValue(name);
        const duration = Math.max(90, Math.min(260, parseFloat(value("--hw-duration")) || 170));
        const delay = Math.max(0, parseFloat(value("--hw-delay")) || 0);
        headingAnimations.push(ink.animate([
          { opacity: 0, clipPath: "polygon(0 -30%,0 -30%,-20% 140%,-20% 140%)", transform: `translate(-2px,${value("--hw-rise") || "0px"}) scale(.95) rotate(${value("--hw-tilt") || "0deg"})`, offset: 0 },
          { opacity: 1, offset: .2 },
          { clipPath: "polygon(-20% -30%,120% -30%,100% 140%,-20% 140%)", offset: .85 },
          { opacity: 1, clipPath: "none", transform: "none", offset: 1 },
        ], { duration, delay, easing: "linear", fill: "both" }));
      }
      const current = headingAnimations;
      const finish = () => { if (headingAnimations === current) settleHeading(); };
      Promise.all(current.map(animation => animation.finished)).then(finish, finish);
    } catch { settleHeading(); }
  }
  function settle(item, animation = item.animation) {
    if (animation && item.animation !== animation) return;
    item.animation = null; animation?.cancel();
    item.el.classList.remove("section-arrival-running", "section-arrival-queued", "section-arrival-waiting");
    clipping();
  }
  function finishForInteraction(item) {
    if (item.side < 0) settleHeading();
    item.done = true; queued.delete(item); observer?.unobserve(item.el); settle(item);
    if (!queued.size && frame) { window.cancelAnimationFrame(frame); frame = 0; }
  }
  function render() {
    frame = 0;
    if (!allowed()) { refresh(); return; }
    const width = document.documentElement.clientWidth || window.innerWidth;
    // Batch every layout read before starting any animation or adding hints.
    const measured = [...queued].filter(item => !item.done && visible(item)).map(item => ({ item, rect: item.el.getBoundingClientRect() }));
    queued.forEach(item => item.el.classList.remove("section-arrival-queued")); queued.clear();
    for (const { item, rect } of measured) {
      if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= entryLine || rect.right <= 0 || rect.left >= width) continue;
      if (focused(item)) { finishForInteraction(item); continue; }
      item.done = true; observer?.unobserve(item.el);
      const distance = item.side < 0 ? -rect.right - 32 : width - rect.left + 32;
      const overshoot = -item.side * Math.min(15, rect.width * .04);
      const frames = [
        { transform: `perspective(1200px) translate3d(${distance}px, 18px, -90px) rotate(${item.side * 1.2}deg) scale(.96)`, opacity: 0, offset: 0 },
        { transform: `perspective(1200px) translate3d(${overshoot}px, -3px, 6px) rotate(${-item.side * .45}deg) scale(1.008)`, opacity: 1, offset: .7 },
        { transform: `perspective(1200px) translate3d(${-overshoot * .35}px, 1px, 0) rotate(${item.side * .12}deg)`, opacity: 1, offset: .86 },
        { transform: "none", opacity: 1, offset: 1 },
      ];
      try {
        const animation = item.el.animate(frames, { duration: item.side < 0 ? 920 : 1000, delay: item.delay, easing: "cubic-bezier(.22,.8,.3,1)", fill: "both" });
        item.animation = animation; item.el.classList.add("section-arrival-running"); clipping();
        animation.finished.then(() => {
          if (item.animation !== animation) return;
          settle(item, animation); writeHeading();
        }, () => {
          if (item.animation !== animation) return;
          settle(item, animation);
          if (item.side < 0) settleHeading();
        });
      } catch { settle(item); if (item.side < 0) settleHeading(); }
    }
  }
  function onEntries(entries) {
    if (!allowed()) return;
    for (const { target, isIntersecting, intersectionRatio } of entries) {
      const item = byElement.get(target);
      if (!item || item.done || !isIntersecting || !(intersectionRatio >= .001) || !visible(item) || !item.el.animate) continue;
      if (focused(item)) { finishForInteraction(item); continue; }
      queued.add(item); item.el.classList.add("section-arrival-queued");
    }
    if (queued.size && !frame) frame = window.requestAnimationFrame(render);
  }
  function refresh() {
    if (disposed) return;
    // An interrupted sequence ends readable; cancelled promises cannot restart it.
    if (headingAnimations.length || folderItems.some(item => item.animation)) settleHeading();
    if (frame) window.cancelAnimationFrame(frame); frame = 0;
    queued.clear(); observer?.disconnect();
    const height = window.innerHeight || 1;
    entryLine = Math.min(height * .68, 840);
    if (window.IntersectionObserver && allowed() && (!observer || observerHeight !== height)) {
      observerHeight = height;
      // Vertical percentage root margins resolve against width, so use viewport-height pixels.
      // The capped line also matches the capped chapter gaps on very tall displays.
      observer = new window.IntersectionObserver(onEntries, {
        threshold: .001, rootMargin: `0px 0px ${Math.round(entryLine - height)}px 0px`,
      });
    }
    items.forEach(item => {
      settle(item);
      if (observer && allowed() && !item.done && visible(item) && item.el.animate) {
        if (focused(item)) { finishForInteraction(item); return; }
        item.el.classList.add("section-arrival-waiting"); observer.observe(item.el);
      }
    });
    const headingEligible = observer && allowed() && heading && visible({ el: heading }) && heading.animate && inks.length && inks.every(ink => ink.animate) && folderItems.length && folderItems.every(item => item.el.animate);
    if (!headingDone && headingEligible && folderItems.some(item => !item.done)) heading.classList.add("shortcuts-heading-waiting");
    else settleHeading(headingDone);
  }
  items.forEach(item => {
    listen(item.el, "focusin", () => finishForInteraction(item));
    listen(item.el, "pointerdown", () => finishForInteraction(item));
  });
  listen(window, "resize", refresh, { passive: true }); listen(window, "hashchange", refresh);
  listen(document, "visibilitychange", refresh); listen(reduced, "change", refresh);
  listen(document, "fartopsy:intro-ready", refresh); listen(document, "fartopsy:welcome-unlocked", refresh);
  refresh();
  return { refresh, dispose() {
    if (disposed) return;
    disposed = true; if (frame) window.cancelAnimationFrame(frame); frame = 0;
    queued.clear(); observer?.disconnect(); items.forEach(item => settle(item)); settleHeading();
    listeners.forEach(remove => remove());
  } };
}
