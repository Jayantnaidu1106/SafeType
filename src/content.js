console.log("SafeType content script loaded");

let currentActiveElement = null;
let confidenceCheckTimeout = null;
let confidenceNotification = null;
let safeFilterNotification = null;
let zenModeIndicator = null;
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
        // Get current settings
        const settings = await chrome.storage.sync.get(['toneDetection', 'safeFilter', 'zenMode']);

        // Skip if tone detection is disabled
        if (settings.toneDetection === false) {
            return;
        }

        // Check safe content first if safe filter is enabled
        if (settings.safeFilter !== false) {
            const safetyResponse = await chrome.runtime.sendMessage({
                type: 'CHECK_SAFE_CONTENT',
                payload: text
            });

            if (safetyResponse.success && safetyResponse.safetyCheck && !safetyResponse.safetyCheck.is_safe) {
                showSafeFilterNotification(element, safetyResponse.safetyCheck);
                addMoodEntry('Filtered', getPageContext(), '🚫');
                return;
            }
        }

        const response = await chrome.runtime.sendMessage({
            type: 'ANALYZE_CONFIDENCE',
            payload: text
        });

        if (response.success && response.analysis) {
            const { confidence_score, needs_rewriting, explanation, suggested_improvements, mood, emotional_tone, writing_style } = response.analysis;

            // Track mood
            const detectedMood = mood || (confidence_score >= 7 ? 'Confident' : confidence_score >= 5 ? 'Neutral' : 'Anxious');
            const emoji = getMoodEmoji(detectedMood);
            addMoodEntry(detectedMood, getPageContext(), emoji);

            // Show notification based on confidence score and Zen mode setting
            if (settings.zenMode !== true) {
                if (confidence_score < 6 && needs_rewriting) {
                    // Show low confidence notification
                    showConfidenceNotification(element, {
                        score: confidence_score,
                        explanation,
                        improvements: suggested_improvements,
                        originalText: text,
                        mood: detectedMood,
                        emotional_tone,
                        writing_style
                    });
                } else if (confidence_score >= 8) {
                    // Show positive feedback for high confidence
                    showPositiveFeedback(element, {
                        score: confidence_score,
                        mood: detectedMood,
                        emotional_tone
                    });
                } else {
                    hideConfidenceNotification();
                }
            } else {
                // In Zen mode, only track mood but don't show notifications
                hideConfidenceNotification();
            }
        }
    } catch (error) {
        console.error('SafeType: Error analyzing confidence:', error);
    }
}

function getMoodEmoji(mood) {
    const moodEmojis = {
        'Confident': '😊',
        'Neutral': '😐',
        'Anxious': '😰',
        'Excited': '🤩',
        'Frustrated': '😤',
        'Sad': '😢',
        'Happy': '😄',
        'Filtered': '🚫'
    };
    return moodEmojis[mood] || '😐';
}

function getPageContext() {
    const hostname = window.location.hostname;
    if (hostname.includes('gmail.com')) return 'Gmail';
    if (hostname.includes('discord.com')) return 'Discord';
    if (hostname.includes('slack.com')) return 'Slack';
    if (hostname.includes('twitter.com') || hostname.includes('x.com')) return 'Twitter';
    if (hostname.includes('linkedin.com')) return 'LinkedIn';
    if (hostname.includes('facebook.com')) return 'Facebook';
    return 'Web';
}

function addMoodEntry(mood, source, emoji) {
    const now = new Date();

    // Get existing mood history
    chrome.storage.local.get(['moodHistory'], function(result) {
        const history = result.moodHistory || [];

        // Add new entry
        history.unshift({
            mood,
            source,
            emoji,
            timestamp: now.toISOString()
        });

        // Keep only last 20 entries
        if (history.length > 20) {
            history.splice(20);
        }

        // Save updated history
        chrome.storage.local.set({ moodHistory: history });
    });
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

    if (message.type === 'SETTING_CHANGED') {
        // Handle setting changes from popup
        console.log('SafeType: Setting changed:', message.setting, message.value);

        // If safe filter was disabled, hide any safe filter notifications
        if (message.setting === 'safeFilter' && !message.value) {
            hideSafeFilterNotification();
        }

        // If zen mode was enabled, hide all notifications and show zen indicator
        if (message.setting === 'zenMode' && message.value) {
            hideConfidenceNotification();
            hideSafeFilterNotification();
            showZenModeIndicator();
        } else if (message.setting === 'zenMode' && !message.value) {
            hideZenModeIndicator();
        }

        // If tone detection was disabled, hide confidence notifications
        if (message.setting === 'toneDetection' && !message.value) {
            hideConfidenceNotification();
        }
    }

    return true;
});

