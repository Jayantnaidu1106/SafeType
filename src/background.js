async function analyzeConfidence(inputText) {
  try {
    const result = await chrome.storage.sync.get(['geminiApiKey']);
    const apiKey = result.geminiApiKey;

    if (!apiKey) {
      return { error: 'Please set your Gemini API key in the extension options.' };
    }

    const body = {
      contents: [
        {
          parts: [
            {
              text: `Analyze the confidence level of this text on a scale of 1-10 (where 1 is very uncertain/hesitant and 10 is very confident/assertive). Also provide a brief explanation and suggest if it needs rewriting.

Text: "${inputText}"

Respond in this exact JSON format:
{
  "confidence_score": [number 1-10],
  "explanation": "[brief explanation of why this score]",
  "needs_rewriting": [true/false],
  "suggested_improvements": "[what could be improved]"
}`
            }
          ]
        }
      ]
    };

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    );

    if (!res.ok) {
      return { error: `API Error (${res.status})` };
    }

    const data = await res.json();
    const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!responseText) {
      return { error: 'No response from AI' };
    }

    try {
      // Extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]);
        return { success: true, analysis };
      } else {
        return { error: 'Could not parse AI response' };
      }
    } catch (parseError) {
      return { error: 'Invalid response format' };
    }

  } catch (error) {
    return { error: error.message };
  }
}

async function rewriteWithConfidence(inputText) {
  try {
    // Get API key from Chrome storage
    const result = await chrome.storage.sync.get(['geminiApiKey']);
    const apiKey = result.geminiApiKey;

    console.log('API Key exists:', !!apiKey);

    if (!apiKey) {
      return 'Please set your Gemini API key in the extension options.';
    }

    if (!inputText || inputText.trim().length === 0) {
      return 'Please provide some text to rewrite.';
    }

    const body = {
      contents: [
        {
          parts: [
            {
              text: `Rewrite the following text in a more confident and calming tone. Keep the same meaning but make it sound more assured and positive:\n\n"${inputText}"`
            }
          ]
        }
      ]
    };

    console.log('Making API request to Gemini...');

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    );

    console.log('Response status:', res.status);

    if (!res.ok) {
      const errorData = await res.json();
      console.error('API Error:', errorData);

      if (res.status === 400) {
        return 'Invalid API request. Please check your API key.';
      } else if (res.status === 403) {
        return 'API key is invalid or doesn\'t have permission. Please check your Gemini API key.';
      } else if (res.status === 429) {
        return 'Too many requests. Please wait a moment and try again.';
      } else {
        return `API Error (${res.status}): ${errorData.error?.message || 'Unknown error'}`;
      }
    }

    const data = await res.json();
    console.log('API Response:', data);

    if (data.error) {
      console.error('Gemini API Error:', data.error);
      return `Error: ${data.error.message}`;
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      console.error('No text in response:', data);
      return 'No response generated. The content might have been filtered.';
    }

    return text.trim();

  } catch (error) {
    console.error('Rewrite function error:', error);
    return `Error: ${error.message}`;
  }
}

// Create context menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'rewriteText',
    title: 'Rewrite with SafeType',
    contexts: ['selection']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'rewriteText' && info.selectionText) {
    rewriteWithConfidence(info.selectionText).then((result) => {
      // Inject script to replace selected text
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: replaceSelectedText,
        args: [result]
      });
    });
  }
});

function replaceSelectedText(newText) {
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(newText));
    selection.removeAllRanges();
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'REWRITE_TEXT') {
    rewriteWithConfidence(msg.payload).then((result) => {
      sendResponse({ rewrittenText: result });
    });
    return true; // Keep message channel open for async
  }

  if (msg.type === 'ANALYZE_CONFIDENCE') {
    analyzeConfidence(msg.payload).then((result) => {
      sendResponse(result);
    });
    return true; // Keep message channel open for async
  }
});
