import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const loadFunction = async relativePath => {
  const source = await readFile(resolve(root, relativePath), 'utf8');
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
};

const manifestSource = await readFile(resolve(root, 'functions/api/store-manifest.js'), 'utf8');
const iconSource = await readFile(resolve(root, 'functions/api/store-icon.js'), 'utf8');
if (!manifestSource.includes('export async function onRequestGet') || !manifestSource.includes('context.env')) {
  throw new Error('Manifesto não está preparado como Cloudflare Pages Function.');
}
if (!iconSource.includes('export async function onRequestGet')) {
  throw new Error('Ícone dinâmico não está preparado como Cloudflare Pages Function.');
}

const manifestFunction = await loadFunction('functions/api/store-manifest.js');
const iconFunction = await loadFunction('functions/api/store-icon.js');
const manifestResponse = await manifestFunction.onRequestGet({
  request: new Request('https://fechai.example/api/store-manifest?loja=loja-demo&nome=Mercado%20Central&cor=%23149b67'),
  env: {}
});
assert.equal(manifestResponse.status, 200);
assert.equal(manifestResponse.headers.get('content-type'), 'application/manifest+json; charset=utf-8');
const manifest = await manifestResponse.json();
assert.equal(manifest.name, 'Mercado Central | FechAí');
assert.match(manifest.icons[0].src, /^\/api\/store-icon\?/);

const iconResponse = await iconFunction.onRequestGet({
  request: new Request('https://fechai.example/api/store-icon?nome=Mercado%20Central&cor=%23149b67'),
  env: {}
});
assert.equal(iconResponse.status, 200);
assert.equal(iconResponse.headers.get('content-type'), 'image/svg+xml; charset=utf-8');
assert.match(await iconResponse.text(), /Mercado Central/);
console.log('Cloudflare Pages Functions validadas: manifest e ícone dinâmico respondem corretamente.');
