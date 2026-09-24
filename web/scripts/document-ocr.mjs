import { createWorker } from 'tesseract.js';
import sharp from 'sharp';
import { resolve } from 'node:path';

// All recognition is local to the isolated parser. No credentials, URLs or
// remote language downloads. OCR is evidence with uncertainty, not a transcript.
export function createOcr(warn) {
  let worker, operations = 0; const deadline = Date.now() + 55000;
  async function recognize(bytes, location, extra = {}) {
    if (operations >= 12 || Date.now() >= deadline) { warn('ocr_limit'); return null; }
    operations++;
    let timer;
    try {
      const work = async () => {
        const input = await sharp(bytes, { limitInputPixels: 40000000 }).rotate().resize({ width: 2600, height: 3500, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#fff' }).png().toBuffer();
        worker ??= await createWorker('spa+eng', 1, { workerPath: resolve('worker/ocr-worker.cjs'), langPath: resolve('worker/tessdata'), cacheMethod: 'none', gzip: true, logger: () => {}, errorHandler: () => {} });
        const { data } = await worker.recognize(input);
        if (!data.text.trim()) { warn('ocr_no_text'); return null; }
        if (data.confidence < 75) warn('ocr_low_confidence');
        return { text: data.text, location: `${location} · OCR`, ...extra, method: 'ocr', confidence: data.confidence };
      };
      return await Promise.race([work(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('OCR_TIMEOUT')), Math.min(25000, Math.max(1, deadline - Date.now()))); })]);
    } catch { warn('ocr_unavailable'); await worker?.terminate(); worker = undefined; return null; }
    finally { clearTimeout(timer); }
  }
  return { recognize, close: async () => { await worker?.terminate(); } };
}
