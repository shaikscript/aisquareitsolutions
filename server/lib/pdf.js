/**
 * Minimal, dependency-free PDF writer used to generate starter guideline
 * documents and printable result sheets. Produces a valid PDF 1.4 file with
 * Helvetica text, automatic line wrapping and pagination.
 */

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 56;
const LINE_H = 15.5;
const BODY_SIZE = 10.5;

const escapeText = (value) =>
  String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, ' ');

function wrap(text, maxChars) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (!line) {
      line = word;
    } else if ((line + ' ' + word).length <= maxChars) {
      line += ` ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

export function buildPdf({ title, subtitle = '', sections = [] }) {
  const pages = [];
  let ops = [];
  let y = PAGE_H - MARGIN;

  const newPage = () => {
    if (ops.length) pages.push(ops.join('\n'));
    ops = [];
    y = PAGE_H - MARGIN;
  };

  const writeLine = (text, { size = BODY_SIZE, bold = false, gap = 0, color = '0.13 0.13 0.15' } = {}) => {
    if (y < MARGIN + 40) newPage();
    ops.push(
      `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${color} rg 1 0 0 1 ${MARGIN} ${y.toFixed(2)} Tm (${escapeText(text)}) Tj ET`
    );
    y -= size * 1.42 + gap;
  };

  writeLine('AISQUARE IT SOLUTIONS', { size: 9, bold: true, color: '0.45 0.35 0.85' });
  y -= 6;
  for (const line of wrap(title, 62)) writeLine(line, { size: 20, bold: true });
  if (subtitle) {
    y -= 2;
    for (const line of wrap(subtitle, 92)) writeLine(line, { size: 10, color: '0.42 0.42 0.48' });
  }
  y -= 12;
  ops.push(`${MARGIN} ${y.toFixed(2)} m ${(PAGE_W - MARGIN).toFixed(2)} ${y.toFixed(2)} l S`);
  y -= 22;

  for (const section of sections) {
    if (section.heading) {
      y -= 6;
      for (const line of wrap(section.heading, 66)) writeLine(line, { size: 13, bold: true });
      y -= 2;
    }
    for (const paragraph of section.paragraphs || []) {
      for (const line of wrap(paragraph, 98)) writeLine(line);
      y -= 6;
    }
    if (section.bullets?.length) {
      for (const bullet of section.bullets) {
        const lines = wrap(bullet, 94);
        lines.forEach((line, index) => writeLine(`${index === 0 ? '•  ' : '    '}${line}`));
      }
      y -= 6;
    }
  }

  writeLine(
    `Document generated ${new Date().toISOString().slice(0, 10)} · Property of AI Square IT Solutions. Internal use only.`,
    { size: 8, color: '0.55 0.55 0.6' }
  );
  if (ops.length) pages.push(ops.join('\n'));

  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };

  const font1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const font2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

  const pageIds = [];
  const contentIds = [];

  for (const content of pages) {
    const stream = content;
    const contentId = add(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
    contentIds.push(contentId);
    pageIds.push(null); // placeholder index kept in sync below
  }

  const pagesId = objects.length + pages.length * 2 + 1; // computed after page objects added
  const kids = [];

  pages.forEach((_, index) => {
    const pageId = add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W.toFixed(2)} ${PAGE_H.toFixed(2)}] ` +
        `/Resources << /Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >> >> /Contents ${contentIds[index]} 0 R >>`
    );
    kids.push(`${pageId} 0 R`);
  });

  const pagesObjId = add(`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`);
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesObjId} 0 R >>`);

  let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, 'latin1');
}
