import { build } from 'esbuild';
await build({ entryPoints: ['scripts/document-worker.mjs'], outfile: 'worker/document-worker.mjs', bundle: true, platform: 'node', target: 'node24', format: 'esm', external: ['pdfjs-dist/*'], banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" }, logLevel: 'warning' });
