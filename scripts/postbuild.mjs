// Post-build: fill in the site URL, inline the CSS, hash the inline theme script for the CSP,
// and write sitemap.xml, robots.txt and _headers for Cloudflare Pages.
import { createHash } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';

const SITE_URL = (process.env.SITE_URL || 'https://tg-booking-miniapp.pages.dev').replace(/\/$/, '');
const dist = new URL('../dist/', import.meta.url);
let html = readFileSync(new URL('index.html', dist), 'utf8').replaceAll('%SITE_URL%', SITE_URL);

html = html.replace(/<link rel="stylesheet"[^>]*href="(\/assets\/[^"]+\.css)"[^>]*>/, (_m, href) => {
  const css = readFileSync(new URL('.' + href, dist), 'utf8');
  rmSync(new URL('.' + href, dist));
  return `<style>${css}</style>`;
});
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
writeFileSync(new URL('index.html', dist), html);

writeFileSync(new URL('sitemap.xml', dist), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE_URL}/</loc></url>
</urlset>
`);
writeFileSync(new URL('robots.txt', dist), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
// Telegram opens Mini Apps in a WebView (mobile/desktop) or an iframe (web.telegram.org),
// so framing must be allowed for Telegram origins only. No X-Frame-Options on purpose.
const csp = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' https://telegram.org ${inline.join(' ')}`.trim(),
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org",
].join('; ');
writeFileSync(new URL('_headers', dist), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: ${csp}

/assets/*
  Cache-Control: public, max-age=31536000, immutable
`);
console.log('postbuild: index.html, sitemap.xml, robots.txt, _headers for', SITE_URL);
