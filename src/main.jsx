import React from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource-variable/geist';
import '@fontsource/instrument-serif/400-italic.css';

import './styles/tokens.css';
import './styles/base.css';
import './styles/ui.css';
import './styles/marketing.css';
import './styles/app.css';

import App from './App.jsx';

const root = document.getElementById('root');
createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
