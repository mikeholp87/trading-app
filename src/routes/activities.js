const express = require('express');
const router = express.Router();
const alpaca = require('../alpaca');

router.get('/', async (req, res) => {
  try {
    const { type, after, until, page_size = 50, page_token } = req.query;
    const activities = await alpaca.getActivities({ type, after, until, page_size: parseInt(page_size), page_token });
    res.json({ success: true, data: activities });
  } catch (error) {
    const message = error.response?.data?.message || error.message;
    res.status(error.response?.status || 500).json({ success: false, error: message });
  }
});

module.exports = router;
