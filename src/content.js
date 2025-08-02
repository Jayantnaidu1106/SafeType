console.log("SafeType content script loaded");

let currentActiveElement = null;
let confidenceCheckTimeout = null;
let confidenceNotification = null;
let currentMonitoredElement = null; // Track the element being monitored for rewriting

// Monitor text input in various elements
function monitorTextInput() {
    // Target common input elements
    const inputSelectors = [
        'textarea',
        'input[type="text"]',
        'input[type="email"]',
        '[contenteditable="true"]',
        '[role="textbox"]',
        '.editable', // Common class for editable elements
        '[data-testid*="compose"]', // Gmail compose
        '[data-testid*="message"]', // Chat apps
        // Gmail specific selectors
        'div[contenteditable="true"][role="textbox"]', // Gmail compose area
        'div[contenteditable="true"][aria-label*="Message"]', // Gmail compose
        'div[contenteditable="true"][aria-label*="message"]', // Gmail compose
        'div[contenteditable="true"][aria-label*="compose"]', // Gmail compose
        'div[contenteditable="true"][aria-label*="reply"]', // Gmail reply
        'div[contenteditable="true"][aria-label*="forward"]', // Gmail forward
        // WhatsApp Web
        'div[contenteditable="true"][data-tab]', // WhatsApp message input
        'div[contenteditable="true"][role="textbox"][spellcheck="true"]', // WhatsApp
        // Twitter/X
        'div[contenteditable="true"][aria-label*="Tweet"]', // Twitter compose
        'div[contenteditable="true"][aria-label*="Post"]', // Twitter/X compose
        // LinkedIn
        'div[contenteditable="true"][aria-label*="Write"]', // LinkedIn
        'div[contenteditable="true"][role="textbox"][aria-multiline="true"]', // LinkedIn
        // Discord
        'div[contenteditable="true"][role="textbox"][aria-label*="Message"]', // Discord
        // Slack
        'div[contenteditable="true"][data-qa="message_input"]', // Slack
        // Facebook
        'div[contenteditable="true"][aria-label*="Write"]', // Facebook
        'div[contenteditable="true"][role="textbox"][aria-describedby]', // Facebook
    ];

    inputSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(element => {
            if (!element.hasAttribute('data-safetype-monitored')) {
                element.setAttribute('data-safetype-monitored', 'true');

                element.addEventListener('input', handleTextInput);
                element.addEventListener('focus', handleElementFocus);
                element.addEventListener('blur', handleElementBlur);
            }
        });
    });
}

function handleElementFocus(event) {
    currentActiveElement = event.target;
}

function handleElementBlur(event) {
    if (currentActiveElement === event.target) {
        currentActiveElement = null;
        hideConfidenceNotification();
    }
}

function handleTextInput(event) {
    const element = event.target;
    const text = getElementText(element);

    // Clear previous timeout
    if (confidenceCheckTimeout) {
        clearTimeout(confidenceCheckTimeout);
    }

    // Only analyze if text is substantial (more than 10 characters)
    if (text.length > 10) {
        confidenceCheckTimeout = setTimeout(() => {
            analyzeTextConfidence(text, element);
        }, 2000); // Wait 2 seconds after user stops typing
    } else {
        hideConfidenceNotification();
    }
}

function getElementText(element) {
    if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
        return element.value;
    } else if (element.contentEditable === 'true') {
        return element.innerText || element.textContent;
    }
    return '';
}

async function analyzeTextConfidence(text, element) {
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'ANALYZE_CONFIDENCE',
            payload: text
        });

        if (response.success && response.analysis) {
            const { confidence_score, needs_rewriting, explanation, suggested_improvements } = response.analysis;

            // Show notification if confidence is low (score < 6)
            if (confidence_score < 6 && needs_rewriting) {
                showConfidenceNotification(element, {
                    score: confidence_score,
                    explanation,
                    improvements: suggested_improvements,
                    originalText: text
                });
            } else {
                hideConfidenceNotification();
            }
        }
    } catch (error) {
        console.error('SafeType: Error analyzing confidence:', error);
    }
}

