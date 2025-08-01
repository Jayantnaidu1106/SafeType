document.addEventListener('DOMContentLoaded', function() {
    const inputText = document.getElementById('inputText');
    const rewriteBtn = document.getElementById('rewriteBtn');
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
            rewriteBtn.textContent = 'Rewrite with Confidence';
        }
    });

    // Allow Enter key to trigger rewrite (with Ctrl/Cmd)
    inputText.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            rewriteBtn.click();
        }
    });
});