function showSafeFilterNotification(element, safetyData) {
    hideSafeFilterNotification(); // Remove any existing notification

    const notification = document.createElement('div');
    notification.id = 'safetype-safe-filter-notification';
    notification.innerHTML = `
        <div style="
            position: fixed;
            top: 20px;
            right: 20px;
            background: #fff;
            border: 2px solid #dc2626;
            border-radius: 12px;
            padding: 16px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10001;
            max-width: 350px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            line-height: 1.4;
        ">
            <div style="display: flex; align-items: center; margin-bottom: 12px;">
                <span style="font-size: 20px; margin-right: 8px;">🚫</span>
                <strong style="color: #dc2626;">Content Filtered</strong>
            </div>
            <div style="margin-bottom: 12px; color: #374151;">
                ${safetyData.content_issues || 'Inappropriate content detected'}
            </div>
            ${safetyData.suggested_alternative ? `
                <div style="margin-bottom: 12px;">
                    <strong style="color: #059669;">Suggested alternative:</strong>
                    <div style="background: #f0fdf4; padding: 8px; border-radius: 6px; margin-top: 4px; border-left: 3px solid #059669;">
                        ${safetyData.suggested_alternative}
                    </div>
                </div>
            ` : ''}
            <div style="display: flex; gap: 8px;">
                <button id="safetype-use-alternative" style="
                    background: #059669;
                    color: white;
                    border: none;
                    padding: 8px 12px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: 500;
                ">Use Alternative</button>
                <button id="safetype-dismiss-filter" style="
                    background: #6b7280;
                    color: white;
                    border: none;
                    padding: 8px 12px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 12px;
                    font-weight: 500;
                ">Dismiss</button>
            </div>
        </div>
    `;

    document.body.appendChild(notification);
    safeFilterNotification = notification;

    // Add event listeners
    const useAlternativeBtn = document.getElementById('safetype-use-alternative');
    const dismissBtn = document.getElementById('safetype-dismiss-filter');

    if (useAlternativeBtn && safetyData.suggested_alternative) {
        useAlternativeBtn.addEventListener('click', () => {
            replaceElementText(element, safetyData.suggested_alternative);
            hideSafeFilterNotification();
        });
    } else if (useAlternativeBtn) {
        useAlternativeBtn.style.display = 'none';
    }

    if (dismissBtn) {
        dismissBtn.addEventListener('click', () => {
            hideSafeFilterNotification();
        });
    }

    // Auto-hide after 10 seconds
    setTimeout(() => {
        hideSafeFilterNotification();
    }, 10000);
}

function hideSafeFilterNotification() {
    if (safeFilterNotification) {
        safeFilterNotification.remove();
        safeFilterNotification = null;
    }
}

