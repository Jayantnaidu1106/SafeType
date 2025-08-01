console.log("SafeType content script loaded");

// Add context menu functionality for text selection
document.addEventListener('mouseup', function() {
    const selectedText = window.getSelection().toString().trim();
    if (selectedText.length > 0) {
        // Store selected text for potential use
        chrome.runtime.sendMessage({
            type: 'TEXT_SELECTED',
            payload: selectedText
        });
    }
});

// Listen for messages from popup or background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_SELECTED_TEXT') {
        const selectedText = window.getSelection().toString().trim();
        sendResponse({ selectedText: selectedText });
    }
    return true;
});
