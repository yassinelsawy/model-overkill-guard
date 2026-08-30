// Shared defaults + tunable config for Model Overkill Guard.
// Loaded first; every other content script reads/writes window.MOG_CONFIG.
(function () {
  const DEFAULT_SIMPLE_KEYWORDS = [
    "fix typo", "typo", "rephrase", "reword", "summarize", "summarise",
    "tl;dr", "tldr", "translate", "shorten", "proofread", "grammar",
    "rename", "format this", "what does", "define", "one sentence",
    "quick question", "quick fix", "small change", "one-liner"
  ];

  const DEFAULT_COMPLEX_KEYWORDS = [
    "architect", "refactor", "entire codebase", "design system",
    "design a", "system design", "analyze", "analysis", "debug",
    "root cause", "migrate", "migration", "security review", "audit",
    "algorithm", "optimize performance", "write a plan", "multi-step",
    "end-to-end", "comprehensive", "strategy", "large-scale"
  ];

  // minConfidence gates the nudge: we only flag a send as overkill when the blended classifier
  // (structural + intent) is at least this sure the task is genuinely lighter. Higher = quieter /
  // fewer false positives. "lenient" nags least, "strict" nags most.
  const SENSITIVITY_PRESETS = {
    lenient: { simpleCutoff: -3, complexCutoff: 4, shortWords: 12, longWords: 160, minConfidence: 0.6 },
    balanced: { simpleCutoff: -2, complexCutoff: 3, shortWords: 20, longWords: 120, minConfidence: 0.45 },
    strict: { simpleCutoff: -1, complexCutoff: 2, shortWords: 30, longWords: 90, minConfidence: 0.3 }
  };

  // Leading imperative verbs — the single strongest offline signal of task type. Only the FIRST
  // meaningful word is checked here (imperative mood); mid-sentence mentions are covered by the
  // keyword lists above.
  const SIMPLE_VERBS = [
    "fix", "rename", "format", "capitalize", "translate", "summarize", "summarise",
    "shorten", "rephrase", "reword", "proofread", "define", "list", "convert", "spell",
    "correct", "tldr", "reply", "capitalise"
  ];
  const COMPLEX_VERBS = [
    "design", "architect", "refactor", "debug", "optimize", "optimise", "analyze", "analyse",
    "migrate", "plan", "compare", "evaluate", "investigate", "prove", "derive", "redesign", "audit"
  ];

  // Cue phrases for structural complexity. Multi-part requirements, sequencing, and reasoning
  // asks all correlate with harder tasks far better than raw length does.
  const REASONING_CUES = [
    "why", "compare", "trade-off", "tradeoff", "tradeoffs", "root cause", "because",
    "unless", "versus", " vs ", "pros and cons", "edge case", "reason through", "justify"
  ];
  const STEP_CUES = [
    "step by step", "first,", "then ", "after that", "finally,", "multi-step", "walk me through"
  ];

  // Tuning knobs for the intent classifier (content/intent-model.js). The example corpus itself
  // lives in that file so it's easy to extend.
  const INTENT = {
    intentWeight: 0.6,      // how much the TF-IDF intent verdict counts in the blend
    structuralWeight: 0.4,  // how much the structural score counts in the blend
    softmaxTemp: 0.08,      // lower = sharper tier probabilities from the (small) cosine scores
    minTopScore: 0.05,      // if the best cosine is below this, the intent model abstains
    marginForFullConf: 0.12,// top-vs-second cosine gap that counts as full intent confidence
    useBigrams: true        // include word pairs so "root cause" / "step by step" register
  };

  const DEFAULTS = {
    enabled: true,
    newChatAlertsEnabled: true,
    sensitivity: "balanced",
    flagSonnetOverkillToo: false,
    tierGap: 1,
    customSimpleKeywords: [],
    customComplexKeywords: [],
    weights: {
      complexKeyword: 3,
      simpleKeyword: 2,
      codeBlock: 2,
      complexVerb: 3,   // leading verb like "design"/"refactor"
      simpleVerb: 3,    // leading verb like "fix"/"translate"
      requirement: 1,   // per distinct requirement (list item / "and also"), capped
      step: 2,          // any multi-step / sequencing cue present
      reasoningCue: 1   // per reasoning cue ("why"/"compare"/"root cause"), capped
    }
  };

  const MODEL_TIER_ORDER = ["haiku", "sonnet", "opus"];

  // Maps substrings found in the model picker's visible label to a tier.
  // Checked in order; keep opus/sonnet before haiku since "Claude" appears in all of them.
  const MODEL_LABEL_PATTERNS = [
    { pattern: /opus/i, tier: "opus" },
    { pattern: /sonnet/i, tier: "sonnet" },
    { pattern: /haiku/i, tier: "haiku" }
  ];

  // Matches claude.ai's own light/dark palette so injected UI blends in rather than
  // looking like a foreign browser-extension overlay.
  const THEME = {
    dark: {
      bg: "#2a2a28", card: "#30302e", border: "#4a4a47",
      text: "#faf9f5", textMuted: "#b0aea3",
      accent: "#2c84db", accentText: "#ffffff",
      warn: "#ce2029"
    },
    light: {
      bg: "#ffffff", card: "#fbfaf8", border: "#e5e3dc",
      text: "#141413", textMuted: "#6b6a65",
      accent: "#5aa6ff", accentText: "#141413",
      warn: "#ce2029"
    }
  };

  const TIER_META = {
    haiku: { label: "Haiku", blurb: "fastest, cheapest — quick edits & short questions" },
    sonnet: { label: "Sonnet", blurb: "balanced — everyday coding & writing tasks" },
    opus: { label: "Opus", blurb: "most capable, most expensive — hard multi-step work" }
  };

  window.MOG_CONFIG = {
    DEFAULT_SIMPLE_KEYWORDS,
    DEFAULT_COMPLEX_KEYWORDS,
    SIMPLE_VERBS,
    COMPLEX_VERBS,
    REASONING_CUES,
    STEP_CUES,
    SENSITIVITY_PRESETS,
    INTENT,
    DEFAULTS,
    MODEL_TIER_ORDER,
    MODEL_LABEL_PATTERNS,
    THEME,
    TIER_META
  };
})();
