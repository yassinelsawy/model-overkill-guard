// Lightweight, auto-dismissing, theme-aware toast — Shadow DOM isolated, same visual
// language as modal-ui.js but non-blocking. Used for ambient nudges (e.g. new-chat reminder)
// rather than the hard send-time stop.
(function () {
  function show({ title, body, actions = [], anchorRect = null, durationMs = 8000 }) {
    const theme = window.MOG_DOM.isDarkMode() ? window.MOG_CONFIG.THEME.dark : window.MOG_CONFIG.THEME.light;

    // A zero-size rect means the anchor wasn't actually laid out (e.g. read mid SPA-transition)
    // — treat it the same as no anchor rather than computing a nonsensical off-screen position.
    if (anchorRect && anchorRect.width === 0 && anchorRect.height === 0) anchorRect = null;

    const host = document.createElement("div");
    host.id = "model-overkill-guard-toast";
    document.body.appendChild(host);
    const root = host.attachShadow({ mode: "open" });

    const top = anchorRect ? Math.max(12, anchorRect.top - 12) : 24;
    const left = anchorRect ? Math.min(window.innerWidth - 340, Math.max(12, anchorRect.left)) : window.innerWidth - 340;

    root.innerHTML = `
      <style>
        :host { all: initial; }
        .toast {
          position: fixed; z-index: 2147483646;
          top: ${anchorRect ? "auto" : "24px"};
          bottom: ${anchorRect ? `${window.innerHeight - top}px` : "auto"};
          left: ${left}px; width: 300px;
          background: ${theme.card}; color: ${theme.text};
          border: 1px solid ${theme.border}; border-radius: 12px;
          padding: 14px 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.18);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          opacity: 0; transform: translateY(6px);
          transition: opacity 180ms ease, transform 180ms ease;
        }
        .toast.in { opacity: 1; transform: translateY(0); }
        .title { font-size: 13px; font-weight: 600; margin: 0 0 4px; display: flex; align-items: center; gap: 6px; }
        .body { font-size: 12.5px; color: ${theme.textMuted}; margin: 0 0 10px; line-height: 1.4; }
        .actions { display: flex; flex-wrap: wrap; gap: 6px; }
        button {
          font: inherit; font-size: 12px; padding: 5px 10px; border-radius: 7px;
          border: 1px solid ${theme.border}; background: transparent; color: ${theme.text};
          cursor: pointer;
        }
        button.primary { background: ${theme.accent}; color: ${theme.accentText}; border-color: ${theme.accent}; }
        button:hover { opacity: 0.85; }
        .close { position: absolute; top: 8px; right: 10px; border: none; background: none; font-size: 14px; padding: 2px 4px; color: ${theme.textMuted}; }
      </style>
      <div class="toast" role="status">
        <button class="close" data-action="__close">&times;</button>
        <p class="title">${title}</p>
        <p class="body">${body}</p>
        <div class="actions"></div>
      </div>
    `;

    const actionsEl = root.querySelector(".actions");
    actions.forEach(({ label, primary, onClick }) => {
      const btn = document.createElement("button");
      btn.textContent = label;
      if (primary) btn.classList.add("primary");
      btn.addEventListener("click", () => {
        onClick?.();
        dismiss();
      });
      actionsEl.appendChild(btn);
    });

    function dismiss() {
      clearTimeout(timer);
      host.remove();
    }

    root.querySelector('[data-action="__close"]').addEventListener("click", dismiss);
    requestAnimationFrame(() => root.querySelector(".toast").classList.add("in"));
    const timer = setTimeout(dismiss, durationMs);

    return dismiss;
  }

  window.MOG_TOAST = { show };
})();
