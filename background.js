// background.js — MV3 service worker. Orchestrates the one-call flow:
//
//   popup -> background ("summarize")
//     -> inject content.js into the active tab (text + metadata extraction)
//     -> (optional, disabled) capture a screenshot for the multimodal path
//     -> call llm.summarize() — ONE Claude call: classify + extract -> JSON
//   -> reply to popup with { ok, result } or { ok: false, error }
//
// MV3 service workers can fetch() directly, so the LLM call lives here rather
// than in the popup (which can be torn down at any moment).

import { summarize } from "./llm.js";

// Read settings from chrome.storage.local. The API key lives ONLY here; it is
// entered via the Options page and is never hard-coded.
async function getSettings() {
  const { apiKey = "", multimodal = false } = await chrome.storage.local.get([
    "apiKey",
    "multimodal"
  ]);
  return { apiKey, multimodal };
}

// Inject the extractor into the active tab and return its result object:
//   { url, title, metaDescription, text, screenshot: null }
async function extractFromTab(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"]
  });

  // executeScript returns one InjectionResult per frame; we target the top
  // frame, so the first result holds the value content.js evaluated to.
  const value = results && results[0] && results[0].result;
  if (!value || typeof value !== "object") {
    throw new Error("Couldn't read this page. Try reloading it and retrying.");
  }
  return value;
}

// captureVisibleTab — the screenshot stub for the future multimodal path.
//
// Gated behind the `multimodal` setting (default off). Returns a Claude-ready
// image descriptor { mediaType, data } (base64, no data: prefix) or null.
//
// This is shipped DISABLED: the Options toggle is inactive, so `multimodal`
// stays false and this never runs in v1. It's here so enabling multimodal
// later is a small, localized change.
async function captureVisibleTab(windowId) {
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
    format: "png"
  });
  // dataUrl looks like "data:image/png;base64,XXXX" — split off the base64 tail.
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return null;
  return { mediaType: "image/png", data: dataUrl.slice(comma + 1) };
}

async function handleSummarize() {
  const { apiKey, multimodal } = await getSettings();

  // Find the active tab in the current window.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id == null) {
    throw new Error("No active tab to read.");
  }

  // Guard against restricted pages where scripting isn't allowed.
  const url = tab.url || "";
  if (/^(chrome|edge|about|chrome-extension|devtools):/i.test(url)) {
    throw new Error(
      "This page can't be read by extensions. Open a normal website and try again."
    );
  }

  const extracted = await extractFromTab(tab.id);

  // Multimodal screenshot path — wired but inactive (default off). The Options
  // toggle is disabled, so this branch does not run in v1.
  let image = null;
  if (multimodal) {
    try {
      image = await captureVisibleTab(tab.windowId);
    } catch (_) {
      image = null; // never let a screenshot failure block the text path
    }
  }

  const result = await summarize(extracted, { apiKey, image });
  return result;
}

// Message bridge from the popup. Returning true keeps the channel open for the
// async sendResponse.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "summarize") return false;

  handleSummarize()
    .then((result) => sendResponse({ ok: true, result }))
    .catch((err) =>
      sendResponse({
        ok: false,
        error: err && err.message ? err.message : "Something went wrong."
      })
    );

  return true; // async response
});
