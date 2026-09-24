import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await build({ entryPoints: ['scripts/document-worker.mjs'], outfile: 'worker/document-worker.mjs', bundle: true, platform: 'node', target: 'node24', format: 'esm', external: ['pdfjs-dist/*', '@napi-rs/canvas', 'sharp', 'tesseract.js-core/*'], banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url); const __dirname = import.meta.dirname;" }, logLevel: 'warning' });

await build({ entryPoints: ['node_modules/tesseract.js/src/worker-script/node/index.js'], outfile: 'worker/ocr-worker.cjs', bundle: true, platform: 'node', target: 'node24', format: 'cjs', external: ['tesseract.js-core/*'], logLevel: 'warning' });
await mkdir('worker/tessdata', { recursive: true });
for (const lang of ['spa', 'eng']) await copyFile('node_modules/@tesseract.js-data/' + lang + '/4.0.0/' + lang + '.traineddata.gz', 'worker/tessdata/' + lang + '.traineddata.gz');
