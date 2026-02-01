const express = require('express');
const router = express.Router();
const {
  getAuditLogs,
  getRecordAuditTrail,
  getEntityAuditSummary
} = require('../controllers/audit.controller');
const { authenticate } = require('../middleware/auth');

router.get('/logs', authenticate, getAuditLogs);
router.get('/record/:recordId/timeline', authenticate, getRecordAuditTrail);
router.get('/summary', authenticate, getEntityAuditSummary);

module.exports = router;
