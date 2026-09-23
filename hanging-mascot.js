/** A small spring in scene-local coordinates; the parent is free to scale in depth. */
export function createHangingMascot({ motionAllowed = () => true, introCovering = () => false } = {}) {
  const scene = document.querySelector('[data-hanging-scene]');
  const button = scene?.querySelector('[data-hanging-mascot]');
  const rope = scene?.querySelector('[data-hanging-rope]');
  const path = scene?.querySelector('[data-hanging-rope-path]');
  const speech = scene?.querySelector('[data-hanging-reaction]');
  const aside = scene?.querySelector('[data-hanging-aside]');
  if (!scene || !button || !rope || !path) return { refresh() {}, dispose() {} };

  const listeners = [], reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const layoutRoot = scene.closest('[data-depth-intro]') || scene;
  let disposed = false, inView = false, entered = false, frame = 0, scrollFrame = 0, last = 0, reactionTimer = 0;
  let width = 0, height = 0, homeY = 0, mascotWidth = 0, mascotHeight = 0;
  let revealGeometry = null;
  let x = 0, y = 0, vx = 0, vy = 0, targetX = 0, targetY = 0;
  let gesture = null, held = false, reactOnReturn = false;
  const reactions = ['WOW\nAMAZING!!!', 'wow amazing!!', 'oh my glob', 'hmmmmm...', '#yeahandyeahsoyeah',
    'wow guys :)', 'yayyyyyyyy!', 'thats so amazingness', 'hi hi hello', 'i see i see', 'you got this'];
  let lastReaction = -1;
  const visible = () => !disposed && !document.hidden && !scene.closest('[hidden]') && !introCovering();
  const interactive = () => visible() && inView && width > 0 && height > 0;
  const animated = () => motionAllowed() && !reduced?.matches;
  const listen = (target, type, handler, options) => {
    if (!target?.addEventListener) return;
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  };
  function measure() {
    width = scene.clientWidth; height = scene.clientHeight;
    homeY = button.offsetTop; mascotWidth = button.offsetWidth; mascotHeight = button.offsetHeight;
    if (width && height) rope.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const scroll = window.scrollY || 0, viewport = window.innerHeight || 800;
    const layoutTop = element => {
      let top = 0;
      for (let current = element; current; current = current.offsetParent) top += current.offsetTop || 0;
      return top;
    };
    // The wrapper does not inherit the scene's scroll-depth transform.
    const top = layoutRoot.getBoundingClientRect().top + scroll + layoutTop(scene) - layoutTop(layoutRoot);
    const available = Math.max(0, (document.documentElement?.scrollHeight || viewport) - viewport);
    revealGeometry = { top, viewport, start: Math.max(0, top - viewport * .72),
      end: Math.min(available, top + Math.min(height * .3, viewport * .3) - viewport * .4) };
  }
  function updateScroll() {
    if (!revealGeometry) return;
    const { top, viewport, start, end } = revealGeometry, scroll = window.scrollY || 0;
    const progress = !animated() || end <= start ? 1 : Math.max(0, Math.min(1, (scroll - start) / (end - start)));
    scene.style.setProperty('--hanging-reveal', progress.toFixed(4));
    // Wait for the resting character to fit before dropping; entering at a single pixel
    // would finish the fall underneath the viewport while the visitor was still reading above.
    const landingVisible = top - scroll + homeY + mascotHeight <= viewport - 24;
    if (!entered && interactive() && (!animated() || landingVisible)) {
      entered = true;
      scene.classList.add('hanging-entered');
      if (animated()) { y = -Math.min(homeY + mascotHeight * .3, 310); vy = 30; }
      paint(); wake();
    }
  }
  function scheduleScroll() {
    if (!interactive() || !animated() || scrollFrame) return;
    scrollFrame = window.requestAnimationFrame(() => {
      scrollFrame = 0;
      if (interactive()) updateScroll();
    });
  }
  function paint() {
    button.style.setProperty('--hanging-x', `${x.toFixed(3)}px`);
    button.style.setProperty('--hanging-y', `${y.toFixed(3)}px`);
    const angle = animated() ? Math.max(-24, Math.min(24, x * .045 + vx * .012)) : 0;
    button.style.setProperty('--hanging-angle', `${angle.toFixed(3)}deg`);
    // The attachment sits at the top center, which is also the rotation origin.
    const start = width / 2, endX = start + x, endY = homeY + y + 2;
    const bend = Math.max(-70, Math.min(70, x * .13 - vx * .025));
    path.setAttribute('d', `M ${start} 0 C ${start + bend} ${endY * .36} ${endX - x * .3 + bend} ${endY * .72} ${endX} ${endY}`);
  }
  function hideReaction() {
    if (reactionTimer) window.clearTimeout(reactionTimer);
    reactionTimer = 0;
    if (speech) speech.hidden = true;
    scene.classList.remove('hanging-reacting');
  }
  function react() {
    hideReaction();
    if (!interactive() || !speech) return;
    // Pick uniformly from the other phrases without a retry loop.
    let next = Math.floor(Math.random() * (reactions.length - (lastReaction < 0 ? 0 : 1)));
    if (lastReaction >= 0 && next >= lastReaction) next++;
    speech.textContent = reactions[next];
    lastReaction = next;
    speech.hidden = false;
    scene.classList.add('hanging-reacting');
    reactionTimer = window.setTimeout(hideReaction, 1450);
  }
  function cancelFrame() {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0; last = 0;
  }
  function releaseCapture() {
    const id = gesture?.id;
    gesture = null;
    scene.classList.remove('hanging-dragging');
    if (id != null && button.hasPointerCapture?.(id)) button.releasePointerCapture(id);
  }
  function updateAside() {
    aside?.setAttribute('aria-pressed', String(held));
    if (aside) aside.textContent = held ? 'Bring my friend back' : 'Move aside to read';
  }
  function suspend() {
    cancelFrame(); releaseCapture(); hideReaction();
    if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
    x = y = vx = vy = targetX = targetY = 0;
    held = reactOnReturn = false;
    updateAside(); paint();
  }
  function finish() {
    x = targetX; y = targetY; vx = vy = 0; last = 0;
    paint();
    if (reactOnReturn && !held) { reactOnReturn = false; react(); }
  }
  function render(time) {
    frame = 0;
    if (!interactive()) { suspend(); return; }
    if (gesture) { paint(); last = 0; return; }
    if (!animated()) { finish(); return; }
    // Capped substeps remain stable after a delayed frame and preserve the same spring.
    const elapsed = Math.min(.05, last ? Math.max(0, time - last) / 1000 : 1 / 60);
    last = time;
    const steps = Math.max(1, Math.ceil(elapsed / .012)), dt = elapsed / steps;
    for (let i = 0; i < steps; i++) {
      vx += ((targetX - x) * 105 - vx * 13) * dt;
      vy += ((targetY - y) * 105 - vy * 13) * dt;
      x += vx * dt; y += vy * dt;
    }
    if (Math.abs(x - targetX) < .15 && Math.abs(y - targetY) < .15 && Math.abs(vx) + Math.abs(vy) < .6) {
      finish(); return;
    }
    paint(); frame = window.requestAnimationFrame(render);
  }
  function wake() {
    if (!interactive()) return;
    if (!animated()) { cancelFrame(); if (gesture) paint(); else finish(); return; }
    if (!frame) frame = window.requestAnimationFrame(render);
  }
  function goHome(reaction = true) {
    const displaced = Math.abs(x) + Math.abs(y) + Math.abs(targetX) + Math.abs(targetY) > 2;
    releaseCapture(); held = false; targetX = targetY = 0;
    reactOnReturn = reaction && displaced;
    updateAside(); wake();
  }
  function localPoint(event) {
    // Read the live ancestor scale only during a pointer interaction, never in the spring loop.
    const rect = scene.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * width / (rect.width || width),
      y: (event.clientY - rect.top) * height / (rect.height || height) };
  }
  function refresh() {
    if (disposed) return;
    scene.classList.toggle('hanging-motion', animated());
    measure();
    updateScroll();
    if (!interactive()) { suspend(); return; }
    if (!animated()) { cancelFrame(); if (gesture) paint(); else finish(); }
    else { paint(); if (Math.abs(x - targetX) + Math.abs(y - targetY) > .15) wake(); }
  }

  listen(button, 'pointerdown', event => {
    if (!interactive() || gesture || event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault(); cancelFrame(); hideReaction();
    const point = localPoint(event);
    gesture = { id: event.pointerId, grabX: point.x - x, grabY: point.y - y };
    vx = vy = 0; held = false; reactOnReturn = false; updateAside();
    button.setPointerCapture?.(event.pointerId);
    scene.classList.add('hanging-dragging');
  });
  listen(button, 'pointermove', event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    if (!interactive()) { suspend(); return; }
    const point = localPoint(event);
    x = point.x - gesture.grabX; y = point.y - gesture.grabY;
    wake();
  });
  const endPointer = event => { if (gesture && event.pointerId === gesture.id) goHome(); };
  listen(button, 'pointerup', endPointer);
  listen(button, 'pointercancel', endPointer);
  listen(button, 'lostpointercapture', endPointer);
  listen(button, 'dragstart', event => event.preventDefault());
  listen(button, 'keydown', event => {
    if (!interactive()) return;
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const direction = directions[event.key];
    if (direction) {
      event.preventDefault(); releaseCapture(); hideReaction();
      held = true; reactOnReturn = false;
      const step = event.shiftKey ? 90 : 48;
      targetX = Math.max(-width * .65, Math.min(width * .65, targetX + direction[0] * step));
      targetY = Math.max(-homeY + 16, Math.min(height - homeY - mascotHeight * .35, targetY + direction[1] * step));
      updateAside(); wake();
    } else if (['Enter', 'Escape', ' '].includes(event.key)) { event.preventDefault(); goHome(); }
  });
  listen(button, 'blur', () => { if (held || gesture) goHome(); });
  listen(aside, 'click', () => {
    if (!interactive()) return;
    if (held) { goHome(); return; }
    releaseCapture(); hideReaction(); held = true; reactOnReturn = false;
    targetX = width / 2 - mascotWidth * .2;
    targetY = -Math.min(homeY - 24, mascotHeight * .68);
    updateAside(); wake();
  });
  listen(window, 'blur', () => { if (interactive()) goHome(false); });
  listen(window, 'resize', refresh, { passive: true });
  listen(window, 'scroll', scheduleScroll, { passive: true });
  listen(window, 'hashchange', refresh);
  listen(window, 'pageshow', refresh);
  listen(document, 'visibilitychange', refresh);
  listen(document, 'fartopsy:intro-ready', refresh);
  listen(document, 'fartopsy:welcome-unlocked', refresh);
  listen(reduced, 'change', refresh);
  const resize = window.ResizeObserver ? new window.ResizeObserver(refresh) : null;
  resize?.observe(scene); resize?.observe(button);
  const intersection = window.IntersectionObserver ? new window.IntersectionObserver(entries => {
    // A tall text scene may never fit 30% into a short viewport. Intersection
    // permits scroll updates; the separate landing test controls the actual fall.
    // Include the boundary intersection so threshold zero cannot strand the reveal.
    inView = entries.some(entry => entry.isIntersecting); refresh();
  }, { threshold: 0 }) : null;
  if (intersection) intersection.observe(scene); else inView = true;
  refresh();
  return {
    refresh,
    dispose() {
      if (disposed) return;
      disposed = true; suspend(); resize?.disconnect(); intersection?.disconnect();
      listeners.forEach(remove => remove());
      scene.classList.remove('hanging-motion');
      scene.classList.remove('hanging-entered');
      scene.style.removeProperty('--hanging-reveal');
      ['--hanging-x', '--hanging-y', '--hanging-angle'].forEach(name => button.style.removeProperty(name));
    },
  };
}
