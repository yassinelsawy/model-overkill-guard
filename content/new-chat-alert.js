// Fires a gentle, dismissible reminder every time the user lands on an empty/new chat
// (no conversation id in the URL yet), nudging them to pick a model deliberately before
// they even start typing — separate from interceptor.js's hard send-time block.
(function () {
  const DOM = window.MOG_DOM;
  const CONFIG = window.MOG_CONFIG;

  // Fixed config — there's no settings UI, so this is the single source of behavior.
  const settings = CONFIG.DEFAULTS;

  let wasOnConversation = null; // null = not yet determined (initial load)
  let lastAlertAt = 0;

  // Right when a pushState-driven route change fires, the picker element can still exist in
  // the DOM but not yet be laid out (mid-transition, e.g. briefly display:none while the SPA
  // swaps views) — getBoundingClientRect() returns all zeros in that window. Poll a few
  // animation frames for a real (non-zero) layout before anchoring the toast to it.
  function waitForLayout(el, maxFrames = 15) {
    return new Promise((resolve) => {
      let frames = 0;
      function check() {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) return resolve(rect);
        frames++;
        if (frames >= maxFrames) return resolve(rect);
        requestAnimationFrame(check);
      }
      check();
    });
  }

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
    const rect = await waitForLayout(picker);

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
