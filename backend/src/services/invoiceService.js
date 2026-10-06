const PDFDocument = require('pdfkit');

function formatCurrency(num) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(num);
}

function formatDate(date) {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

/**
 * Generate official PDF invoice using pdfkit
 * @param {Object} invoice 
 * @param {Object} order 
 * @param {Stream.Writable} outputStream (optional, pipe destination like express res)
 * @returns {PDFDocument}
 */
function createInvoicePDF(invoice, order, outputStream) {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });

  if (outputStream) {
    doc.pipe(outputStream);
  }

  // --- BRAND HEADER ---
  doc.rect(40, 40, 515, 65).fill('#0f172a');
  doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold').text('SHERISH CIPTA INTERINDO', 55, 55);
  doc.fillColor('#94a3b8').fontSize(9).font('Helvetica').text('Official Furniture & Architectural Solution', 55, 76);
  doc.text('Jl. Panyaungan No. 15 Cileunyi, Bandung · finance@sherish.co.id', 55, 88);

  // --- INVOICE TITLE & BADGE ---
  doc.fillColor('#0f172a').fontSize(18).font('Helvetica-Bold').text('FAKTUR / INVOICE', 40, 125);
  
  const typeLabel = invoice.type === 'DP_PAYMENT' ? 'TAGIHAN DOWN PAYMENT (DP)' : invoice.type === 'FINAL_PAYMENT' ? 'INVOICE PELUNASAN AKHIR' : 'INVOICE PEMBAYARAN PENUH';
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#059669').text(typeLabel, 40, 147);

  // --- METADATA BOX ---
  const metaY = 170;
  doc.rect(40, metaY, 515, 75).fill('#f8fafc').stroke('#e2e8f0');
  
  doc.fillColor('#64748b').fontSize(9).font('Helvetica');
  doc.text('Nomor Invoice:', 55, metaY + 12);
  doc.text('Nomor Pesanan:', 55, metaY + 28);
  doc.text('Tanggal Terbit:', 55, metaY + 44);
  doc.text('Jatuh Tempo:', 55, metaY + 60);

  doc.fillColor('#0f172a').font('Helvetica-Bold');
  doc.text(invoice.invoiceNumber, 140, metaY + 12);
  doc.text(order.orderNumber, 140, metaY + 28);
  doc.font('Helvetica').text(formatDate(invoice.createdAt), 140, metaY + 44);
  doc.fillColor('#b45309').font('Helvetica-Bold').text(formatDate(invoice.dueDate), 140, metaY + 60);

  // Customer column
  doc.fillColor('#64748b').font('Helvetica');
  doc.text('Ditagihkan Kepada:', 310, metaY + 12);
  doc.text('Tujuan Pengiriman:', 310, metaY + 44);

  doc.fillColor('#0f172a').font('Helvetica-Bold');
  const custName = order.mitra?.storeName ? `${order.mitra.storeName} (${order.user?.fullName || order.recipientName})` : (order.user?.fullName || order.recipientName);
  doc.text(custName, 310, metaY + 26);
  doc.font('Helvetica').fontSize(8.5).text(`${order.shippingAddress}, ${order.shippingCity}`, 310, metaY + 56, { width: 230 });

  // --- ITEM LIST TABLE ---
  const tableY = 265;
  doc.rect(40, tableY, 515, 22).fill('#1e293b');
  doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold');
  doc.text('Deskripsi Item Furnitur', 55, tableY + 6);
  doc.text('Qty', 330, tableY + 6);
  doc.text('Harga Satuan', 380, tableY + 6);
  doc.text('Total', 480, tableY + 6);

  let curY = tableY + 28;
  const items = order.items || [];
  
  items.forEach((item, idx) => {
    const isEven = idx % 2 === 0;
    doc.rect(40, curY - 4, 515, 26).fill(isEven ? '#ffffff' : '#f8fafc');
    
    doc.fillColor('#0f172a').fontSize(8.5).font('Helvetica-Bold');
    doc.text(item.product?.title || 'Produk Sherish', 55, curY);
    doc.font('Helvetica').fontSize(7.5).fillColor('#64748b');
    doc.text(`${item.selectedMaterial || 'Jati'} · ${item.selectedFinishing || 'Natural'}`, 55, curY + 11);

    doc.fillColor('#0f172a').fontSize(8.5).font('Helvetica');
    doc.text(item.quantity.toString(), 335, curY + 4);
    doc.text(formatCurrency(item.unitPrice), 375, curY + 4);
    doc.font('Helvetica-Bold').text(formatCurrency(item.subtotal), 465, curY + 4);

    curY += 28;
  });

  // --- TOTAL SUMMARY SECTION ---
  curY += 10;
  doc.rect(300, curY, 255, 95).fill('#f1f5f9').stroke('#cbd5e1');

  doc.fillColor('#475569').fontSize(9).font('Helvetica');
  doc.text('Subtotal Keseluruhan:', 315, curY + 12);
  doc.fillColor('#0f172a').font('Helvetica-Bold').text(formatCurrency(order.totalAmount), 440, curY + 12);

  doc.fillColor('#475569').font('Helvetica').text('Skema Pembayaran:', 315, curY + 28);
  doc.fillColor('#0f172a').text(order.paymentScheme.replace('DOWN_PAYMENT_', 'DP '), 440, curY + 28);

  doc.fillColor('#475569').text('Status Invoice:', 315, curY + 44);
  const statusColor = invoice.status === 'PAID' ? '#059669' : '#d97706';
  doc.fillColor(statusColor).font('Helvetica-Bold').text(invoice.status, 440, curY + 44);

  doc.rect(300, curY + 62, 255, 33).fill('#0f172a');
  doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold');
  doc.text('TOTAL TAGIHAN INVOICE:', 315, curY + 73);
  doc.fillColor('#34d399').fontSize(11).text(formatCurrency(invoice.amount), 430, curY + 72);

  // --- PAYMENT BANK DETAILS ---
  const bankY = curY;
  doc.rect(40, bankY, 245, 95).fill('#eff6ff').stroke('#bfdbfe');
  doc.fillColor('#1e40af').fontSize(9).font('Helvetica-Bold').text('INFORMASI REKENING RESMI', 55, bankY + 12);
  doc.font('Helvetica').fontSize(8.5).fillColor('#1e3a8a');
  doc.text('Bank: Bank Central Asia (BCA)', 55, bankY + 30);
  doc.text('Nomor Rekening: 8830-1928-31', 55, bankY + 44);
  doc.text('Atas Nama: PT Sherish Cipta Interindo', 55, bankY + 58);
  doc.fontSize(7.5).fillColor('#3b82f6').text('*Sertakan nomor invoice pada berita transfer', 55, bankY + 75);

  // --- FOOTER & SIGNATURE ---
  const footY = 740;
  doc.rect(40, footY, 515, 1).fill('#cbd5e1');
  doc.fillColor('#64748b').fontSize(8).font('Helvetica').text(
    'Faktur ini merupakan bukti penagihan sah yang diterbitkan otomatis oleh Sistem Keuangan & ERP PT Sherish Cipta Interindo.',
    40, footY + 10, { align: 'center', width: 515 }
  );

  doc.end();
  return doc;
}

module.exports = {
  createInvoicePDF,
  formatCurrency,
  formatDate
};
