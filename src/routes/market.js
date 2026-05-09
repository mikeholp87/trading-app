const express = require('express');
const router = express.Router();
const alpaca = require('../alpaca');

router.get('/bars/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { timeframe = '1Day', start, end, limit = 100 } = req.query;
    
    const bars = await alpaca.getBars(symbol, timeframe, start, end, parseInt(limit));
    res.json({ success: true, data: bars });
  } catch (error) {
    const message = error.response?.data?.message || error.message;
    res.status(error.response?.status || 500).json({ success: false, error: message });
  }
});

router.get('/historical/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { timeframe = '1Day', start, end } = req.query;
    
    const bars = await alpaca.getHistoricalBars(symbol, timeframe, start, end);
    res.json({ success: true, data: bars });
  } catch (error) {
    const message = error.response?.data?.message || error.message;
    res.status(error.response?.status || 500).json({ success: false, error: message });
  }
});

router.get('/quote/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const quote = await alpaca.getLatestQuote(symbol);
    res.json({ success: true, data: quote });
  } catch (error) {
    const message = error.response?.data?.message || error.message;
    res.status(error.response?.status || 500).json({ success: false, error: message });
  }
});

router.get('/clock', async (req, res) => {
  try {
    const clock = await alpaca.getClock();
    res.json({ success: true, data: clock });
  } catch (error) {
    const message = error.response?.data?.message || error.message;
    res.status(error.response?.status || 500).json({ success: false, error: message });
  }
});

module.exports = router;