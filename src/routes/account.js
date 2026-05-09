const express = require('express');
const router = express.Router();
const alpaca = require('../alpaca');

router.get('/', async (req, res) => {
  try {
    const account = await alpaca.getAccount();
    res.json({ success: true, data: account });
  } catch (error) {
    const status = error.response?.status || 500;
    const message = error.response?.data?.message || error.message;
    
    if (status === 401 || message.includes('unauthorized')) {
      res.status(401).json({ 
        success: false, 
        error: 'Invalid API credentials. Please update your ALPACA_API_KEY and ALPACA_SECRET_KEY in .env',
        hint: 'Get new keys from https://app.alpaca.markets/paper/dashboard/keys'
      });
    } else {
      res.status(status).json({ success: false, error: message });
    }
  }
});

module.exports = router;