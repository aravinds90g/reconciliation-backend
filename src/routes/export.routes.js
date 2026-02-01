const express = require('express');
const router = express.Router();
const {
  exportRecords,
  exportReconciliationResults,
  exportDashboardData
} = require('../controllers/export.controller');
const { authenticate, authorize } = require('../middleware/auth');

// Routes - only analysts and admins can export
router.get('/records', authenticate, authorize(['admin', 'analyst']), exportRecords);
router.get('/reconciliation', authenticate, authorize(['admin', 'analyst']), exportReconciliationResults);
router.get('/dashboard', authenticate, authorize(['admin', 'analyst']), exportDashboardData);

module.exports = router;
