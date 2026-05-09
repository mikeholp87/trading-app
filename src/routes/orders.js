const express = require('express');
const router = express.Router();
const alpaca = require('../alpaca');

// Get all orders
router.get('/', async (req, res) => {
  try {
    const { status = 'all', limit = 20 } = req.query;
    const orders = await alpaca.getOrders(status, parseInt(limit));
    res.json({ success: true, data: orders });
  } catch (error) {
    const message = error.response?.data?.message || error.message;
    res.status(error.response?.status || 500).json({ success: false, error: message });
  }
});

// Create a new order
router.post('/', async (req, res) => {
  try {
    const order = await alpaca.placeOrder(req.body);
    res.json({ success: true, data: order });
  } catch (error) {
    const message = error.response?.data?.message || error.message;
    res.status(error.response?.status || 500).json({ success: false, error: message });
  }
});

// Replace an order
router.patch('/:orderId', async (req, res) => {
  try {
    const order = await alpaca.replaceOrder(req.params.orderId, req.body);
    res.json({ success: true, data: order });
  } catch (error) {
    const message = error.response?.data?.message || error.message;
    res.status(error.response?.status || 500).json({ success: false, error: message });
  }
});

// Delete (cancel) an order
router.delete('/:orderId', async (req, res) => {
  try {
    await alpaca.cancelOrder(req.params.orderId);
    res.json({ success: true, data: { message: 'Order cancelled' } });
  } catch (error) {
    const message = error.response?.data?.message || error.message;
    res.status(error.response?.status || 500).json({ success: false, error: message });
  }
});

// Delete all orders
router.delete('/', async (req, res) => {
  try {
    console.log('[Orders] Deleting all orders');
    const result = await alpaca.deleteAllOrders();
    res.json({ success: true, data: result });
  } catch (error) {
    const message = error.response?.data?.message || error.message;
    console.error('[Orders] Delete all error:', message);
    res.status(error.response?.status || 500).json({ success: false, error: message });
  }
});

module.exports = router;