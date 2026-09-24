import { createWorker } from 'tesseract.js';
import sharp from 'sharp';
import { resolve } from 'node:path';

// All recognition is local to the isolated parser. No credentials, URLs or
// remote language downloads. OCR is evidence with uncertainty, not a transcript.
export function createOcr(warn, detailed = false) {
  const limit = detailed ? 40 : 12;
  let worker, operations = 0; const deadline = Date.now() + (detailed ? 120000 : 55000);
  async function recognize(bytes, location, extra = {}, options = {}) {
    if (operations >= limit || Date.now() >= deadline) { warn('ocr_limit'); return null; }
    operations++;
    let timer;
    try {
      const work = async () => {
        const input = await sharp(bytes, { limitInputPixels: 40000000 }).rotate().resize({ width: 2600, height: 3500, fit: 'inside', withoutEnlargement: !options.lines }).flatten({ background: '#fff' }).png().toBuffer();
        worker ??= await createWorker('spa+eng', 1, { workerPath: resolve('worker/ocr-worker.cjs'), langPath: resolve('worker/tessdata'), cacheMethod: 'none', gzip: true, logger: () => {}, errorHandler: () => {} });
        await worker.setParameters({ tessedit_pageseg_mode: options.lines ? '11' : '3' });
        const { data } = await worker.recognize(input, { rotateAuto: Boolean(options.lines) }, { text: true, blocks: Boolean(options.lines) });
        if (options.lines) {
          // Confidence belongs to each literal line, not to the entire drawing.
          // A weak word (especially a digit) cannot borrow confidence from others.
          const lines = (data.blocks ?? []).flatMap(b => b.paragraphs ?? []).flatMap(p => p.lines ?? []).filter(l => l.text.trim()).map(l => ({ text: l.text.trim(), location: `${location} · OCR`, ...extra, method: 'ocr', confidence: Math.min(l.confidence, ...l.words.filter(w => w.text.trim()).map(w => w.confidence)) }));
          if (lines.some(l => !Number.isFinite(l.confidence) || l.confidence < 75)) warn('ocr_low_confidence');
          // Noisy geometry must not consume the evidence window ahead of legible labels.
          return { segments: lines.filter(l => Number.isFinite(l.confidence) && l.confidence >= 75 && l.confidence <= 100) };
        }
        if (!data.text.trim()) { warn('ocr_no_text'); return null; }
        if (data.confidence < 75) warn('ocr_low_confidence');
        return { text: data.text, location: `${location} · OCR`, ...extra, method: 'ocr', confidence: data.confidence };
      };
      return await Promise.race([work(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('OCR_TIMEOUT')), Math.min(25000, Math.max(1, deadline - Date.now()))); })]);
    } catch { warn('ocr_unavailable'); await worker?.terminate(); worker = undefined; return null; }
    finally { clearTimeout(timer); }
  }
  return { recognize, available: () => operations < limit && Date.now() < deadline, close: async () => { await worker?.terminate(); } };
}
