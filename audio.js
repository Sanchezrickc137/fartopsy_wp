const playlist = [
  { src: "./audio/purple-starry-night.mp3", title: "Purple Starry Night" },
  { src: "./audio/untitled.mp3", title: "Untitled" },
];

/** Background music has its own preference and starts only after the intro closes. */
export function createBackgroundMusic({
  introActive = () => document.documentElement.classList.contains("intro-active"),
  mediaActive = () => false,
} = {}) {
  const buttons = [...document.querySelectorAll("[data-music-toggle]")];
  const statuses = [...document.querySelectorAll("[data-music-status]")];
  if (!buttons.length) return { refresh() {}, toggle() {}, setEnabled() {}, dispose() {},
    snapshot: () => ({ wanted: false, playing: false, pending: false, blocked: false, unavailable: false, storageBlocked: false, index: 0, track: playlist[0].title }),
  };
  const audio = new Audio();
  audio.preload = "none"; audio.loop = false; audio.volume = .35; audio.src = playlist[0].src;
  const listeners = [];
  let wanted = true, playing = false, pending = false, blocked = false, unavailable = false;
  let disposed = false, leaving = false, storageBlocked = false, index = 0, version = 0;
  let fadeOnResume = false, fading = false, fadeTimer = 0;
  const normalVolume = .35, fadeDuration = 1000;
  try { wanted = localStorage.getItem("fartopsy-welcome-demo-music") !== "off"; }
  catch { storageBlocked = true; }
  const ready = () => !disposed && !leaving && !document.hidden && !introActive() && !mediaActive();
  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  }
  function render() {
    const waiting = introActive();
    const mediaWaiting = !waiting && mediaActive();
    const label = playing ? "On" : "Off";
    const description = waiting ? "Music starts after the intro" : mediaWaiting ? "Music pauses while game/media audio is playing" : playing ? "Mute background music" :
      unavailable ? "Music unavailable. Try again" : "Play background music";
    for (const button of buttons) {
      button.disabled = disposed || waiting || mediaWaiting;
      button.setAttribute("aria-pressed", String(playing));
      button.setAttribute("aria-busy", String(pending));
      button.setAttribute("aria-label", description); button.title = description;
      const text = button.querySelector("[data-music-state]");
      if (text && text.textContent !== label) text.textContent = label;
    }
    const message = waiting ? "Music starts after the intro." : mediaWaiting ? "Music pauses while game/media audio is playing." : unavailable ? "Music couldn’t load. Press Music to try again." :
      blocked ? "Press Music, or interact with the page, to start." : playing ? `Playing ${playlist[index].title}.` :
      pending ? "Starting music…" : "Background music is off.";
    const status = `${message}${storageBlocked ? " Your choice works in this tab." : ""}`;
    statuses.forEach(node => { if (node.textContent !== status) node.textContent = status; });
  }
  function cancelFade() {
    if (fadeTimer) window.clearTimeout(fadeTimer);
    fadeTimer = 0;
    if (fading) fadeOnResume = true;
    fading = false;
  }
  function fadeIn(request) {
    cancelFade(); fading = true;
    const started = performance.now();
    function step() {
      // A late callback from a cancelled play request cannot touch a newer fade.
      if (request !== version || disposed) return;
      fadeTimer = 0;
      if (!ready() || !wanted || audio.paused) { stop(); return; }
      const progress = Math.min(1, (performance.now() - started) / fadeDuration);
      audio.volume = normalVolume * progress * progress * (3 - 2 * progress);
      if (progress < 1) fadeTimer = window.setTimeout(step, 25);
      else { fading = false; fadeOnResume = false; }
    }
    fadeTimer = window.setTimeout(step, 25);
  }
  function stop() {
    version++; cancelFade(); pending = false; playing = false;
    if (fadeOnResume) audio.volume = 0;
    audio.pause(); render();
  }
  async function start(gesture = false) {
    if (!ready() || !wanted || pending || playing || (!gesture && (blocked || unavailable))) { render(); return; }
    const request = ++version;
    // Silence before invoking play; the promise may take a while to settle.
    // Starting the envelope only after it resolves preserves the full fade.
    audio.volume = fadeOnResume ? 0 : normalVolume;
    pending = true; blocked = false; unavailable = false; render();
    try {
      // Call play synchronously from gestures; awaiting another task loses activation.
      await audio.play();
      if (request !== version || disposed) {
        if (!wanted || !ready()) audio.pause();
        return;
      }
      pending = false;
      if (!ready() || !wanted) { stop(); return; }
      playing = !audio.paused && !audio.ended;
      if (playing && fadeOnResume) fadeIn(request);
      render();
    } catch (error) {
      if (request !== version || disposed) return;
      pending = false; playing = false;
      blocked = ["NotAllowedError", "AbortError"].includes(error.name);
      unavailable = !blocked; audio.pause(); render();
    }
  }
  function setEnabled(value) {
    if (disposed) return;
    wanted = Boolean(value); blocked = false; unavailable = false;
    try { localStorage.setItem("fartopsy-welcome-demo-music", wanted ? "on" : "off"); storageBlocked = false; }
    catch { storageBlocked = true; }
    if (!wanted) stop(); else start(true);
  }
  function toggle() { if (!disposed) setEnabled(!(playing || pending)); }
  function refresh() {
    if (disposed) return;
    if (mediaActive()) fadeOnResume = true;
    if (!ready()) stop();
    else if (wanted) start();
    else render();
  }
  function interaction(event) {
    if (!wanted || !blocked || !ready() || event.target?.closest?.("[data-music-toggle]")) return;
    if (event.type === "keydown" && (event.repeat || event.ctrlKey || event.metaKey || event.altKey ||
        ["Shift", "Control", "Alt", "Meta", "Escape"].includes(event.key))) return;
    start(true);
  }
  buttons.forEach(button => listen(button, "click", toggle));
  listen(document, "pointerdown", interaction, { passive: true });
  listen(document, "keydown", interaction);
  listen(document, "visibilitychange", refresh);
  listen(document, "fartopsy:intro-ready", refresh);
  listen(window, "pagehide", () => { leaving = true; stop(); });
  listen(window, "pageshow", () => { leaving = false; refresh(); });
  listen(audio, "playing", () => {
    if (!wanted || !ready()) { stop(); return; }
    playing = true; pending = false; blocked = false; unavailable = false; render();
  });
  listen(audio, "pause", () => {
    // Pause events are queued; an earlier stop can arrive after a newer play.
    if (!audio.paused) return;
    cancelFade(); playing = false; render();
  });
  listen(audio, "ended", () => {
    if (disposed || !wanted) return;
    cancelFade();
    version++; playing = false; pending = false; blocked = false; unavailable = false;
    index = (index + 1) % playlist.length; audio.src = playlist[index].src;
    audio.currentTime = 0; refresh();
  });
  listen(audio, "error", () => { unavailable = true; blocked = false; stop(); });
  refresh();
  return { refresh, toggle, setEnabled,
    snapshot: () => ({ wanted, playing, pending, blocked, unavailable, storageBlocked, index, track: playlist[index].title }),
    dispose() {
      if (disposed) return;
      disposed = true; stop(); listeners.forEach(remove => remove());
      audio.removeAttribute("src"); audio.load();
    },
  };
}

