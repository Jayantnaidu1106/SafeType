import React from 'react';
import ReactDOM from 'react-dom/client';
import Popup from './popup/Popup';
import './index.css';
import './background.js';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>
);

