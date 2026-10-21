// gtm.contracts (WP-4.19): the quote document sent to DocuSign and offered as a download. The repo has no PDF library
// (WP-4.9 found the same), so this writes a plain PDF 1.4 by hand: A4 pages of Helvetica text lines, no images. Text is
// limited to Latin-1; anything else becomes "?" so the file stays valid.

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 56;
const LINE_HEIGHT = 16;
const LINES_PER_PAGE = Math.floor((PAGE_HEIGHT - 2 * MARGIN) / LINE_HEIGHT);
const MAX_CHARS = 90;

export type PdfLine = { text: string; bold?: boolean; size?: number };

function latin1(text: string) {
  return [...text].map((char) => (char.charCodeAt(0) <= 0xff ? char : '?')).join('');
}

function escapePdf(text: string) {
  return latin1(text).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[\r\n]/g, ' ');
}

/** Splits long lines at word boundaries so nothing runs off the page. */
function wrap(lines: PdfLine[]) {
  const out: PdfLine[] = [];
  for (const line of lines) {
    const words = line.text.split(/\s+/);
    let current = '';
    for (const word of words) {
      if ((current ? `${current} ${word}` : word).length > MAX_CHARS && current) {
        out.push({ ...line, text: current });
        current = word;
      } else current = current ? `${current} ${word}` : word;
    }
    out.push({ ...line, text: current });
  }
  return out;
}

export function renderPdf(lines: PdfLine[]): Buffer {
  const wrapped = wrap(lines);
  const pages: PdfLine[][] = [];
  for (let index = 0; index < wrapped.length; index += LINES_PER_PAGE) pages.push(wrapped.slice(index, index + LINES_PER_PAGE));
  if (pages.length === 0) pages.push([]);

  // Objects: 1 catalog, 2 pages, 3 Helvetica, 4 Helvetica-Bold, then (page, content) per page.
  const objects: string[] = [];
  const pageIds = pages.map((_, index) => 5 + index * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  pages.forEach((pageLines, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    const body = pageLines
      .map((line, row) => `BT /${line.bold ? 'F2' : 'F1'} ${line.size ?? 11} Tf ${MARGIN} ${PAGE_HEIGHT - MARGIN - row * LINE_HEIGHT} Td (${escapePdf(line.text)}) Tj ET`)
      .join('\n');
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(body, 'latin1')} >>\nstream\n${body}\nendstream`;
  });

  let pdf = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(pdf, 'latin1');
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
