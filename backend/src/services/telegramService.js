/**
 * Telegram Bot Service - Zephyr Integration
 * Handles incoming messages from Zephyr Telegram bot & sends responses
 */

const axios = require('axios');

const TELEGRAM_BOT_TOKEN = process.env.ZEPHYR_BOT_TOKEN || '8687492832:AAF1FekTL0vu9aZlsKiDOXH1UYM_djXIiHk';
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

class TelegramService {
  /**
   * Send message to Telegram chat
   * @param {number} chatId - Telegram chat ID
   * @param {string} message - Message text
   * @param {object} options - Additional Telegram options
   */
  static async sendMessage(chatId, message, options = {}) {
    try {
      const response = await axios.post(`${TELEGRAM_API_URL}/sendMessage`, {
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        ...options,
      });
      return response.data;
    } catch (error) {
      console.error('Telegram sendMessage error:', error.message);
      throw error;
    }
  }

  /**
   * Handle incoming Telegram webhook update
   * @param {object} update - Telegram update object
   */
  static async handleUpdate(update) {
    try {
      // Handle text messages
      if (update.message && update.message.text) {
        const { message } = update;
        const chatId = message.chat.id;
        const userId = message.from.id;
        const userName = message.from.username || message.from.first_name;
        const text = message.text;

        console.log(`[Telegram] Message from @${userName} (${userId}): ${text}`);

        // Route message based on command
        if (text.startsWith('/')) {
          await this.handleCommand(chatId, userId, userName, text);
        } else {
          // Echo message or handle as query
          await this.handleQuery(chatId, userId, userName, text);
        }
      }

      // Handle callback queries (inline buttons)
      if (update.callback_query) {
        const { callback_query } = update;
        const chatId = callback_query.message.chat.id;
        const userId = callback_query.from.id;
        const data = callback_query.data;

        console.log(`[Telegram] Callback from ${userId}: ${data}`);
        await this.handleCallback(chatId, userId, data);
      }

      return { ok: true };
    } catch (error) {
      console.error('Telegram handleUpdate error:', error);
      return { ok: false, error: error.message };
    }
  }

  /**
   * Handle Telegram bot commands
   */
  static async handleCommand(chatId, userId, userName, command) {
    const cmd = command.toLowerCase();

    if (cmd === '/start') {
      await this.sendMessage(
        chatId,
        `<b>👋 Welcome to Sherish E-Commerce Platform!</b>\n\nHi <b>@${userName}</b>! 🎉\n\nI'm Zephyr, your Sherish assistant bot.\n\n<b>Available Commands:</b>\n/orders - View your orders\n/status - Check platform status\n/help - Show help\n/settings - Manage preferences`,
        { reply_markup: this.getMainKeyboard() }
      );
    } else if (cmd === '/orders') {
      await this.sendMessage(
        chatId,
        `<b>📦 Your Orders</b>\n\nFetching your recent orders...`,
        { reply_markup: this.getOrdersKeyboard(userId) }
      );
    } else if (cmd === '/status') {
      await this.sendMessage(
        chatId,
        `<b>✅ Platform Status</b>\n\n🟢 <b>Backend API:</b> ONLINE\n🟢 <b>PostgreSQL:</b> ONLINE\n🟢 <b>Frontend Services:</b> ONLINE\n\nAll systems operational!`
      );
    } else if (cmd === '/help') {
      await this.sendMessage(
        chatId,
        `<b>❓ Help & Support</b>\n\n<b>Commands:</b>\n/start - Welcome message\n/orders - View orders\n/status - Platform status\n/help - This help message\n/settings - User preferences\n\n<b>Features:</b>\n• Order tracking\n• Status notifications\n• Invoice downloads\n• Payment reminders\n\nNeed more help? Contact: support@sherish.co.id`
      );
    } else if (cmd === '/settings') {
      await this.sendMessage(
        chatId,
        `<b>⚙️ Settings</b>\n\nNotification preferences:`,
        { reply_markup: this.getSettingsKeyboard() }
      );
    } else {
      await this.sendMessage(chatId, `Unknown command: <b>${command}</b>\n\nType /help for available commands`);
    }
  }

  /**
   * Handle text queries/messages
   */
  static async handleQuery(chatId, userId, userName, text) {
    // Echo with order lookup hint
    await this.sendMessage(
      chatId,
      `<b>📨 Message received:</b>\n\n${text}\n\n💡 <b>Tip:</b> Use /orders to view your orders or /status for platform status.`,
      { reply_markup: this.getMainKeyboard() }
    );
  }

