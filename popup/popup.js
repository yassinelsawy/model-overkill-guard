(function () {
  const { DEFAULTS } = window.MOG_CONFIG;

  const els = {
    enabled: document.getElementById("enabled"),
    newChatAlertsEnabled: document.getElementById("newChatAlertsEnabled"),
    sensitivity: document.getElementById("sensitivity"),
    flagSonnet: document.getElementById("flagSonnet"),
    simpleKeywords: document.getElementById("simpleKeywords"),
    complexKeywords: document.getElementById("complexKeywords"),
    reset: document.getElementById("reset"),
    status: document.getElementById("status")
  };

  function toCsv(arr) {
    return (arr || []).join(", ");
  }

  function fromCsv(str) {
    return str
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function render(settings) {
    els.enabled.checked = settings.enabled;
    els.newChatAlertsEnabled.checked = settings.newChatAlertsEnabled;
    els.sensitivity.value = settings.sensitivity;
    els.flagSonnet.checked = settings.flagSonnetOverkillToo;
    els.simpleKeywords.value = toCsv(settings.customSimpleKeywords);
    els.complexKeywords.value = toCsv(settings.customComplexKeywords);
  }

  function save(partial) {
    chrome.storage.sync.set(partial, () => {
      els.status.textContent = "Saved";
      setTimeout(() => (els.status.textContent = ""), 1000);
    });
  }

  chrome.storage.sync.get(DEFAULTS, render);

  els.enabled.addEventListener("change", () => save({ enabled: els.enabled.checked }));
  els.newChatAlertsEnabled.addEventListener("change", () =>
    save({ newChatAlertsEnabled: els.newChatAlertsEnabled.checked })
  );
  els.sensitivity.addEventListener("change", () => save({ sensitivity: els.sensitivity.value }));
  els.flagSonnet.addEventListener("change", () => save({ flagSonnetOverkillToo: els.flagSonnet.checked }));
  els.simpleKeywords.addEventListener("change", () =>
    save({ customSimpleKeywords: fromCsv(els.simpleKeywords.value) })
  );
  els.complexKeywords.addEventListener("change", () =>
    save({ customComplexKeywords: fromCsv(els.complexKeywords.value) })
  );
  els.reset.addEventListener("click", () => {
    chrome.storage.sync.set(DEFAULTS, () => render(DEFAULTS));
  });
})();
