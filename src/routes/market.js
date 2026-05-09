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

// Get snapshot for a single symbol
router.get('/snapshot/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    console.log('[Market] Getting snapshot for', symbol);
    const snapshot = await alpaca.getSnapshot(symbol);
    res.json({ success: true, data: snapshot });
  } catch (error) {
    const message = error.response?.data?.message || error.message;
    console.error('[Market] Snapshot error:', message);
    res.status(error.response?.status || 500).json({ success: false, error: message });
  }
});

// Get snapshots for multiple symbols
router.get('/snapshots', async (req, res) => {
  try {
    const { symbols } = req.query;
    if (!symbols) {
      return res.status(400).json({ success: false, error: 'symbols parameter required' });
    }
    console.log('[Market] Getting snapshots for', symbols);
    const snapshots = await alpaca.getSnapshots(symbols);
    res.json({ success: true, data: snapshots });
  } catch (error) {
    const message = error.response?.data?.message || error.message;
    console.error('[Market] Snapshots error:', message);
    res.status(error.response?.status || 500).json({ success: false, error: message });
  }
});

// Get latest trade for a symbol
router.get('/trade/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    console.log('[Market] Getting latest trade for', symbol);
    const trade = await alpaca.getLatestTrade(symbol);
    res.json({ success: true, data: trade });
  } catch (error) {
    const message = error.response?.data?.message || error.message;
    console.error('[Market] Latest trade error:', message);
    res.status(error.response?.status || 500).json({ success: false, error: message });
  }
});

module.exports = router;