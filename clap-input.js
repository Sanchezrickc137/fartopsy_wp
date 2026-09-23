/** A short input cooldown, independent of sound, decorative motion and database writes. */
export function createClapInput({ enabled = () => true, onPress = () => {}, changed = () => {}, intervalMs = 150 } = {}) {
  const interval = Number.isFinite(intervalMs) ? Math.max(0, intervalMs) : 150;
  let deadline = -Infinity, timer = null, cooling = false, pressing = false, disposed = false, revision = 0;

  function notify(value) {
    if (disposed || cooling === value) return;
    cooling = value;
    changed({ cooling });
  }
  function schedule(version) {
    timer = setTimeout(() => {
      if (disposed || version !== revision) return;
      timer = null;
      // Timers may run early: only the monotonic clock can end the cooldown.
      if (performance.now() < deadline) { schedule(version); return; }
      notify(false);
    }, Math.max(0, deadline - performance.now()));
  }
  function press() {
    if (disposed || pressing || performance.now() < deadline) return false;
    pressing = true;
    try {
      if (!enabled() || disposed) return false;
      deadline = performance.now() + interval;
      if (timer !== null) clearTimeout(timer);
      schedule(++revision);
      // Reserve the interval before either callback can attempt another press.
      notify(true);
      if (disposed) return false;
      onPress();
      return true;
    } finally { pressing = false; }
  }
  return { press, dispose() {
    if (disposed) return;
    disposed = true; revision++;
    if (timer !== null) clearTimeout(timer);
    timer = null; cooling = false;
  } };
}
