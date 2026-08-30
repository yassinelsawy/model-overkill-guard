# Model Overkill Guard

A Chrome extension that nudges you toward the right Claude model for the task, on
[claude.ai](https://claude.ai) — instead of defaulting to the biggest, most expensive one for
every prompt. No API calls, no LLM classification — everything runs locally.

It judges a prompt's difficulty by blending two offline signals rather than leaning on length
(a short "prove this theorem" is Opus work; a long "fix the grammar in this doc" is not):

1. **Structural signals** (`content/heuristics.js`) — the leading imperative verb, multi-part
   requirements, sequencing/reasoning cues, code, keyword hits, and (weakly) length.
2. **Intent model** (`content/intent-model.js`) — TF-IDF cosine similarity of the prompt to a
   small labeled corpus of example prompts per tier, built at load time. Improve it by adding
   example prompts to the corpus; no weight-tuning needed.

The two are merged confidence-weighted, and the guard only nudges when the combined confidence
clears the sensitivity preset's threshold — when the signals disagree it stays quiet, because a
wrong "this is overkill" nag costs more trust than a missed one.

## Load it

1. Go to `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.
4. Open claude.ai — it works immediately. There's no settings UI; the extension runs on fixed
   defaults (`DEFAULTS` in `content/config.js`).

## What it does

- **New-chat reminder** — a dismissible toast appears every time you open a fresh, empty chat,
  showing the currently selected model and one-click buttons to switch tiers before you even
  start typing (`content/new-chat-alert.js`).
- **Live inline hint** — as you type, a small pill appears next to the composer's toolbar if
  the draft looks lighter than the selected model warrants (`content/live-badge.js`) — an
  ambient heads-up, not an interruption.
- **Send-time guard** — if you go to send a prompt that still looks like overkill for the
  selected model, a confirmation modal blocks the send: switch model and send, send anyway, or
  cancel (`content/interceptor.js` + `content/modal-ui.js`).

All three share the same scoring logic (`content/heuristics.js`) and the same visual language —
colors and dark/light theming match claude.ai's own palette (`content/config.js` THEME,
detected via `document.documentElement.dataset.mode`) so the UI doesn't look like a bolted-on
browser alert.

## How it works

- `content/dom-watcher.js` finds the model picker, prompt box, and send button on claude.ai,
  and detects SPA navigation (new chat / switching conversations) by patching
  `history.pushState`/`replaceState`. Selectors are real `data-testid` attributes cross-checked
  against [she-llac/claude-counter](https://github.com/she-llac/claude-counter) (MIT) — see
  [SELECTORS.md](SELECTORS.md) for details and what to check if claude.ai's DOM changes.
- `content/heuristics.js` blends the structural score with the intent model to recommend a tier
  and a confidence — pure functions, no DOM access, easy to unit test. `content/intent-model.js`
  holds the example corpus, the TF-IDF vectorizer, and the per-tier centroids.
- `content/toast.js` / `content/modal-ui.js` are the two shared UI primitives (non-blocking
  nudge vs. blocking confirmation), both Shadow DOM isolated.
- Behavior is fixed in `DEFAULTS` (`content/config.js`) — there is no settings UI and no storage.
  The content scripts read that object directly, so to change behavior you edit it and reload the
  extension. (The `storage` permission was dropped along with the settings popup.)

## Manual test checklist

- Open a new chat → toast appears near the model picker with switch-model buttons.
- Type a trivial prompt ("fix this typo: recieve") with Opus selected → the live pill appears
  suggesting a lighter model; hitting send/Enter blocks with the confirmation modal.
- "Send anyway" → message sends under Opus.
- "Switch and send" → model picker changes tier, then sends.
- Long/complex prompt + Opus selected → no pill, no modal, sends directly.
- Paste a long doc + "just fix the grammar" with Opus → still flagged as overkill (length alone no
  longer earns a heavy tier).
- Short but hard prompt ("prove the four color theorem") with Opus → no pill, no modal (the intent
  model recognizes the task as Opus-worthy despite its length).
- Switch to a different existing conversation and back to a new chat → toast still fires (SPA
  navigation detection survives route changes).
