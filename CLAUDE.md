# Key Info Collector — Build Brief

> This file is the complete specification. The project folder is **empty** apart
> from this file and `.claude/settings.json`. Build every file from scratch per
> the spec below. Do not ask the user to re-confirm decisions in the
> "Locked decisions" section — they are settled.

---

## 0. What you are building

A **Chrome extension (Manifest V3)** called *Key Info Collector*.

The user clicks the toolbar icon on any webpage. The extension extracts the
page's text, sends it to an LLM, and shows the **key info** in a clean,
plain-language popup.

**Target users:** people with ADHD, seniors, and anyone reluctant or impatient
about reading / navigating webpages. The product goal, in the user's words, is
"things done once and for all" — minimum effort to get the essentials.

The extension also acts as a lightweight **decision helper**: the LLM
classifies each page into a category and the popup renders adaptively for that
category (a flight page shows times/gates; a product page shows price/rating;
an interactive page shows suggested next actions).

**Build OS:** macOS (write setup docs for macOS).

---

## 1. Locked decisions (do NOT re-litigate)

- **Form factor:** Chrome extension, Manifest V3.
- **LLM layer is pluggable**, but build the **Claude API backend first** (used
  for both local testing and distribution). Keep a clean interface
  (`llm.js` with a single `summarize(extracted, opts)` entry point) so other
  backends (e.g. Ollama) can drop in later. Do NOT build Ollama in this pass —
  just leave the interface clean. Do NOT add `localhost:11434` to
  `host_permissions`. Only `https://api.anthropic.com/*` belongs there.
- **Input is page TEXT now.** Architecture must keep **multimodal (screenshot)**
  easy to add later: include a **disabled, wired-but-inactive** screenshot stub
  (see §4).
- **Output:** plain-text "TL;DR + key points" by default. The LLM classifies the
  page into ONE category and the popup renders adaptively.
- **Categories:** `schedule` (flights, conferences, calls, appointments),
  `recipe` (recipe / how-to), `informative` (encyclopedias, lectures, docs),
  `interactive` (forms, requests, email writing), `product` (product / shopping),
  `news` (news / article), and `other` (fallback).

---

## 2. Architecture / data flow

```
popup (popup.html + popup.js)
  -> background service worker (background.js)
     -> inject extraction into the active tab via chrome.scripting
        (content extraction returns {url, title, metaDescription, text, screenshot:null})
     -> background calls the LLM (ONE call that both classifies AND extracts,
        returning strict JSON)
  -> popup renders the result (adaptive by category)
```

Key principle: **one LLM call** does classification + extraction together and
returns a single strict-JSON object. No second round trip.

---

## 3. File structure to create

```
key-info-collector/
├─ manifest.json
├─ background.js          # service worker: orchestration + LLM call
├─ content.js            # injected extractor (text + metadata; screenshot stub)
├─ llm.js                # pluggable LLM interface; Claude backend implemented
├─ popup.html
├─ popup.js              # renders adaptive result by category
├─ popup.css
├─ options.html          # API key entry + (disabled) multimodal toggle
├─ options.js
├─ icons/
│  ├─ icon16.png
│  ├─ icon48.png
│  └─ icon128.png
└─ README.md             # macOS setup instructions
```

(`CLAUDE.md` and `.claude/settings.json` already exist — leave them.)

---

## 4. Content extraction + screenshot stub

`content.js` is injected via `chrome.scripting.executeScript` into the active
tab. It returns:

```js
{ url, title, metaDescription, text, screenshot: null }
```

- `text`: visible page text. Trim/limit to a sane size (e.g. cap at ~12k chars,
  strip script/style/nav boilerplate where reasonable). Don't over-engineer
  readability; a simple `document.body.innerText` clean-up is fine for v1.

- **Screenshot stub:** `background.js` has a `captureVisibleTab` function gated
  behind a `multimodal` setting (**default off**). `llm.js` accepts an optional
  `image` arg — wired but inactive. When eventually enabled, the image is sent
  as a Claude content block of type `"image"` with a base64 source. Ship it
  disabled; do not wire the toggle to anything live beyond storing the flag.

