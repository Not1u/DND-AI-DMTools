export function pdfFixture(text = 'Moonstone caverns secret passage', chinese = false) {
  const value = chinese ? '<' + Array.from(text).map(c => c.charCodeAt(0).toString(16).padStart(4, '0')).join('') + '>' : '(' + text + ')';
  const stream = 'BT /F1 18 Tf 40 120 Td ' + value + ' Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', '<< /Length ' + Buffer.byteLength(stream) + ' >>\nstream\n' + stream + '\nendstream'];
  if (chinese) {
    objects[3] = '<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [6 0 R] >>';
    objects.push('<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> /FontDescriptor 7 0 R >>');
    objects.push('<< /Type /FontDescriptor /FontName /STSong-Light /Flags 6 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 800 /Descent -200 /CapHeight 700 /StemV 80 >>');
  }
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += (i + 1) + ' 0 obj\n' + obj + '\nendobj\n'; });
  const xref = Buffer.byteLength(pdf);
  pdf += 'xref\n0 ' + offsets.length + '\n0000000000 65535 f \n' + offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size ' + offsets.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
  return Buffer.from(pdf);
}

