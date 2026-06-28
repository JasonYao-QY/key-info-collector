// popup.js — drives the popup UI and renders the adaptive result.
//
// Flow: on open, ask the background worker to summarize the active tab, then
// render one of three states: loading, error, or result. Rendering adapts to
// the page `category` per §5:
//   - always show tldr + keyPoints
//   - render the fields card only when fields is non-empty
//   - render the actions checklist only when actions is present

const els = {
  loading: document.getElementById("loading"),
  error: document.getElementById("error"),
  errorMessage: document.getElementById("error-message"),
  result: document.getElementById("result"),
  rerun: document.getElementById("rerun"),
  retry: document.getElementById("retry"),
  openOptions: document.getElementById("open-options"),
  footerOptions: document.getElementById("footer-options"),
  categoryPill: document.getElementById("category-pill"),
  resultTitle: document.getElementById("result-title"),
  tldr: document.getElementById("tldr"),
  keyPoints: document.getElementById("key-points"),
  fieldsCard: document.getElementById("fields-card"),
  fields: document.getElementById("fields"),
  actionsWrap: document.getElementById("actions-wrap"),
  actions: document.getElementById("actions")
};

function show(state) {
  els.loading.hidden = state !== "loading";
  els.error.hidden = state !== "error";
  els.result.hidden = state !== "result";
  // The "run again" button only makes sense once we've shown something.
  els.rerun.hidden = state === "loading";
}

function showError(message) {
  els.errorMessage.textContent = message || "Something went wrong.";
  show("error");
}

function clearChildren(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function renderResult(r) {
  // Category pill.
  els.categoryPill.textContent = r.categoryLabel || r.category || "Page";
  els.categoryPill.dataset.category = r.category || "other";

  // Title.
  els.resultTitle.textContent = r.title || "";
  els.resultTitle.hidden = !r.title;

  // TL;DR (always shown).
  els.tldr.textContent = r.tldr || "";
  els.tldr.hidden = !r.tldr;

  // Key points (always shown when present).
  clearChildren(els.keyPoints);
  (r.keyPoints || []).forEach((point) => {
    const li = document.createElement("li");
    li.textContent = point;
    els.keyPoints.appendChild(li);
  });
  els.keyPoints.hidden = !(r.keyPoints && r.keyPoints.length);

  // Fields card — only when non-empty.
  clearChildren(els.fields);
  if (r.fields && r.fields.length) {
    r.fields.forEach((f) => {
      const dt = document.createElement("dt");
      dt.textContent = f.label;
      const dd = document.createElement("dd");
      dd.textContent = f.value;
      els.fields.appendChild(dt);
      els.fields.appendChild(dd);
    });
    els.fieldsCard.hidden = false;
  } else {
    els.fieldsCard.hidden = true;
  }

  // Actions checklist — only when present.
  clearChildren(els.actions);
  if (r.actions && r.actions.length) {
    r.actions.forEach((action, i) => {
      const li = document.createElement("li");
      const id = `action-${i}`;

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.id = id;

      const label = document.createElement("label");
      label.setAttribute("for", id);
      label.textContent = action;

      li.appendChild(cb);
      li.appendChild(label);
      els.actions.appendChild(li);
    });
    els.actionsWrap.hidden = false;
  } else {
    els.actionsWrap.hidden = true;
  }

  show("result");
}

async function run() {
  show("loading");
  try {
    const response = await chrome.runtime.sendMessage({ type: "summarize" });
    if (!response) {
      showError("No response from the extension. Try reopening the popup.");
      return;
    }
    if (!response.ok) {
      showError(response.error);
      return;
    }
    renderResult(response.result);
  } catch (e) {
    showError(
      e && e.message ? e.message : "Couldn't run. Try reloading the page."
    );
  }
}

function openOptions() {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL("options.html"));
  }
}

// Wire up controls.
els.rerun.addEventListener("click", run);
els.retry.addEventListener("click", run);
els.openOptions.addEventListener("click", openOptions);
els.footerOptions.addEventListener("click", openOptions);

// Kick off as soon as the popup opens.
run();
