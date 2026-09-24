import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import JSZip from 'jszip';
import CFB from 'cfb';
import sharp from 'sharp';
import { parseDocument } from '../lib/documents/parser.ts';
import { findExcerpts } from '../lib/search/engine.ts';
import { readLegacyPpt } from '../scripts/legacy-ppt.mjs';

// Synthetic TEST-only documents: never used as project data.
function testImage() {
  const c=createCanvas(1400,250),ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1400,250);ctx.fillStyle='#000';ctx.font='48px Arial';ctx.fillText('TEST INFORME MECANICA DE SUELOS',30,120);return c.toBuffer('image/png');
}
test('photos and images use local OCR with provenance; a blank image yields no invented text',async()=>{
  const doc=await parseDocument(testImage(),'TEST-photo.png');assert.equal(doc.status,'parsed');
  const hit=findExcerpts(doc,[['mecanica','suelos']])[0];assert.ok(hit);assert.equal(hit.method,'ocr');assert.match(hit.location,/Imagen.*OCR/);assert.ok(hit.confidence>75);
  const canvas=createCanvas(500,300);const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,500,300);
  const blank=await parseDocument(canvas.toBuffer('image/png'),'TEST-blank.png');assert.equal(blank.status,'no_text');assert.equal(blank.segments.length,0);
});

test('scanned PDF pages and TIFF scans yield OCR citations at the actual page',async()=>{
  const jpg=await sharp(testImage()).jpeg().toBuffer(), command='q 560 0 0 100 10 500 cm /Im1 Do Q';
  const objects=[Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 700] /Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>'),Buffer.from(`<< /Length ${command.length} >>\nstream\n${command}\nendstream`),Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width 1400 /Height 250 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`),jpg,Buffer.from('\nendstream')])];
  const chunks=[Buffer.from('%PDF-1.4\n')],offsets=[];for(let i=0;i<objects.length;i++){offsets.push(chunks.reduce((n,b)=>n+b.length,0));chunks.push(Buffer.from(`${i+1} 0 obj\n`),objects[i],Buffer.from('\nendobj\n'));}
  const xref=chunks.reduce((n,b)=>n+b.length,0);chunks.push(Buffer.from(`xref\n0 6\n0000000000 65535 f \n${offsets.map(n=>String(n).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`));
  const doc=await parseDocument(Buffer.concat(chunks),'TEST-scan.pdf'),hit=findExcerpts(doc,[['mecanica','suelos']])[0];assert.ok(hit);assert.equal(hit.page,1);assert.equal(hit.method,'ocr');assert.match(hit.location,/Página 1/);
  const tiff=await parseDocument(await sharp(testImage()).tiff().toBuffer(),'TEST-scan.tiff');assert.ok(findExcerpts(tiff,[['mecanica','suelos']]).length);
});

test('PPTX uses presentation order, preserves text context and slide locations, and reads slide images with OCR',async()=>{
  const zip=new JSZip();
  zip.file('ppt/presentation.xml','<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId r:id="SECOND"/><p:sldId r:id="FIRST"/></p:sldIdLst></p:presentation>');
  zip.file('ppt/_rels/presentation.xml.rels','<Relationships><Relationship Id="FIRST" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="SECOND" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/></Relationships>');
  zip.file('ppt/slides/slide2.xml','<p:sld xmlns:p="p" xmlns:a="a" xmlns:r="r"><a:p><a:r><a:t>TEST suelo de arcilla; </a:t></a:r><a:r><a:t>pendiente de validación.</a:t></a:r></a:p><a:blip r:embed="IMG"/></p:sld>');
  zip.file('ppt/slides/_rels/slide2.xml.rels','<Relationships><Relationship Id="IMG" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>');
  zip.file('ppt/media/image1.png',testImage());
  zip.file('ppt/slides/slide1.xml','<p:sld xmlns:p="p" xmlns:a="a"><a:p><a:r><a:t>TEST segunda diapositiva</a:t></a:r></a:p></p:sld>');
  zip.file('ppt/slides/slide999.xml','<p:sld><a:t>TEST deleted slide MUST NOT APPEAR</a:t></p:sld>');
  const doc=await parseDocument(await zip.generateAsync({type:'nodebuffer'}),'TEST.pptx');
  assert.equal(doc.pages,2);assert.match(doc.segments[0].text,/arcilla; pendiente de validación/);assert.equal(doc.segments[0].slide,1);
  const hit=findExcerpts(doc,[['mecanica','suelos']])[0];assert.ok(hit);assert.match(hit.location,/Diapositiva 1, imagen 1.*OCR/);
  assert.ok(doc.segments.some(s=>s.slide===2&&s.text.includes('segunda')));assert.ok(!JSON.stringify(doc).includes('MUST NOT APPEAR'));
});

