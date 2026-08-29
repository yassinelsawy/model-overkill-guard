# Model Overkill Guard

A Chrome extension that nudges you toward the right Claude model for the task, on
[claude.ai](https://claude.ai) — instead of defaulting to the biggest, most expensive one for
every prompt. No API calls, no LLM classification — pure local heuristics (prompt length +
keyword matching).

## Load it

1. Go to `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.
4. Open claude.ai — the toolbar icon opens settings (enable/disable, new-chat reminders,
   sensitivity, custom keywords).

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
- `content/heuristics.js` scores prompt text (length, "simple"/"complex" keyword hits, code
  blocks) to recommend a model tier — pure functions, no DOM access, easy to unit test.
- `content/toast.js` / `content/modal-ui.js` are the two shared UI primitives (non-blocking
  nudge vs. blocking confirmation), both Shadow DOM isolated.
- Settings (`popup/`) are stored in `chrome.storage.sync`.

## Manual test checklist

- Open a new chat → toast appears near the model picker with switch-model buttons.
- Type a trivial prompt ("fix this typo: recieve") with Opus selected → the live pill appears
  suggesting a lighter model; hitting send/Enter blocks with the confirmation modal.
- "Send anyway" → message sends under Opus.
- "Switch and send" → model picker changes tier, then sends.
- Long/complex prompt + Opus selected → no pill, no modal, sends directly.
- Toggle "Block overkill sends" off in the popup → the send-time modal never appears (pill and
  toast are controlled by their own toggles).
- Toggle "Remind me on new chats" off → no toast on new chat, guard/pill still work.
- Switch to a different existing conversation and back to a new chat → toast still fires (SPA
  navigation detection survives route changes).
