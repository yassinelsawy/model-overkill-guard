// Prompt-classification logic. No DOM access, no chrome.* calls — easy to reason about in isolation.
//
// It blends two independent, offline judgments of how hard a prompt is:
//   1. STRUCTURAL signals (this file) — leading verb, keyword hits, multi-part requirements,
//      sequencing/reasoning cues, code, and (weakly) length.
//   2. INTENT model (content/intent-model.js) — TF-IDF cosine similarity of the prompt to a labeled
//      corpus of example prompts per tier.
// Each produces a tier estimate on a 0..2 scale (haiku..opus) plus a confidence, and they're merged
// confidence-weighted. Length is deliberately demoted to a weak tiebreaker — a short "prove this
// theorem" is Opus work and a long "fix the grammar in this doc" is not.
//
// The recommendation is only surfaced as a nudge when the *combined* confidence clears the preset's
// minConfidence (see isOverkill). When the two signals disagree, confidence drops and we stay quiet
// — false positives erode trust far faster than a missed nudge does.
(function () {
  const TIER_ORDER = ["haiku", "sonnet", "opus"];

  function countMatches(text, keywords) {
    const lower = text.toLowerCase();
    return keywords.filter((kw) => lower.includes(kw.toLowerCase()));
  }

  function leadingVerb(text, config) {
    const first = (text.trim().toLowerCase().match(/[a-z]+/) || [""])[0];
    if (!first) return { word: "", klass: "neutral" };
    if (config.COMPLEX_VERBS.includes(first)) return { word: first, klass: "complex" };
    if (config.SIMPLE_VERBS.includes(first)) return { word: first, klass: "simple" };
    return { word: first, klass: "neutral" };
  }

  function analyzeSignals(text, config) {
    config = config || window.MOG_CONFIG;
    const trimmed = text.trim();
    const words = trimmed.length ? trimmed.split(/\s+/) : [];
    const lower = text.toLowerCase();

    // Distinct requirements: explicit list items plus " and "/" also " style conjunctions, capped so
    // one very enumerated prompt can't dominate the score.
    const listItems = (text.match(/^\s*(?:[-*]|\d+[.)])\s+/gm) || []).length;
    const conjunctions = (lower.match(/\b(and also|additionally|furthermore|as well as)\b/g) || []).length;
    const requirementCount = Math.min(5, listItems + conjunctions);

    const stepCount = (config.STEP_CUES || []).filter((c) => lower.includes(c)).length;
    const reasoningCueCount = Math.min(3, (config.REASONING_CUES || []).filter((c) => lower.includes(c)).length);

    return {
      wordCount: words.length,
      charCount: trimmed.length,
      hasCodeBlock: /```/.test(text) || /\n(    |\t)/.test(text),
      questionMarkCount: (text.match(/\?/g) || []).length,
      lineCount: text.split(/\n/).filter((l) => l.trim().length > 0).length,
      requirementCount,
      stepCount,
      reasoningCueCount,
      leadingVerb: leadingVerb(text, config)
    };
  }

  // --- Approach 1: structural score -> a tier rank on [0,2] plus how decisive it is. -------------
  function structuralAssessment(text, signals, matchedSimple, matchedComplex, settings, preset) {
    const w = settings.weights;
    const verb = signals.leadingVerb;

    let score = 0;
    score += matchedComplex.length * w.complexKeyword;
    score -= matchedSimple.length * w.simpleKeyword;
    if (verb.klass === "complex") score += w.complexVerb;
    if (verb.klass === "simple") score -= w.simpleVerb;
    score += signals.requirementCount * w.requirement;
    score += signals.stepCount > 0 ? w.step : 0;
    score += signals.reasoningCueCount * w.reasoningCue;

    // Code usually means real work — but "fix"/"format"/"rename" over a snippet is still trivial.
    if (signals.hasCodeBlock && verb.klass !== "simple") score += w.codeBlock;

    // Length is only a weak nudge at the extremes, never the driver.
    if (signals.wordCount > 0 && signals.wordCount < preset.shortWords) score -= 1;
    if (signals.wordCount > preset.longWords) score += 1;

    // A strong complex signal shouldn't be dragged below neutral by a couple of simple-word hits.
    if ((matchedComplex.length > 0 || verb.klass === "complex") && score < 0) score = 0;

    // Map score -> rank on [0,2]: simpleCutoff -> 0 (haiku), complexCutoff -> 2 (opus).
    const span = preset.complexCutoff - preset.simpleCutoff || 1;
    const rank = clamp(((score - preset.simpleCutoff) / span) * 2, 0, 2);

    // Confidence: decisive at/beyond the cutoffs, ~0 in the ambiguous middle.
    const mid = (preset.simpleCutoff + preset.complexCutoff) / 2;
    const halfBand = span / 2;
    const confidence = clamp(Math.abs(score - mid) / halfBand, 0, 1);

    return { score, rank, confidence };
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function tierFromRank(rank) {
    return TIER_ORDER[clamp(Math.round(rank), 0, 2)];
  }

  // settings: merged runtime config (see interceptor.js loadSettings), config: window.MOG_CONFIG
  function classifyPrompt(text, settings, config) {
    config = config || window.MOG_CONFIG;
    const preset = config.SENSITIVITY_PRESETS[settings.sensitivity] || config.SENSITIVITY_PRESETS.balanced;
    const simpleKeywords = config.DEFAULT_SIMPLE_KEYWORDS.concat(settings.customSimpleKeywords || []);
    const complexKeywords = config.DEFAULT_COMPLEX_KEYWORDS.concat(settings.customComplexKeywords || []);

    const signals = analyzeSignals(text, config);
    const matchedSimpleKeywords = countMatches(text, simpleKeywords);
    const matchedComplexKeywords = countMatches(text, complexKeywords);

    const structural = structuralAssessment(
      text, signals, matchedSimpleKeywords, matchedComplexKeywords, settings, preset
    );

    // --- Approach 2: intent model (abstains gracefully if unavailable). --------------------------
    const intent = (window.MOG_INTENT && window.MOG_INTENT.classify(text)) || {
      tier: null, rankExpected: structural.rank, confidence: 0, topTerms: [], scores: {}
    };
    // Blend on the intent model's argmax tier, not its softmax expected rank: for a short prompt
    // with few in-corpus words the expected rank goes mushy (~middle) even when the top tier is
    // clearly Opus, which would wrongly drag a hard-but-terse task down a tier. Confidence + the
    // agreement discount below already absorb the model's uncertainty.
    const intentRank = intent.tier ? TIER_ORDER.indexOf(intent.tier) : structural.rank;

    // --- Blend: confidence-weighted average of the two ranks. ------------------------------------
    const cfg = config.INTENT;
    const wI = cfg.intentWeight * intent.confidence;
    const wS = cfg.structuralWeight * structural.confidence;
    const blendedRank = (wI + wS) > 1e-6
      ? (wI * intentRank + wS * structural.rank) / (wI + wS)
      : (intentRank + structural.rank) / 2; // both unsure -> neutral average

    // Overall confidence: as sure as our best signal, discounted by how much the two disagree.
    // Disagreement is what produces abstention — the guard goes quiet instead of guessing.
    const disagreement = Math.abs(intentRank - structural.rank); // 0..2
    const agreementFactor = clamp(1 - disagreement / 1.5, 0.3, 1);
    const confidence = Math.max(intent.confidence, structural.confidence) * agreementFactor;

    return {
      recommendedTier: tierFromRank(blendedRank),
      confidence,
      blendedRank,
      structural,
      intent: { tier: intent.tier, confidence: intent.confidence, scores: intent.scores, topTerms: intent.topTerms },
      // Back-compat + modal chips: keyword arrays and the raw score consumers already read.
      score: structural.score,
      signals: Object.assign({}, signals, {
        matchedSimpleKeywords,
        matchedComplexKeywords,
        topIntentTerms: intent.topTerms || []
      })
    };
  }

  // classification: the full object from classifyPrompt (was: just recommendedTier).
  function isOverkill(activeTier, classification, settings, config) {
    config = config || window.MOG_CONFIG;
    const preset = config.SENSITIVITY_PRESETS[settings.sensitivity] || config.SENSITIVITY_PRESETS.balanced;
    // Tolerate an old-style call that passed the tier string directly.
    const recommendedTier = typeof classification === "string" ? classification : classification.recommendedTier;
    const confidence = typeof classification === "string" ? 1 : classification.confidence;

    const order = config.MODEL_TIER_ORDER;
    const activeIdx = order.indexOf(activeTier);
    const recIdx = order.indexOf(recommendedTier);
    if (activeIdx === -1 || recIdx === -1) return false;

    const gap = activeIdx - recIdx;
    if (gap <= 0) return false; // active tier is not more powerful than recommended
    if (gap === 1 && activeTier === "sonnet" && !settings.flagSonnetOverkillToo) return false;
    if (gap < settings.tierGap) return false;

    // Abstention: only nudge when we're actually confident the task is lighter.
    if (confidence < (preset.minConfidence || 0)) return false;
    return true;
  }

  window.MOG_HEURISTICS = { classifyPrompt, isOverkill, analyzeSignals };
})();
