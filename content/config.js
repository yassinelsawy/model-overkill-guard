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

  const SENSITIVITY_PRESETS = {
    lenient: { simpleCutoff: -3, complexCutoff: 4, shortWords: 12, longWords: 160 },
    balanced: { simpleCutoff: -2, complexCutoff: 3, shortWords: 20, longWords: 120 },
    strict: { simpleCutoff: -1, complexCutoff: 2, shortWords: 30, longWords: 90 }
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
      codeBlock: 2
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
    SENSITIVITY_PRESETS,
    DEFAULTS,
    MODEL_TIER_ORDER,
    MODEL_LABEL_PATTERNS,
    THEME,
    TIER_META
  };
})();
