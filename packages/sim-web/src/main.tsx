import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from '@ui5/webcomponents-react';
// Registers every icon in the "SAP-icons" collection. Without this, <Icon name="..."> silently
// renders blank for any icon that hasn't been individually side-effect-imported elsewhere — the
// cause of several "invalid icon name" dead ends during the Fiori-density work.
import '@ui5/webcomponents-icons/dist/AllIcons.js';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
