// Isolated parser adapted from Nexo AI. No network or credentials are passed in.
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
const [file, name] = process.argv.slice(2);
const bytes = await readFile(file), extension = extname(name).toLowerCase();
if (bytes.length > 25 * 1024 * 1024) throw new Error('FILE_LIMIT');
const segments = []; let size = 0, pages, textlessPages = 0;
function append(text, location, extra = {}) {
  text = text.trim(); if (!text) return;
  size += text.length; if (size > 2000000 || segments.length >= 20000) throw new Error('TEXT_LIMIT');
  segments.push({ text, location, ...extra });
}
if (['.txt', '.md'].includes(extension)) {
  new TextDecoder('utf-8', { fatal: true }).decode(bytes).split(/\r?\n/).forEach((text, i) => append(text, `Línea ${i + 1}`, { line: i + 1 }));
} else if (extension === '.csv') {
  const { parse } = await import('csv-parse/sync');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const first = text.split(/\r?\n/)[0];
  const delimiter = (first.match(/;/g) ?? []).length > (first.match(/,/g) ?? []).length ? ';' : ',';
  parse(text, { bom: true, delimiter, max_record_size: 100000, relax_column_count: true }).forEach((row, i) => append(row.join(' | '), `Registro ${i + 1}`, { row: i + 1 }));
} else if (extension === '.docx') {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer: bytes });
  result.value.split(/\n\s*\n/).forEach((text, i) => append(text, `Párrafo ${i + 1}`, { paragraph: i + 1 }));
} else if (extension === '.xlsx') {
  const { default: Excel } = await import('exceljs'); const workbook = new Excel.Workbook();
  await workbook.xlsx.load(bytes, { ignoreNodes: ['drawing', 'picture', 'extLst', 'dataValidations', 'conditionalFormatting'] });
  workbook.eachSheet(sheet => sheet.eachRow((row, i) => {
    const values = []; row.eachCell(cell => values.push(`${cell.address}: ${cell.text}`));
    append(values.join(' | '), `Hoja «${sheet.name}», fila ${i}`, { sheet: sheet.name, row: i });
  }));
} else if (extension === '.pdf') {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 });
  try {
    const pdf = await task.promise; pages = pdf.numPages; if (pages > 1000) throw new Error('PAGE_LIMIT');
    for (let n = 1; n <= pages; n++) {
      const page = await pdf.getPage(n), content = await page.getTextContent();
      const text = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('');
      if (!text.trim()) textlessPages++;
      append(text, `Página ${n}`, { page: n }); page.cleanup();
    }
  } finally { await task.destroy(); }
} else throw new Error('UNSUPPORTED');
process.stdout.write(JSON.stringify({ segments, pages, textlessPages, status: segments.length ? 'parsed' : extension === '.pdf' ? 'ocr_required' : 'no_text' }));
