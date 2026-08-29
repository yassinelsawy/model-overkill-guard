// Runs in the page's MAIN world (see manifest.json's "world": "MAIN" entry) — NOT the
// extension's isolated world. This is required: history.pushState/replaceState on the
// isolated-world's `history` object is a distinct copy from the page's own, so claude.ai's
// router calling pushState there is invisible to a patch applied from the isolated world.
// Dispatching a plain window event bridges back across the world boundary, since DOM events
// (unlike JS object references) aren't isolated per-world.
(function () {
  ["pushState", "replaceState"].forEach((method) => {
    const original = history[method];
    history[method] = function (...args) {
      const result = original.apply(this, args);
      window.dispatchEvent(new Event("mog:urlchange"));
      return result;
    };
  });
})();
