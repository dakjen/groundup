import React from 'react'
import ReactDOM from 'react-dom/client'
import { inject } from '@vercel/analytics'
import App from './index'

// Vercel Web Analytics — pairs with the Analytics toggle in the Vercel dashboard
inject()

// Meta pixel for the ad funnels — only when VITE_META_PIXEL_ID is set in Vercel
const PIXEL = import.meta.env.VITE_META_PIXEL_ID
if (PIXEL) {
  (function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments) }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = true; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = true; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s) })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js')
  window.fbq('init', PIXEL); window.fbq('track', 'PageView')
}

// The static copy crawlers read (scripts/prerender.mjs) comes out the moment the app mounts
for (const id of ['seo-content', 'seo-style']) { const el = document.getElementById(id); if (el) el.remove(); }

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
