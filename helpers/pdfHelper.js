const PDFDocument = require('pdfkit');

const PAGE_MARGIN = 50;
const PAGE_WIDTH = 595.28; // A4 pt
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;

const COLORS = {
  primary: '#1f4d3c',
  text: '#21281f',
  muted: '#5c6459',
  border: '#dde3da',
  headerBg: '#eaeee8',
};

const money = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN')}`;

const periodLabel = (bill) => {
  if (bill.periodType === 'custom') {
    return `${bill.fromDate} to ${bill.toDate}`;
  }
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${MONTHS[bill.month - 1]} ${bill.year}`;
};

/**
 * Streams a formatted invoice PDF for the given bill+customer+company into the response.
 * Uses a proper aligned table (fixed column x-positions, header band, row borders,
 * right-aligned numeric columns) rather than manually walked continued-text.
 */
const streamBillPDF = (res, { company, customer, bill }) => {
  const doc = new PDFDocument({ margin: PAGE_MARGIN, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  const filenamePeriod = bill.periodType === 'custom' ? `${bill.fromDate}_to_${bill.toDate}` : `${bill.month}-${bill.year}`;
  res.setHeader('Content-Disposition', `attachment; filename=invoice-${bill.invoiceNumber || customer.name}-${filenamePeriod}.pdf`);
  doc.pipe(res);

  // ---------- Header band: company on left, invoice meta on right ----------
  const headerTop = doc.y;
  doc.fillColor(COLORS.primary).fontSize(20).font('Helvetica-Bold').text(company.name, PAGE_MARGIN, headerTop);
  doc.fillColor(COLORS.muted).fontSize(9).font('Helvetica');
  if (company.address) doc.text(company.address, PAGE_MARGIN, doc.y, { width: 280 });
  if (company.phone) doc.text(`Phone: ${company.phone}`, PAGE_MARGIN, doc.y, { width: 280 });

  const metaX = PAGE_MARGIN + 320;
  doc.fillColor(COLORS.text).fontSize(16).font('Helvetica-Bold').text('INVOICE', metaX, headerTop, { width: 175, align: 'right' });
  doc.fontSize(10).font('Helvetica').fillColor(COLORS.muted);
  doc.text(`No: ${bill.invoiceNumber || '-'}`, metaX, doc.y, { width: 175, align: 'right' });
  doc.text(`Date: ${new Date(bill.generatedAt).toLocaleDateString('en-IN')}`, metaX, doc.y, { width: 175, align: 'right' });
  doc.text(`Period: ${periodLabel(bill)}`, metaX, doc.y, { width: 175, align: 'right' });

  doc.moveDown(1.5);
  doc.moveTo(PAGE_MARGIN, doc.y).lineTo(PAGE_MARGIN + CONTENT_WIDTH, doc.y).strokeColor(COLORS.border).stroke();
  doc.moveDown(1);

  // ---------- Bill-to ----------
  doc.fillColor(COLORS.muted).fontSize(9).font('Helvetica-Bold').text('BILL TO', PAGE_MARGIN, doc.y);
  doc.fillColor(COLORS.text).fontSize(11).font('Helvetica-Bold').text(customer.name, PAGE_MARGIN, doc.y + 2);
  doc.fillColor(COLORS.muted).fontSize(10).font('Helvetica');
  doc.text(customer.phone || '', PAGE_MARGIN, doc.y);
  doc.text(customer.area || '', PAGE_MARGIN, doc.y);
  doc.moveDown(1.5);

  // ---------- Table ----------
  const cols = [
    { label: 'Meal', x: PAGE_MARGIN, width: 190, align: 'left' },
    { label: 'Count', x: PAGE_MARGIN + 190, width: 90, align: 'right' },
    { label: 'Rate', x: PAGE_MARGIN + 280, width: 90, align: 'right' },
    { label: 'Amount', x: PAGE_MARGIN + 370, width: CONTENT_WIDTH - 370, align: 'right' },
  ];
  const rowHeight = 24;

  const drawRow = (y, cells, { bold = false, bg = null, color = COLORS.text } = {}) => {
    if (bg) {
      doc.rect(PAGE_MARGIN, y, CONTENT_WIDTH, rowHeight).fill(bg);
    }
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor(color);
    cols.forEach((col, i) => {
      doc.text(String(cells[i]), col.x + 8, y + 7, { width: col.width - 16, align: col.align });
    });
  };

  let y = doc.y;
  drawRow(y, cols.map((c) => c.label), { bold: true, bg: COLORS.headerBg });
  y += rowHeight;
  doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + CONTENT_WIDTH, y).strokeColor(COLORS.border).stroke();

  const rows = [
    ['Breakfast', bill.breakfastCount, money(bill.breakfastRate), money(bill.breakfastAmount)],
    ['Lunch', bill.lunchCount, money(bill.lunchRate), money(bill.lunchAmount)],
    ['Dinner', bill.dinnerCount, money(bill.dinnerRate), money(bill.dinnerAmount)],
  ];

  rows.forEach((row) => {
    drawRow(y, row);
    y += rowHeight;
    doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + CONTENT_WIDTH, y).strokeColor(COLORS.border).stroke();
  });

  doc.y = y + 14;

  // ---------- Totals block (right-aligned) ----------
  const totalsX = PAGE_MARGIN + 300;
  const totalsWidth = CONTENT_WIDTH - 300;
  const totalLine = (label, value, opts = {}) => {
    doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.size || 10).fillColor(opts.color || COLORS.text);
    doc.text(label, totalsX, doc.y, { continued: true, width: totalsWidth / 2, align: 'left' });
    doc.text(value, { width: totalsWidth / 2, align: 'right' });
  };

  totalLine('Total Amount', money(bill.totalAmount), { bold: true, size: 12 });
  totalLine('Amount Paid', money(bill.amountPaid));
  doc.moveDown(0.3);
  doc.moveTo(totalsX, doc.y).lineTo(PAGE_MARGIN + CONTENT_WIDTH, doc.y).strokeColor(COLORS.border).stroke();
  doc.moveDown(0.3);
  totalLine('Balance Due', money(bill.totalAmount - bill.amountPaid), { bold: true, color: COLORS.primary, size: 12 });

  doc.moveDown(1);
  const statusColor = bill.paymentStatus === 'paid' ? COLORS.primary : bill.paymentStatus === 'partial' ? '#c07d1e' : '#b23a34';
  doc.font('Helvetica-Bold').fontSize(10).fillColor(statusColor).text(`Status: ${bill.paymentStatus.toUpperCase()}`, totalsX, doc.y, { width: totalsWidth, align: 'right' });

  // ---------- Footer ----------
  doc.fontSize(8).fillColor(COLORS.muted).font('Helvetica').text(
    'Thank you for your business.',
    PAGE_MARGIN,
    doc.page.height - 60,
    { width: CONTENT_WIDTH, align: 'center' }
  );

  doc.end();
};

module.exports = { streamBillPDF };
