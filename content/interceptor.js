// Orchestrator: wires dom-watcher + heuristics + modal-ui together. The only file that
// knows the full "should we block this send?" flow.
(function () {
  const { DEFAULTS } = window.MOG_CONFIG;
  const DOM = window.MOG_DOM;
  const HEURISTICS = window.MOG_HEURISTICS;
  const MODAL = window.MOG_MODAL;

  let settings = Object.assign({}, DEFAULTS);
  let bypassNext = false;
  let processing = false;

  function loadSettings() {
    chrome.storage.sync.get(DEFAULTS, (stored) => {
      settings = Object.assign({}, DEFAULTS, stored, { weights: DEFAULTS.weights });
    });
  }
  loadSettings();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync") loadSettings();
  });

  async function onSendAttempt(event) {
    if (bypassNext) {
      bypassNext = false;
      return; // let this one through untouched
    }
    if (!settings.enabled || processing) return;

    const text = DOM.getPromptText();
    if (!text.trim()) return;

    const activeTier = DOM.getActiveModelTier();
    if (!activeTier) return; // couldn't identify the picker; fail open rather than block sends

    const classification = HEURISTICS.classifyPrompt(text, settings, window.MOG_CONFIG);
    if (!HEURISTICS.isOverkill(activeTier, classification, settings, window.MOG_CONFIG)) {
      window.MOG_LIVE_BADGE?.hide();
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    processing = true;

    try {
      const result = await MODAL.show({
        activeTier,
        recommendedTier: classification.recommendedTier,
        signals: classification.signals
      });

      if (result.action === "cancel") return;

      if (result.action === "switch-and-send") {
        await DOM.switchToModel(result.tier);
      }

      window.MOG_LIVE_BADGE?.hide();
      bypassNext = true;
      resend(event);
    } finally {
      processing = false;
    }
  }

  function resend(originalEvent) {
    if (originalEvent.type === "keydown") {
      const input = DOM.findPromptInput();
      if (!input) return;
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true })
      );
    } else {
      const button = DOM.findSendButton();
      if (button) button.click();
    }
  }

  DOM.watchAndAttach(onSendAttempt);
})();
