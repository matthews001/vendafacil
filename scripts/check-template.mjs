import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile, unlink } from 'node:fs/promises';

const html = await readFile(new URL('../index.template.html', import.meta.url), 'utf8');
const asset = await readFile(new URL('../assets/commerce-extension.js', import.meta.url), 'utf8');
if (!html.includes('screen-commerce-app') || !html.includes('screen-store')) throw new Error('Telas do Comércio não foram encontradas.');
if (!html.includes('assets/commerce-extension.js')) throw new Error('Asset do módulo Comércio não está referenciado.');
if (!asset.includes('modo=comercio')) throw new Error('Link público do Comércio não foi encontrado.');
const file = join(tmpdir(), `vendafacil-commerce-${Date.now()}.js`);
await writeFile(file, asset, 'utf8');
try { execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' }); } finally { await unlink(file).catch(() => {}); }
console.log('Template e JavaScript do módulo Comércio validados.');
