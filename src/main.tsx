import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// Prefer the user's saved theme; otherwise follow the system preference.
try {
  const saved = localStorage.getItem('theme');
  const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)').matches;
  if (saved === 'light' || (!saved && prefersLight)) document.documentElement.classList.add('light');
} catch {
  /* Default to dark mode when localStorage is unavailable. */
}

// Route basename follows the Vite base.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
