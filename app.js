/* =====================================================================
   AI RESUME PORTFOLIO GENERATOR — FRONTEND LOGIC
   =====================================================================

   INTEGRATION POINT (read this first)
   ------------------------------------
   This file is backend-agnostic. All the actual "talk to the server"
   logic lives in one function: requestPortfolioGeneration(file).

   Right now DEMO_MODE is on, so the app fabricates a portfolio in the
   browser (no network call, no Gemini, no key) purely so the UI can be
   demoed/tested on its own.

   Once server.py exists:
     1. Set DEMO_MODE = false
     2. Set API_ENDPOINT to your Flask route, e.g. "/generate"
     3. Done — requestPortfolioGeneration() already POSTs the file as
        multipart/form-data and expects back:
          { "status": "ok", "html": "<!DOCTYPE html>..." }
        or on failure:
          { "status": "error", "message": "human readable reason" }

   The frontend never sees or requests the Gemini API key — it only
   ever talks to your own backend.
   ===================================================================== */

const DEMO_MODE = false;
const API_ENDPOINT = "/generate";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_EXTENSIONS = ["txt", "docx"];

const GENERATING_MESSAGES = [
  "Analyzing your resume…",
  "Structuring your information…",
  "Building your portfolio…",
];

// ---------------------------------------------------------------------
// Element references
// ---------------------------------------------------------------------

const stageCard = document.getElementById("stageCard");
const panels = document.querySelectorAll("[data-stage-panel]");

const dropzone = document.getElementById("dropzone");
const dropzoneEmpty = document.getElementById("dropzoneEmpty");
const dropzoneFile = document.getElementById("dropzoneFile");
const fileInput = document.getElementById("fileInput");

const fileTypeIcon = document.getElementById("fileTypeIcon");
const fileNameEl = document.getElementById("fileName");
const fileTypeLabel = document.getElementById("fileTypeLabel");
const fileSizeEl = document.getElementById("fileSize");

const replaceFileBtn = document.getElementById("replaceFileBtn");
const removeFileBtn = document.getElementById("removeFileBtn");

const alertBox = document.getElementById("alertBox");
const generateBtn = document.getElementById("generateBtn");

const generatingStatus = document.getElementById("generatingStatus");

const successFileName = document.getElementById("successFileName");
const previewBtn = document.getElementById("previewBtn");
const downloadBtn = document.getElementById("downloadBtn");
const resetBtn = document.getElementById("resetBtn");

const genFailReason = document.getElementById("genFailReason");
const retryBtn = document.getElementById("retryBtn");
const failResetBtn = document.getElementById("failResetBtn");

const previewModal = document.getElementById("previewModal");
const previewFrame = document.getElementById("previewFrame");
const modalBackdrop = document.getElementById("modalBackdrop");
const closePreviewBtn = document.getElementById("closePreviewBtn");

// ---------------------------------------------------------------------
// State
// ---------------------------------------------------------------------

let selectedFile = null;
let generatedHtml = null;
let messageTimer = null;

// ---------------------------------------------------------------------
// Stage switching
// ---------------------------------------------------------------------

function setStage(stage) {
  stageCard.dataset.stage = stage;
  panels.forEach((panel) => {
    panel.hidden = panel.dataset.stagePanel !== stage;
  });
}

// ---------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------

function showAlert(message) {
  alertBox.textContent = message;
  alertBox.hidden = false;
}

function clearAlert() {
  alertBox.hidden = true;
  alertBox.textContent = "";
}

// ---------------------------------------------------------------------
// File validation
// ---------------------------------------------------------------------

function getExtension(filename) {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateFile(file) {
  const ext = getExtension(file.name);

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return `"${file.name}" isn't a supported format. Please upload a .txt or .docx file.`;
  }

  if (file.size === 0) {
    return `"${file.name}" is empty. Please choose a resume file with content.`;
  }

  if (file.size > MAX_FILE_BYTES) {
    return `"${file.name}" is too large (${formatFileSize(file.size)}). Max size is 5 MB.`;
  }

  return null;
}

// ---------------------------------------------------------------------
// File selection handling
// ---------------------------------------------------------------------

function handleFileSelected(file) {
  clearAlert();

  const error = validateFile(file);
  if (error) {
    showAlert(error);
    resetFile();
    return;
  }

  selectedFile = file;

  const ext = getExtension(file.name).toUpperCase();
  fileTypeIcon.textContent = ext;
  fileNameEl.textContent = file.name;
  fileTypeLabel.textContent = ext;
  fileSizeEl.textContent = formatFileSize(file.size);

  dropzoneEmpty.hidden = true;
  dropzoneFile.hidden = false;
  dropzone.classList.add("has-file");
  dropzone.setAttribute(
    "aria-label",
    `${file.name} selected. Press Enter to replace the file.`
  );

  generateBtn.disabled = false;
}

function resetFile() {
    // Reset selected file
    selectedFile = null;
    fileInput.value = "";

    // Reset file information
    fileNameEl.textContent = "";
    fileTypeLabel.textContent = "";
    fileSizeEl.textContent = "";

    // Reset dropzone
    dropzoneEmpty.hidden = false;
    dropzoneFile.hidden = true;
    dropzone.classList.remove("has-file");
    dropzone.setAttribute(
      "aria-label",
      "Upload your resume, drag and drop or choose a file"
    );

    // Disable Generate button
    generateBtn.disabled = true;
}

// ---------------------------------------------------------------------
// Dropzone interactions
// ---------------------------------------------------------------------

dropzone.addEventListener("click", (e) => {
  // Clicking the remove/replace icons shouldn't re-open the file picker.
  if (e.target.closest(".file-actions")) return;
  if (!selectedFile) fileInput.click();
});

dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fileInput.click();
  }
});

