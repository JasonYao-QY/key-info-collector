// content.js — injected into the active tab via chrome.scripting.executeScript.
//
// Returns a single plain object describing the page:
//   { url, title, metaDescription, text, screenshot: null }
//
// `text` is the visible page text, lightly cleaned and capped at ~12k chars.
// The screenshot field is a wired-but-inactive stub (see §4 of the spec): the
// multimodal path is intentionally left disabled in v1, so this is always null.
//
// NOTE: This function is the body that chrome.scripting executes in the page.
// It must be self-contained — it cannot reference anything outside its own
// scope, because it is serialized and run in the target tab's world.

(() => {
  const MAX_TEXT_CHARS = 12000;

  // Elements whose text is boilerplate / chrome rather than content.
  const SKIP_SELECTORS = [
    "script",
    "style",
    "noscript",
    "template",
    "svg",
    "nav",
    "header",
    "footer",
    "aside",
    "[aria-hidden='true']",
    "[hidden]"
  ];

  function getMetaDescription() {
    const candidates = [
      "meta[name='description']",
      "meta[property='og:description']",
      "meta[name='twitter:description']"
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      const content = el && el.getAttribute("content");
      if (content && content.trim()) return content.trim();
    }
    return "";
  }

  function extractText() {
    // Prefer a <main> / <article> region when present — it usually holds the
    // real content and skips the surrounding chrome. Fall back to <body>.
    const root =
      document.querySelector("main") ||
      document.querySelector("article") ||
      document.body;

    if (!root) return "";

    // Clone so we can strip boilerplate without touching the live page.
    const clone = root.cloneNode(true);
    clone.querySelectorAll(SKIP_SELECTORS.join(",")).forEach((el) => el.remove());

    // innerText respects visibility and gives reasonable line breaks.
    const raw = clone.innerText || "";

    // Collapse runs of blank lines and trailing whitespace into something
    // compact and readable for the model.
    const cleaned = raw
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter((line) => line.length > 0)
      .join("\n");

    return cleaned.length > MAX_TEXT_CHARS
      ? cleaned.slice(0, MAX_TEXT_CHARS)
      : cleaned;
  }

  return {
    url: document.location.href,
    title: (document.title || "").trim(),
    metaDescription: getMetaDescription(),
    text: extractText(),
    // Screenshot stub: multimodal input is wired but inactive in v1.
    screenshot: null
  };
})();
