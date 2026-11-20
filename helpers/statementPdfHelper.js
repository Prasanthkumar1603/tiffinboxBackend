const PDFDocument = require('pdfkit');

const M = 40;
const W = 595.28 - M * 2;
const C = { primary: '#1f4d3c', text: '#21281f', muted: '#5c6459', border: '#dde3da', head: '#eaeee8', danger: '#b23a34' };
const money = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN')}`;
const fmtDay = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  });
};

const mealCell = (cell) => {
  if (!cell) return '-';
  if (cell.status === 'cancelled') return 'Cancelled';
  return cell.qty > 1 ? `${cell.qty} x ${money(cell.rate)}` : money(cell.rate);
};

/** Streams the monthly statement PDF (multi-page safe). */
const streamStatementPDF = (res, st) => {
  const doc = new PDFDocument({ margin: M, size: 'A4', bufferPages: true });
  const safeName = String(st.customer.name || 'customer').replace(/[^a-z0-9]+/gi, '-');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=statement-${safeName}-${st.period.year}-${String(st.period.month).padStart(2, '0')}.pdf`);
  doc.pipe(res);

  const bottomLimit = () => doc.page.height - 60;
  const ensureSpace = (h) => {
    if (doc.y + h > bottomLimit()) {
      doc.addPage();
      return true;
    }
    return false;
  };
  const hr = () => {
    doc.moveTo(M, doc.y).lineTo(M + W, doc.y).strokeColor(C.border).stroke();
  };

  // ---- Header ----
  const top = doc.y;
  doc.fillColor(C.primary).font('Helvetica-Bold').fontSize(18).text(st.company.name, M, top, { width: 300 });
  doc.fillColor(C.muted).font('Helvetica').fontSize(9);
  if (st.company.address) doc.text(st.company.address, M, doc.y, { width: 300 });
  if (st.company.phone) doc.text(`Phone: ${st.company.phone}`, M, doc.y, { width: 300 });
  doc.fillColor(C.text).font('Helvetica-Bold').fontSize(15).text('MONTHLY STATEMENT', M + 280, top, { width: W - 280, align: 'right' });
  doc.fillColor(C.muted).font('Helvetica').fontSize(10).text(st.period.label, M + 280, doc.y, { width: W - 280, align: 'right' });
  doc.y = Math.max(doc.y, top + 60);
  doc.moveDown(0.8);
  hr();
  doc.moveDown(0.8);

  doc.fillColor(C.muted).font('Helvetica-Bold').fontSize(8).text('CUSTOMER', M, doc.y);
  doc.fillColor(C.text).font('Helvetica-Bold').fontSize(11).text(st.customer.name, M, doc.y + 2);
  doc.fillColor(C.muted).font('Helvetica').fontSize(9.5).text(`${st.customer.phone}  |  ${st.customer.area || ''}`, M, doc.y);
  doc.moveDown(1);

  // ---- Daily table ----
  const cols = [
    { label: 'Date', x: M, w: 90, align: 'left' },
    { label: 'Breakfast', x: M + 90, w: 95, align: 'right' },
    { label: 'Lunch', x: M + 185, w: 95, align: 'right' },
    { label: 'Dinner', x: M + 280, w: 95, align: 'right' },
    { label: 'Day total', x: M + 375, w: W - 375, align: 'right' },
  ];
  const rh = 20;
  const drawRow = (y, cells, { bold = false, bg = null, colors = [] } = {}) => {
    if (bg) doc.rect(M, y, W, rh).fill(bg);
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
    cols.forEach((c, i) => {
      doc.fillColor(colors[i] || C.text).text(String(cells[i]), c.x + 6, y + 6, { width: c.w - 12, align: c.align });
    });
  };
  const header = () => {
    drawRow(doc.y, cols.map((c) => c.label), { bold: true, bg: C.head });
    doc.y += rh;
  };

  header();
  if (st.days.length === 0) {
    doc.fillColor(C.muted).font('Helvetica').fontSize(10).text('No deliveries recorded for this month.', M, doc.y + 8);
    doc.moveDown(2);
  }
  st.days.forEach((r) => {
    if (ensureSpace(rh + 4)) header();
    const y = doc.y;
    drawRow(
      y,
      [fmtDay(r.date), mealCell(r.breakfast), mealCell(r.lunch), mealCell(r.dinner), r.dayTotal ? money(r.dayTotal) : '-'],
      {
        colors: [
          C.text,
          r.breakfast?.status === 'cancelled' ? C.danger : C.text,
          r.lunch?.status === 'cancelled' ? C.danger : C.text,
          r.dinner?.status === 'cancelled' ? C.danger : C.text,
          C.text,
        ],
      }
    );
    doc.y = y + rh;
    hr();
  });

  // ---- Summary ----
  doc.moveDown(1);
  ensureSpace(190);
  const sx = M + 270;
  const sw = W - 270;
  const line = (label, value, opts = {}) => {
    const y = doc.y;
    doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.size || 10).fillColor(opts.color || C.text);
    doc.text(label, sx, y, { width: sw - 110, align: 'left' });
    doc.text(value, sx + sw - 110, y, { width: 110, align: 'right' });
    doc.y = y + (opts.size || 10) + 6;
  };
  line(`Breakfast (${st.totals.breakfast.count})`, money(st.totals.breakfast.amount));
  line(`Lunch (${st.totals.lunch.count})`, money(st.totals.lunch.amount));
  line(`Dinner (${st.totals.dinner.count})`, money(st.totals.dinner.amount));
  doc.moveTo(sx, doc.y).lineTo(M + W, doc.y).strokeColor(C.border).stroke();
  doc.y += 6;
  line(`Delivered this month (${st.deliveredCount} meals)`, money(st.deliveredAmount), { bold: true });
  if (st.cancelledCount) line('Meals cancelled (not charged)', String(st.cancelledCount), { color: C.muted, size: 9 });
  if (st.bill) {
    line(`Invoice ${st.bill.invoiceNumber || ''}`, money(st.bill.totalAmount));
    line('Paid against this invoice', money(st.bill.amountPaid));
  }
  if (st.previousDue > 0) line('Previous outstanding', money(st.previousDue));
  doc.y += 4;
  line('Total outstanding', money(st.totalOutstandingNow), { bold: true, size: 12, color: st.totalOutstandingNow > 0 ? C.danger : C.primary });

  // ---- Payments ----
  if (st.payments.length) {
    doc.moveDown(1);
    ensureSpace(60);
    doc.fillColor(C.primary).font('Helvetica-Bold').fontSize(11).text('Payments received this month', M, doc.y);
    doc.moveDown(0.4);
    st.payments.forEach((p) => {
      ensureSpace(18);
      const y = doc.y;
      doc.font('Helvetica').fontSize(9.5).fillColor(C.text);
      doc.text(new Date(p.paidAt).toLocaleDateString('en-IN'), M, y, { width: 80 });
      doc.text(String(p.mode).replace('_', ' ').toUpperCase(), M + 85, y, { width: 90 });
      doc.fillColor(C.muted).text(p.invoiceNumber || '', M + 180, y, { width: 100 });
      doc.fillColor(C.text).font('Helvetica-Bold').text(money(p.amount), M + W - 110, y, { width: 110, align: 'right' });
      doc.y = y + 16;
    });
  }

  // ---- Footer on every page ----
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.font('Helvetica').fontSize(8).fillColor(C.muted).text(
      `${st.company.name}  |  Statement ${st.period.label}  |  Page ${i + 1} of ${range.count}`,
      M,
      doc.page.height - 40,
      { width: W, align: 'center', lineBreak: false }
    );
  }

  doc.end();
};

module.exports = { streamStatementPDF };
