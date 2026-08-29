// Fires a gentle, dismissible reminder every time the user lands on an empty/new chat
// (no conversation id in the URL yet), nudging them to pick a model deliberately before
// they even start typing — separate from interceptor.js's hard send-time block.
(function () {
  const DOM = window.MOG_DOM;
  const CONFIG = window.MOG_CONFIG;

  let settings = { enabled: true, newChatAlertsEnabled: true };
  function loadSettings() {
    chrome.storage.sync.get(CONFIG.DEFAULTS, (stored) => {
      settings = Object.assign({}, CONFIG.DEFAULTS, stored);
    });
  }
  loadSettings();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync") loadSettings();
  });

  let wasOnConversation = null; // null = not yet determined (initial load)
  let lastAlertAt = 0;

  async function maybeAlert() {
    if (!settings.enabled || !settings.newChatAlertsEnabled) return;

    const conversationId = DOM.getConversationId();
    const isNewChat = !conversationId;
    const cameFromConversation = wasOnConversation === true;
    const isInitialLoad = wasOnConversation === null;
    wasOnConversation = !isNewChat;

    if (!isNewChat) return;
    // Fire on a genuine transition into "new chat", or on first load landing there —
    // but not repeatedly for redirect chains that bounce between no-id paths quickly.
    const now = Date.now();
    if (!cameFromConversation && !isInitialLoad && now - lastAlertAt < 30000) return;
    lastAlertAt = now;

    await DOM.waitForElement(DOM.SEL.MODEL_SELECTOR, 5000);
    const picker = DOM.findModelPickerButton();
    if (!picker) return;

    const activeTier = DOM.getActiveModelTier() || "sonnet";
    const rect = picker.getBoundingClientRect();

    const otherTiers = CONFIG.MODEL_TIER_ORDER.filter((t) => t !== activeTier);
    window.MOG_TOAST.show({
      title: "🧭 New chat started",
      body: `Currently on <strong>${CONFIG.TIER_META[activeTier].label}</strong> (${CONFIG.TIER_META[activeTier].blurb}). Pick the lightest model that fits what you're about to ask.`,
      anchorRect: rect,
      durationMs: 10000,
      actions: otherTiers.map((tier) => ({
        label: `Switch to ${CONFIG.TIER_META[tier].label}`,
        primary: tier === "haiku",
        onClick: () => DOM.switchToModel(tier)
      }))
    });
  }

  DOM.observeUrlChanges(() => maybeAlert());
  // Initial load isn't a pushState/popstate event, so check once after the composer mounts.
  DOM.waitForElement(DOM.SEL.MODEL_SELECTOR, 8000).then(() => maybeAlert());
})();
