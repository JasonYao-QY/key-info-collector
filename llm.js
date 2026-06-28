// llm.js — pluggable LLM interface for Key Info Collector.
//
// The rest of the extension only ever calls `summarize(extracted, opts)`.
// Today that's backed by the Claude Messages API; tomorrow another backend
// (e.g. a local Ollama server) could implement the same `summarize` contract
// and drop in here without touching background.js or the popup.
//
// `summarize` returns a parsed object matching the strict JSON schema in §5 of
// the spec. It throws an Error with a friendly message on any failure so the
// popup can show something useful.

// --- Model is a constant near the top so it's trivially swappable. ----------
const MODEL = "claude-haiku-4-5-20251001"; // fast + cheap, plenty for extraction
const MAX_TOKENS = 1024; // the schema is small; this is generous
const API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

const VALID_CATEGORIES = [
  "schedule",
  "recipe",
  "informative",
  "interactive",
  "product",
  "news",
  "other"
];

// --- System prompt (§6). ----------------------------------------------------
const SYSTEM_PROMPT = `You extract the essentials of a webpage for a reader who wants minimum effort — think someone with ADHD, a senior, or anyone impatient about reading or navigating pages. Your goal is "things done once and for all": give them just the essentials so they don't have to read the page.

Do the following in a SINGLE response:

1. Classify the page into EXACTLY ONE category:
   - "schedule": flights, conferences, calls, appointments, anything time/date bound
   - "recipe": a recipe or how-to / step-by-step guide
   - "informative": encyclopedias, lectures, documentation, reference material
   - "interactive": forms, requests, email writing, anything asking the reader to act
   - "product": product or shopping pages
   - "news": news articles or opinion pieces
   - "other": anything that doesn't clearly fit above

2. Write at a plain, everyday reading level. No jargon.

3. Fill out every field of the schema:
   - "category": one of the seven values above.
   - "categoryLabel": a short human-readable label for the category (e.g. "Flight schedule", "Recipe", "Product").
   - "title": a short page title.
   - "tldr": EXACTLY ONE plain-language sentence capturing the gist.
   - "keyPoints": 3 to 6 short, concrete, scannable strings. No fluff.
   - "fields": label/value pairs appropriate to the category. Use [] if none apply.
       * product   -> Price, Rating, Availability
       * schedule  -> Event, Date, Time, Location
       * recipe    -> Time, Servings, Ingredient count
       * news      -> Source, Date, Author (when available)
       * informative/interactive/other -> sensible analogous fields, or []
   - "actions": optional suggested next steps, especially for "schedule" and
     "interactive" pages (e.g. "Add to calendar", "Reply to confirm"). Use [] if none.

Return ONLY valid JSON matching this exact shape — no Markdown, no code fences, no commentary:

{
  "category": "schedule|recipe|informative|interactive|product|news|other",
  "categoryLabel": "string",
  "title": "string",
  "tldr": "string",
  "keyPoints": ["string"],
  "fields": [{ "label": "string", "value": "string" }],
  "actions": ["string"]
}`;

// --- Helpers ----------------------------------------------------------------

// Strip Markdown code fences before JSON.parse — the model occasionally wraps
// JSON in ```json ... ``` even when told not to.
function stripCodeFences(text) {
  let t = (text || "").trim();
  // Opening fence, optionally tagged with a language (```json).
  t = t.replace(/^```[^\n]*\n?/, "");
  // Closing fence.
  t = t.replace(/\n?```$/, "");
  return t.trim();
}

// Coerce the parsed object into the schema shape so the popup can trust it.
function normalize(parsed) {
  const category = VALID_CATEGORIES.includes(parsed.category)
    ? parsed.category
    : "other";

  const asStringArray = (v) =>
    Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : [];

  const fields = Array.isArray(parsed.fields)
    ? parsed.fields
        .filter((f) => f && typeof f === "object")
        .map((f) => ({
          label: String(f.label ?? "").trim(),
          value: String(f.value ?? "").trim()
        }))
        .filter((f) => f.label || f.value)
    : [];

  return {
    category,
    categoryLabel: String(parsed.categoryLabel ?? category).trim(),
    title: String(parsed.title ?? "").trim(),
    tldr: String(parsed.tldr ?? "").trim(),
    keyPoints: asStringArray(parsed.keyPoints),
    fields,
    actions: asStringArray(parsed.actions)
  };
}

// Build the user-turn content. Text is always included; an optional image is
// wired in for the future multimodal path but inactive by default (the caller
// passes no image in v1).
function buildUserContent(extracted, image) {
  const blocks = [];

  // image is the disabled-but-wired multimodal stub. When eventually enabled,
  // background.js will pass { mediaType, data } (base64) and it goes FIRST so
  // the model sees the screenshot before the text, per Claude's conventions.
  if (image && image.data) {
    blocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: image.mediaType || "image/png",
        data: image.data
      }
    });
  }

  const pageText = [
    `URL: ${extracted.url || ""}`,
    `Page title: ${extracted.title || ""}`,
    extracted.metaDescription
      ? `Meta description: ${extracted.metaDescription}`
      : null,
    "",
    "Page text:",
    extracted.text || "(no extractable text)"
  ]
    .filter((line) => line !== null)
    .join("\n");

  blocks.push({ type: "text", text: pageText });
  return blocks;
}

// --- Public interface -------------------------------------------------------
//
// summarize(extracted, opts)
//   extracted: { url, title, metaDescription, text, screenshot }
//   opts:      { apiKey, image? }  (image is the inactive multimodal stub)
//
// Returns a normalized object matching the §5 schema. Throws on failure.
export async function summarize(extracted, opts = {}) {
  const { apiKey, image } = opts;

  if (!apiKey) {
    throw new Error(
      "No API key set. Open the extension's Options page and paste your Claude API key."
    );
  }

  const body = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildUserContent(extracted, image)
      }
    ]
  };

  let response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
        // Required to call the API directly from a browser/extension context
        // (opts into CORS for direct browser access).
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify(body)
    });
  } catch (e) {
    throw new Error(
      "Couldn't reach the Claude API. Check your internet connection and try again."
    );
  }

  if (!response.ok) {
    let detail = "";
    try {
      const errJson = await response.json();
      detail = errJson?.error?.message || "";
    } catch (_) {
      // ignore — fall back to status text below
    }
    if (response.status === 401) {
      throw new Error(
        "Your Claude API key was rejected (401). Double-check it on the Options page."
      );
    }
    if (response.status === 429) {
      throw new Error("Rate limited by the Claude API (429). Wait a moment and retry.");
    }
    throw new Error(
      `Claude API error (${response.status})${detail ? `: ${detail}` : "."}`
    );
  }

  const data = await response.json();

  // Concatenate any text blocks in the response.
  const rawText = Array.isArray(data.content)
    ? data.content
        .filter((b) => b && b.type === "text" && typeof b.text === "string")
        .map((b) => b.text)
        .join("")
    : "";

  if (!rawText.trim()) {
    throw new Error("The model returned an empty response. Try again.");
  }

  // Defensive parsing: strip fences, then JSON.parse inside a try/catch.
  let parsed;
  try {
    parsed = JSON.parse(stripCodeFences(rawText));
  } catch (e) {
    throw new Error(
      "Couldn't read the model's response (it wasn't valid JSON). Try again."
    );
  }

  return normalize(parsed);
}

// Exposed for potential reuse / testing of other backends.
export const config = { MODEL, MAX_TOKENS, API_URL, ANTHROPIC_VERSION, VALID_CATEGORIES };
