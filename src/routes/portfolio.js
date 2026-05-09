const express = require('express');
const router = express.Router();
const alpaca = require('../alpaca');

// Get portfolio history
router.get('/history', async (req, res) => {
  try {
    const { start, end, period, timeframe } = req.query;
    const history = await alpaca.getPortfolioHistory(start, end, period, timeframe);
    res.json({ success: true, data: history });
  } catch (error) {
    const message = error.response?.data?.message || error.message;
    res.status(error.response?.status || 500).json({ success: false, error: message });
  }
});

module.exports = router;