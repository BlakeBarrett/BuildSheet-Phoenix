
import React from 'react';
import ReactDOM from 'react-dom/client';
// Fix: Import App as a default export from App.tsx
import App from './App.tsx';
import { ServiceProvider } from './contexts/ServiceContext.tsx';
import './services/i18n.ts'; // Import i18n configuration

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ServiceProvider>
      <App />
    </ServiceProvider>
  </React.StrictMode>
);
