import sharp from 'sharp';

// Overlapping regions retain small labels at native rendering resolution.
export function planRegions(width, height, tileSize = 2200, overlap = 240) {
  const positions = length => {
    const values = [0];
    while (values.at(-1) + tileSize < length) values.push(Math.min(values.at(-1) + tileSize - overlap, length - tileSize));
    return values;
  };
  return positions(height).flatMap((top, row) => positions(width).map((left, column) => ({ left, top, width: Math.min(tileSize, width-left), height: Math.min(tileSize, height-top), row: row+1, column: column+1 })));
}
export async function readPlanRegions(width, height, render, location, extra, ocr, append, warn, tileSize = 2200) {
  const regions = planRegions(width, height, tileSize), seen = new Set();
  let read = 0;
  // Read all zones before spending the remaining budget on other orientations.
  for (const angle of [0, 30, -30, 90]) {
    for (const region of regions) {
      if (!ocr.available()) { warn('plan_regions_partial'); return read; }
      const original = await render(region);
      const input = angle ? await sharp(original).rotate(angle, {background:'#fff'}).png().toBuffer() : original;
      const label = `${location} · zona fila ${region.row}, columna ${region.column} (x ${Math.round(region.left/width*100)}–${Math.round((region.left+region.width)/width*100)} %, y ${Math.round(region.top/height*100)}–${Math.round((region.top+region.height)/height*100)} %)`;
      const result = await ocr.recognize(input, label, extra, {lines:true});
      if (!result) { warn('plan_regions_partial'); continue; }
      for (const segment of result.segments) {
        const key = `${region.row}:${region.column}:${segment.text}`;
        // Retain stronger independent recognition if a later rotation reads it better.
        const confidenceKey = `${key}:${Math.floor(segment.confidence)}`;
        if (seen.has(confidenceKey)) continue;
        seen.add(confidenceKey); append(segment.text, segment.location, segment); read++;
      }
    }
  }
  return read;
}
