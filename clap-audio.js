import { clapSamples } from "./clap-samples.mjs";

/** Decoded one-shot samples share a context; each accepted click owns a new voice. */
export function createClapAudio({ enabled = () => true, volume = .4, maxVoices = 32 } = {}) {
  const listeners = [], voices = new Set(), abort = new AbortController();
  const limit = Math.max(1, Math.min(32, Math.floor(Number(maxVoices)) || 32));
  let context = null, output = null, compressor = null, buffers = [], last = -1;
  let disposed = false, leaving = false, loading = false, preloadPromise = null, resumePromise = null, pending = null;
  let resumeVersion = 0, resumeFromPlay = false;
  let level = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : .4;
  const ready = () => !disposed && !leaving && !document.hidden;
  const now = () => performance.now();
  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  }
  function getContext() {
    if (disposed || context?.state === "closed") return null;
    if (context) return context;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    try {
      context = new AudioContext({ latencyHint: "interactive" });
      output = context.createGain(); output.gain.value = level;
      // Keep closely overlapping transients from becoming disproportionately loud.
      if (context.createDynamicsCompressor) {
        compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -10; compressor.knee.value = 6; compressor.ratio.value = 12;
        compressor.attack.value = .002; compressor.release.value = .12;
        output.connect(compressor); compressor.connect(context.destination);
      } else output.connect(context.destination);
      return context;
    } catch {
      try { context?.close().catch(() => {}); } catch { /* No audio must never block the clap. */ }
      context = null; output = null; compressor = null;
      return null;
    }
  }
  function preload() {
    if (disposed) return Promise.resolve(0);
    if (preloadPromise) return preloadPromise;
    const audio = getContext();
    if (!audio) return Promise.resolve(0);
    loading = true;
    preloadPromise = Promise.all(clapSamples.map(async src => {
      try {
        const response = await fetch(src, { signal: abort.signal });
        if (!response.ok || disposed) return null;
        const bytes = await response.arrayBuffer();
        if (disposed) return null;
        return await audio.decodeAudioData(bytes);
      } catch { return null; }
    })).then(decoded => {
      if (disposed) return 0;
      buffers = decoded.filter(Boolean);
      return buffers.length;
    }).finally(() => { loading = false; });
    return preloadPromise;
  }
  function release(source, stop = false) {
    if (!voices.delete(source)) return;
    source.onended = null;
    if (stop) { try { source.stop(); } catch { /* A finished voice is already silent. */ } }
    try { source.disconnect(); } catch { /* The audio context may already be closed. */ }
  }
  function startVoice() {
    if (!ready() || !enabled() || !level || !buffers.length || context?.state !== "running" || voices.size >= limit) return false;
    // Uniform choice among every available sample except the immediately previous one.
    const alternatives = buffers.length - (last >= 0 && buffers.length > 1 ? 1 : 0);
    let index = Math.floor(Math.random() * alternatives);
    if (buffers.length > 1 && last >= 0 && index >= last) index++;
    let source;
    try {
      source = context.createBufferSource(); source.buffer = buffers[index]; source.loop = false;
      source.connect(output); voices.add(source); source.onended = () => release(source);
      source.start(); last = index;
      return true;
    } catch { if (source) release(source, true); return false; }
  }
  function suspend() {
    if (!context || context.state === "closed") return;
    try { context.suspend().catch(() => {}); } catch { /* A restricted context simply stays silent. */ }
  }
  function unlock(fromPlay = false) {
    if (!ready() || !enabled() || !context || context.state === "closed" || context.state === "running" ||
        (resumePromise && (!fromPlay || resumeFromPlay))) return;
    const audio = context, version = ++resumeVersion;
    resumeFromPlay = fromPlay;
    try {
      // resume() must be called in the original pointer/keyboard gesture stack.
      resumePromise = Promise.resolve(audio.resume()).then(() => {
        if (version !== resumeVersion) return;
        const request = pending; pending = null;
        if (!ready() || !enabled()) { if (!disposed) suspend(); return; }
        if (request && now() - request.at <= 180) startVoice();
      }, () => { if (version === resumeVersion) pending = null; }).finally(() => {
        if (version === resumeVersion) { resumePromise = null; resumeFromPlay = false; }
      });
    } catch { pending = null; resumePromise = null; resumeFromPlay = false; }
  }
  function play() {
    if (!ready() || !enabled() || !level || !buffers.length || !context || context.state === "closed") return false;
    if (context.state === "running") { pending = null; return startVoice(); }
    // At most one recent click survives unlock; network/decode never queue sounds.
    pending = { at: now() }; unlock(true);
    return Boolean(pending);
  }
  function stop() { pending = null; resumeFromPlay = false; [...voices].forEach(source => release(source, true)); }
  function setVolume(value) {
    if (disposed || !Number.isFinite(value)) return;
    level = Math.max(0, Math.min(1, value));
    if (output) output.gain.setTargetAtTime(level, context.currentTime, .01);
    if (!level) stop();
  }
  function interaction(event) {
    if (event.type === "keydown" && (event.repeat || event.ctrlKey || event.metaKey || event.altKey ||
        ["Shift", "Control", "Alt", "Meta", "Escape"].includes(event.key))) return;
    unlock();
  }
  listen(document, "pointerdown", interaction, { passive: true }); listen(document, "keydown", interaction);
  listen(document, "visibilitychange", () => { if (document.hidden) { stop(); suspend(); } });
  listen(window, "pagehide", () => { leaving = true; stop(); suspend(); });
  listen(window, "pageshow", () => { leaving = false; });
  return { preload, play, stop, setVolume,
    snapshot: () => ({ ready: buffers.length > 0 && !disposed, loading, loadedSamples: buffers.length,
      totalSamples: clapSamples.length, activeVoices: voices.size, contextState: context?.state || "uninitialized", pending: Boolean(pending) }),
    dispose() {
      if (disposed) return;
      disposed = true; stop(); abort.abort(); listeners.forEach(remove => remove());
      buffers = []; output?.disconnect(); compressor?.disconnect();
      try { context?.close().catch(() => {}); } catch { /* Already closed or unavailable. */ }
    },
  };
}
