// Ambient inline hint: a small pill anchored above the model picker that appears only when
// the currently-typed draft looks like it's overkill for the selected model — a quiet
// heads-up before the user ever hits send, so the blocking modal in interceptor.js becomes a
// rare last resort rather than the only signal.
//
// Positioned as a fixed-position overlay (bounding-rect anchored), not inserted into
// claude.ai's own DOM flow — the composer toolbar is laid out with CSS grid on the live site
// (not matching the plain flex row this was first built against), and any sibling inserted
// into a grid container gets auto-placed into an arbitrary cell instead of visually where
// intended. A fixed overlay sidesteps that entirely, the same way toast.js already does.
(function () {
  const DOM = window.MOG_DOM;
  const HEURISTICS = window.MOG_HEURISTICS;
  const CONFIG = window.MOG_CONFIG;

  let settings = Object.assign({}, CONFIG.DEFAULTS);
  function loadSettings() {
    chrome.storage.sync.get(CONFIG.DEFAULTS, (stored) => {
      settings = Object.assign({}, CONFIG.DEFAULTS, stored, { weights: CONFIG.DEFAULTS.weights });
    });
  }
  loadSettings();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync") loadSettings();
  });

  let host = null;
  let shadowRoot = null;

  function ensureHost() {
    if (host) return;
    host = document.createElement("div");
    host.id = "model-overkill-guard-badge";
    document.body.appendChild(host);
    shadowRoot = host.attachShadow({ mode: "open" });
  }

  function hide() {
    if (shadowRoot) shadowRoot.innerHTML = "";
  }

  function render(recommendedTier, anchorRect) {
    ensureHost();
    const theme = DOM.isDarkMode() ? CONFIG.THEME.dark : CONFIG.THEME.light;
    const top = Math.max(8, anchorRect.top - 34);
    const left = Math.min(window.innerWidth - 260, Math.max(8, anchorRect.right - 250));

    shadowRoot.innerHTML = `
      <style>
        :host { all: initial; }
        .pill {
          position: fixed; top: ${top}px; left: ${left}px; z-index: 2147483645;
          display: inline-flex; align-items: center; gap: 6px;
          padding: 5px 10px; border-radius: 999px;
          font: 11.5px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          background: ${theme.card}; border: 1px solid ${theme.border}; color: ${theme.textMuted};
          box-shadow: 0 4px 14px rgba(0,0,0,0.18);
          max-width: 250px;
        }
        .dot { width: 6px; height: 6px; border-radius: 50%; background: ${theme.warn}; flex: none; }
        strong { color: ${theme.text}; }
      </style>
      <span class="pill">
        <span class="dot"></span>
        Try <strong>${CONFIG.TIER_META[recommendedTier].label}</strong> instead? Looks like a ${recommendedTier === "haiku" ? "quick" : "lighter"} task.
      </span>
    `;
  }

  function evaluate(text) {
    if (!settings.enabled || !text.trim()) return hide();

    const picker = DOM.findModelPickerButton();
    const activeTier = DOM.getActiveModelTier();
    if (!picker || !activeTier) return hide();

    const classification = HEURISTICS.classifyPrompt(text, settings, CONFIG);
    if (HEURISTICS.isOverkill(activeTier, classification.recommendedTier, settings, CONFIG)) {
      render(classification.recommendedTier, picker.getBoundingClientRect());
    } else {
      hide();
    }
  }

  let debounceTimer = null;
  DOM.watchInputText((text) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => evaluate(text), 250);
  });

  DOM.observeUrlChanges(() => hide());
  window.addEventListener("resize", () => hide());

  // The composer clears programmatically once a message actually sends, which doesn't fire
  // a native `input` event — so interceptor.js calls this directly once a send goes through.
  window.MOG_LIVE_BADGE = { hide };
})();
