const esc = value => String(value || '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' }[char]));
const cleanText = (value, fallback) => {
  const text = String(value || '').replace(/[\r\n<>]/g, ' ').trim().replace(/\s+/g, ' ');
  return (text || fallback).slice(0, 70);
};
const cleanColor = value => /^#[0-9a-f]{6}$/i.test(String(value || '').trim()) ? String(value).trim().toLowerCase() : '#1d9e75';
const cleanSlug = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 80);

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const name = cleanText(url.searchParams.get('nome'), cleanSlug(url.searchParams.get('loja')) || 'FechAí');
  const color = cleanColor(url.searchParams.get('cor'));
  const initial = Array.from(name)[0]?.toUpperCase() || 'F';
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="${esc(name)}">
  <rect width="512" height="512" rx="112" fill="${esc(color)}"/>
  <circle cx="256" cy="205" r="116" fill="rgba(255,255,255,.15)"/>
  <path d="M160 194h192l-18 165H178z" fill="#fff" opacity=".97"/>
  <path d="M205 194c0-47 22-76 51-76s51 29 51 76" fill="none" stroke="#fff" stroke-width="27" stroke-linecap="round"/>
  <text x="256" y="341" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="92" fill="${esc(color)}">${esc(initial)}</text>
</svg>`;

  return new Response(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=900, s-maxage=900'
    }
  });
}
