import React, { useState } from 'react';

export default function Popup() {
  const [text, setText] = useState('');
  const [result, setResult] = useState('');

  const handleRewrite = () => {
    chrome.runtime.sendMessage(
      { type: 'REWRITE_TEXT', payload: text },
      (response) => setResult(response.rewrittenText)
    );
  };

  return (
    <div className="p-4 w-[300px]">
      <h2 className="font-bold text-xl mb-2">🛡 SafeType</h2>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full border rounded p-2 mb-2"
        placeholder="Type your message here..."
      />
      <button
        onClick={handleRewrite}
        className="bg-blue-600 text-white rounded px-4 py-2 w-full mb-2"
      >
        Rewrite with Confidence
      </button>
      <div className="text-sm text-gray-700 whitespace-pre-wrap">{result}</div>
    </div>
  );
}
