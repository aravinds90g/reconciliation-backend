const express = require('express');
const router = express.Router();
const {
  reconcileUpload,
  getReconciliationResult,
  getReconciliationResults,
  manualCorrection,
  getRecordDetails,
  getComparisonView
} = require('../controllers/reconciliation.controller');
const { authenticate, authorize } = require('../middleware/auth');

router.post('/upload/:uploadJobId', authenticate, reconcileUpload);
router.get('/results', authenticate, getReconciliationResults);
router.get('/results/:id', authenticate, getReconciliationResult);
router.put('/records/:recordId/correction', authenticate, manualCorrection);
router.get('/records/:id', authenticate, getRecordDetails);
router.get('/compare/:uploadJobId', authenticate, getComparisonView);

module.exports = router;
