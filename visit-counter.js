import { validCount } from "./counters.js";

// The accessible number is always confirmed. Only aria-hidden digit strips roll.
export function createVisitCounter({ element, motionAllowed, introCovering, unavailableText = "Recorded views unavailable" }) {
  if (!element) return { update() {}, refresh() {}, dispose() {} };
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const animations = new Set(), listeners = [];
  let lastValue, lastLabel, accessible, labelNode, wheels = [];
  let pending = false, disposed = false, inView = false, serial = 0;
  function node(className, text) {
    const result = document.createElement("span");
    result.className = className;
    if (text !== undefined) result.textContent = text;
    return result;
  }
  function settle(wheel) {
    wheel.track.replaceChildren(node("visit-digit-face", String(wheel.value)));
    wheel.track.style.transform = "translateY(0em)";
    wheel.track.style.removeProperty("will-change");
  }
  function cancel() {
    serial++;
    for (const animation of animations) animation.cancel();
    animations.clear();
    wheels.forEach(settle);
  }
  function refresh() {
    if (disposed) return;
    if (!motionAllowed() || reduced?.matches) { pending = false; cancel(); return; }
    const routeHidden = !!element.closest("[hidden]");
    if (routeHidden) inView = false;
    if (document.hidden || introCovering() || routeHidden || !inView) { cancel(); return; }
    if (!pending) return;
    pending = false;
    if (!observer || !wheels.length || typeof wheels[0].track.animate !== "function") return;
    const current = ++serial;
    for (const wheel of wheels) {
      const { value, start, direction, rank, track } = wheel;
      const distance = direction > 0 ? (value - start + 10) % 10 : (start - value + 10) % 10;
      const steps = distance + 10 * (1 + Math.min(3, rank));
      const first = direction > 0 ? start : value;
      track.replaceChildren(...Array.from({ length: steps + 1 }, (_, index) =>
        node("visit-digit-face", String((first + index) % 10))));
      const travel = `translateY(${-steps * 1.15}em)`, resting = "translateY(0em)";
      const from = direction > 0 ? resting : travel, to = direction > 0 ? travel : resting;
      track.style.transform = to;
      track.style.setProperty("will-change", "transform");
      try {
        const animation = track.animate([{ transform: from }, { transform: to }], {
          duration: 1000 + Math.min(3, rank) * 180,
          easing: "cubic-bezier(.16,.72,.18,1)",
        });
        animations.add(animation);
        animation.finished.then(() => {
          if (disposed || current !== serial) return;
          animations.delete(animation);
          settle(wheel);
        }).catch(() => {});
      } catch { cancel(); break; }
    }
  }
  const observer = window.IntersectionObserver ? new window.IntersectionObserver((entries) => {
    if (disposed) return;
    for (const entry of entries) if (entry.target === element) {
      inView = entry.isIntersecting && entry.intersectionRatio >= .25;
      refresh();
    }
  }, { threshold: [0, .25] }) : null;
  observer?.observe(element);
  function update(value, { label = "recorded site visits" } = {}) {
    if (disposed) return;
    const confirmed = validCount(value) ? value : null;
    label = typeof label === "string" && label.trim() ? label.trim() : "recorded site visits";
    if (confirmed === lastValue) {
      if (confirmed !== null && label !== lastLabel) {
        accessible.textContent = `${confirmed.toLocaleString("en-US")} ${label}`;
        labelNode.textContent = label;
        lastLabel = label;
      }
      return;
    }
    const previous = validCount(lastValue) ? lastValue : null;
    cancel(); wheels = []; pending = false;
    lastValue = confirmed; lastLabel = label;
    if (confirmed === null) { element.textContent = unavailableText; return; }
    const formatted = confirmed.toLocaleString("en-US"), raw = String(confirmed);
    const previousDigits = previous === null ? null : String(previous).padStart(raw.length, "0");
    accessible = node("visit-count-accessible", `${formatted} ${label}`);
    const digits = node("visit-digits"); digits.setAttribute("aria-hidden", "true");
    labelNode = node("visit-label", label); labelNode.setAttribute("aria-hidden", "true");
    const separators = formatted.length - raw.length;
    digits.style.setProperty("--visit-width-units", String(raw.length * .68 + separators * .24));
    let index = 0;
    for (const character of formatted) {
      if (character === ",") { digits.append(node("visit-separator", character)); continue; }
      const digit = Number(character), place = raw.length - index - 1;
      const track = node("visit-digit-track"), viewport = node("visit-digit-wheel");
      const previousDigit = previousDigits ? Number(previousDigits.at(-place - 1) || "0") : (digit + 3) % 10;
      const wheel = { track, value: digit, start: previousDigit, rank: index,
        direction: previous !== null && confirmed < previous ? -1 : 1 };
      settle(wheel); wheels.push(wheel); viewport.append(track); digits.append(viewport); index++;
    }
    element.replaceChildren(accessible, digits, labelNode);
    pending = motionAllowed() && !reduced?.matches && !!observer;
    refresh();
  }
  function listen(target, event) {
    target?.addEventListener?.(event, refresh);
    listeners.push(() => target?.removeEventListener?.(event, refresh));
  }
  listen(document, "visibilitychange"); listen(document, "fartopsy:intro-ready"); listen(reduced, "change");
  return { update, refresh, dispose() {
    if (disposed) return;
    disposed = true; pending = false; cancel(); observer?.disconnect();
    listeners.forEach(remove => remove());
  } };
}