// Add context menu functionality for text selection
document.addEventListener('mouseup', function() {
    const selectedText = window.getSelection().toString().trim();
    if (selectedText.length > 0) {
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

function showConfidenceNotification(element, data) {
    hideConfidenceNotification(); // Remove any existing notification

    // Store reference to the element being monitored
    currentMonitoredElement = element;
    console.log('SafeType: Showing notification for element:', element);

    const notification = document.createElement('div');
    notification.id = 'safetype-confidence-notification';
    notification.innerHTML = `
        <div style="
            position: fixed;
            top: 20px;
            right: 20px;
            background: #fff;
            border: 2px solid #f59e0b;
            border-radius: 12px;
            padding: 16px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            max-width: 350px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            line-height: 1.4;
        ">
            <div style="display: flex; align-items: center; margin-bottom: 12px;">
                <span style="font-size: 20px; margin-right: 8px;">⚠️</span>
                <strong style="color: #d97706;">Low Confidence Detected</strong>
            </div>

            <div style="margin-bottom: 12px; color: #374151;">
                <div><strong>Confidence Score:</strong> ${data.score}/10</div>
                <div style="margin-top: 4px;"><strong>Issue:</strong> ${data.explanation}</div>
                <div style="margin-top: 4px;"><strong>Suggestion:</strong> ${data.improvements}</div>
            </div>

            <div style="margin-bottom: 12px; font-weight: 500; color: #374151;">
                Would you like me to rewrite this text with more confidence?
            </div>

            <div style="display: flex; gap: 8px;">
                <button id="safetype-rewrite-yes" style="
                    background: #4F46E5;
                    color: white;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 500;
                ">Yes, Rewrite</button>

                <button id="safetype-rewrite-no" style="
                    background: #6b7280;
                    color: white;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 500;
                ">No, Keep As Is</button>
            </div>
        </div>
    `;

    document.body.appendChild(notification);
    confidenceNotification = notification;

    // Add event listeners
    document.getElementById('safetype-rewrite-yes').addEventListener('click', () => {
        console.log('SafeType: Yes button clicked!');
        console.log('SafeType: Element to rewrite:', element);
        console.log('SafeType: Original text:', data.originalText);
        console.log('SafeType: Element is connected:', element.isConnected);
        console.log('SafeType: Element tag:', element.tagName);
        console.log('SafeType: Element contentEditable:', element.contentEditable);

        // Test simple replacement first
        testSimpleReplacement(element, data.originalText);
    });

    document.getElementById('safetype-rewrite-no').addEventListener('click', () => {
        hideConfidenceNotification();
    });

    // Auto-hide after 15 seconds
    setTimeout(() => {
        hideConfidenceNotification();
    }, 15000);
}

function hideConfidenceNotification() {
    if (confidenceNotification) {
        confidenceNotification.remove();
        confidenceNotification = null;
    }
}

async function rewriteText(element, originalText) {
    // Show loading state
    const yesButton = document.getElementById('safetype-rewrite-yes');
    if (yesButton) {
        yesButton.textContent = 'Rewriting...';
        yesButton.disabled = true;
    }

    try {
        console.log('SafeType: Rewriting text for element:', element);

        const response = await chrome.runtime.sendMessage({
            type: 'REWRITE_TEXT',
            payload: originalText
        });

        if (response && response.rewrittenText) {
            console.log('SafeType: Got rewritten text:', response.rewrittenText);

            // Make sure the element is still focused and valid
            if (element && element.isConnected) {
                // Replace text in the element
                setElementText(element, response.rewrittenText);

                // Show success message briefly
                if (confidenceNotification) {
                    confidenceNotification.innerHTML = `
                        <div style="
                            position: fixed;
                            top: 20px;
                            right: 20px;
                            background: #10b981;
                            color: white;
                            border-radius: 12px;
                            padding: 16px;
                            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                            z-index: 10000;
                            max-width: 350px;
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            font-size: 14px;
                            text-align: center;
                        ">
                            ✅ Text rewritten with more confidence!
                        </div>
                    `;

                    setTimeout(() => {
                        hideConfidenceNotification();
                    }, 3000);
                }
            } else {
                console.error('SafeType: Element is no longer valid or connected');
                // Try to find the currently focused element
                const focusedElement = document.activeElement;
                if (focusedElement && (focusedElement.tagName === 'TEXTAREA' ||
                    focusedElement.tagName === 'INPUT' ||
                    focusedElement.contentEditable === 'true')) {
                    console.log('SafeType: Using currently focused element instead');
                    setElementText(focusedElement, response.rewrittenText);
                }
            }
        } else {
            console.error('SafeType: No rewritten text received');
            if (confidenceNotification) {
                confidenceNotification.innerHTML = `
                    <div style="
                        position: fixed;
                        top: 20px;
                        right: 20px;
                        background: #ef4444;
                        color: white;
                        border-radius: 12px;
                        padding: 16px;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                        z-index: 10000;
                        max-width: 350px;
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        font-size: 14px;
                        text-align: center;
                    ">
                        ❌ Failed to rewrite text. Please try again.
                    </div>
                `;

                setTimeout(() => {
                    hideConfidenceNotification();
                }, 3000);
            }
        }
    } catch (error) {
        console.error('SafeType: Error rewriting text:', error);
        hideConfidenceNotification();
    }
}

function testSimpleReplacement(element, originalText) {
    console.log('SafeType: Testing simple replacement...');

    // Test 1: Just try to set a simple test value
    try {
        element.focus();

        if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
            console.log('SafeType: Testing textarea/input replacement');
            element.value = 'TEST REPLACEMENT WORKED!';
            element.dispatchEvent(new Event('input', { bubbles: true }));
        } else if (element.contentEditable === 'true') {
            console.log('SafeType: Testing contentEditable replacement');
            element.textContent = 'TEST REPLACEMENT WORKED!';
            element.dispatchEvent(new Event('input', { bubbles: true }));
        }

        console.log('SafeType: Simple test completed');

        // Now try the actual rewrite
        setTimeout(() => {
            // Try a more direct approach
            directTextReplacement(element, originalText);
        }, 1000);

    } catch (error) {
        console.error('SafeType: Simple test failed:', error);
    }
}

async function directTextReplacement(element, originalText) {
    console.log('SafeType: Starting direct text replacement');

    try {
        const response = await chrome.runtime.sendMessage({
            type: 'REWRITE_TEXT',
            payload: originalText
        });

        if (response && response.rewrittenText) {
            console.log('SafeType: Got rewritten text:', response.rewrittenText);

            // Try the most basic approach first
            element.focus();

            // Method 1: For regular inputs
            if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
                console.log('SafeType: Using input method');
                element.value = response.rewrittenText;

                // Fire all possible events
                ['input', 'change', 'keyup', 'blur', 'focus'].forEach(eventType => {
                    element.dispatchEvent(new Event(eventType, { bubbles: true }));
                });
            }
            // Method 2: For contentEditable
            else if (element.contentEditable === 'true') {
                console.log('SafeType: Using contentEditable method');

                // Try different properties
                element.textContent = response.rewrittenText;
                element.innerText = response.rewrittenText;
                element.innerHTML = response.rewrittenText;

                // Fire all possible events
                ['input', 'change', 'keyup', 'blur', 'focus', 'textInput'].forEach(eventType => {
                    element.dispatchEvent(new Event(eventType, { bubbles: true }));
                });

                // Also try InputEvent
                element.dispatchEvent(new InputEvent('input', {
                    bubbles: true,
                    cancelable: true,
                    data: response.rewrittenText
                }));
            }

            console.log('SafeType: Direct replacement completed');

            // Show success message
            if (confidenceNotification) {
                confidenceNotification.innerHTML = `
                    <div style="
                        position: fixed;
                        top: 20px;
                        right: 20px;
                        background: #10b981;
                        color: white;
                        border-radius: 12px;
                        padding: 16px;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                        z-index: 10000;
                        max-width: 350px;
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        font-size: 14px;
                        text-align: center;
                    ">
                        ✅ Text replaced! Check if it worked in the text field.
                    </div>
                `;

                setTimeout(() => {
                    hideConfidenceNotification();
                }, 5000);
            }
        }
    } catch (error) {
        console.error('SafeType: Direct replacement error:', error);
    }
}

function setElementText(element, text) {
    try {
        console.log('SafeType: Attempting to set text in element:', element.tagName, element.className);

        // Store original value for comparison
        const originalValue = getElementText(element);

        if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
            // Standard input/textarea elements
            element.focus();
            element.value = text;

            // Trigger multiple events to ensure compatibility
            element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true }));

        } else if (element.contentEditable === 'true' || element.getAttribute('contenteditable') === 'true') {
            // ContentEditable elements (like Gmail compose)
            element.focus();

            // Method 1: Try using execCommand (works in many cases)
            if (document.execCommand) {
                // Select all text first
                const range = document.createRange();
                range.selectNodeContents(element);
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);

                // Replace with new text
                document.execCommand('insertText', false, text);
            } else {
                // Method 2: Direct manipulation
                element.innerText = text;
            }

            // Trigger events for contentEditable
            element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true }));

        } else {
            // Try to find a parent contentEditable element
            let parent = element.parentElement;
            while (parent && parent !== document.body) {
                if (parent.contentEditable === 'true' || parent.getAttribute('contenteditable') === 'true') {
                    setElementText(parent, text);
                    return;
                }
                parent = parent.parentElement;
            }

            console.warn('SafeType: Could not determine how to set text for element:', element);
        }

        // Verify the text was actually set
        setTimeout(() => {
            const newValue = getElementText(element);
            if (newValue !== text) {
                console.warn('SafeType: Text replacement may have failed. Expected:', text, 'Got:', newValue);
                // Try alternative method for Gmail and other complex apps
                tryAlternativeTextReplacement(element, text);
            } else {
                console.log('SafeType: Text successfully replaced');
            }
        }, 100);

    } catch (error) {
        console.error('SafeType: Error setting element text:', error);
        tryAlternativeTextReplacement(element, text);
    }
}

