import React from 'react';
import ReactDOM from 'react-dom/client';
import './services/api'; // Inicializar interceptores de autenticación JWT
import App from './App';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Registro automático del Service Worker para funcionamiento PWA offline y standalone
registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('Nueva versión de la PWA disponible.');
  },
  onOfflineReady() {
    console.log('PWA lista para trabajar offline.');
  }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
