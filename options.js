// options.js — loads and saves settings to chrome.storage.local.
//
// Stores:
//   apiKey     — the Claude API key (only ever sent to api.anthropic.com)
//   multimodal — the screenshot flag. The toggle is DISABLED in the UI, so this
//                only persists whatever value is already stored (default false).
//                Per spec, the toggle is not wired to anything live beyond
//                storing the flag.

const keyInput = document.getElementById("api-key");
const revealBtn = document.getElementById("reveal");
const multimodalToggle = document.getElementById("multimodal");
const saveBtn = document.getElementById("save");
const statusEl = document.getElementById("status");

async function load() {
  const { apiKey = "", multimodal = false } = await chrome.storage.local.get([
    "apiKey",
    "multimodal"
  ]);
  keyInput.value = apiKey;
  // Reflect the stored flag even though the control is disabled.
  multimodalToggle.checked = !!multimodal;
}

function flashSaved() {
  statusEl.classList.add("show");
  setTimeout(() => statusEl.classList.remove("show"), 1500);
}

async function save() {
  await chrome.storage.local.set({
    apiKey: keyInput.value.trim(),
    // The toggle is disabled, so this just re-persists the existing flag.
    multimodal: multimodalToggle.checked
  });
  flashSaved();
}

revealBtn.addEventListener("click", () => {
  const showing = keyInput.type === "text";
  keyInput.type = showing ? "password" : "text";
  revealBtn.textContent = showing ? "Show" : "Hide";
});

saveBtn.addEventListener("click", save);

// Save on Enter for convenience.
keyInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") save();
});

load();
