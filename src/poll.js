// Polling that stops when nobody is looking.
//
// Every live view here (community messages, threads, DMs, notifications) used to
// run a bare setInterval, which kept firing in a minimized window, a background
// tab, or a browser left open on a desk overnight. That traffic never let the
// database suspend, so it billed compute around the clock whether or not anyone
// was using the site.
//
// A tick now fires only while the tab is visible AND someone has interacted
// recently. Returning to the tab refreshes immediately, so coming back never
// shows stale data.

const IDLE_MS = 5 * 60 * 1000; // treat the person as away after this much quiet
const MIN_MS = 30 * 1000;      // floor: nothing here polls faster than this
const ACTIVITY = ["mousemove", "keydown", "pointerdown", "scroll", "touchstart"];

export function pollVisible(fn, ms) {
  ms = Math.max(ms || MIN_MS, MIN_MS);
  let lastActive = Date.now();
  const bump = () => { lastActive = Date.now(); };
  ACTIVITY.forEach(e => window.addEventListener(e, bump, { passive: true }));

  const awake = () => !document.hidden && Date.now() - lastActive < IDLE_MS;
  const tick = () => { if (awake()) fn(); };
  const t = setInterval(tick, ms);

  // Coming back to the tab (or waking the laptop) should refresh right away
  // rather than after a full interval of stale content.
  const onVisible = () => { if (!document.hidden) { bump(); fn(); } };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onVisible);

  return () => {
    clearInterval(t);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onVisible);
    ACTIVITY.forEach(e => window.removeEventListener(e, bump));
  };
}
