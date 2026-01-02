chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "generate_pdf") {
    handleGeneratePdf(request.jobText);
    sendResponse({ status: "started" });
    return true; // Keep channel open
  }
});

async function handleGeneratePdf(jobText) {
  const API_URL = "https://tailor-resume-chrome-ext.onrender.com/tailor";

  try {
    console.log("handleGeneratePdf called. Job text length:", jobText ? jobText.length : 0);
    console.log("Sending request to backend at:", API_URL);
    
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ job_text: jobText })
    });

    console.log("Backend response received. Status:", response.status, response.statusText);

    if (!response.ok) {
        const errText = await response.text();
        console.error("Backend error body:", errText);
        return;
    }

    // Use arrayBuffer and manual base64 conversion to avoid FileReader issues in Service Workers
    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    const url = `data:application/pdf;base64,${base64}`;
    
    console.log("Attempting chrome.downloads.download...");
    chrome.downloads.download({
        url: url,
        filename: "tailored_resume.pdf",
        saveAs: false, // Automatic download without dialog
        conflictAction: "overwrite"
    }, (downloadId) => {
        if (chrome.runtime.lastError) {
            console.error("Download failed (chrome.runtime.lastError):", chrome.runtime.lastError.message);
        } else {
            console.log("Download started successfully. Download ID:", downloadId);
        }
    });

  } catch (error) {
    console.error("Error generating PDF (catch block):", error);
  }
}