function replaceElementText(element, newText) {
    try {
        console.log('SafeType: Replacing element text with:', newText);

        // Focus the element first
        element.focus();

        if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
            // For input/textarea elements
            element.value = newText;

            // Trigger input events to notify the page
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (element.contentEditable === 'true') {
            // For contentEditable elements
            element.textContent = newText;

            // Trigger input events
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
        }

        console.log('SafeType: Text replacement successful');
    } catch (error) {
        console.error('SafeType: Error replacing element text:', error);
    }
}

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
    document.getElementById('safetype-rewrite-yes').addEventListener('click', async () => {
        console.log('SafeType: Yes button clicked!');
        console.log('SafeType: Element to rewrite:', element);
        console.log('SafeType: Original text:', data.originalText);

        // Show loading state
        const yesButton = document.getElementById('safetype-rewrite-yes');
        if (yesButton) {
            yesButton.textContent = 'Rewriting...';
            yesButton.disabled = true;
        }

        try {
            const response = await chrome.runtime.sendMessage({
                type: 'REWRITE_TEXT',
                payload: data.originalText
            });

            if (response && response.rewrittenText) {
                console.log('SafeType: Got rewritten text:', response.rewrittenText);

                // Check if it's an error message
                if (response.rewrittenText.startsWith('Error:') ||
                    response.rewrittenText.startsWith('Please set your') ||
                    response.rewrittenText.startsWith('API Error')) {

                    // Show error in notification
                    if (confidenceNotification) {
                        const errorDiv = confidenceNotification.querySelector('div');
                        errorDiv.innerHTML = `
                            <div style="display: flex; align-items: center; margin-bottom: 12px;">
                                <span style="font-size: 20px; margin-right: 8px;">❌</span>
                                <strong style="color: #dc2626;">Error</strong>
                            </div>
                            <div style="margin-bottom: 12px; color: #374151;">
                                ${response.rewrittenText}
                            </div>
                            <button onclick="this.closest('#safetype-confidence-notification').remove()" style="
                                background: #6b7280;
                                color: white;
                                border: none;
                                padding: 8px 12px;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 12px;
                            ">Close</button>
                        `;
                    }
                } else {
                    // Replace the text in the element
                    replaceElementText(element, response.rewrittenText);

                    // Show success message
                    if (confidenceNotification) {
                        const successDiv = confidenceNotification.querySelector('div');
                        successDiv.innerHTML = `
                            <div style="display: flex; align-items: center; margin-bottom: 12px;">
                                <span style="font-size: 20px; margin-right: 8px;">✅</span>
                                <strong style="color: #059669;">Text Rewritten Successfully!</strong>
                            </div>
                            <div style="margin-bottom: 12px; color: #374151;">
                                Your text has been updated with a more confident tone.
                            </div>
                        `;

                        // Auto-hide after 3 seconds
                        setTimeout(() => {
                            hideConfidenceNotification();
                        }, 3000);
                    }
                }
            } else {
                console.error('SafeType: No rewritten text received');
                hideConfidenceNotification();
            }
        } catch (error) {
            console.error('SafeType: Error rewriting text:', error);
            hideConfidenceNotification();
        }
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

function showPositiveFeedback(element, data) {
    hideConfidenceNotification(); // Remove any existing notification

    const notification = document.createElement('div');
    notification.id = 'safetype-confidence-notification';
    notification.innerHTML = `
        <div style="
            position: fixed;
            top: 20px;
            right: 20px;
            background: #fff;
            border: 2px solid #10b981;
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
                <span style="font-size: 20px; margin-right: 8px;">✅</span>
                <strong style="color: #059669;">Great Writing!</strong>
            </div>
            <div style="margin-bottom: 12px; color: #374151;">
                Your text sounds confident and clear. Score: ${data.score}/10
            </div>
            <div style="margin-bottom: 12px; color: #6b7280; font-size: 12px;">
                Mood: ${data.mood} • Tone: ${data.emotional_tone}
            </div>
            <button onclick="this.closest('#safetype-confidence-notification').remove()" style="
                background: #10b981;
                color: white;
                border: none;
                padding: 8px 12px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 12px;
                font-weight: 500;
            ">Thanks!</button>
        </div>
    `;

    document.body.appendChild(notification);
    confidenceNotification = notification;

    // Auto-hide after 5 seconds
    setTimeout(() => {
        hideConfidenceNotification();
    }, 5000);
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

function showZenModeIndicator() {
    hideZenModeIndicator(); // Remove any existing indicator

    const indicator = document.createElement('div');
    indicator.id = 'safetype-zen-indicator';
    indicator.innerHTML = `
        <div style="
            position: fixed;
            top: 10px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(99, 102, 241, 0.95);
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 12px;
            font-weight: 500;
            z-index: 10002;
            backdrop-filter: blur(10px);
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            display: flex;
            align-items: center;
            gap: 6px;
        ">
            <span style="font-size: 14px;">🧘</span>
            <span>Zen Mode Active</span>
        </div>
    `;

    document.body.appendChild(indicator);
    zenModeIndicator = indicator;

    // Auto-hide after 3 seconds
    setTimeout(() => {
        if (zenModeIndicator) {
            zenModeIndicator.style.opacity = '0.6';
        }
    }, 3000);
}

function hideZenModeIndicator() {
    if (zenModeIndicator) {
        zenModeIndicator.remove();
        zenModeIndicator = null;
    }
}

// Check if Zen Mode is active on page load
chrome.storage.sync.get(['zenMode'], function(result) {
    if (result.zenMode === true) {
        showZenModeIndicator();
    }
});

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
