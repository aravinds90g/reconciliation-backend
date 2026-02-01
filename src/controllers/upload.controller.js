const { UploadService, upload } = require('../services/uploadService');
const UploadJob = require('../models/UploadJob');
const { processReconciliationQueue } = require('../services/queueService');
const { createAuditLog } = require('../services/auditService');

const uploadService = new UploadService();

exports.uploadFile = [
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded'
        });
      }

      const columnMapping = req.body.columnMapping 
        ? JSON.parse(req.body.columnMapping)
        : null;

      const result = await uploadService.processFile(
        req.file,
        req.user.id,
        columnMapping
      );

      // If processing was successful, trigger reconciliation
      // Note: provided code triggers reconciliation automatically if status is completed
      if (result.status === 'completed') {
        try {
          await processReconciliationQueue.add({
            jobId: result.jobId,
            userId: req.user.id
          });
        } catch (queueError) {
          console.error('[Queue Error] Failed to add job to background queue:', queueError.message);
          // Don't fail the whole request, just log it. The user can trigger reconciliation manually if needed.
        }
      }

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
];

exports.getUploadJobs = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status, startDate, endDate } = req.query;
    
    const query = { uploadedBy: req.user.id };
    
    if (status) query.status = status;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    const uploadJobs = await UploadJob.find(query)
      .populate('uploadedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await UploadJob.countDocuments(query);
    
    res.status(200).json({
      success: true,
      data: {
        data: uploadJobs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getUploadJobById = async (req, res, next) => {
  try {
    const uploadJob = await UploadJob.findById(req.params.id)
      .populate('uploadedBy', 'name email');
    
    if (!uploadJob) {
      return res.status(404).json({
        success: false,
        error: 'Upload job not found'
      });
    }
    
    // Check authorization
    if (uploadJob.uploadedBy._id.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to access this upload job'
      });
    }
    
    res.status(200).json({
      success: true,
      data: { uploadJob }
    });
  } catch (error) {
    next(error);
  }
};

exports.updateColumnMapping = async (req, res, next) => {
  try {
    const { columnMapping } = req.body;
    
    const uploadJob = await UploadJob.findById(req.params.id);
    
    if (!uploadJob) {
      return res.status(404).json({
        success: false,
        error: 'Upload job not found'
      });
    }
    
    if (uploadJob.status !== 'processing' && uploadJob.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Cannot update column mapping after processing is complete'
      });
    }
    
    // Update column mapping
    uploadJob.columnMapping = columnMapping;
    await uploadJob.save();
    
    // Create audit log
    await createAuditLog({
      action: 'UPDATE',
      entity: 'UPLOAD_JOB',
      entityId: uploadJob._id,
      userId: req.user.id,
      changes: {
        oldValue: { columnMapping: uploadJob.columnMapping },
        newValue: { columnMapping },
        changedFields: ['columnMapping']
      }
    });
    
    res.status(200).json({
      success: true,
      data: { uploadJob }
    });
  } catch (error) {
    next(error);
  }
};

exports.previewFile = [
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded'
        });
      }
      
      let previewData;
      if (req.file.mimetype.includes('csv')) {
        previewData = await uploadService.processCSV(req.file.path);
      } else {
        previewData = await uploadService.processExcel(req.file.path);
      }
      
      // Get first 20 rows for preview
      const first20Rows = previewData.slice(0, 20);
      
      // Get column names
      const columns = first20Rows.length > 0 ? Object.keys(first20Rows[0]) : [];
      
      // Auto-detect column mapping
      const autoMapping = uploadService.autoDetectColumns(
        first20Rows.length > 0 ? first20Rows[0] : {}
      );
      
      // Clean up the file
      await require('fs').promises.unlink(req.file.path).catch(() => {});
      
      res.status(200).json({
        success: true,
        data: {
          filename: req.file.originalname,
          fileSize: req.file.size,
          totalRows: previewData.length,
          previewRows: first20Rows,
          columns,
          autoMapping
        }
      });
    } catch (error) {
      next(error);
    }
  }
];
