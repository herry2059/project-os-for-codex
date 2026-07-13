import fs from 'node:fs';
import PDFDocument from 'pdfkit';

const FONT_CANDIDATES = [
  process.env.PROJECT_OS_PDF_FONT ? { file: process.env.PROJECT_OS_PDF_FONT, family: process.env.PROJECT_OS_PDF_FONT_FAMILY } : null,
  { file: '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf' },
  { file: '/usr/share/fonts/opentype/noto/NotoSans-Regular.otf' },
  { file: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf' },
  { file: '/Library/Fonts/Arial Unicode.ttf' },
  { file: '/System/Library/Fonts/Supplemental/Arial Unicode.ttf' },
].filter(Boolean);

function findFont() {
  return FONT_CANDIDATES.find((font) => fs.existsSync(font.file)) || null;
}

function textOf(value, fallback = '') {
  return String(value || fallback).replace(/\r\n/g, '\n');
}

function writeWrapped(doc, text, options = {}) {
  doc.text(textOf(text), { width: options.width || 500, lineGap: options.lineGap ?? 4 });
}

export async function knowledgePdfBuffer({ title = 'Team Knowledge Export', items = [], generatedAt = new Date() }) {
  const font = findFont();
  if (!font) {
    const err = new Error('A Unicode font is required. Install Noto Sans or set PROJECT_OS_PDF_FONT.');
    err.statusCode = 500;
    throw err;
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 54, bottom: 54, left: 48, right: 48 },
      info: { Title: title, Author: 'Project OS for Codex' },
    });
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('unicode', font.file, font.family);
    doc.font('unicode');
    doc.fontSize(22).fillColor('#111111').text(title);
    doc.moveDown(0.4);
    doc.fontSize(10).fillColor('#666666').text(`Exported: ${generatedAt.toLocaleString('en-US')}`);
    doc.text(`Entries: ${items.length}`);
    doc.moveDown(1.4);

    doc.fontSize(15).fillColor('#111111').text('Contents');
    doc.moveDown(0.4);
    items.forEach((item, idx) => {
      doc.fontSize(10).fillColor('#333333').text(`${idx + 1}. ${item.aiTitle || item.title || 'Untitled knowledge'}`);
    });

    items.forEach((item, idx) => {
      doc.addPage();
      const titleText = item.aiTitle || item.title || 'Untitled knowledge';
      const summary = item.aiSummary || item.body || '';
      const detail = item.aiDetail || item.body || '';
      const meta = [
        item.type,
        item.businessLine,
        item.visibility ? `Visibility: ${item.visibility}` : '',
        item.status ? `Status: ${item.status}` : '',
        item.source ? `Source: ${item.source}` : '',
      ].filter(Boolean);

      doc.fontSize(10).fillColor('#777777').text(`Entry ${idx + 1} of ${items.length}`);
      doc.moveDown(0.3);
      doc.fontSize(18).fillColor('#111111');
      writeWrapped(doc, titleText, { lineGap: 6 });
      doc.moveDown(0.4);
      doc.fontSize(9).fillColor('#666666');
      writeWrapped(doc, meta.join('  ·  '));
      if (Array.isArray(item.tags) && item.tags.length) {
        writeWrapped(doc, `Tags: ${item.tags.join(', ')}`);
      }
      doc.moveDown(0.8);

      doc.fontSize(12).fillColor('#111111').text('Summary');
      doc.moveDown(0.2);
      doc.fontSize(10).fillColor('#333333');
      writeWrapped(doc, summary || 'No summary available.');
      doc.moveDown(0.9);

      doc.fontSize(12).fillColor('#111111').text('Details');
      doc.moveDown(0.2);
      doc.fontSize(10).fillColor('#333333');
      writeWrapped(doc, detail || 'No details available.', { lineGap: 5 });
    });

    doc.end();
  });
}
