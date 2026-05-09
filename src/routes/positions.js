const express = require('express');
const router = express.Router();
const alpaca = require('../alpaca');

router.get('/', async (req, res) => {
  try {
    const positions = await alpaca.getPositions();
    res.json({ success: true, data: positions });
  } catch (error) {
    const message = error.response?.data?.message || error.message;
    res.status(error.response?.status || 500).json({ success: false, error: message });
  }
});

module.exports = router;