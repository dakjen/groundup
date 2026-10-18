import React from 'react'
import ReactDOM from 'react-dom/client'
import { inject } from '@vercel/analytics'
import App from './index'

// Vercel Web Analytics — pairs with the Analytics toggle in the Vercel dashboard
inject()

// The static copy crawlers read (scripts/prerender.mjs) comes out the moment the app mounts
for (const id of ['seo-content', 'seo-style']) { const el = document.getElementById(id); if (el) el.remove(); }

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
