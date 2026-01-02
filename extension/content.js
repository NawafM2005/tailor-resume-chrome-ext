chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extract_text") {
    // Simple extraction strategy
    let text = "";
    
    // 1. Try selection first
    const selection = window.getSelection().toString();
    if (selection) {
        text = selection;
    } else {
        // 2. Fallback to body text
        text = document.body.innerText;
    }

    // Basic cleanup
    text = text.replace(/\s+/g, ' ').trim();
    
    // Limit length to avoid token limits (simple truncation)
    if (text.length > 20000) {
        text = text.substring(0, 20000) + "...";
    }

    sendResponse({ text: text });
  }
});