/** Gesture effects keep separate media elements, so they never interrupt the playlist. */
function createOneShotSound(src, volume) {
  const audio = new Audio();
  audio.src = src; audio.preload = "none"; audio.loop = false; audio.volume = volume;
  let disposed = false, leaving = false, active = false, version = 0;
  const listeners = [];
  function listen(target, type, handler) {
    target.addEventListener(type, handler); listeners.push(() => target.removeEventListener(type, handler));
  }
  function pause() { version++; active = false; audio.pause(); }
  async function play() {
    if (disposed || leaving || document.hidden) return false;
    const request = ++version; active = true;
    try {
      audio.currentTime = 0;
      await audio.play();
      if (disposed || leaving || document.hidden || !active) { audio.pause(); return false; }
      return request === version;
    } catch {
      if (request === version) pause();
      return false;
    }
  }
  listen(document, "visibilitychange", () => { if (document.hidden) pause(); });
  listen(window, "pagehide", () => { leaving = true; pause(); });
  listen(window, "pageshow", () => { leaving = false; });
  listen(audio, "ended", () => { active = false; });
  listen(audio, "error", pause);
  return { play, dispose() {
    if (disposed) return;
    disposed = true; pause(); listeners.forEach(remove => remove()); audio.removeAttribute("src"); audio.load();
  } };
}

export function createBackToTopSound() {
  return createOneShotSound("./audio/vinyl-stop.mp3", .32);
}

export function createPuzzleCompleteSound() {
  return createOneShotSound("./audio/puzzle-complete.mp3", .65);
}

export function createPuzzleErrorSound() {
  return createOneShotSound("./audio/puzzle-error.mp3", .65);
}





export function createCreditsClickSound() {
  return createOneShotSound("./audio/credits-click.mp3", .65);
}
