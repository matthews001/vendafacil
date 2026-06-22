import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const template = await readFile(resolve(root, 'index.template.html'), 'utf8');
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error('Defina SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY antes de gerar o site.');
}

const html = template
  .replaceAll('__SUPABASE_URL__', url)
  .replaceAll('__SUPABASE_PUBLISHABLE_KEY__', key);

await mkdir(resolve(root, 'dist'), { recursive: true });
await writeFile(resolve(root, 'dist/index.html'), html, 'utf8');
console.log('Site gerado em dist/index.html');
