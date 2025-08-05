document.addEventListener('DOMContentLoaded', function() {
    const inputText = document.getElementById('inputText');
    const rewriteBtn = document.getElementById('rewriteBtn');
    const feedbackMessage = document.getElementById('feedbackMessage');
    const moodHistory = document.getElementById('moodHistory');

    // Toggle switches
    const toneDetectionToggle = document.getElementById('toneDetectionToggle');
    const safeFilterToggle = document.getElementById('safeFilterToggle');
    const zenModeToggle = document.getElementById('zenModeToggle');

    // Load saved settings and mood history
    loadSettings();
    loadMoodHistory();

    // Toggle switch event listeners
    toneDetectionToggle.addEventListener('click', function() {
        toggleSwitch(toneDetectionToggle, 'toneDetection');
    });

    safeFilterToggle.addEventListener('click', function() {
        toggleSwitch(safeFilterToggle, 'safeFilter');
    });

    zenModeToggle.addEventListener('click', function() {
        toggleSwitch(zenModeToggle, 'zenMode');
    });

    // Rewrite button functionality
    rewriteBtn.addEventListener('click', async function() {
        const text = inputText.value.trim();

        if (!text) {
            showFeedback('⚠️', 'Please enter some text to rewrite.', 'warning');
            return;
        }

        // Check safe filter if enabled
        const settings = await getSettings();
        if (settings.safeFilter && await containsInappropriateContent(text)) {
            showFeedback('🚫', 'Content filtered: Please use appropriate language.', 'error');
            return;
        }

        // Show loading state
        rewriteBtn.disabled = true;
        rewriteBtn.innerHTML = '<span>Rewriting...</span><span>⏳</span>';

        try {
            const response = await chrome.runtime.sendMessage({
                type: 'REWRITE_TEXT',
                payload: text
            });

            if (response && response.rewrittenText) {
                // Check if it's an error message
                if (response.rewrittenText.startsWith('Error:') ||
                    response.rewrittenText.startsWith('Please set your') ||
                    response.rewrittenText.startsWith('API Error') ||
                    response.rewrittenText.startsWith('Invalid') ||
                    response.rewrittenText.startsWith('Too many')) {
                    showFeedback('❌', response.rewrittenText, 'error');
                } else {
                    // Update the text input with rewritten text
                    inputText.value = response.rewrittenText;
                    showFeedback('✅', 'Text rewritten successfully!', 'success');

                    // Add to mood history
                    addMoodEntry('Confident', 'Popup', '😊');
                }
            } else {
                showFeedback('❌', 'No response received. Please check your API key.', 'error');
            }
        } catch (error) {
            console.error('Popup Error:', error);
            showFeedback('❌', `Connection error: ${error.message}`, 'error');
        } finally {
            // Re-enable button
            rewriteBtn.disabled = false;
            rewriteBtn.innerHTML = '<span>Rewrite with Confidence</span><span>↻</span>';
        }
    });

    // Auto-analyze text as user types
    let analyzeTimeout;
    inputText.addEventListener('input', function() {
        clearTimeout(analyzeTimeout);
        const text = inputText.value.trim();

        if (text.length > 10) {
            analyzeTimeout = setTimeout(() => {
                analyzeTextConfidence(text);
            }, 1500);
        } else {
            showFeedback('💭', 'Type something to get started...', 'neutral');
        }
    });

    async function analyzeTextConfidence(text) {
        try {
            const settings = await getSettings();

            // Check safe filter if enabled
            if (settings.safeFilter && await containsInappropriateContent(text)) {
                showFeedback('🚫', 'Content filtered: Please use appropriate language.', 'error');
                addMoodEntry('Filtered', 'Popup', '🚫');
                return;
            }

            const response = await chrome.runtime.sendMessage({
                type: 'ANALYZE_CONFIDENCE',
                payload: text
            });

            if (response.success && response.analysis) {
                const { confidence_score, explanation, needs_rewriting } = response.analysis;

                // Determine mood and feedback
                let mood, emoji, message;
                if (confidence_score >= 7) {
                    mood = 'Confident';
                    emoji = '😊';
                    message = 'This works well — go ahead!';
                } else if (confidence_score >= 5) {
                    mood = 'Neutral';
                    emoji = '😐';
                    message = 'This is okay, but could be more confident.';
                } else {
                    mood = 'Anxious';
                    emoji = '😰';
                    message = 'This text seems uncertain. Consider rewriting.';
                }

                showFeedback(emoji, message, mood.toLowerCase());
                addMoodEntry(mood, 'Popup', emoji);

            } else if (response.error) {
                showFeedback('❌', response.error, 'error');
            }
        } catch (error) {
            console.error('Analysis Error:', error);
            showFeedback('❌', 'Analysis failed. Please try again.', 'error');
        }
    }

    function showFeedback(emoji, text, type) {
        const feedbackMessage = document.getElementById('feedbackMessage');
        const emojiSpan = feedbackMessage.querySelector('.emoji');
        const textSpan = feedbackMessage.querySelector('.text');

        emojiSpan.textContent = emoji;
        textSpan.textContent = text;

        // Update styling based on type
        feedbackMessage.className = 'feedback-message';
        if (type === 'error') {
            feedbackMessage.style.background = '#fef2f2';
            feedbackMessage.style.borderColor = '#fecaca';
            textSpan.style.color = '#dc2626';
        } else if (type === 'warning') {
            feedbackMessage.style.background = '#fffbeb';
            feedbackMessage.style.borderColor = '#fed7aa';
            textSpan.style.color = '#d97706';
        } else if (type === 'success') {
            feedbackMessage.style.background = '#f0fdf4';
            feedbackMessage.style.borderColor = '#bbf7d0';
            textSpan.style.color = '#166534';
        } else {
            feedbackMessage.style.background = '#f8fafc';
            feedbackMessage.style.borderColor = '#e2e8f0';
            textSpan.style.color = '#475569';
        }
    }

    function toggleSwitch(switchElement, settingName) {
        switchElement.classList.toggle('active');
        const isActive = switchElement.classList.contains('active');

        // Save setting through background script
        chrome.runtime.sendMessage({
            type: 'UPDATE_SETTING',
            payload: { setting: settingName, value: isActive }
        }, function(response) {
            if (response && response.success) {
                console.log(`SafeType: ${settingName} setting updated to ${isActive}`);

                // Show feedback based on setting
                if (settingName === 'zenMode' && isActive) {
                    showFeedback('🧘', 'Zen Mode enabled - minimal notifications', 'success');
                } else if (settingName === 'safeFilter' && isActive) {
                    showFeedback('🛡️', 'Safe Filter enabled - content will be filtered', 'success');
                } else if (settingName === 'toneDetection' && isActive) {
                    showFeedback('🎯', 'Real-time tone detection enabled', 'success');
                }
            }
        });
    }

    async function loadSettings() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });

            // Set toggle states based on stored settings
            if (response.toneDetection !== false) {
                toneDetectionToggle.classList.add('active');
            }
            if (response.safeFilter !== false) {
                safeFilterToggle.classList.add('active');
            }
            if (response.zenMode === true) {
                zenModeToggle.classList.add('active');
            }

            console.log('SafeType: Settings loaded:', response);
        } catch (error) {
            console.error('SafeType: Error loading settings:', error);

            // Fallback to default settings
            toneDetectionToggle.classList.add('active');
            safeFilterToggle.classList.add('active');
        }
    }

    async function getSettings() {
        return await chrome.storage.sync.get(['toneDetection', 'safeFilter', 'zenMode']);
    }

    async function containsInappropriateContent(text) {
        // Simple content filter - in production, you'd use a more sophisticated filter
        const inappropriateWords = [
            'damn', 'hell', 'shit', 'fuck', 'bitch', 'ass', 'crap', 'piss',
            'stupid', 'idiot', 'moron', 'dumb', 'hate', 'kill', 'die'
        ];

        const lowerText = text.toLowerCase();
        return inappropriateWords.some(word => lowerText.includes(word));
    }

    function addMoodEntry(mood, source, emoji) {
        const now = new Date();
        const timeAgo = 'just now';

        // Get existing mood history
        chrome.storage.local.get(['moodHistory'], function(result) {
            const history = result.moodHistory || [];

            // Add new entry
            history.unshift({
                mood,
                source,
                emoji,
                timestamp: now.toISOString(),
                timeAgo
            });

            // Keep only last 10 entries
            if (history.length > 10) {
                history.splice(10);
            }

            // Save updated history
            chrome.storage.local.set({ moodHistory: history });

            // Update display
            updateMoodHistoryDisplay(history);
        });
    }

    function loadMoodHistory() {
        chrome.storage.local.get(['moodHistory'], function(result) {
            const history = result.moodHistory || [];
            updateMoodHistoryDisplay(history);
        });
    }

    function updateMoodHistoryDisplay(history) {
        const moodHistory = document.getElementById('moodHistory');

        if (history.length === 0) {
            moodHistory.innerHTML = '<div style="text-align: center; color: #9ca3af; padding: 20px;">No recent activity</div>';
            return;
        }

        moodHistory.innerHTML = history.map(entry => {
            const timeAgo = getTimeAgo(new Date(entry.timestamp));
            return `
                <div class="mood-item">
                    <div class="mood-left">
                        <span class="mood-emoji">${entry.emoji}</span>
                        <span class="mood-text">${entry.mood} — ${entry.source}</span>
                    </div>
                    <span class="mood-time">${timeAgo}</span>
                </div>
            `;
        }).join('');
    }

    function getTimeAgo(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    }

    // Initialize with default feedback
    showFeedback('💭', 'Type something to get started...', 'neutral');
});
