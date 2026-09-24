import CFB from 'cfb';

// MS-PPT 2.1.2 / 2.3: resolve ONLY the live persist directory, never deleted slides
// or historical text left in the compound stream by incremental saves.
export function readLegacyPpt(bytes) {
  const compound = CFB.read(bytes, { type: 'buffer' });
  const user = Buffer.from(CFB.find(compound, 'Current User')?.content ?? []);
  const data = Buffer.from(CFB.find(compound, 'PowerPoint Document')?.content ?? []);
  if (user.length < 20 || user.readUInt16LE(2) !== 0x0ff6 || user.readUInt32LE(12) !== 0xe391c05f) throw new Error('PPT_ENCRYPTED_OR_INVALID');
  function record(offset, end = data.length) {
    if (!Number.isInteger(offset) || offset < 0 || offset + 8 > end) throw new Error('PPT_RECORD');
    const flags = data.readUInt16LE(offset), length = data.readUInt32LE(offset + 4);
    if (offset + 8 + length > end) throw new Error('PPT_RECORD');
    return { type: data.readUInt16LE(offset + 2), instance: flags >>> 4, container: (flags & 15) === 15, start: offset + 8, end: offset + 8 + length, length };
  }
  function children(r) { const list = []; for (let p = r.start; p < r.end;) { const c = record(p, r.end); list.push(c); p = c.end; } return list; }
  const directory = new Map(), edits = new Set(); let offset = user.readUInt32LE(16), documentId;
  while (offset) {
    if (edits.has(offset) || edits.size > 10000) throw new Error('PPT_EDIT'); edits.add(offset);
    const edit = record(offset); if (edit.type !== 0x0ff5 || ![28, 32].includes(edit.length)) throw new Error('PPT_EDIT');
    if (edit.length === 32 && data.readUInt32LE(edit.start + 28)) throw new Error('PPT_ENCRYPTED');
    documentId ??= data.readUInt32LE(edit.start + 16);
    const previous = data.readUInt32LE(edit.start + 8), dirOffset = data.readUInt32LE(edit.start + 12);
    if (previous >= offset || dirOffset >= offset || dirOffset <= previous) throw new Error('PPT_EDIT');
    const dir = record(dirOffset); if (dir.type !== 0x1772) throw new Error('PPT_DIRECTORY');
    for (let p = dir.start; p < dir.end;) {
      if (p + 4 > dir.end) throw new Error('PPT_DIRECTORY');
      const header = data.readUInt32LE(p); p += 4; const id = header & 0xfffff, count = header >>> 20;
      if (!count || p + count * 4 > dir.end) throw new Error('PPT_DIRECTORY');
      for (let n = 0; n < count; n++, p += 4) if (!directory.has(id + n)) directory.set(id + n, data.readUInt32LE(p));
    }
    offset = previous;
  }
  const document = record(directory.get(documentId)); if (document.type !== 1000) throw new Error('PPT_DOCUMENT');
  const slideList = children(document).find(r => r.type === 4080 && r.instance === 0);
  if (!slideList) throw new Error('PPT_SLIDES');
  const slides = []; let slide;
  const textOf = r => r.type === 4000 ? data.subarray(r.start, r.end).toString('utf16le') : r.type === 4008 ? data.subarray(r.start, r.end).toString('latin1') : '';
  for (const r of children(slideList)) {
    if (r.type === 1011) { if (r.length < 20) throw new Error('PPT_SLIDE'); slide = { id: data.readUInt32LE(r.start), parts: [] }; slides.push(slide); }
    else if (slide && [4000, 4008].includes(r.type)) slide.parts.push(textOf(r));
  }
  function texts(r, depth = 0) {
    if (depth > 64) throw new Error('PPT_DEPTH');
    if ([4000, 4008].includes(r.type)) return [textOf(r)];
    // OfficeArtClientTextbox has nested PPT atoms despite recVer=0.
    return r.container || r.type === 0xf00d ? children(r).flatMap(c => texts(c, depth + 1)) : [];
  }
  return slides.map((s, index) => {
    const live = record(directory.get(s.id)); if (live.type !== 1006) throw new Error('PPT_SLIDE');
    return { text: [...new Set([...s.parts, ...texts(live)])].join('\n'), location: `Diapositiva ${index + 1} (PPT, texto digital)`, slide: index + 1 };
  });
}
