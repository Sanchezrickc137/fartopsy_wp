/** Free dragging and an equivalent keyboard path; only the continuation is gated. */
export function createWelcomePuzzle({ motionAllowed = () => true, introCovering = () => false, onUnlock = () => {}, onSolve = () => {}, onIncorrect = () => {} } = {}) {
  const root = document.querySelector("[data-welcome-puzzle]");
  const continuation = document.querySelector("[data-welcome-continuation]");
  const welcome = document.querySelector("#welcome");
  const board = root?.querySelector("[data-puzzle-board]");
  const cards = [...(root?.querySelectorAll("[data-puzzle-card]") || [])];
  if (!root || !continuation || !welcome || !board || cards.length !== 5) return { refresh() {}, dispose() {} };
  const status = root.querySelector("[data-puzzle-status]"), cue = root.querySelector("[data-puzzle-cue]");
  const heading = root.querySelector("[data-puzzle-heading]");
  const title = root.querySelector("[data-puzzle-title]");
  const alarm = root.querySelector("[data-puzzle-alarm]");
  const completion = root.querySelector("[data-puzzle-completion]");
  const particles = root.querySelector("[data-puzzle-particles]");
  const retryDialog = root.querySelector("[data-puzzle-retry-dialog]"), retryButton = root.querySelector("[data-puzzle-retry]");
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const listeners = [], entrances = new Set(), angles = [-7, 5, -4, 7, -5];
  // Authored centers keep the pile informal without pushing cards into corners.
  // These are real board coordinates, shared by painting, dragging and retries.
  const scatter = [{ x: .44, y: .10 }, { x: .66, y: .28 }, { x: .29, y: .52 }, { x: .62, y: .70 }, { x: .40, y: .91 }];
  const scatterGaps = [8, 12, 8, 12];
  const states = cards.map((card, index) => ({ card, ...scatter[[2, 0, 4, 1, 3][index]], width: 0, height: 0, index, placed: false }));
  let width = 0, height = 0, ready = false, solved = false, disposed = false, drag = null, entered = false;
  let complete = false, stacked = false, cueConsumed = false, incorrect = false;
  let frame = 0, timer = 0, layer = 5, layoutDirty = false, top = 0, sectionHeight = 1;
  let scatterBounds = [], scatterHeight = 0;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const active = () => !welcome.hidden && !root.closest("[hidden]");
  const interactive = () => !disposed && !solved && !incorrect && ready && active() && !document.hidden && !introCovering();
  const animated = () => motionAllowed() && !reduced?.matches && !document.hidden && !introCovering();
  function listen(target, event, handler, options) {
    target?.addEventListener?.(event, handler, options);
    listeners.push(() => target?.removeEventListener?.(event, handler, options));
  }
  function gate() {
    const locked = (ready || introCovering()) && !complete && !disposed;
    continuation.hidden = locked;
    continuation.inert = locked;
    document.body.classList.toggle("welcome-gated", locked && active());
  }
  function confine(state) {
    const halfX = Math.min(.5, (state.width / 2 + 4) / width), halfY = Math.min(.5, (state.height / 2 + 4) / height);
    state.x = clamp(state.x, halfX, 1 - halfX); state.y = clamp(state.y, halfY, 1 - halfY);
  }
  function arrangeScatter() {
    if (!ready || solved || states.some(state => state.placed) || !scatterBounds.length) return;
    // Center the real five-card composition. Different silhouettes and small
    // alternating gaps make the heights informal without a long fixed grid.
    let edge = (height - scatterHeight) / 2;
    [...states].sort((a, b) => a.y - b.y).forEach((state, row) => {
      const bounds = scatterBounds[state.index];
      state.y = (edge + bounds.top) / height;
      edge += bounds.top + bounds.bottom + (scatterGaps[row] || 0);
    });
  }
  function paint() {
    if (!ready || disposed) return;
    for (const state of states) {
      if (stacked) { state.x = .5 + (state.index - 2) * 8 / width; state.y = .5 + (state.index - 2) * 7 / height; }
      confine(state);
      const aligned = Math.abs(state.x - .5) * width < 1;
      state.card.style.setProperty("--puzzle-x", `${(state.x * width).toFixed(2)}px`);
      state.card.style.setProperty("--puzzle-y", `${(state.y * height).toFixed(2)}px`);
      state.card.style.setProperty("--puzzle-angle", `${stacked ? (state.index - 2) * 5 : aligned ? 0 : angles[state.index]}deg`);
      if (stacked) state.card.style.setProperty("z-index", String(20 + state.index));
    }
    const exit = complete && animated() && active()
      ? clamp(((window.scrollY || 0) - Math.max(0, top - (window.innerHeight || 800) * .1)) / (sectionHeight * .72), 0, 1) : 0;
    root.style.setProperty("--puzzle-exit", exit.toFixed(4));
    if (complete && active() && (window.scrollY || 0) >= Math.max(0, top - (window.innerHeight || 800) * .1) + sectionHeight * .72) consumeCue();
  }
  function stopCelebration() {
    if (timer) window.clearTimeout(timer);
    timer = 0; root.classList.remove("is-celebrating"); particles?.replaceChildren();
  }
  function stopEntrance() {
    entrances.forEach(animation => animation.cancel()); entrances.clear();
  }
  function animate(element, keyframes, options) {
    if (!element?.animate) return;
    try {
      const animation = element.animate(keyframes, options);
      entrances.add(animation);
      animation.finished?.then(() => entrances.delete(animation)).catch(() => {});
    } catch { /* The final static state remains usable without animation support. */ }
  }
  function enter() {
    if (entered || !ready) return;
    entered = true;
    root.classList.remove("puzzle-waiting");
    if (!animated()) return;
    animate(heading, [
      { translate: "0 18px", scale: ".92", opacity: 0 },
      { translate: "0 0", scale: "1", opacity: 1 },
    ], { duration: 560, easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" });
    animate(alarm, [0, -14, 14, -13, 13, -11, 11, -9, 9, -7, 7, -5, 5, -3, 2, 0]
      .map(angle => ({ rotate: `${angle}deg` })),
    { duration: 2000, delay: 350, easing: "ease-in-out" });
    bounceCards(580);
  }
  function bounceCards(delay = 0) {
    if (!animated()) return;
    cards.forEach((card, index) => {
        animate(card, [
          { translate: "0 28px", scale: ".88", opacity: document.activeElement === card ? 1 : 0, offset: 0 },
          { translate: "0 -6px", scale: "1.025", opacity: 1, offset: .68 },
          { translate: "0 0", scale: "1", opacity: 1, offset: 1 },
        ], { duration: 650, delay: delay + index * 75, easing: "cubic-bezier(.2,.7,.3,1)", fill: "backwards" });
    });
  }
  function dismissRetry() {
    incorrect = false;
    if (retryDialog?.open) retryDialog.close();
  }
  function retryAttempt(focus = true) {
    if (!incorrect || disposed || solved) return;
    stopEntrance(); dismissRetry();
    const previous = [...states].sort((a, b) => a.y - b.y), shuffled = [...states];
    for (let index = shuffled.length - 1; index > 0; index--) {
      const other = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
    }
    // Never hand out the solution, or repeat the just-submitted arrangement.
    while (shuffled.every((state, index) => state.index === index) || shuffled.every((state, index) => state === previous[index])) shuffled.push(shuffled.shift());
    shuffled.forEach((state, index) => {
      state.x = scatter[index].x + (Math.random() - .5) * .04;
      state.y = scatter[index].y; state.placed = false;
      state.card.style.removeProperty("z-index");
    });
    if (status) status.textContent = "Give it another try.";
    arrangeScatter();
    paint(); gate();
    if (focus && active() && !document.hidden && !introCovering()) {
      cards[0].focus({ preventScroll: true }); bounceCards();
    } else if (cards.includes(document.activeElement) || retryDialog?.contains(document.activeElement)) document.activeElement?.blur?.();
  }
  function failAttempt() {
    incorrect = true; stopEntrance();
    onIncorrect();
    if (status) status.textContent = "Try again.";
    try {
      if (!retryDialog?.showModal || !retryButton) throw new Error("Dialog unavailable");
      retryDialog.showModal(); retryButton.focus({ preventScroll: true });
    } catch { retryAttempt(); }
  }
  function consumeCue() {
    if (cueConsumed) return;
    cueConsumed = true;
    if (cue && document.activeElement === cue && !continuation.hidden && active()) {
      continuation.setAttribute("tabindex", "-1"); continuation.focus({ preventScroll: true });
    }
    if (cue) cue.hidden = true;
  }
  function finishPuzzle() {
    if (disposed || complete) return;
    stopCelebration(); stopEntrance(); stacked = true; complete = true;
    root.classList.add("puzzle-stacked", "puzzle-complete");
    if (title) title.textContent = "Puzzle completed";
    if (status) status.textContent = "";
    gate();
    if (cue) cue.hidden = cueConsumed || !active();
    paint();
    if (active() && animated() && !cueConsumed) animate(completion, [
      { opacity: 0, translate: "0 24px", scale: ".92", offset: 0 },
      { opacity: 1, translate: "0 -5px", scale: "1.025", offset: .72 },
      { opacity: 1, translate: "0 0", scale: "1", offset: 1 },
    ], { duration: 680, easing: "cubic-bezier(.2,.75,.25,1)" });
    document.dispatchEvent(new CustomEvent("fartopsy:welcome-unlocked"));
    onUnlock();
  }
  function cardTransform(state) {
    const angle = stacked ? (state.index - 2) * 5 : Math.abs(state.x - .5) * width < 1 ? 0 : angles[state.index];
    return `translate3d(${state.x * width - state.width / 2}px, ${state.y * height - state.height / 2}px, 0) rotate(${angle}deg)`;
  }
  function gather() {
    timer = 0;
    if (disposed) return;
    if (!animated() || !active()) { finishPuzzle(); return; }
    stopCelebration(); stopEntrance();
    const before = states.map(cardTransform);
    stacked = true; root.classList.add("puzzle-stacked"); paint();
    states.forEach((state, index) => animate(state.card, [{ transform: before[index] }, { transform: cardTransform(state) }],
      { duration: 650, easing: "cubic-bezier(.22,1,.36,1)" }));
    timer = window.setTimeout(finishPuzzle, 650);
  }
  function celebrate() {
    if (!animated()) { finishPuzzle(); return; }
    root.classList.add("is-celebrating");
    timer = window.setTimeout(() => {
      timer = 0;
      if (disposed) return;
      if (!active() || !animated()) { finishPuzzle(); return; }
      for (let index = 0; particles && index < 24; index++) {
        const dot = document.createElement("i"), angle = index * Math.PI * 2 / 24;
        dot.style.setProperty("--burst-x", `${Math.cos(angle) * (100 + index % 3 * 40)}px`);
        dot.style.setProperty("--burst-y", `${Math.sin(angle) * (100 + index % 3 * 40)}px`);
        dot.style.setProperty("--burst-color", ["#ffe2a2", "#d7bafa", "#b5e5d0", "#f3b9cb"][index % 4]);
        particles.append(dot);
      }
      timer = window.setTimeout(gather, 480);
    }, 240);
  }
  function check() {
    if (solved || incorrect || !ready) return;
    const averageX = states.reduce((sum, state) => sum + state.x, 0) / 5;
    const tolerance = Math.max(24, Math.min(72, width * .18));
    if (states.some(state => Math.abs(state.x - averageX) * width > tolerance)) return;
    const ordered = [...states].sort((a, b) => a.y - b.y);
    for (let index = 1; index < 5; index++) {
      const minimumGap = (ordered[index].height + ordered[index - 1].height) / 2 + 2;
      if ((ordered[index].y - ordered[index - 1].y) * height < minimumGap) return;
    }
    if (ordered.some((state, index) => state.index !== index)) {
      if (states.every(state => state.placed)) failAttempt();
      return;
    }
    solved = true; stopEntrance(); root.classList.add("puzzle-solved");
    onSolve();
    if (title) {
      title.textContent = "Puzzle completed";
      if (cards.includes(document.activeElement)) title.focus({ preventScroll: true });
      if (animated()) animate(title, [{ opacity: .3, translate: "0 8px", scale: ".96" }, { opacity: 1, translate: "0 0", scale: "1" }],
        { duration: 420, easing: "cubic-bezier(.16,1,.3,1)" });
    }
    if (status) {
      status.textContent = "";
      if (!title && cards.includes(document.activeElement)) status.focus({ preventScroll: true });
    }
    cards.forEach(card => { card.disabled = true; });
    celebrate();
  }
  function snap(state) {
    const tolerance = Math.max(24, Math.min(64, width * .15));
    if (Math.abs(state.x - .5) * width <= tolerance) state.x = .5;
    const row = clamp(Math.round(state.y * 5 - .5), 0, 4), slot = (row + .5) / 5;
    if (Math.abs(state.y - slot) * height <= height / 5 * .28) state.y = slot;
  }
  function release(commit = false) {
    if (!drag) return;
    const current = drag; drag = null;
    if (!commit) { current.state.x = current.x; current.state.y = current.y; }
    current.state.card.classList.remove("is-dragging");
    if (current.state.card.hasPointerCapture?.(current.id)) current.state.card.releasePointerCapture(current.id);
    if (frame) window.cancelAnimationFrame(frame); frame = 0;
    if (commit) { snap(current.state); current.state.placed = true; }
    paint(); if (commit) check();
  }
  function measure() {
    root.classList.add("puzzle-ready");
    const rect = board.getBoundingClientRect();
    const sizes = states.map(state => ({ width: state.card.offsetWidth, height: state.card.offsetHeight }));
    // The lower edge is 11px deep in CSS. Pack the actual rotated silhouettes,
    // rather than expanding the whole board for a hypothetical extreme row.
    scatterBounds = sizes.map((size, index) => {
      const angle = angles[index] * Math.PI / 180, cosine = Math.abs(Math.cos(angle));
      const top = (cosine * size.height + Math.abs(Math.sin(angle)) * size.width) / 2;
      return { top, bottom: top + cosine * 11 };
    });
    scatterHeight = scatterBounds.reduce((sum, bounds) => sum + bounds.top + bounds.bottom, 0) + scatterGaps.reduce((sum, gap) => sum + gap, 0);
    const minimum = Math.ceil(Math.max(260, scatterHeight + 8));
    const rootRect = root.getBoundingClientRect?.() || { top: rect.top, height: board.clientHeight };
    top = rootRect.top + (window.scrollY || 0);
    const boardTop = Number.isFinite(board.offsetTop) ? top + board.offsetTop : rect.top + (window.scrollY || 0);
    const footerHeight = completion?.offsetHeight || 88;
    const available = (window.innerHeight || rect.height + boardTop + footerHeight) - boardTop - footerHeight;
    const preferredMaximum = rect.width <= 600 || (window.innerHeight || 900) <= 760 ? 500 : 540;
    board.style.setProperty("--puzzle-height", `${Math.max(minimum, Math.min(preferredMaximum, available))}px`);
    width = board.clientWidth; height = board.clientHeight;
    ready = width > 0 && height > 0;
    root.classList.toggle("puzzle-ready", ready);
    states.forEach((state, index) => Object.assign(state, sizes[index]));
    arrangeScatter();
    // Move only the finished controls, keeping the board and scroll distance stable.
    const stackBottom = Math.max(...sizes.map((size, index) => {
      const angle = (index - 2) * 5 * Math.PI / 180;
      return (index - 2) * 7 + (Math.abs(Math.cos(angle)) * size.height + Math.abs(Math.sin(angle)) * size.width) / 2;
    }));
    root.style.setProperty("--puzzle-completion-lift", `${Math.max(0, height / 2 - stackBottom - 24).toFixed(2)}px`);
    sectionHeight = root.getBoundingClientRect?.().height || rootRect.height || height;
  }
  function refresh() {
    if (disposed) return;
    if (!entered && introCovering()) root.classList.add("puzzle-waiting");
    if (!active() && solved) consumeCue();
    if (!active() || document.hidden || introCovering()) {
      if (incorrect) retryAttempt(false);
      release(); if (frame) window.cancelAnimationFrame(frame); frame = 0; stopEntrance(); stopCelebration();
      if (solved && !complete) finishPuzzle();
      gate(); return;
    }
    const oldWidth = width, oldHeight = height;
    release(); measure(); gate(); paint();
    if (!animated()) { stopEntrance(); stopCelebration(); if (solved && !complete) finishPuzzle(); }
    else if (stacked && !complete && (oldWidth !== width || oldHeight !== height)) finishPuzzle();
    enter();
  }
  function schedule(remeasure = false) {
    if (disposed || !active() || document.hidden) return;
    layoutDirty ||= remeasure;
    if (!frame) frame = window.requestAnimationFrame(() => {
      frame = 0;
      if (layoutDirty) { layoutDirty = false; refresh(); } else paint();
    });
  }
  for (const state of states) {
    const { card } = state;
    listen(card, "pointerdown", event => {
      if (!interactive() || drag || event.button !== 0) return;
      stopEntrance();
      const rect = board.getBoundingClientRect();
      drag = { state, id: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: state.x, y: state.y, width: rect.width || width, height: rect.height || height };
      card.focus({ preventScroll: true }); card.setPointerCapture?.(event.pointerId);
      card.style.setProperty("z-index", String(++layer)); card.classList.add("is-dragging"); event.preventDefault();
    });
    listen(card, "pointermove", event => {
      if (!drag || drag.state !== state || event.pointerId !== drag.id || !interactive()) return;
      state.x = drag.x + (event.clientX - drag.clientX) / drag.width;
      state.y = drag.y + (event.clientY - drag.clientY) / drag.height;
      confine(state); schedule();
    });
    listen(card, "pointerup", event => { if (drag?.id === event.pointerId) release(true); });
    for (const event of ["pointercancel", "lostpointercapture"]) listen(card, event, () => { if (drag?.state === state) release(); });
    listen(card, "keydown", event => {
      if (!interactive() || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home"].includes(event.key)) return;
      event.preventDefault(); stopEntrance(); release();
      if (event.key === "Home") state.x = .5;
      else if (event.key === "ArrowLeft" || event.key === "ArrowRight") state.x += (event.key === "ArrowLeft" ? -24 : 24) / width;
      else { const row = clamp(Math.round(state.y * 5 - .5) + (event.key === "ArrowUp" ? -1 : 1), 0, 4); state.y = (row + .5) / 5; }
      state.placed = true; confine(state); paint(); check();
      if (!solved && !incorrect && status) status.textContent = `${card.textContent}, row ${clamp(Math.round(state.y * 5 - .5), 0, 4) + 1} of 5.`;
    });
  }
  listen(cue, "click", () => {
    if (!complete || cueConsumed || !active()) return;
    consumeCue(); continuation.scrollIntoView({ behavior: animated() ? "smooth" : "instant", block: "start" });
  });
  listen(cue, "pointerdown", stopEntrance);
  listen(cue, "focus", stopEntrance);
  listen(retryButton, "click", () => retryAttempt());
  listen(retryDialog, "cancel", event => { event.preventDefault(); retryAttempt(); });
  listen(retryDialog, "close", () => { if (incorrect && !retryDialog.open) retryAttempt(); });
  listen(window, "resize", () => schedule(true), { passive: true });
  listen(window, "scroll", () => { if (solved) schedule(); }, { passive: true });
  listen(window, "hashchange", refresh);
  listen(document, "visibilitychange", refresh); listen(document, "fartopsy:intro-ready", refresh); listen(reduced, "change", refresh);
  const resize = window.ResizeObserver ? new window.ResizeObserver(() => schedule(true)) : null;
  resize?.observe(board); cards.forEach(card => resize?.observe(card));
  refresh();
  return { refresh, dispose() {
    if (disposed) return;
    dismissRetry();
    release(); disposed = true; if (frame) window.cancelAnimationFrame(frame); frame = 0;
    stopEntrance(); stopCelebration(); resize?.disconnect(); listeners.forEach(remove => remove());
    root.classList.remove("puzzle-ready", "puzzle-waiting", "is-celebrating"); root.style.removeProperty("--puzzle-exit");
    root.style.removeProperty("--puzzle-completion-lift");
    continuation.hidden = false; continuation.inert = false; document.body.classList.remove("welcome-gated");
  } };
}
