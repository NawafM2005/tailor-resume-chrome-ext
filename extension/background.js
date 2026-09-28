// Resume Tailor - background service worker.
//
// Owns the network request + downloads so work survives the popup closing.
// Reports progress both by messaging the popup (if open) and by persisting the
// run state to chrome.storage.local so a reopened popup shows the outcome.

const API_URL = "https://tailor-resume-chrome-ext.onrender.com/tailor";
const RESUME_FILENAME = "Nawaf_Mahmood_Resume.pdf";
const COVER_FILENAME = "Nawaf_Mahmood_Cover_Letter.pdf";

const REQUEST_TIMEOUT_MS = 150000; // Render free tier can cold-start slowly.
const MAX_ATTEMPTS = 3;

let running = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request && request.action === "generate") {
    if (running) {
      sendResponse({ status: "busy" });
      return; // no async work started
    }
    running = true;
    handleGenerate(request.jobText, request.mode || "both")
      .catch((err) => console.error("Unhandled generate error:", err))
      .finally(() => { running = false; });
    sendResponse({ status: "started" });
    return true; // keep the channel open
  }
});

function broadcast(state) {
  chrome.storage.local.set({ lastRun: state });
  // Messaging a closed popup throws; swallow it.
  chrome.runtime.sendMessage({ type: "tailor-status", state }).catch(() => {});
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postTailor(jobText, mode) {
  let lastErr = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_text: jobText, mode, include_cover_letter: mode !== "resume" }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      // Retry transient server / gateway errors (cold start, restarts).
      if ([502, 503, 504].includes(res.status) && attempt < MAX_ATTEMPTS) {
        broadcast({ busy: true, mode, message: `Server waking up, retrying (${attempt}/${MAX_ATTEMPTS - 1})...`, results: {}, errors: {} });
        await sleep(2500 * attempt);
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      const reason = err.name === "AbortError" ? "timed out" : "connection failed";
      if (attempt < MAX_ATTEMPTS) {
        broadcast({ busy: true, mode, message: `Request ${reason}, retrying (${attempt}/${MAX_ATTEMPTS - 1})...`, results: {}, errors: {} });
        await sleep(2000 * attempt);
        continue;
      }
    }
  }
  throw lastErr || new Error("Request failed");
}

function downloadPdf(base64Data, filename) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(
      {
        url: `data:application/pdf;base64,${base64Data}`,
        filename,
        saveAs: false,
        conflictAction: "overwrite",
      },
      (downloadId) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(downloadId);
      }
    );
  });
}

async function handleGenerate(jobText, mode) {
  const state = { busy: true, mode, message: "Contacting server...", results: {}, errors: {} };
  broadcast(state);

  let res;
  try {
    res = await postTailor(jobText, mode);
  } catch (err) {
    state.busy = false;
    state.message = err.name === "AbortError"
      ? "Server took too long to respond. Please try again."
      : "Could not reach the server. Check your connection and try again.";
    state.errors = { resume: state.message, cover_letter: state.message };
    broadcast(state);
    return;
  }

  if (!res.ok) {
    let detail = `Server error (${res.status})`;
    try {
      const body = await res.json();
      if (body && body.detail) detail = body.detail;
    } catch (_) {
      try { detail = (await res.text()) || detail; } catch (__) {}
    }
    state.busy = false;
    state.message = detail;
    state.errors = { resume: detail, cover_letter: detail };
    broadcast(state);
    return;
  }

  let data;
  try {
    data = await res.json();
  } catch (err) {
    state.busy = false;
    state.message = "Server returned an unreadable response.";
    state.errors = { resume: state.message, cover_letter: state.message };
    broadcast(state);
    return;
  }

  state.message = "Downloading...";
  state.errors = data.errors || {};
  broadcast(state);

  // Download whatever came back. One failing does not block the other.
  if (data.resume) {
    try {
      await downloadPdf(data.resume, RESUME_FILENAME);
      state.results.resume = true;
    } catch (err) {
      state.results.resume = false;
      state.errors.resume = "Download failed: " + err.message;
    }
  }

  if (data.cover_letter) {
    try {
      await downloadPdf(data.cover_letter, COVER_FILENAME);
      state.results.cover_letter = true;
    } catch (err) {
      state.results.cover_letter = false;
      state.errors.cover_letter = "Download failed: " + err.message;
    }
  }

  // Compose a final summary message.
  const want = {
    resume: mode === "both" || mode === "resume",
    cover: mode === "both" || mode === "cover",
  };
  const okResume = !!state.results.resume;
  const okCover = !!state.results.cover_letter;

  let message;
  if (want.resume && want.cover) {
    if (okResume && okCover) message = "Resume and cover letter downloaded.";
    else if (okResume) message = "Resume downloaded. Cover letter failed.";
    else if (okCover) message = "Cover letter downloaded. Resume failed.";
    else message = "Generation failed. Please try again.";
  } else if (want.resume) {
    message = okResume ? "Resume downloaded." : "Resume generation failed.";
  } else {
    message = okCover ? "Cover letter downloaded." : "Cover letter generation failed.";
  }

  state.busy = false;
  state.message = message;
  broadcast(state);
}
