/**
 * Builds a wa.me deep link that opens WhatsApp with a prefilled message summarizing
 * the bill, and a note that the PDF is attached/available via the given download link.
 * This avoids requiring WhatsApp Business API credentials - the admin taps the link,
 * WhatsApp opens with the customer's chat pre-filled, and they manually attach the
 * downloaded PDF (or the message can reference a hosted PDF URL if available).
 */
const buildWhatsAppBillLink = ({ customerPhone, customerName, month, year, totalAmount, pdfUrl }) => {
  const digitsOnly = customerPhone.replace(/[^\d]/g, '');
  const lines = [
    `Hi ${customerName}, your food subscription invoice for ${month}/${year} is Rs. ${totalAmount}.`,
  ];
  if (pdfUrl) {
    lines.push(`View/download your invoice here: ${pdfUrl}`);
  }
  const text = encodeURIComponent(lines.join('\n'));
  return `https://wa.me/${digitsOnly}?text=${text}`;
};

module.exports = { buildWhatsAppBillLink };