---

## 5. LLM output — strict JSON schema (single call returns EXACTLY this)

```json
{
  "category": "schedule|recipe|informative|interactive|product|news|other",
  "categoryLabel": "human-readable label",
  "title": "short page title",
  "tldr": "one plain-language sentence",
  "keyPoints": ["3-6 short, concrete, scannable strings"],
  "fields": [{ "label": "...", "value": "..." }],
  "actions": ["optional next steps, especially for schedule/interactive"]
}
```

Popup rendering rules:
- Always show `tldr` + `keyPoints`.
- Render `fields` as a card **when non-empty**.
- Render `actions` as a checklist **when present**.

**Defensive parsing:** strip Markdown code fences before `JSON.parse` — the
model occasionally wraps JSON in ```` ```json ```` even when told not to. Parse
in a try/catch and show a friendly error in the popup on failure.

---

## 6. System prompt intent (for the LLM call)

Tell the model:
- You extract the essentials of a webpage for a reader who wants minimum effort.
- Classify the page into ONE category (from §1).
- Write at a plain reading level. `tldr` is **exactly one sentence**.
- `keyPoints` are short and concrete (3–6 items).
- Choose `fields` appropriate to the category:
  - `product`  → Price / Rating / Availability
  - `schedule` → Event / Date / Time / Location
  - `recipe`   → Time / Servings / Ingredient count
  - (analogous sensible fields for the others)
- Return ONLY valid JSON matching the schema — no Markdown, no commentary.

---

## 7. Claude API backend details (`llm.js`)

- Endpoint: `POST https://api.anthropic.com/v1/messages`
- Required headers:
  - `x-api-key: <user key from chrome.storage.local>`
  - `anthropic-version: 2023-06-01`
  - `content-type: application/json`
  - `anthropic-dangerous-direct-browser-access: true`  ← needed for direct
    calls from a browser/extension context (enables CORS).
- Body: `{ model, max_tokens, system, messages }`.
  - `model`: default `claude-haiku-4-5-20251001` (fast + cheap for extraction).
    Make it a constant near the top of `llm.js` so it's trivially swappable.
  - `max_tokens`: ~1024 is plenty for this schema.
  - `system`: the §6 prompt.
  - `messages`: one user turn containing the extracted page text (and, when the
    multimodal stub is later enabled, an image content block).
- MV3 service workers can `fetch` directly; `host_permissions` must include
  `https://api.anthropic.com/*`.
- The API key lives ONLY in `chrome.storage.local`, entered via the Options
  page, and is sent ONLY to `api.anthropic.com`. Never hard-code a key.

---

## 8. Deliverables checklist

1. Create every file in §3 with complete, working code.
2. Generate simple placeholder PNG icons (16 / 48 / 128). A flat solid-color
   square with a glyph is fine; they just need to be valid PNGs.
3. Write `README.md` with macOS setup:
   - Get a Claude API key from `console.anthropic.com`.
   - Enter it in the extension's Options page.
   - Load the unpacked extension in Chrome:
     `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
     select this folder.
   - Privacy note: the API key is stored locally in `chrome.storage.local` and
     only sent to `api.anthropic.com`.
4. Verify all JS parses (`node --check <file>.js` on each) and that
   `manifest.json` is valid JSON. Report the results.

---

## 9. Build order (suggested)

1. `manifest.json` (MV3: action, background service worker, permissions
   `activeTab`, `scripting`, `storage`; `host_permissions`
   `https://api.anthropic.com/*`).
2. `content.js` extractor.
3. `llm.js` Claude backend + clean `summarize()` interface.
4. `background.js` orchestration (message from popup → extract → llm → reply).
5. `popup.html/.js/.css` adaptive renderer.
6. `options.html/.js` key entry + disabled multimodal toggle.
7. Icons.
8. `README.md`.
9. Verification pass (§8.4).

Then stop and summarize what was built and how to load it.
