const express = require('express');
const router = express.Router();
const {
  getDashboardSummary,
  getChartData
} = require('../controllers/dashboard.controller');
const { authenticate } = require('../middleware/auth');

router.get('/summary', authenticate, getDashboardSummary);
router.get('/charts', authenticate, getChartData);

module.exports = router;