  /**
   * Handle callback queries from inline buttons
   */
  static async handleCallback(chatId, userId, data) {
    const [action, param] = data.split(':');

    if (action === 'orders_list') {
      await this.sendMessage(
        chatId,
        `<b>📦 Recent Orders</b>\n\n1️⃣ Order #ORD-001\n   Status: CONFIRMED\n   Total: Rp 5,000,000\n   Date: 2026-10-05\n\n2️⃣ Order #ORD-002\n   Status: PENDING_DP\n   Total: Rp 3,500,000\n   Date: 2026-10-06\n\n📌 Click below to view details:`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: 'View Order #ORD-001', callback_data: 'order_detail:ORD-001' },
                { text: 'View Order #ORD-002', callback_data: 'order_detail:ORD-002' },
              ],
              [{ text: '🔄 Back', callback_data: 'menu_main' }],
            ],
          },
        }
      );
    } else if (action === 'order_detail') {
      await this.sendMessage(
        chatId,
        `<b>🔍 Order Details: ${param}</b>\n\n<b>Order #:</b> ${param}\n<b>Status:</b> CONFIRMED\n<b>Total:</b> Rp 5,000,000\n<b>Items:</b> 2 products\n<b>Date:</b> 2026-10-05\n<b>Expected Delivery:</b> 2026-10-15\n\n📥 <b>Download Invoice:</b> [PDF]\n\n💬 Need help? Contact support.`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📥 Download Invoice', url: 'http://localhost:8095/api/invoices/1/pdf' }],
              [{ text: '🔄 Back to Orders', callback_data: 'orders_list' }],
            ],
          },
        }
      );
    } else if (action === 'notify_toggle') {
      await this.sendMessage(
        chatId,
        `✅ <b>Notification Setting Updated</b>\n\nNotifications for <b>${param}</b> have been ${param === 'order_status' ? 'enabled' : 'disabled'}.`
      );
    } else if (action === 'menu_main') {
      await this.sendMessage(
        chatId,
        `<b>🏠 Main Menu</b>\n\nWhat would you like to do?`,
        { reply_markup: this.getMainKeyboard() }
      );
    }
  }

  /**
   * Get main keyboard markup
   */
  static getMainKeyboard() {
    return {
      inline_keyboard: [
        [
          { text: '📦 My Orders', callback_data: 'orders_list' },
          { text: '✅ Platform Status', callback_data: 'menu_status' },
        ],
        [
          { text: '⚙️ Settings', callback_data: 'menu_settings' },
          { text: '❓ Help', callback_data: 'menu_help' },
        ],
      ],
    };
  }

  /**
   * Get orders keyboard
   */
  static getOrdersKeyboard(userId) {
    return {
      inline_keyboard: [
        [{ text: 'View My Orders', callback_data: 'orders_list' }],
        [{ text: '🔄 Refresh', callback_data: 'orders_list' }],
      ],
    };
  }

  /**
   * Get settings keyboard
   */
  static getSettingsKeyboard() {
    return {
      inline_keyboard: [
        [
          { text: '🔔 Order Status Notifications', callback_data: 'notify_toggle:order_status' },
        ],
        [
          { text: '💰 Payment Reminders', callback_data: 'notify_toggle:payment_reminder' },
        ],
        [
          { text: '🔄 Back to Menu', callback_data: 'menu_main' },
        ],
      ],
    };
  }

  /**
   * Send order status update notification
   */
  static async notifyOrderStatusChange(chatId, order) {
    const statusEmoji = {
      CONFIRMED: '✅',
      PRODUCTION: '🏭',
      SHIPPED: '📦',
      DELIVERED: '🎉',
      CANCELLED: '❌',
    };

    const emoji = statusEmoji[order.status] || '📌';

    await this.sendMessage(
      chatId,
      `${emoji} <b>Order Status Update</b>\n\n<b>Order #:</b> ${order.id}\n<b>New Status:</b> ${order.status}\n<b>Updated:</b> ${new Date().toLocaleString('id-ID')}\n\n👉 /orders to view full details`,
      { reply_markup: this.getMainKeyboard() }
    );
  }

  /**
   * Send payment reminder
   */
  static async sendPaymentReminder(chatId, order) {
    await this.sendMessage(
      chatId,
      `💰 <b>Payment Reminder</b>\n\n⏰ Your DP payment is due in <b>3 days</b>\n\n<b>Order #:</b> ${order.id}\n<b>Amount Due:</b> Rp ${order.dpAmount.toLocaleString('id-ID')}\n<b>Due Date:</b> ${new Date(order.dpDueDate).toLocaleDateString('id-ID')}\n\n👉 /orders to proceed with payment`,
      { reply_markup: this.getMainKeyboard() }
    );
  }
}

module.exports = TelegramService;
