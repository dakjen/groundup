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

// A session token lasts fourteen days. When one has quietly expired the page
// used to keep showing you signed in while every request came back 401 —
// uploads "refusing" files, lists not loading. Now the first 401 on our own
// API signs you out and brings you back to a fresh sign-in.
const _fetch = window.fetch.bind(window);
let _bounced = false;
window.fetch = async (...args) => {
  const res = await _fetch(...args);
  try {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
    const hadToken = !!(localStorage.getItem('guToken') || sessionStorage.getItem('adminToken'));
    if (res.status === 401 && hadToken && !_bounced && /^\/api\//.test(url) && !/\/api\/auth$/.test(url.split('?')[0]) ) {
      const h = (args[1] && args[1].headers) || {};
      const sent = h.Authorization || h.authorization || (h.get && h.get('Authorization'));
      if (sent) {
        _bounced = true;
        localStorage.removeItem('guMember'); localStorage.removeItem('guToken');
        sessionStorage.removeItem('adminToken'); sessionStorage.removeItem('isAdmin'); sessionStorage.removeItem('currentUser');
        alert('Your session expired. Please sign in again.');
        window.location.href = '/';
      }
    }
  } catch {}
  return res;
};

// Private documents live behind /api/file, which needs the session. Instead
// of saving straight to Downloads, every document link opens the viewer page
// (preview + a download button), which fetches the file with the session.
// Direct downloads (?download=1) and in-page previews (iframes) are untouched.
const toViewer = (href) => {
  try {
    const u = new URL(href, window.location.origin);
    if (u.pathname !== '/api/file' || u.searchParams.get('download') === '1') return null;
    const p = u.searchParams.get('p'); if (!p) return null;
    return '/doc?p=' + encodeURIComponent(p) + '&from=' + encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
  } catch { return null; }
};
document.addEventListener('click', (e) => {
  const a = e.target && e.target.closest && e.target.closest('a[href]');
  if (!a) return;
  const v = toViewer(a.getAttribute('href') || '');
  if (!v) return;
  e.preventDefault(); e.stopPropagation();
  window.location.href = v;
}, true);
const _open = window.open.bind(window);
window.open = (url, ...rest) => {
  const v = toViewer(String(url || ''));
  if (v) { window.location.href = v; return null; }
  return _open(url, ...rest);
};

// The static copy crawlers read (scripts/prerender.mjs) comes out the moment the app mounts
for (const id of ['seo-content', 'seo-style']) { const el = document.getElementById(id); if (el) el.remove(); }
// The splash holds the screen black for a beat, then fades once the app has painted —
// a refresh reads as one quiet moment instead of a blink of half-built page.
setTimeout(() => { const sp = document.getElementById('gu-splash'); if (sp) { sp.classList.add('out'); setTimeout(() => { sp.remove(); const st = document.getElementById('gu-splash-style'); if (st) st.remove(); }, 400); } }, 450);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