fileInput.addEventListener("change", () => {
  if (fileInput.files.length) handleFileSelected(fileInput.files[0]);
});

["dragenter", "dragover"].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add("is-dragover");
  });
});

["dragleave", "drop"].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove("is-dragover");
  });
});

dropzone.addEventListener("drop", (e) => {
  const files = e.dataTransfer?.files;
  if (files && files.length) handleFileSelected(files[0]);
});

replaceFileBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  fileInput.click();
});

removeFileBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  resetFile();
  clearAlert();
});

// ---------------------------------------------------------------------
// Generation flow
// ---------------------------------------------------------------------

generateBtn.addEventListener("click", startGeneration);
retryBtn.addEventListener("click", startGeneration);

async function startGeneration() {
  if (!selectedFile) return;

  clearAlert();
  setStage("generating");
  cycleGeneratingMessages();

  try {
    generatedHtml = await requestPortfolioGeneration(selectedFile);
    clearInterval(messageTimer);

    successFileName.textContent = selectedFile.name;
    setStage("success");
  } catch (err) {
    clearInterval(messageTimer);
    genFailReason.textContent =
      err && err.message
        ? err.message
        : "The backend couldn't process this resume. Nothing was saved.";
    setStage("genfail");
  }
}

function cycleGeneratingMessages() {
  let i = 0;
  generatingStatus.textContent = GENERATING_MESSAGES[0];
  messageTimer = setInterval(() => {
    i = (i + 1) % GENERATING_MESSAGES.length;
    generatingStatus.textContent = GENERATING_MESSAGES[i];
  }, 1600);
}

/**
 * Sends the resume file to the backend and resolves with the generated
 * portfolio HTML (a string). Rejects with an Error carrying a
 * user-facing message on failure.
 */
async function requestPortfolioGeneration(file) {
  if (DEMO_MODE) {
    return demoGeneratePortfolio(file);
  }

  const formData = new FormData();
  formData.append("resume", file);

  let response;
  try {
    response = await fetch(API_ENDPOINT, {
      method: "POST",
      body: formData,
    });
  } catch (networkErr) {
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The server sent back something unexpected. Please try again.");
  }

  if (!response.ok || payload.status !== "ok") {
    throw new Error(payload.message || "Something went wrong while generating your portfolio.");
  }

  return payload.html;
}

// ---------------------------------------------------------------------
// Demo mode — lets the UI be tested before server.py exists.
// Reads the raw text (best-effort for .docx) and drops it into a
// minimal on-brand portfolio shell, just so Preview/Download work.
// ---------------------------------------------------------------------

async function demoGeneratePortfolio(file) {
  await new Promise((r) => setTimeout(r, 3200)); // let the loading state breathe

  const nameGuess = file.name.replace(/\.(txt|docx)$/i, "").replace(/[_-]+/g, " ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(nameGuess)} | Portfolio</title>
<style>
  body { font-family: Inter, Arial, sans-serif; background:#080b16; color:#f5f7ff; margin:0; padding:80px 24px; text-align:center; }
  h1 { font-size: 2.4rem; margin-bottom: 12px; }
  p { color:#aab3ca; max-width: 480px; margin: 0 auto; line-height: 1.6; }
  .badge { display:inline-block; margin-top:28px; padding:8px 16px; border:1px solid rgba(255,255,255,0.15); border-radius:999px; font-size:0.8rem; color:#8d98ff; }
</style>
</head>
<body>
  <h1>${escapeHtml(nameGuess) || "Your Portfolio"}</h1>
  <p>This is a placeholder preview generated in demo mode. Once connected to the Python backend, this will be your real AI-generated portfolio built from <strong>${escapeHtml(file.name)}</strong>.</p>
  <div class="badge">DEMO MODE — no backend call made</div>
</body>
</html>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------------------------------------------------------------------
// Success actions: preview / download / reset
// ---------------------------------------------------------------------

function openPreview() {
  if (!generatedHtml) return;
  previewFrame.srcdoc = generatedHtml;
  
  // Support both hidden attribute and CSS classes
  previewModal.hidden = false;
  previewModal.classList.add("is-open");
  
  // Set focus to close button so keydown events are captured
  setTimeout(() => {
    closePreviewBtn.focus();
  }, 50);
}

function closePreview() {
  previewModal.hidden = true;
  previewModal.classList.remove("is-open");
  previewFrame.srcdoc = "";
}

previewBtn.addEventListener("click", openPreview);

closePreviewBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  closePreview();
});

modalBackdrop.addEventListener("click", (e) => {
  // Only close if they click specifically on the backdrop, not the panel
  if (e.target === modalBackdrop) {
    closePreview();
  }
});

// Close when Esc is pressed in the main document
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && (!previewModal.hidden || previewModal.classList.contains("is-open"))) {
    closePreview();
  }
});

// Capture Escape key presses from inside the iframe
previewFrame.addEventListener("load", () => {
  try {
    const iframeDoc = previewFrame.contentDocument || previewFrame.contentWindow.document;
    if (iframeDoc) {
      iframeDoc.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          closePreview();
        }
      });
    }
  } catch (err) {
    console.warn("Could not bind Esc key handler to preview iframe (cross-origin or load timing issue):", err);
  }
});

downloadBtn.addEventListener("click", () => {
  if (!generatedHtml) return;
  const blob = new Blob([generatedHtml], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "portfolio.html";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

// Reset flow shared function
function handleReset() {
  // Clear generated portfolio
  generatedHtml = null;

  // Fully reset file state and dropzone UI elements
  resetFile();

  // Clear alert message
  clearAlert();

  // Reset UI back to upload panel
  setStage("upload");
}

resetBtn.addEventListener("click", handleReset);
if (failResetBtn) {
  failResetBtn.addEventListener("click", handleReset);
}