function tryAlternativeTextReplacement(element, text) {
    try {
        console.log('SafeType: Trying alternative text replacement method');

        // Focus the element
        element.focus();

        // Try using clipboard API
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                // Select all existing text
                if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
                    element.select();
                } else {
                    // For contentEditable, select all content
                    const range = document.createRange();
                    range.selectNodeContents(element);
                    const selection = window.getSelection();
                    selection.removeAllRanges();
                    selection.addRange(range);
                }

                // Paste the new text
                document.execCommand('paste');
            }).catch(() => {
                // Fallback: simulate typing
                simulateTyping(element, text);
            });
        } else {
            simulateTyping(element, text);
        }
    } catch (error) {
        console.error('SafeType: Alternative text replacement failed:', error);
    }
}

function simulateTyping(element, text) {
    try {
        console.log('SafeType: Simulating typing');
        element.focus();

        // Clear existing content first
        if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
            element.select();
            element.value = '';
        } else {
            // For contentEditable
            const range = document.createRange();
            range.selectNodeContents(element);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            selection.deleteFromDocument();
        }

        // Type character by character
        let index = 0;
        const typeChar = () => {
            if (index < text.length) {
                const char = text[index];

                // Create and dispatch keyboard events
                const keydownEvent = new KeyboardEvent('keydown', {
                    key: char,
                    char: char,
                    bubbles: true,
                    cancelable: true
                });

                const keypressEvent = new KeyboardEvent('keypress', {
                    key: char,
                    char: char,
                    bubbles: true,
                    cancelable: true
                });

                const inputEvent = new InputEvent('input', {
                    data: char,
                    bubbles: true,
                    cancelable: true
                });

                element.dispatchEvent(keydownEvent);
                element.dispatchEvent(keypressEvent);

                // Add the character
                if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
                    element.value += char;
                } else {
                    element.textContent += char;
                }

                element.dispatchEvent(inputEvent);

                index++;
                setTimeout(typeChar, 10); // Small delay between characters
            }
        };

        typeChar();
    } catch (error) {
        console.error('SafeType: Typing simulation failed:', error);
    }
}

// Initialize monitoring
monitorTextInput();

// Re-monitor when new elements are added to the page
const observer = new MutationObserver(() => {
    monitorTextInput();
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});
