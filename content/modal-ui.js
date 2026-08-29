// Blocking confirmation modal, rendered in a Shadow DOM so claude.ai's CSS can't
// clash with it (and vice versa). show() returns a Promise of the user's choice.
// Styling mirrors claude.ai's own light/dark palette (see config.js THEME) instead of
// looking like a generic browser-alert overlay.
(function () {
  function buildReason(signals) {
    const chips = [];
    chips.push(`${signals.wordCount} words`);
    if (signals.matchedSimpleKeywords.length) {
      chips.push(`"${signals.matchedSimpleKeywords[0]}"`);
    }
    if (signals.matchedComplexKeywords.length === 0) {
      chips.push("no complex-task keywords");
    }
    return chips;
  }

  function show({ activeTier, recommendedTier, signals }) {
    return new Promise((resolve) => {
      const theme = window.MOG_DOM.isDarkMode() ? window.MOG_CONFIG.THEME.dark : window.MOG_CONFIG.THEME.light;
      const TIER_META = window.MOG_CONFIG.TIER_META;

      const host = document.createElement("div");
      host.id = "model-overkill-guard-root";
      document.body.appendChild(host);
      const root = host.attachShadow({ mode: "open" });

      const chips = buildReason(signals)
        .map((c) => `<span class="chip">${c}</span>`)
        .join("");

      root.innerHTML = `
        <style>
          :host { all: initial; }
          .backdrop {
            position: fixed; inset: 0; z-index: 2147483647;
            background: rgba(0, 0, 0, 0.45);
            display: flex; align-items: center; justify-content: center;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            opacity: 0; transition: opacity 150ms ease;
          }
          .backdrop.in { opacity: 1; }
          .card {
            background: ${theme.card}; color: ${theme.text};
            border: 1px solid ${theme.border};
            border-radius: 16px; padding: 22px; max-width: 400px; width: 90%;
            box-shadow: 0 16px 40px rgba(0,0,0,0.3);
            transform: scale(0.97); transition: transform 150ms ease;
          }
          .backdrop.in .card { transform: scale(1); }
          .eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: ${theme.textMuted}; margin: 0 0 6px; }
          h2 { margin: 0 0 10px; font-size: 16px; line-height: 1.35; }
          h2 strong { color: ${theme.warn}; }
          .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 14px; }
          .chip {
            font-size: 11.5px; background: ${theme.bg}; border: 1px solid ${theme.border};
            border-radius: 999px; padding: 3px 9px; color: ${theme.textMuted};
          }
          .suggestion {
            font-size: 13px; margin: 0 0 16px; color: ${theme.textMuted}; line-height: 1.4;
          }
          .suggestion strong { color: ${theme.text}; }
          .actions { display: flex; flex-direction: column; gap: 8px; }
          button {
            font: inherit; font-size: 13.5px; padding: 10px 14px; border-radius: 10px;
            border: 1px solid ${theme.border}; cursor: pointer; background: transparent; color: ${theme.text};
          }
          button.primary { background: ${theme.accent}; color: ${theme.accentText}; border-color: ${theme.accent}; font-weight: 600; }
          button:hover { opacity: 0.85; }
          button:focus-visible { outline: 2px solid ${theme.accent}; outline-offset: 2px; }
          .cancel { border: none; background: none; color: ${theme.textMuted}; text-decoration: underline; padding: 4px; align-self: center; }
        </style>
        <div class="backdrop">
          <div class="card" role="dialog" aria-modal="true" aria-labelledby="mog-title">
            <p class="eyebrow">Model Overkill Guard</p>
            <h2 id="mog-title">You picked <strong>${TIER_META[activeTier].label}</strong> for what looks like a simple prompt</h2>
            <div class="chips">${chips}</div>
            <p class="suggestion"><strong>${TIER_META[recommendedTier].label}</strong> — ${TIER_META[recommendedTier].blurb}</p>
            <div class="actions">
              <button class="primary" data-action="switch">Switch to ${TIER_META[recommendedTier].label} and send</button>
              <button data-action="send">Send anyway with ${TIER_META[activeTier].label}</button>
              <button class="cancel" data-action="cancel">Cancel</button>
            </div>
          </div>
        </div>
      `;

      function cleanup(result) {
        document.removeEventListener("keydown", onKeydown, true);
        host.remove();
        resolve(result);
      }

      function onKeydown(e) {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          cleanup({ action: "cancel" });
        }
      }
      document.addEventListener("keydown", onKeydown, true);

      root.querySelector('[data-action="send"]').addEventListener("click", () =>
        cleanup({ action: "send-anyway" })
      );
      root.querySelector('[data-action="switch"]').addEventListener("click", () =>
        cleanup({ action: "switch-and-send", tier: recommendedTier })
      );
      root.querySelector('[data-action="cancel"]').addEventListener("click", () =>
        cleanup({ action: "cancel" })
      );

      requestAnimationFrame(() => root.querySelector(".backdrop").classList.add("in"));
      root.querySelector(".primary").focus();
    });
  }

  window.MOG_MODAL = { show };
})();
