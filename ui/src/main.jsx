import React from 'react';
import { createRoot } from 'react-dom/client';
import './cometchat-styles.css';
import App from './App';
import { DemoToastProvider } from './components/DemoToastProvider.jsx';

const container = document.getElementById('root');
const root = createRoot(container);
root.render(
  <React.StrictMode>
    <DemoToastProvider>
      <App />
    </DemoToastProvider>
  </React.StrictMode>
);
