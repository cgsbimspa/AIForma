import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { posix } from 'node:path';

const parser = new XMLParser({ ignoreAttributes: false, preserveOrder: true, trimValues: false, parseTagValue: false, processEntities: true });
export async function openOfficeZip(bytes) {
  const zip = await JSZip.loadAsync(bytes); const files = Object.values(zip.files);
  if (files.length > 10000 || files.reduce((n, f) => n + (f._data?.uncompressedSize ?? 0), 0) > 100000000) throw new Error('ZIP_LIMIT');
  return zip;
}
async function xml(zip, path) {
  const entry = zip.file(path); if (!entry) throw new Error('XML_MISSING');
  const text = await entry.async('string'); if (text.length > 12000000 || /<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('XML_LIMIT');
  return parser.parse(text);
}
function nodes(tree, name) {
  const found = [];
  for (const node of tree ?? []) for (const [key, value] of Object.entries(node)) {
    if (key === name) found.push({ attributes: node[':@'] ?? {}, children: value });
    if (key !== ':@' && Array.isArray(value)) found.push(...nodes(value, name));
  }
  return found;
}
const contents = tree => (tree ?? []).map(n => n['#text'] ?? '').join('');
async function relations(zip, path) {
  const relPath = posix.join(posix.dirname(path), '_rels', posix.basename(path) + '.rels');
  if (!zip.file(relPath)) return new Map();
  return new Map(nodes(await xml(zip, relPath), 'Relationship').map(n => {
    const a = n.attributes, target = a['@_Target'];
    if (a['@_TargetMode'] === 'External' || typeof target !== 'string' || target.includes('\\') || /^[a-z]+:/i.test(target)) return [a['@_Id'], { external: true, type: a['@_Type'] }];
    const resolved = target.startsWith('/') ? target.slice(1) : posix.normalize(posix.join(posix.dirname(path), target));
    if (resolved.startsWith('../')) throw new Error('XML_PATH');
    return [a['@_Id'], { path: resolved, type: a['@_Type'] }];
  }));
}
export async function readPptx(bytes, append, ocr, warn) {
  const zip = await openOfficeZip(bytes), presentation = await xml(zip, 'ppt/presentation.xml'), rels = await relations(zip, 'ppt/presentation.xml');
  const slides = nodes(presentation, 'p:sldId'); if (slides.length > 1000) throw new Error('SLIDE_LIMIT');
  for (let index = 0; index < slides.length; index++) {
    const slide = index + 1, relationship = rels.get(slides[index].attributes['@_r:id']);
    if (!relationship?.path || !relationship.type?.endsWith('/slide')) { warn('presentation_partial'); continue; }
    const tree = await xml(zip, relationship.path), slideRels = await relations(zip, relationship.path);
    let paragraph = 0;
    for (const p of nodes(tree, 'a:p')) { paragraph++; append(nodes(p.children, 'a:t').map(n => contents(n.children)).join(''), `Diapositiva ${slide}, párrafo ${paragraph}`, { slide, paragraph }); }
    let imageIndex = 0;
    for (const blip of nodes(tree, 'a:blip')) {
      imageIndex++;
      const image = slideRels.get(blip.attributes['@_r:embed']);
      if (!image?.path || !zip.file(image.path)) { warn('presentation_partial'); continue; }
      const recognized = await ocr.recognize(await zip.file(image.path).async('nodebuffer'), `Diapositiva ${slide}, imagen ${imageIndex}`, { slide });
      if (recognized) append(recognized.text, recognized.location, recognized);
    }
    if (nodes(tree, 'c:chart').length || nodes(tree, 'dgm:relIds').length || nodes(tree, 'p:oleObj').length) warn('presentation_partial');
    // Speaker notes are explicitly distinguished from visible slide text.
    for (const rel of slideRels.values()) if (rel.type?.endsWith('/notesSlide') && rel.path) {
      const notes = await xml(zip, rel.path);
      for (const shape of nodes(notes, 'p:sp')) {
        const placeholder = nodes(shape.children, 'p:ph')[0];
        if (placeholder && placeholder.attributes['@_type'] !== 'body') continue;
        append(nodes(shape.children, 'a:t').map(n => contents(n.children)).join(' '), `Diapositiva ${slide}, notas del presentador`, { slide });
      }
    }
  }
  return slides.length;
}
