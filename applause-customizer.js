const defaults = { shape: "circle", base: "rounded", face: "lavender", baseColor: "cream" };
const choices = {
  shape: ["circle", "rounded", "square"], base: ["none", "square", "rounded", "circle"],
  face: ["lavender", "peach", "cream", "mint", "rose", "sky"], baseColor: ["cream", "plum", "lavender"],
};
const colors = {
  lavender: ["#cbb0ee", "#76558c"], peach: ["#ffc39d", "#a75e53"], cream: ["#ffe5a9", "#ac8249"],
  mint: ["#b6e3cf", "#568978"], rose: ["#efb1cd", "#a35b85"], sky: ["#afcdee", "#5a749e"], plum: ["#635073", "#302039"],
};

/** Appearance only: the existing clap controller exclusively owns the real button action. */
export function createApplauseCustomizer({ motionAllowed = () => true } = {}) {
  const root = document.querySelector("[data-applause-customizer]");
  if (!root) return { refresh() {}, dispose() {} };
  const inputs = [...root.querySelectorAll("[data-applause-option]")];
  const fields = [...root.querySelectorAll("[data-applause-field]")];
  const button = root.querySelector("#clap-button"), status = root.querySelector("[data-applause-storage]");
  const fine = window.matchMedia?.("(any-hover: hover) and (any-pointer: fine)");
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const listeners = [], selected = { ...defaults };
  let disposed = false, blocked = false, frame = 0, light = null;
  try {
    const stored = JSON.parse(localStorage.getItem("fartopsy-welcome-demo-applause-style"));
    for (const key of Object.keys(defaults)) if (choices[key].includes(stored?.[key])) selected[key] = stored[key];
  } catch (error) { blocked = !(error instanceof SyntaxError); }
  function listen(target, type, handler, options) {
    target?.addEventListener?.(type, handler, options);
    listeners.push(() => target?.removeEventListener?.(type, handler, options));
  }
  function render() {
    root.dataset.applauseShape = selected.shape; root.dataset.applauseBase = selected.base;
    root.style.setProperty("--applause-face", colors[selected.face][0]);
    root.style.setProperty("--applause-side", colors[selected.face][1]);
    root.style.setProperty("--applause-base", colors[selected.baseColor][0]);
    root.style.setProperty("--applause-base-side", colors[selected.baseColor][1]);
    inputs.forEach(input => { input.checked = selected[input.dataset.applauseOption] === input.value; });
    if (status) status.textContent = blocked ? "This look stays in this tab." : "Your choices stay in this browser.";
  }
  function resetLight() {
    if (frame) window.cancelAnimationFrame(frame); frame = 0; light = null;
    button?.style.removeProperty("--applause-light-x"); button?.style.removeProperty("--applause-light-y");
  }
  const lightAllowed = () => !disposed && button && !button.disabled && !root.hidden && !root.closest("[hidden]") && !document.hidden && motionAllowed() && !reduced?.matches && fine?.matches;
  function paintLight() {
    frame = 0;
    if (!light || !lightAllowed()) { resetLight(); return; }
    button.style.setProperty("--applause-light-x", `${light.x.toFixed(2)}%`);
    button.style.setProperty("--applause-light-y", `${light.y.toFixed(2)}%`);
  }
  function move(event) {
    if (event.pointerType === "touch" || !lightAllowed()) { resetLight(); return; }
    if (!light) return;
    light.x = Math.max(0, Math.min(100, (event.clientX - light.rect.left) / light.rect.width * 100));
    light.y = Math.max(0, Math.min(100, (event.clientY - light.rect.top) / light.rect.height * 100));
    if (!frame) frame = window.requestAnimationFrame(paintLight);
  }
  inputs.forEach(input => listen(input, "change", () => {
    const key = input.dataset.applauseOption;
    if (disposed || !input.checked || !choices[key]?.includes(input.value)) return;
    selected[key] = input.value;
    try { localStorage.setItem("fartopsy-welcome-demo-applause-style", JSON.stringify(selected)); blocked = false; }
    catch { blocked = true; }
    render();
  }));
  listen(button, "pointerenter", event => {
    resetLight();
    if (event.pointerType === "touch" || !lightAllowed()) return;
    const rect = button.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    light = { rect, x: 50, y: 50 }; move(event);
  });
  listen(button, "pointermove", move);
  ["pointerleave", "pointercancel", "blur"].forEach(type => listen(button, type, resetLight));
  listen(window, "blur", resetLight); listen(window, "resize", resetLight, { passive: true });
  listen(window, "scroll", resetLight, { passive: true }); listen(window, "hashchange", refresh);
  listen(document, "visibilitychange", refresh); listen(fine, "change", refresh); listen(reduced, "change", refresh);
  function refresh() { if (!disposed && !lightAllowed()) resetLight(); }
  fields.forEach(field => { field.disabled = false; }); render();
  return { refresh, dispose() {
    if (disposed) return;
    disposed = true; resetLight(); listeners.forEach(remove => remove());
    fields.forEach(field => { field.disabled = true; });
  } };
}
