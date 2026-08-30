import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './lib/auth.js';
import { App } from './App.js';
import './styles.css';
import './brand.css';   // palette + storefront surfaces, layered over the shell
import './shop.css';    // product cards, product page, and the bars in brand colour
import './motion.css';  // hover states and the small movements, last so they win

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
