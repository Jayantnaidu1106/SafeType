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
    <div style={{ padding: '16px', width: '300px', fontFamily: 'Arial, sans-serif' }}>
      <h2 style={{ fontWeight: 'bold', fontSize: '20px', marginBottom: '16px', color: '#4F46E5' }}>
        🛡 SafeType
      </h2>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{
          width: '100%',
          border: '1px solid #d1d5db',
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '16px',
          fontSize: '14px',
          resize: 'vertical',
          minHeight: '80px',
          boxSizing: 'border-box'
        }}
        placeholder="Type your message here..."
      />
      <button
        onClick={handleRewrite}
        style={{
          background: '#4F46E5',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          padding: '12px 16px',
          width: '100%',
          marginBottom: '16px',
          fontSize: '14px',
          fontWeight: '500',
          cursor: 'pointer'
        }}
      >
        Rewrite with Confidence
      </button>
      <div style={{
        fontSize: '14px',
        color: '#374151',
        whiteSpace: 'pre-wrap',
        lineHeight: '1.5',
        background: '#f9fafb',
        padding: '12px',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
        minHeight: '60px'
      }}>
        {result || 'Your rewritten text will appear here...'}
      </div>
    </div>
  );
}
