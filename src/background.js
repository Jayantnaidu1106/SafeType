export async function rewriteWithConfidence(inputText) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  const body = {
    contents: [
      {
        parts: [
          {
            text: `Rewrite the following in a confident and calming tone:\n\n"${inputText}"`
          }
        ]
      }
    ]
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }
  );

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Rewrite failed';
  return text;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'REWRITE_TEXT') {
    rewriteWithConfidence(msg.payload).then((result) => {
      sendResponse({ rewrittenText: result });
    });
    return true; // Keep message channel open for async
  }
});
