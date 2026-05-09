const express = require('express');
const router = express.Router();
const alpaca = require('../alpaca');

// Get all positions
router.get('/', async (req, res) => {
  try {
    const positions = await alpaca.getPositions();
    res.json({ success: true, data: positions });
  } catch (error) {
    const message = error.response?.data?.message || error.message;
    res.status(error.response?.status || 500).json({ success: false, error: message });
  }
});

// Close all positions
router.delete('/', async (req, res) => {
  try {
    const result = await alpaca.closeAllPositions();
    res.json({ success: true, data: result });
  } catch (error) {
    const message = error.response?.data?.message || error.message;
    res.status(error.response?.status || 500).json({ success: false, error: message });
  }
});

// Close a single position
router.delete('/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const result = await alpaca.closePosition(symbol);
    res.json({ success: true, data: result });
  } catch (error) {
    const message = error.response?.data?.message || error.message;
    res.status(error.response?.status || 500).json({ success: false, error: message });
  }
});

module.exports = router;