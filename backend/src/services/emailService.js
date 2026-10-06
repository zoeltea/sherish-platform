const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

// In-memory email log store for audit/demo/testing verification
const sentEmailLogs = [];

let transporter;

function getTransporter() {
  if (!transporter) {
    if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
      transporter = nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE || 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD
        }
      });
    } else {
      // Mock / JSON / console transport for local container environment
      transporter = nodemailer.createTransport({
        jsonTransport: true
      });
    }
  }
  return transporter;
}

function renderTemplate(templateName, data) {
  const templatePath = path.join(__dirname, '../templates/emails', `${templateName}.html`);
  if (fs.existsSync(templatePath)) {
    let html = fs.readFileSync(templatePath, 'utf8');
    Object.keys(data).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      html = html.replace(regex, data[key] !== undefined && data[key] !== null ? data[key] : '');
    });
    return html;
  }
  return `<p>${JSON.stringify(data)}</p>`;
}

async function sendMail({ to, subject, templateName, data }) {
  try {
    const html = renderTemplate(templateName, data);
    const transport = getTransporter();
    
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'Sherish E-Commerce Platform'}" <${process.env.EMAIL_USER || 'notifications@sherish.co.id'}>`,
      to,
      subject,
      html
    };

    const info = await transport.sendMail(mailOptions);
    const logEntry = {
      id: `EMAIL-${Date.now().toString().slice(-6)}`,
      to,
      subject,
      templateName,
      sentAt: new Date().toISOString(),
      messageId: info.messageId || 'local-mock-id',
      dataPreview: data
    };

    sentEmailLogs.unshift(logEntry);
    if (sentEmailLogs.length > 50) sentEmailLogs.pop();

    console.log(`📧 [Email Notification Sent] To: ${to} | Subject: "${subject}" | Template: ${templateName}`);
    return logEntry;
  } catch (err) {
    console.error(`❌ [Email Service Error]`, err);
    return null;
  }
}

// 1. Order Confirmed / Created (DP Payment Instructions)
async function sendOrderConfirmedEmail(order, user) {
  const formatIDR = (val) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);
  return sendMail({
    to: user.email,
    subject: `[Sherish] Konfirmasi Pesanan #${order.orderNumber} & Instruksi Pembayaran DP`,
    templateName: 'order_confirmed',
    data: {
      customerName: user.fullName,
      orderNumber: order.orderNumber,
      orderType: order.orderType,
      paymentScheme: order.paymentScheme.replace('DOWN_PAYMENT_', 'DP '),
      totalAmount: formatIDR(order.totalAmount),
      dpAmount: formatIDR(order.dpAmount),
      remainingAmount: formatIDR(order.remainingAmount),
      shippingAddress: order.shippingAddress,
      shippingCity: order.shippingCity,
      recipientName: order.recipientName
    }
  });
}

// 2. DP Payment Received / Verified (Production Starts)
async function sendDpPaymentReceivedEmail(order, user) {
  const formatIDR = (val) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);
  return sendMail({
    to: user.email,
    subject: `[Sherish] Pembayaran DP Terverifikasi — Pesanan #${order.orderNumber} Mulai Diproduksi`,
    templateName: 'dp_payment_received',
    data: {
      customerName: user.fullName,
      orderNumber: order.orderNumber,
      dpAmount: formatIDR(order.dpAmount),
      status: order.status,
      remainingAmount: formatIDR(order.remainingAmount)
    }
  });
}

// 3. Order Shipped / In Transit
async function sendOrderShippedEmail(order, user) {
  return sendMail({
    to: user.email,
    subject: `[Sherish] Pesanan #${order.orderNumber} Sedang Dalam Pengiriman`,
    templateName: 'order_shipped',
    data: {
      customerName: user.fullName,
      orderNumber: order.orderNumber,
      trackingNumber: order.trackingNumber || 'SHR-EXP-' + Date.now().toString().slice(-6),
      shippingAddress: order.shippingAddress,
      shippingCity: order.shippingCity
    }
  });
}

// 4. KYC / Mitra Approval Notification
async function sendKYCApprovedEmail(mitraProfile, user) {
  return sendMail({
    to: user.email,
    subject: `[Sherish Partner Hub] Selamat! Kemitraan ${mitraProfile.storeName} Telah Terverifikasi Resmi`,
    templateName: 'kyc_approved',
    data: {
      mitraName: user.fullName,
      storeName: mitraProfile.storeName,
      mitraType: mitraProfile.mitraType || mitraProfile.partnerType,
      workArea: mitraProfile.workArea || mitraProfile.storeCity,
      discountTier: `${Math.round(mitraProfile.discountTier * 100)}%`
    }
  });
}

// 5. Payment Reminder (DP or Final Settlement)
async function sendPaymentReminderEmail(order, user, reminderType = 'DP') {
  const formatIDR = (val) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);
  const amount = reminderType === 'DP' ? order.dpAmount : order.remainingAmount;
  return sendMail({
    to: user.email,
    subject: `[Sherish Reminder] Pengingat Tagihan Pembayaran ${reminderType} #${order.orderNumber}`,
    templateName: 'payment_reminder',
    data: {
      customerName: user.fullName,
      orderNumber: order.orderNumber,
      reminderType,
      amountDue: formatIDR(amount),
      status: order.status
    }
  });
}

function getEmailLogs() {
  return sentEmailLogs;
}

module.exports = {
  sendMail,
  sendOrderConfirmedEmail,
  sendDpPaymentReceivedEmail,
  sendOrderShippedEmail,
  sendKYCApprovedEmail,
  sendPaymentReminderEmail,
  getEmailLogs
};
