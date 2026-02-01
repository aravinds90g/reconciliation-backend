const express = require('express');
const router = express.Router();
const {
  uploadFile,
  getUploadJobs,
  getUploadJobById,
  updateColumnMapping,
  previewFile
} = require('../controllers/upload.controller');
const { authenticate, authorize } = require('../middleware/auth');

// Routes
router.post('/', uploadFile);
router.post('/preview', previewFile);
router.get('/jobs', authenticate, getUploadJobs);
router.get('/jobs/:id', authenticate, getUploadJobById);
router.put('/jobs/:id/mapping', authenticate, updateColumnMapping);

module.exports = router;
