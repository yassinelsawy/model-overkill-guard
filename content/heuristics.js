// Pure prompt-classification logic. No DOM access, no chrome.* calls — easy to reason about in isolation.
(function () {
  function countMatches(text, keywords) {
    const lower = text.toLowerCase();
    return keywords.filter((kw) => lower.includes(kw.toLowerCase()));
  }

  function analyzeSignals(text) {
    const trimmed = text.trim();
    const words = trimmed.length ? trimmed.split(/\s+/) : [];
    return {
      wordCount: words.length,
      charCount: trimmed.length,
      hasCodeBlock: /```/.test(text) || /\n(    |\t)/.test(text),
      questionMarkCount: (text.match(/\?/g) || []).length,
      lineCount: text.split(/\n/).filter((l) => l.trim().length > 0).length
    };
  }

  // settings: merged runtime config (see interceptor.js loadSettings), config: window.MOG_CONFIG
  function classifyPrompt(text, settings, config) {
    config = config || window.MOG_CONFIG;
    const preset = config.SENSITIVITY_PRESETS[settings.sensitivity] || config.SENSITIVITY_PRESETS.balanced;
    const simpleKeywords = config.DEFAULT_SIMPLE_KEYWORDS.concat(settings.customSimpleKeywords || []);
    const complexKeywords = config.DEFAULT_COMPLEX_KEYWORDS.concat(settings.customComplexKeywords || []);

    const signals = analyzeSignals(text);
    const matchedSimpleKeywords = countMatches(text, simpleKeywords);
    const matchedComplexKeywords = countMatches(text, complexKeywords);

    let score = 0;
    score += matchedComplexKeywords.length * settings.weights.complexKeyword;
    score -= matchedSimpleKeywords.length * settings.weights.simpleKeyword;
    score += signals.hasCodeBlock ? settings.weights.codeBlock : 0;

    if (signals.wordCount > 0 && signals.wordCount < preset.shortWords) score -= 1;
    if (signals.wordCount > preset.longWords) score += 1;

    // A strong complex-keyword hit vetoes a confidently-simple score even in a short prompt,
    // e.g. "refactor auth" is 2 words but not actually trivial.
    if (matchedComplexKeywords.length > 0 && score < 0) score = 0;

    let recommendedTier;
    if (score <= preset.simpleCutoff) recommendedTier = "haiku";
    else if (score >= preset.complexCutoff) recommendedTier = "opus";
    else recommendedTier = "sonnet";

    return {
      recommendedTier,
      score,
      signals: Object.assign({}, signals, { matchedSimpleKeywords, matchedComplexKeywords })
    };
  }

  function isOverkill(activeTier, recommendedTier, settings, config) {
    config = config || window.MOG_CONFIG;
    const order = config.MODEL_TIER_ORDER;
    const activeIdx = order.indexOf(activeTier);
    const recIdx = order.indexOf(recommendedTier);
    if (activeIdx === -1 || recIdx === -1) return false;

    const gap = activeIdx - recIdx;
    if (gap <= 0) return false; // active tier is not more powerful than recommended
    if (gap === 1 && activeTier === "sonnet" && !settings.flagSonnetOverkillToo) return false;
    return gap >= settings.tierGap;
  }

  window.MOG_HEURISTICS = { classifyPrompt, isOverkill, analyzeSignals };
})();
