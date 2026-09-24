// Isolated parser adapted from Nexo AI. No network or credentials are passed in.
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { createOcr } from './document-ocr.mjs';
import { readPptx, openOfficeZip } from './presentation-xml.mjs';
import { readLegacyPpt } from './legacy-ppt.mjs';
import sharp from 'sharp';
import { readPlanRegions } from './plan-ocr.mjs';
const [file, name, pageArgument, detail] = process.argv.slice(2);
const detailed = detail === 'plan' || /emplazamiento|loteo|ubicaci[oó]n|plano/i.test(name);
const startPage = Number(pageArgument ?? 1);
if (!Number.isInteger(startPage) || startPage < 1 || startPage > 1000) throw new Error("PAGE_RANGE");
const bytes = await readFile(file), extension = extname(name).toLowerCase();
if (bytes.length > 25 * 1024 * 1024) throw new Error('FILE_LIMIT');
const segments = []; let size = 0, pages, nextPage, pageEnd = startPage - 1, textlessPages = 0;
const warnings = new Set(); const warn = code => warnings.add(code);
const ocr = createOcr(warn, detailed);
function append(text, location, extra = {}) {
  text = text.trim(); if (!text) return;
  if (size + text.length > 2000000 || segments.length >= 20000) { warn('text_limit'); return; } size += text.length;
  segments.push({ text, location, ...extra });
}
try {
if (['.txt', '.md'].includes(extension)) {
  new TextDecoder('utf-8', { fatal: true }).decode(bytes).split(/\r?\n/).forEach((text, i) => append(text, `Línea ${i + 1}`, { line: i + 1 }));
} else if (extension === '.csv') {
  const { parse } = await import('csv-parse/sync');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const first = text.split(/\r?\n/)[0];
  const delimiter = (first.match(/;/g) ?? []).length > (first.match(/,/g) ?? []).length ? ';' : ',';
  parse(text, { bom: true, delimiter, max_record_size: 100000, relax_column_count: true }).forEach((row, i) => append(row.join(' | '), `Registro ${i + 1}`, { row: i + 1 }));
} else if (extension === '.docx') {
  const zip = await openOfficeZip(bytes);
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer: bytes });
  result.value.split(/\n\s*\n/).forEach((text, i) => append(text, `Párrafo ${i + 1}`, { paragraph: i + 1 }));
  if (Object.keys(zip.files).some(p => p.startsWith('word/media/'))) warn('embedded_images_unread');
} else if (extension === '.xlsx') {
  const zip = await openOfficeZip(bytes);
  if (Object.keys(zip.files).some(p => p.startsWith('xl/media/'))) warn('embedded_images_unread');
  const { default: Excel } = await import('exceljs'); const workbook = new Excel.Workbook();
  await workbook.xlsx.load(bytes, { ignoreNodes: ['drawing', 'picture', 'extLst', 'dataValidations', 'conditionalFormatting'] });
  workbook.eachSheet(sheet => sheet.eachRow((row, i) => {
    const values = []; row.eachCell(cell => values.push(`${cell.address}: ${cell.text}`));
    append(values.join(' | '), `Hoja «${sheet.name}», fila ${i}`, { sheet: sheet.name, row: i });
  }));
} else if (extension === '.pdf') {
  const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { createCanvas } = await import('@napi-rs/canvas');
  const task = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 });
  try {
    const pdf = await task.promise; pages = pdf.numPages; if (pages > 1000) throw new Error('PAGE_LIMIT');
    if (startPage > pages) throw new Error("PAGE_RANGE");
    for (let n = startPage; n <= pages; n++) {
      const page = await pdf.getPage(n), content = await page.getTextContent();
      const text = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('');
      const operators = await page.getOperatorList();
      const hasImages = operators.fnArray.some(op => [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject].includes(op));
      if ((!text.trim() || hasImages || detailed) && !ocr.available()) { nextPage = n; page.cleanup(); break; }
      append(text, `Página ${n}`, { page: n });
      if (detailed) {
        try {
          const base = page.getViewport({scale:1}), scale = Math.min(4, 6000/base.width, 6000/base.height), viewport = page.getViewport({scale});
          const count = await readPlanRegions(Math.ceil(viewport.width), Math.ceil(viewport.height), async region => {
            const canvas = createCanvas(region.width, region.height);
            await page.render({canvasContext:canvas.getContext('2d'), viewport, transform:[1,0,0,1,-region.left,-region.top]}).promise;
            return canvas.toBuffer('image/png');
          }, `Página ${n}`, {page:n}, ocr, append, warn);
          if (!count && !text.trim()) textlessPages++;
        } catch { warn('ocr_unavailable'); textlessPages++; }
      } else if (!text.trim() || hasImages) {
        try {
          const base = page.getViewport({ scale: 1 }), scale = Math.min(2, 2600 / base.width, 3500 / base.height), viewport = page.getViewport({ scale });
          const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
          const result = await ocr.recognize(canvas.toBuffer('image/png'), `Página ${n}`, { page: n });
          if (result) append(result.text, result.location, result); else textlessPages++;
        } catch { warn('ocr_unavailable'); textlessPages++; }
      }
      pageEnd = n; page.cleanup();
    }
  } finally { await task.destroy(); }
} else if (extension === '.pptx') {
  pages = await readPptx(bytes, append, ocr, warn);
} else if (extension === '.ppt') {
  const slides = readLegacyPpt(bytes); pages = slides.length;
  for (const slide of slides) append(slide.text, slide.location, { slide: slide.slide });
  // Text from live slides is supported; legacy embedded images/objects are not.
  warn('legacy_ppt_partial');
} else if (/^\.(png|jpe?g|webp|tiff?|gif)$/.test(extension)) {
  const metadata = await sharp(bytes, { limitInputPixels: 40000000 }).metadata(); pages = metadata.pages ?? 1;
  if (pages > 1000 || startPage > pages) throw new Error("PAGE_RANGE");
  for (let page = startPage - 1; page < pages; page++) {
    if (!ocr.available()) { nextPage = page + 1; break; }
    const input = await sharp(bytes, { page, pages: 1, limitInputPixels: 40000000 }).png().toBuffer();
    if (detailed) {
      const meta = await sharp(input).metadata();
      const count = await readPlanRegions(meta.width, meta.height, region => sharp(input).extract({left:region.left,top:region.top,width:region.width,height:region.height}).png().toBuffer(), `Imagen, página ${page+1}`, {page:page+1}, ocr, append, warn, 1000);
      if (!count) textlessPages++;
    } else {
      const result = await ocr.recognize(input, pages > 1 ? `Imagen, página ${page + 1}` : 'Imagen', { page: page + 1 });
      if (result) append(result.text, result.location, result); else textlessPages++;
    }
    pageEnd = page + 1;
  }
} else throw new Error('UNSUPPORTED');
} finally { await ocr.close(); }
process.stdout.write('\nAIFORMA_RESULT:' + JSON.stringify({ segments, pages: pages || undefined, nextPage, ...((extension === ".pdf" || /^\.(png|jpe?g|webp|tiff?|gif)$/.test(extension)) ? { pageStart: startPage, pageEnd } : {}), textlessPages, partial: warnings.size > 0, warnings: [...warnings], status: segments.length ? 'parsed' : 'no_text' }));
