import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Register the service worker only when the browser can use it reliably.
if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    const isSecureContext = window.isSecureContext || window.location.hostname === 'localhost';
    if (isSecureContext) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
        console.log('SW registration note:', err);
      });
    }
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
