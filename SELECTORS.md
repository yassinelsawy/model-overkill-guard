# claude.ai selector notes

`content/dom-watcher.js` centralizes all claude.ai-specific DOM knowledge. The primary
selectors are `data-testid` attributes and the `data-mode` theme flag on `<html>`, cross-checked
against [she-llac/claude-counter](https://github.com/she-llac/claude-counter) (MIT) — an
actively maintained claude.ai extension with a public release history — rather than guessed:

- **Model picker**: `[data-testid="model-selector-dropdown"]`.
- **Composer toolbar anchor**: `[data-testid="chat-input-grid-container"]` /
  `[data-testid="chat-input-grid-area"]`, used to walk up from the model picker to the flex
  row that holds the toolbar buttons (`findToolbarRow` — keys off computed layout + button
  count, not a class name, so it survives wrapper-div churn).
- **Theme**: `document.documentElement.dataset.mode === "dark" | "light"`.
- **Prompt input** and **send button** are not covered by that reference (it doesn't need
  them), so they still use resilient fallback matching: `div[contenteditable="true"][role="textbox"]`
  for the composer, `button[aria-label*="send" i]` first for send, falling back to "the last
  enabled button in the toolbar row that isn't the model picker."
- **Model menu items** (for "switch and send"): `[role="menuitem"]`/`[role="option"]` whose
  text matches the target tier's name.

None of this has been exercised against an authenticated claude.ai session during development
(the build environment only had a signed-out session). Before relying on it:

1. Load it unpacked (`chrome://extensions` → Developer mode → Load unpacked).
2. Open claude.ai signed in, open DevTools, and confirm:
   - `document.querySelector('[data-testid="model-selector-dropdown"]')` finds the model picker
     and its text contains "Opus"/"Sonnet"/"Haiku".
   - The send button really carries an `aria-label` containing "send" — if not, the toolbar-row
     fallback in `findSendButton()` needs checking too.
   - Enter-to-send fires a `keydown` with `key === "Enter"` on the input (not just `keyup`, and
     not only a `form` `submit`) — adjust `watchAndAttach`/`watchInputText` if not.
3. Update the corresponding function in `content/dom-watcher.js` if anything doesn't match —
   that file is the single place all of it lives.

If the extension ever silently stops showing the modal, toast, or live badge, this is the first
place to check: claude.ai's frontend likely changed and one of the assumptions above no longer
holds.
