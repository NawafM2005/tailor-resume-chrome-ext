document.addEventListener('DOMContentLoaded', () => {
  const btnExtract = document.getElementById('btn-extract');
  const btnGenerate = document.getElementById('btn-generate');
  const txtJob = document.getElementById('job-text');
  const chkCoverLetter = document.getElementById('chk-cover-letter');
  const status = document.getElementById('status');

  // Button 1: Extract text from current tab
  btnExtract.addEventListener('click', async () => {
    status.textContent = "Extracting...";
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        status.textContent = "No active tab found.";
        return;
      }

      chrome.tabs.sendMessage(tab.id, { action: "extract_text" }, (response) => {
        if (chrome.runtime.lastError) {
           status.textContent = "Error: " + chrome.runtime.lastError.message;
           return;
        }
        
        if (response && response.text) {
          txtJob.value = response.text;
          status.textContent = "Extracted!";
        } else {
          status.textContent = "Failed to extract text.";
        }
      });
    } catch (err) {
      status.textContent = "Error: " + err.message;
    }
  });

  // Button 2: Generate PDF
  btnGenerate.addEventListener('click', () => {
    console.log("Generate PDF button clicked.");
    const jobText = txtJob.value;
    if (!jobText) {
      console.warn("No job text entered.");
      status.textContent = "Please enter job text first.";
      return;
    }

    status.textContent = "Sending to backend...";
    console.log("Sending message to background script...");

    chrome.runtime.sendMessage({ 
      action: "generate_pdf", 
      jobText: jobText,
      includeCoverLetter: chkCoverLetter.checked
    }, (response) => {
        console.log("Response from background script:", response);
        if (chrome.runtime.lastError) {
            console.error("Runtime error:", chrome.runtime.lastError.message);
            status.textContent = "Error: " + chrome.runtime.lastError.message;
        } else if (response && response.status === "started") {
            status.textContent = "Processing... Check downloads.";
        } else {
            status.textContent = "Request sent.";
        }
    });
  });
});
