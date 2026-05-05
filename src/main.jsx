import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './brand/styles.css';
import App from './App.jsx';

// Single prefix in the new gala repo: /sponsor/{token}
//
// The legacy multi-prefix scheme (/gala-dev, /gala-seats, /gala) lived
// in the def-site repo where one bundle had to serve dev mirror, delegate
// landing, and production simultaneously. After the May 2026 migration
// to gala.daviskids.org, /sponsor is the only sponsor route — the wizard
// step deep-links use /sponsor/{token}/seats etc., still under the same
// basename.
const PATH_PREFIX = '/sponsor';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename={PATH_PREFIX}>
      <App />
    </BrowserRouter>
  </StrictMode>
);
