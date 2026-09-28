const els = {};

document.addEventListener("DOMContentLoaded", () => {
  els.extract = document.getElementById("btn-extract");
  els.clear = document.getElementById("btn-clear");
  els.generate = document.getElementById("btn-generate");
  els.generateLabel = document.getElementById("generate-label");
  els.job = document.getElementById("job-text");
  els.status = document.getElementById("status");
  els.statusText = document.getElementById("status-text");
  els.results = document.getElementById("results");

  restoreState();

  els.extract.addEventListener("click", extractPageText);
  els.clear.addEventListener("click", () => {
    els.job.value = "";
    chrome.storage.local.set({ jobText: "" });
    els.job.focus();
  });
  els.generate.addEventListener("click", generate);

  els.job.addEventListener("input", () => {
    chrome.storage.local.set({ jobText: els.job.value });
  });

  document.querySelectorAll('input[name="mode"]').forEach((r) => {
    r.addEventListener("change", () => {
      chrome.storage.local.set({ mode: getMode() });
      updateGenerateLabel();
    });
  });

  // Live updates from the background worker (while the popup is open).
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "tailor-status") applyRunState(msg.state);
  });
});

function getMode() {
  const checked = document.querySelector('input[name="mode"]:checked');
  return checked ? checked.value : "both";
}

function setMode(mode) {
  const el = document.getElementById(
    mode === "resume" ? "mode-resume" : mode === "cover" ? "mode-cover" : "mode-both"
  );
  if (el) el.checked = true;
}

function updateGenerateLabel() {
  const mode = getMode();
  els.generateLabel.textContent =
    mode === "resume" ? "Generate Resume" :
    mode === "cover" ? "Generate Cover Letter" :
    "Generate Resume + Cover Letter";
}

function restoreState() {
  chrome.storage.local.get(["jobText", "mode", "lastRun"], (data) => {
    if (data.jobText) els.job.value = data.jobText;
    if (data.mode) setMode(data.mode);
    updateGenerateLabel();
    if (data.lastRun) applyRunState(data.lastRun);
  });
}

async function extractPageText() {
  setStatus("Extracting page text...", false);
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return setStatus("No active tab found.", false);
    if (/^(chrome|edge|about|chrome-extension|https:\/\/chrome\.google\.com\/webstore)/.test(tab.url || "")) {
      return setStatus("Can't read this page. Paste the description instead.", false);
    }

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: pageExtractor,
    });

    const text = result && result.result ? result.result : "";
    if (text) {
      els.job.value = text;
      chrome.storage.local.set({ jobText: text });
      setStatus("Page text extracted. Review and edit if needed.", false);
    } else {
      setStatus("Nothing found on the page. Paste it manually.", false);
    }
  } catch (err) {
    setStatus("Couldn't read the page: " + (err.message || err), false);
  }
}

// Runs in the page context (must be self-contained).
function pageExtractor() {
  const selection = window.getSelection ? window.getSelection().toString() : "";
  let text = selection && selection.trim().length > 40 ? selection : "";
  if (!text) {
    const candidate =
      document.querySelector("main") ||
      document.querySelector("article") ||
      document.querySelector('[role="main"]') ||
      document.body;
    text = candidate ? candidate.innerText : "";
  }
  text = (text || "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length > 20000) text = text.slice(0, 20000);
  return text;
}

function generate() {
  const jobText = els.job.value.trim();
  if (!jobText) {
    setStatus("Please add a job description first.", false);
    els.job.focus();
    return;
  }
  const mode = getMode();
  setBusy(true);
  els.results.classList.add("hidden");
  els.results.innerHTML = "";
  setStatus("Contacting server (it may take a moment to wake up)...", true);

  chrome.runtime.sendMessage({ action: "generate", jobText, mode }, (response) => {
    if (chrome.runtime.lastError) {
      setBusy(false);
      setStatus("Error: " + chrome.runtime.lastError.message, false);
      return;
    }
    if (response && response.status === "busy") {
      setStatus("Already generating, please wait...", true);
    }
  });
}

function applyRunState(state) {
  if (!state) return;
  setBusy(!!state.busy);
  if (state.message) setStatus(state.message, !!state.busy);

  const hasResult = state.results && (state.results.resume || state.results.cover_letter ||
    (state.errors && (state.errors.resume || state.errors.cover_letter)));
  if (!state.busy && hasResult) renderResults(state);
}

function renderResults(state) {
  els.results.innerHTML = "";
  const add = (label, ok, detail) => {
    const chip = document.createElement("div");
    chip.className = "chip " + (ok ? "ok" : "err");
    chip.innerHTML = `<span class="dot"></span><span>${label}: ${ok ? "downloaded" : "failed"}</span>`;
    if (!ok && detail) chip.title = detail;
    els.results.appendChild(chip);
  };
  const r = state.results || {};
  const e = state.errors || {};
  if (state.mode === "both" || state.mode === "resume") add("Resume", !!r.resume, e.resume);
  if (state.mode === "both" || state.mode === "cover") add("Cover letter", !!r.cover_letter, e.cover_letter);
  els.results.classList.remove("hidden");
}

function setStatus(text, busy) {
  els.statusText.textContent = text;
  els.status.classList.toggle("busy", !!busy);
}

function setBusy(busy) {
  els.generate.disabled = busy;
  els.extract.disabled = busy;
  els.status.classList.toggle("busy", busy);
}
