const express = require('express');
const router = express.Router();
const alpaca = require('../alpaca');

// Search assets (stocks)
router.get('/search', async (req, res) => {
  try {
    const { query, limit = 20 } = req.query;
    const assets = await alpaca.getAssets('active', 'us_equity');
    
    // Filter by query if provided
    let results = assets;
    if (query) {
      const q = query.toUpperCase();
      results = assets.filter(a => 
        a.symbol.toUpperCase().includes(q) ||
        (a.name && a.name.toUpperCase().includes(q))
      ).slice(0, parseInt(limit));
    } else {
      results = assets.slice(0, parseInt(limit));
    }
    
    res.json({ success: true, data: results });
  } catch (error) {
    const message = error.response?.data?.message || error.message;
    res.status(error.response?.status || 500).json({ success: false, error: message });
  }
});

// Get single asset by symbol
router.get('/:symbol', async (req, res) => {
  try {
    const asset = await alpaca.getAsset(req.params.symbol);
    res.json({ success: true, data: asset });
  } catch (error) {
    const message = error.response?.data?.message || error.message;
    res.status(error.response?.status || 500).json({ success: false, error: message });
  }
});

module.exports = router;