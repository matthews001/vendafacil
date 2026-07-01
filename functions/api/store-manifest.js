const cleanSlug = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 80);
const cleanText = (value, fallback) => {
  const text = String(value || '').replace(/[\r\n<>]/g, ' ').trim().replace(/\s+/g, ' ');
  return (text || fallback).slice(0, 70);
};
const cleanColor = value => /^#[0-9a-f]{6}$/i.test(String(value || '').trim()) ? String(value).trim().toLowerCase() : '#1d9e75';

async function getStore(slug, env) {
  const url = env?.SUPABASE_URL;
  const key = env?.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !slug) return null;

  try {
    const response = await fetch(url.replace(/\/$/, '') + '/rest/v1/rpc/get_public_store_data', {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_slug: slug })
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (_) {
    return null;
  }
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const slug = cleanSlug(url.searchParams.get('loja'));
  const queryName = cleanText(url.searchParams.get('nome'), '');
  const rawColor = url.searchParams.get('cor');
  const queryColor = cleanColor(rawColor);
  const data = (!queryName || !rawColor) ? await getStore(slug, context.env) : null;
  const business = data?.business || {};
  const settings = data?.settings || {};
  const name = queryName || cleanText(business.name, slug ? 'Minha loja' : 'FechAí');
  const color = rawColor ? queryColor : cleanColor(settings.brand_primary_color);
  const startUrl = slug ? '/loja?loja=' + encodeURIComponent(slug) + '&modo=comercio' : '/';
  const iconQuery = new URLSearchParams({ loja: slug, nome: name, cor: color }).toString();

  const manifest = {
    name: name + ' | FechAí',
    short_name: name.slice(0, 18),
    id: startUrl,
    start_url: startUrl,
    scope: '/',
    display: 'standalone',
    background_color: '#f7faf8',
    theme_color: color,
    lang: 'pt-BR',
    icons: [
      { src: '/api/store-icon?' + iconQuery, sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
      { src: '/assets/pwa-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: '/assets/pwa-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
    ]
  };

  return new Response(JSON.stringify(manifest), {
    status: 200,
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0'
    }
  });
}