function record(type,body,flags=0) { const h=Buffer.alloc(8);h.writeUInt16LE(flags);h.writeUInt16LE(type,2);h.writeUInt32LE(body.length,4);return Buffer.concat([h,body]); }
function testPpt() {
  const parts=[record(4000,Buffer.from('TEST HISTORICAL DELETED TEXT','utf16le'))];
  const append=buffer=>{const offset=parts.reduce((s,b)=>s+b.length,0);parts.push(buffer);return offset;};
  const slide=append(record(1006,record(4000,Buffer.from('TEST texto de la diapositiva vigente','utf16le')),15));
  const persist=Buffer.alloc(20);persist.writeUInt32LE(2);
  const doc=append(record(1000,record(4080,record(1011,persist),15),15));
  const entries=Buffer.alloc(12);entries.writeUInt32LE((2<<20)|1);entries.writeUInt32LE(doc,4);entries.writeUInt32LE(slide,8);
  const dir=append(record(6002,entries)),editBody=Buffer.alloc(28);editBody.writeUInt32LE(dir,12);editBody.writeUInt32LE(1,16);
  const edit=append(record(4085,editBody));const user=Buffer.alloc(24);user.writeUInt32LE(20);user.writeUInt32LE(0xe391c05f,4);user.writeUInt32LE(edit,8);
  const c=CFB.utils.cfb_new();CFB.utils.cfb_add(c,'Current User',record(4086,user));CFB.utils.cfb_add(c,'PowerPoint Document',Buffer.concat(parts));return CFB.write(c,{type:'buffer'});
}
test('legacy PPT follows current persisted slide references, excludes stale text, and reports unavailable images',async()=>{
  const bytes=testPpt(),slides=readLegacyPpt(bytes);assert.equal(slides.length,1);assert.ok(!JSON.stringify(slides).includes('HISTORICAL'));
  const parsed=await parseDocument(bytes,'TEST.ppt');assert.equal(parsed.segments[0].slide,1);assert.ok(parsed.warnings.includes('legacy_ppt_partial'));assert.equal(parsed.partial,true);
});

test('PPTX external image URLs are never fetched or treated as verified content',async()=>{
  const zip=new JSZip();zip.file('ppt/presentation.xml','<p:presentation><p:sldId r:id="S"/></p:presentation>');
  zip.file('ppt/_rels/presentation.xml.rels','<Relationships><Relationship Id="S" Type="x/slide" Target="slides/a.xml"/></Relationships>');
  zip.file('ppt/slides/a.xml','<p:sld><a:p><a:r><a:t>TEST verified digital text</a:t></a:r></a:p><a:blip r:link="E"/></p:sld>');
  zip.file('ppt/slides/_rels/a.xml.rels','<Relationships><Relationship Id="E" Type="x/image" Target="https://example.invalid/private" TargetMode="External"/></Relationships>');
  const doc=await parseDocument(await zip.generateAsync({type:'nodebuffer'}),'TEST.pptx');assert.equal(doc.partial,true);assert.ok(doc.warnings.includes('presentation_partial'));assert.equal(doc.segments.length,1);
});
