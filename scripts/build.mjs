import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const template = await readFile(resolve(root, 'index.template.html'), 'utf8');
const url = process.env.SUPABASE_URL?.trim();
const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();

if (!url || !key) {
  throw new Error('Defina SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY antes de gerar o site.');
}

// JSON.stringify gera strings JavaScript seguras mesmo se a variável possuir
// aspas, caracteres especiais ou quebra de linha acidental.
const html = template
  .replaceAll("'__SUPABASE_URL__'", JSON.stringify(url))
  .replaceAll("'__SUPABASE_PUBLISHABLE_KEY__'", JSON.stringify(key));

const dist = resolve(root, 'dist');
await mkdir(dist, { recursive: true });
await writeFile(resolve(dist, 'index.html'), html, 'utf8');
await mkdir(resolve(dist, 'assets'), { recursive: true });

const staticAssets = [
  ['assets/commerce-extension.js', 'assets/commerce-extension.js'],
  ['assets/pwa-icon-192.png', 'assets/pwa-icon-192.png'],
  ['assets/pwa-icon-512.png', 'assets/pwa-icon-512.png'],
  ['assets/apple-touch-icon.png', 'assets/apple-touch-icon.png'],
  ['assets/manifest.webmanifest', 'manifest.webmanifest'],
  ['assets/sw.js', 'sw.js']
];

for (const [source, destination] of staticAssets) {
  const target = resolve(dist, destination);
  await mkdir(resolve(target, '..'), { recursive: true });
  await copyFile(resolve(root, source), target);
}

console.log('Site gerado em dist/index.html');
