document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('optionsForm');
    const apiKeyInput = document.getElementById('apiKey');
    const status = document.getElementById('status');

    // Load saved settings
    chrome.storage.sync.get(['geminiApiKey'], function(result) {
        if (result.geminiApiKey) {
            apiKeyInput.value = result.geminiApiKey;
        }
    });

    // Save settings
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const apiKey = apiKeyInput.value.trim();
        
        if (!apiKey) {
            showStatus('Please enter an API key.', 'error');
            return;
        }

        chrome.storage.sync.set({
            geminiApiKey: apiKey
        }, function() {
            showStatus('Settings saved successfully!', 'success');
        });
    });

    function showStatus(message, type) {
        status.textContent = message;
        status.className = `status ${type}`;
        status.classList.remove('hidden');
        
        setTimeout(() => {
            status.classList.add('hidden');
        }, 3000);
    }
});
