# Key Info Collector

A Chrome extension (Manifest V3) that pulls the **key info** out of any webpage
and shows it in a clean, plain-language popup — built for people who'd rather
not read or navigate the whole page.

Click the toolbar icon on any page. The extension extracts the page's text,
sends it to Claude in a single call that both **classifies** the page and
**extracts** the essentials, then renders the result adaptively for that
category:

- **schedule** (flights, appointments) → event / date / time / location + next steps
- **product** (shopping) → price / rating / availability
- **recipe** → time / servings / ingredient count
- **news**, **informative**, **interactive**, or **other** → sensible fields per type

Every result shows a one-sentence **TL;DR** plus 3–6 **key points**.

---

## Setup (macOS)

### 1. Get a Claude API key

1. Go to **[console.anthropic.com](https://console.anthropic.com)** and sign in
   (or create an account).
2. Open **API Keys** and create a key. It looks like `sk-ant-...`.
3. Copy it — you'll paste it into the extension in step 3.

### 2. Load the unpacked extension in Chrome

1. Open Chrome and go to **`chrome://extensions`**.
2. Turn on **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select this folder — the one containing `manifest.json`
   (`.../Chrome_Extension`).
5. The **Key Info Collector** icon (a blue "K") appears in your toolbar. If you
   don't see it, click the puzzle-piece **Extensions** button and pin it.

### 3. Add your API key

1. Right-click the toolbar icon → **Options** (or click **Settings** in the
   popup).
2. Paste your Claude API key and click **Save**.

### 4. Use it

Open any webpage, click the **Key Info Collector** icon, and read the summary.
Use **↻ Again** to re-run, or the checklist on schedule/interactive pages to
track next steps.

---

## Privacy

- Your API key is stored locally in **`chrome.storage.local`** on your own
  machine. It is **never** hard-coded into the extension and is sent **only** to
  `api.anthropic.com`.
- Page text is sent to the Claude API only when you click the icon, solely to
  produce the summary.

---

## How it works

```
popup (popup.html + popup.js)
  -> background service worker (background.js)
     -> inject content.js into the active tab
        ({ url, title, metaDescription, text, screenshot: null })
     -> llm.js: ONE Claude call classifies + extracts -> strict JSON
  -> popup renders the result, adapted to the page category
```

| File           | Role                                                            |
| -------------- | -------------------------------------------------------------- |
| `manifest.json`| MV3 manifest: action, service worker, permissions              |
| `content.js`   | Injected extractor — visible text + metadata (capped ~12k chars)|
| `llm.js`       | Pluggable LLM interface; Claude Messages API backend            |
| `background.js`| Orchestration: extract → call LLM → reply to popup              |
| `popup.*`      | Adaptive renderer (TL;DR, key points, fields card, actions)     |
| `options.*`    | API key entry + (disabled) multimodal toggle                    |
| `icons/`       | Toolbar icons (16 / 48 / 128)                                   |

### Configuration

- **Model:** the Claude model is a constant near the top of
  [`llm.js`](llm.js) (`MODEL = "claude-haiku-4-5-20251001"` — fast and cheap for
  extraction). Change that one line to swap models.
- **Pluggable backend:** the rest of the extension only calls
  `summarize(extracted, opts)`. A different backend (e.g. a local model) can
  implement the same contract and drop into `llm.js` without touching the popup
  or service worker.
- **Multimodal (screenshots):** the architecture keeps a screenshot path ready —
  `background.js` has a `captureVisibleTab` function gated behind a `multimodal`
  setting (default **off**), and `llm.js` accepts an optional `image` argument.
  This is **shipped disabled**: the Options toggle is inactive and the feature
  does not run in v1.

---

## Requirements

- Google Chrome (or a Chromium-based browser) with Manifest V3 support.
- A Claude API key from `console.anthropic.com`.
