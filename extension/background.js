chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "generate_pdf") {
    handleGeneratePdf(request.jobText, request.includeCoverLetter);
    sendResponse({ status: "started" });
    return true; // Keep channel open
  }
});

async function handleGeneratePdf(jobText, includeCoverLetter) {
  const API_URL = "https://tailor-resume-chrome-ext.onrender.com/tailor";

  try {
    console.log("handleGeneratePdf called. Job text length:", jobText ? jobText.length : 0);
    console.log("Include Cover Letter:", includeCoverLetter);
    console.log("Sending request to backend at:", API_URL);
    
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ 
        job_text: jobText,
        include_cover_letter: !!includeCoverLetter
      })
    });

    console.log("Backend response received. Status:", response.status, response.statusText);

    if (!response.ok) {
        const errText = await response.text();
        console.error("Backend error body:", errText);
        return;
    }

    const data = await response.json();
    
    // Helper to download a file
    const downloadFile = (base64Data, filename) => {
        const url = `data:application/pdf;base64,${base64Data}`;
        console.log(`Attempting chrome.downloads.download (${filename})...`);
        chrome.downloads.download({
            url: url,
            filename: filename,
            saveAs: false,
            conflictAction: "overwrite"
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                console.error(`Download failed for ${filename}:`, chrome.runtime.lastError.message);
            } else {
                console.log(`Download started for ${filename}. ID:`, downloadId);
            }
        });
    };

    // Download Resume
    if (data.resume) {
        downloadFile(data.resume, "tailored_resume.pdf");
    }

    // Download Cover Letter if present
    if (data.cover_letter) {
        // Small delay to ensure browser handles them separately if needed, though usually not required
        setTimeout(() => {
            downloadFile(data.cover_letter, "cover_letter.pdf");
        }, 500);
    }

  } catch (error) {
    console.error("Error generating PDF (catch block):", error);
  }
}
