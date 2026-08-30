// Offline intent classifier — the "how related is this text to each tier" engine (Approach 2).
//
// No AI calls, no network. It ships a small labeled corpus of example prompts per tier and, at
// load time, builds a TF-IDF-weighted word centroid for each tier. classify() then vectorizes a
// prompt the same way and returns the cosine similarity to each centroid.
//
// Why this instead of a hand-maintained keyword list: terms are weighted by how *discriminative*
// they are (TF-IDF), it tolerates partial/fuzzy phrasing instead of exact substring hits, and you
// improve it by ADDING EXAMPLE PROMPTS below — not by tuning weights. A team can drop real prompts
// they've sent into the right bucket and the model gets better. It runs in ~milliseconds over this
// corpus and holds only a few KB of numbers in memory.
//
// It does NOT understand synonyms it has never seen ("refactor" != "clean up" unless both appear in
// the corpus). That's why heuristics.js blends this with the structural signals (Approach 1) rather
// than trusting it alone.
(function () {
  // ------------------------------------------------------------------ corpus
  // Characteristic example prompts per tier. Keep them short and typical of the WORK, not the topic.
  // Add real prompts here to sharpen the model — no other code changes needed.
  const CORPUS = {
    haiku: [
      "fix this typo",
      "correct the spelling in this sentence",
      "rephrase this to sound friendlier",
      "reword this paragraph",
      "make this shorter",
      "shorten this to one sentence",
      "summarize this article in two lines",
      "give me a tldr of this",
      "translate this to spanish",
      "translate the following into french",
      "proofread this email",
      "fix the grammar here",
      "what does this error message mean",
      "define this term for me",
      "what is the capital of japan",
      "rename this variable to something clearer",
      "format this json",
      "format this as a bullet list",
      "capitalize the headings",
      "convert this list to csv",
      "spell check this",
      "add a comma where needed",
      "quick question about this word",
      "what's another word for happy",
      "turn this into a single sentence",
      "clean up the punctuation",
      "make this title case",
      "fix the indentation of this snippet",
      "reply to this message politely",
      "shorten this tweet"
    ],
    sonnet: [
      "write a function to validate an email address",
      "add a loading spinner to this component",
      "write unit tests for this function",
      "explain how this code works",
      "fix this bug in my react component",
      "convert this class component to hooks",
      "add error handling to this fetch call",
      "write a python script to rename files in a folder",
      "help me write a cover letter for a job",
      "draft a polite follow up email to a client",
      "write a sql query to join these two tables",
      "review this pull request for style issues",
      "add pagination to this api endpoint",
      "write a regex to match phone numbers",
      "create a rest endpoint for user signup",
      "refactor this function to be more readable",
      "write documentation for this module",
      "add form validation to this signup page",
      "help me outline a blog post about remote work",
      "explain the difference between let and const",
      "write a bash script to back up this directory",
      "generate sample data for this schema",
      "add dark mode support to this css",
      "write a docstring for this function",
      "parse this csv and print the totals",
      "set up a basic express server",
      "write a github actions workflow to run tests",
      "improve the wording of this product description",
      "add logging to this service"
    ],
    opus: [
      "design the architecture for a multi tenant saas platform",
      "architect a scalable event driven system",
      "refactor this entire codebase to use dependency injection",
      "debug this intermittent race condition across services",
      "find the root cause of this memory leak",
      "do a security review of this authentication flow",
      "migrate this monolith to microservices",
      "design a database schema for a social network",
      "analyze the tradeoffs between these three approaches",
      "write a comprehensive migration plan for this system",
      "optimize the performance of this distributed query",
      "design an end to end strategy for our data pipeline",
      "prove that this algorithm is correct",
      "design a fault tolerant distributed cache",
      "plan a multi step rollout for this feature across teams",
      "evaluate this system design and suggest improvements",
      "reason through the edge cases of this concurrency model",
      "audit this codebase for security vulnerabilities",
      "design a machine learning pipeline end to end",
      "compare these architectures and recommend one with justification",
      "derive the time complexity of this recursive algorithm",
      "redesign this legacy system for high availability",
      "investigate why throughput degrades under load",
      "create a comprehensive test strategy for this platform",
      "design an api versioning strategy for a large org",
      "work through the math for this optimization problem",
      "plan the large scale refactor of our authentication layer",
      "analyze this incident and write a full postmortem",
      "design a consensus protocol for our cluster"
    ]
  };

  // Small stoplist — drops filler that dilutes the centroids without carrying task signal.
  const STOP = new Set([
    "the", "a", "an", "to", "of", "in", "on", "for", "this", "that", "these", "those",
    "is", "are", "be", "and", "or", "my", "me", "i", "you", "it", "with", "please",
    "can", "could", "would", "should", "help", "here", "there", "into", "from", "as",
    "at", "by", "so", "if", "do", "does", "then"
  ]);

  const ORDER = (window.MOG_CONFIG && window.MOG_CONFIG.MODEL_TIER_ORDER) || ["haiku", "sonnet", "opus"];
  const RANK = {};
  ORDER.forEach((t, i) => (RANK[t] = i));

  const CFG = () => (window.MOG_CONFIG && window.MOG_CONFIG.INTENT) || {
    intentWeight: 0.6, structuralWeight: 0.4, softmaxTemp: 0.08,
    minTopScore: 0.05, marginForFullConf: 0.12, useBigrams: true
  };

  // ------------------------------------------------------------- vectorizer
  function tokenize(text) {
    const words = String(text)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 2 && !STOP.has(w));

    const tokens = words.slice();
    if (CFG().useBigrams) {
      for (let i = 0; i < words.length - 1; i++) tokens.push(words[i] + "_" + words[i + 1]);
    }
    return tokens;
  }

  function termFreq(tokens) {
    const tf = new Map();
    tokens.forEach((t) => tf.set(t, (tf.get(t) || 0) + 1));
    return tf;
  }

  // Build vocabulary + IDF over every example doc, then a normalized centroid per tier.
  const docs = []; // { tier, tf }
  const df = new Map();
  ORDER.forEach((tier) => {
    (CORPUS[tier] || []).forEach((text) => {
      const tf = termFreq(tokenize(text));
      docs.push({ tier, tf });
      new Set(tf.keys()).forEach((term) => df.set(term, (df.get(term) || 0) + 1));
    });
  });

  const N = docs.length;
  const idf = new Map();
  df.forEach((count, term) => idf.set(term, Math.log((N + 1) / (count + 1)) + 1));

  function toVector(tf) {
    // TF-IDF with sublinear TF (1 + log tf), then L2-normalized.
    const vec = new Map();
    let norm = 0;
    tf.forEach((count, term) => {
      const w = idf.get(term);
      if (!w) return; // out-of-vocabulary term carries no signal
      const v = (1 + Math.log(count)) * w;
      vec.set(term, v);
      norm += v * v;
    });
    norm = Math.sqrt(norm) || 1;
    vec.forEach((v, term) => vec.set(term, v / norm));
    return vec;
  }

  const centroids = {}; // tier -> normalized mean vector (Map)
  ORDER.forEach((tier) => {
    // Centroid = mean of the tier's doc vectors, L2-normalized. The mean's 1/count factor cancels
    // under normalization, so this is just the summed vectors divided by their own magnitude.
    const sum = new Map();
    docs.filter((d) => d.tier === tier).forEach((d) => {
      toVector(d.tf).forEach((v, term) => sum.set(term, (sum.get(term) || 0) + v));
    });
    let norm = 0;
    sum.forEach((v) => (norm += v * v));
    norm = Math.sqrt(norm) || 1;
    const c = new Map();
    sum.forEach((v, term) => c.set(term, v / norm));
    centroids[tier] = c;
  });

  function cosine(vec, centroid) {
    let dot = 0;
    vec.forEach((v, term) => {
      const cv = centroid.get(term);
      if (cv) dot += v * cv;
    });
    return dot; // both sides are L2-normalized
  }

  // -------------------------------------------------------------- classify
  function classify(text) {
    const cfg = CFG();
    const vec = toVector(termFreq(tokenize(text)));

    const scores = {};
    ORDER.forEach((tier) => (scores[tier] = cosine(vec, centroids[tier])));

    // softmax(scores / temp) -> probability per tier -> expected rank on [0, ORDER.length-1]
    const temp = cfg.softmaxTemp || 0.08;
    const maxScore = Math.max.apply(null, ORDER.map((t) => scores[t]));
    let z = 0;
    const probs = {};
    ORDER.forEach((tier) => {
      const e = Math.exp((scores[tier] - maxScore) / temp);
      probs[tier] = e;
      z += e;
    });
    let rankExpected = 0;
    ORDER.forEach((tier) => {
      probs[tier] /= z;
      rankExpected += RANK[tier] * probs[tier];
    });

    const sorted = ORDER.slice().sort((a, b) => scores[b] - scores[a]);
    const top = scores[sorted[0]];
    const second = scores[sorted[1]];
    const margin = top - second;

    // Confidence: zero if nothing matched well; otherwise how decisive the top tier is.
    let confidence = 0;
    if (top >= (cfg.minTopScore || 0.05)) {
      confidence = Math.max(0, Math.min(1, margin / (cfg.marginForFullConf || 0.12)));
    }

    // Which of the query's terms pulled it toward the winning tier — for a human-readable "why".
    const winner = centroids[sorted[0]];
    const topTerms = [];
    vec.forEach((v, term) => {
      const cv = winner.get(term);
      if (cv) topTerms.push({ term: term.replace(/_/g, " "), contribution: v * cv });
    });
    topTerms.sort((a, b) => b.contribution - a.contribution);

    return {
      tier: sorted[0],
      rankExpected,
      scores,
      top,
      margin,
      confidence,
      topTerms: topTerms.slice(0, 3).map((t) => t.term)
    };
  }

  window.MOG_INTENT = { classify, _centroids: centroids, _idf: idf };
})();
