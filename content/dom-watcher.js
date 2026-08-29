// All claude.ai-specific DOM knowledge lives in this file.
//
// Selectors below (data-testid attributes, the html[data-mode] theme flag) are verified
// against the live site — cross-checked against she-llac/claude-counter (MIT), an actively
// maintained claude.ai extension, rather than guessed. They can still change without notice;
// if this extension stops triggering, re-check these against DevTools first. See SELECTORS.md.
(function () {
  const { MODEL_LABEL_PATTERNS } = window.MOG_CONFIG;

  const SEL = {
    MODEL_SELECTOR: '[data-testid="model-selector-dropdown"]',
    CHAT_MENU_TRIGGER: '[data-testid="chat-menu-trigger"]',
    GRID_CONTAINER: '[data-testid="chat-input-grid-container"]',
    GRID_AREA: '[data-testid="chat-input-grid-area"]'
  };

  function isDarkMode() {
    const mode = document.documentElement.dataset?.mode;
    if (mode === "dark") return true;
    if (mode === "light") return false;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function getConversationId() {
    const match = window.location.pathname.match(/\/chat\/([^/?]+)/);
    return match ? match[1] : null;
  }

  // Walks up from `el` looking for the flex row that holds the composer's toolbar buttons
  // (model picker, tools, send button) — resilient to wrapper-div churn since it keys off
  // computed layout + button count rather than a specific class name.
  function findToolbarRow(el, stopAt) {
    let cur = el;
    while (cur && cur !== document.body) {
      if (stopAt && cur === stopAt) break;
      if (cur !== el && cur.nodeType === 1) {
        const style = window.getComputedStyle(cur);
        if (style.display === "flex" && style.flexDirection === "row") {
          if (cur.querySelectorAll("button").length > 1) return cur;
        }
      }
      cur = cur.parentElement;
    }
    return null;
  }

  function findModelPickerButton() {
    const byTestId = document.querySelector(SEL.MODEL_SELECTOR);
    if (byTestId) return byTestId;

    // Fallback: any button/combobox whose visible text names a model tier.
    const candidates = document.querySelectorAll('button, [role="button"], [role="combobox"]');
    for (const el of candidates) {
      const text = (el.textContent || "").trim();
      if (text.length > 0 && text.length < 60 && MODEL_LABEL_PATTERNS.some((p) => p.pattern.test(text))) {
        return el;
      }
    }
    return null;
  }

  function getActiveModelTier() {
    const picker = findModelPickerButton();
    if (!picker) return null;
    const text = picker.textContent || "";
    for (const { pattern, tier } of MODEL_LABEL_PATTERNS) {
      if (pattern.test(text)) return tier;
    }
    return null;
  }

  function getComposerToolbarRow() {
    const picker = findModelPickerButton();
    if (!picker) return null;
    const gridContainer = picker.closest(SEL.GRID_CONTAINER);
    const gridArea = picker.closest(SEL.GRID_AREA);
    return (
      (gridContainer ? findToolbarRow(picker, gridArea || gridContainer) : null) ||
      findToolbarRow(picker) ||
      picker.parentElement?.parentElement?.parentElement ||
      null
    );
  }

  function findPromptInput() {
    // claude.ai's composer is a contenteditable ProseMirror div with role="textbox".
    const editable = document.querySelector('div[contenteditable="true"][role="textbox"]');
    if (editable) return editable;
    const fallbackEditable = document.querySelector('div[contenteditable="true"]');
    if (fallbackEditable) return fallbackEditable;
    return document.querySelector("textarea");
  }

  function getPromptText() {
    const input = findPromptInput();
    if (!input) return "";
    return (input.innerText !== undefined ? input.innerText : input.value) || "";
  }

  function findSendButton() {
    const byLabel = document.querySelector('button[aria-label*="send" i]');
    if (byLabel) return byLabel;

    // Fallback: within the composer's toolbar row, the enabled button that isn't the picker.
    const row = getComposerToolbarRow();
    const picker = findModelPickerButton();
    if (row) {
      const buttons = Array.from(row.querySelectorAll("button"));
      const candidate = buttons.reverse().find((b) => b !== picker && !b.disabled);
      if (candidate) return candidate;
    }

    const input = findPromptInput();
    if (!input) return null;
    const container = input.closest("form") || input.parentElement?.closest("div");
    if (!container) return null;
    const buttons = Array.from(container.querySelectorAll('button, [role="button"]'));
    return buttons.find((b) => b !== picker && !b.disabled) || null;
  }

  function findModelMenuItemFor(tier) {
    const items = document.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="option"]');
    const pattern = MODEL_LABEL_PATTERNS.find((p) => p.tier === tier)?.pattern;
    if (!pattern) return null;
    for (const el of items) {
      if (pattern.test(el.textContent || "")) return el;
    }
    return null;
  }

  function switchToModel(tier) {
    return new Promise((resolve) => {
      const picker = findModelPickerButton();
      if (!picker) return resolve(false);
      picker.click();

      const deadline = Date.now() + 2000;
      const tryPick = () => {
        const item = findModelMenuItemFor(tier);
        if (item) {
          item.click();
          setTimeout(() => resolve(getActiveModelTier() === tier), 150);
          return;
        }
        if (Date.now() < deadline) {
          requestAnimationFrame(tryPick);
        } else {
          resolve(false);
        }
      };
      requestAnimationFrame(tryPick);
    });
  }

  // Promise-based single-shot element wait — reacts immediately via MutationObserver
  // instead of polling, and self-disconnects once resolved (or on timeout).
  function waitForElement(selector, timeoutMs) {
    return new Promise((resolve) => {
      const existing = document.querySelector(selector);
      if (existing) return resolve(existing);

      let timeoutId;
      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          if (timeoutId) clearTimeout(timeoutId);
          observer.disconnect();
          resolve(el);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      if (timeoutMs) {
        timeoutId = setTimeout(() => {
          observer.disconnect();
          resolve(null);
        }, timeoutMs);
      }
    });
  }

  // Detects SPA navigation (new chat, opening a conversation, back/forward). The
  // history.pushState/replaceState patching itself lives in main-world-nav-patch.js, injected
  // into the page's own MAIN world (see manifest.json) — history.pushState here in the
  // extension's isolated world is a *different* object from the page's, so claude.ai's router
  // calling it would otherwise be invisible to this content script. That script dispatches
  // "mog:urlchange" on `window`, which — unlike JS object references — does cross the
  // isolated/main world boundary, so listening for it here works correctly.
  function observeUrlChanges(callback) {
    let lastPath = window.location.pathname;
    const fireIfChanged = () => {
      const current = window.location.pathname;
      if (current !== lastPath) {
        lastPath = current;
        callback(current);
      }
    };
    window.addEventListener("mog:urlchange", fireIfChanged);
    window.addEventListener("popstate", fireIfChanged);
    return () => {
      window.removeEventListener("mog:urlchange", fireIfChanged);
      window.removeEventListener("popstate", fireIfChanged);
    };
  }

  // Delegated on `document` with capture:true rather than attached directly to the input/
  // button. This matters: claude.ai's composer is ProseMirror-based, and ProseMirror binds
  // its own keydown handler straight onto the contenteditable element (synchronously, at
  // editor construction) to implement Enter-to-send itself. A listener we attach later
  // directly on that same element would lose the ordering race — same element + same phase
  // fires in registration order, and ProseMirror's is always registered first. A capture
  // listener on `document`, being higher in the tree, always runs before any listener on a
  // descendant regardless of registration time, so preventDefault()/stopPropagation() here
  // reliably pre-empts the site's own handling. This also sidesteps needing a MutationObserver
  // to re-attach after SPA re-renders, since the target is re-queried on every event.
  function watchAndAttach(onSendAttempt) {
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Enter" || e.shiftKey) return;
        const input = findPromptInput();
        if (input && input.contains(e.target)) onSendAttempt(e);
      },
      { capture: true }
    );

    document.addEventListener(
      "click",
      (e) => {
        const button = findSendButton();
        if (button && (e.target === button || button.contains(e.target))) onSendAttempt(e);
      },
      { capture: true }
    );
  }

  // Calls `callback(text)` on every keystroke in the prompt box. Delegated for the same
  // reason as watchAndAttach — no MutationObserver re-attachment needed.
  function watchInputText(callback) {
    document.addEventListener(
      "input",
      (e) => {
        const input = findPromptInput();
        if (input && input === e.target) callback(getPromptText());
      },
      { capture: true }
    );
  }

  window.MOG_DOM = {
    SEL,
    isDarkMode,
    getConversationId,
    findToolbarRow,
    findModelPickerButton,
    getActiveModelTier,
    getComposerToolbarRow,
    findPromptInput,
    getPromptText,
    findSendButton,
    switchToModel,
    waitForElement,
    observeUrlChanges,
    watchAndAttach,
    watchInputText
  };
})();
