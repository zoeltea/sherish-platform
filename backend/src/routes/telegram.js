/**
 * Telegram Bot Webhook Routes - Zephyr Integration
 * Handles incoming Telegram updates from Zephyr bot
 */

const express = require('express');
const router = express.Router();
const TelegramService = require('../services/telegramService');

/**
 * POST /api/telegram/webhook
 * Receives incoming Telegram updates from Zephyr bot
 */
router.post('/webhook', async (req, res) => {
  try {
    const update = req.body;
    
    // Verify update is from Telegram
    if (!update.update_id) {
      return res.status(400).json({ error: 'Invalid Telegram update' });
    }

    console.log('[Telegram Webhook] Received update:', update.update_id);

    // Handle update asynchronously (don't block response)
    TelegramService.handleUpdate(update).catch(err => {
      console.error('[Telegram Webhook] Error handling update:', err);
    });

    // Always respond with 200 OK to acknowledge receipt
    res.json({ ok: true, update_id: update.update_id });
  } catch (error) {
    console.error('[Telegram Webhook] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/telegram/status
 * Check Zephyr bot status
 */
router.get('/status', async (req, res) => {
  try {
    const status = {
      bot_name: '@agent_zoel_zephyr_bot',
      bot_token: process.env.ZEPHYR_BOT_TOKEN ? 'Configured' : 'Not configured',
      webhook_url: `${process.env.BACKEND_URL || 'http://localhost:8095'}/api/telegram/webhook`,
      status: 'Active',
      timestamp: new Date().toISOString(),
    };

    res.json({ ok: true, ...status });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * POST /api/telegram/send-message
 * Send message to user via Telegram bot
 * Admin/backend use only
 */
router.post('/send-message', async (req, res) => {
  try {
    const { chatId, message } = req.body;

    if (!chatId || !message) {
      return res.status(400).json({ error: 'chatId and message required' });
    }

    const result = await TelegramService.sendMessage(chatId, message);
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * POST /api/telegram/notify-order-status
 * Send order status notification to user
 */
router.post('/notify-order-status', async (req, res) => {
  try {
    const { chatId, order } = req.body;

    if (!chatId || !order) {
      return res.status(400).json({ error: 'chatId and order required' });
    }

    await TelegramService.notifyOrderStatusChange(chatId, order);
    res.json({ ok: true, message: 'Order status notification sent' });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * POST /api/telegram/notify-payment-reminder
 * Send payment reminder to user
 */
router.post('/notify-payment-reminder', async (req, res) => {
  try {
    const { chatId, order } = req.body;

    if (!chatId || !order) {
      return res.status(400).json({ error: 'chatId and order required' });
    }

    await TelegramService.sendPaymentReminder(chatId, order);
    res.json({ ok: true, message: 'Payment reminder sent' });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
