import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'dist-cli');
fs.mkdirSync(outDir, { recursive: true });

const outfile = path.join(outDir, 'apidacs.cjs');

await esbuild.build({
  entryPoints: [path.join(rootDir, 'src', 'apidacs', 'cli-entry.ts')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile,
  external: ['node:sqlite'],
  minify: false,
  sourcemap: false,
  logLevel: 'info',
});

if (process.platform !== 'win32') {
  fs.chmodSync(outfile, 0o755);
}

console.log(`Built cross-platform executable bundle: ${outfile}`);
