document.addEventListener('DOMContentLoaded', function() {
    const inputText = document.getElementById('inputText');
    const rewriteBtn = document.getElementById('rewriteBtn');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const output = document.getElementById('output');

    rewriteBtn.addEventListener('click', async function() {
        const text = inputText.value.trim();
        
        if (!text) {
            output.textContent = 'Please enter some text to rewrite.';
            return;
        }

        // Disable button and show loading state
        rewriteBtn.disabled = true;
        rewriteBtn.textContent = 'Rewriting...';
        output.innerHTML = '<span class="loading">Processing your text...</span>';

        try {
            // Send message to background script
            const response = await chrome.runtime.sendMessage({
                type: 'REWRITE_TEXT',
                payload: text
            });

            console.log('Response from background:', response);

            if (response && response.rewrittenText) {
                // Check if it's an error message
                if (response.rewrittenText.startsWith('Error:') ||
                    response.rewrittenText.startsWith('Please set your') ||
                    response.rewrittenText.startsWith('API Error') ||
                    response.rewrittenText.startsWith('Invalid') ||
                    response.rewrittenText.startsWith('Too many')) {
                    output.innerHTML = `<span style="color: #dc2626;">${response.rewrittenText}</span>`;
                } else {
                    output.textContent = response.rewrittenText;
                }
            } else {
                output.innerHTML = '<span style="color: #dc2626;">No response received. Please check your API key and try again.</span>';
            }
        } catch (error) {
            console.error('Popup Error:', error);
            output.innerHTML = `<span style="color: #dc2626;">Connection error: ${error.message}</span>`;
        } finally {
            // Re-enable button
            rewriteBtn.disabled = false;
            rewriteBtn.textContent = 'Rewrite Text';
        }
    });

    analyzeBtn.addEventListener('click', async function() {
        const text = inputText.value.trim();

        if (!text) {
            output.textContent = 'Please enter some text to analyze.';
            return;
        }

        // Disable button and show loading state
        analyzeBtn.disabled = true;
        analyzeBtn.textContent = 'Analyzing...';
        output.innerHTML = '<span class="loading">Analyzing confidence level...</span>';

        try {
            const response = await chrome.runtime.sendMessage({
                type: 'ANALYZE_CONFIDENCE',
                payload: text
            });

            if (response.success && response.analysis) {
                const { confidence_score, explanation, needs_rewriting, suggested_improvements } = response.analysis;

                const scoreColor = confidence_score >= 7 ? '#10b981' : confidence_score >= 5 ? '#f59e0b' : '#ef4444';
                const scoreEmoji = confidence_score >= 7 ? '✅' : confidence_score >= 5 ? '⚠️' : '❌';

                output.innerHTML = `
                    <div style="margin-bottom: 12px;">
                        <div style="display: flex; align-items: center; margin-bottom: 8px;">
                            <span style="font-size: 18px; margin-right: 8px;">${scoreEmoji}</span>
                            <strong style="color: ${scoreColor};">Confidence Score: ${confidence_score}/10</strong>
                        </div>
                        <div style="margin-bottom: 8px;"><strong>Analysis:</strong> ${explanation}</div>
                        ${needs_rewriting ? `<div style="margin-bottom: 8px;"><strong>Suggestions:</strong> ${suggested_improvements}</div>` : ''}
                    </div>
                    ${needs_rewriting ?
                        `<div style="padding: 12px; background: #fef3c7; border-radius: 6px; border-left: 4px solid #f59e0b;">
                            <strong>💡 Recommendation:</strong> This text could benefit from rewriting to sound more confident.
                        </div>` :
                        `<div style="padding: 12px; background: #d1fae5; border-radius: 6px; border-left: 4px solid #10b981;">
                            <strong>👍 Great!</strong> This text already sounds confident and clear.
                        </div>`
                    }
                `;
            } else if (response.error) {
                output.innerHTML = `<span style="color: #dc2626;">${response.error}</span>`;
            } else {
                output.innerHTML = '<span style="color: #dc2626;">Failed to analyze text. Please try again.</span>';
            }
        } catch (error) {
            console.error('Analysis Error:', error);
            output.innerHTML = `<span style="color: #dc2626;">Connection error: ${error.message}</span>`;
        } finally {
            // Re-enable button
            analyzeBtn.disabled = false;
            analyzeBtn.textContent = 'Check Confidence';
        }
    });

    // Allow Enter key to trigger analysis (with Ctrl/Cmd)
    inputText.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            analyzeBtn.click();
        }
    });
});
