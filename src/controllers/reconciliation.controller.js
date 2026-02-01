const ReconciliationService = require('../services/reconciliationService');
const ReconciliationResult = require('../models/ReconciliationResult');
const Record = require('../models/Record');
const mongoose = require('mongoose');
const { createAuditLog } = require('../services/auditService');

const reconciliationService = new ReconciliationService();

exports.reconcileUpload = async (req, res, next) => {
  try {
    const { uploadJobId } = req.params;
    
    // Validate uploadJobId
    if (!uploadJobId || !mongoose.Types.ObjectId.isValid(uploadJobId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid upload job ID'
      });
    }
    
    console.log(`[Reconciliation] Starting reconciliation for job: ${uploadJobId}`);
    
    const result = await reconciliationService.reconcileUpload(
      uploadJobId,
      req.user.id
    );
    
    console.log(`[Reconciliation] Completed successfully for job: ${uploadJobId}`);
    
    res.status(200).json({
      success: true,
      data: { result }
    });
  } catch (error) {
    console.error(`[Reconciliation] Error for job ${req.params.uploadJobId}:`, error.message);
    next(error);
  }
};

exports.getReconciliationResult = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const result = await ReconciliationResult.findById(id)
      .populate('uploadJob')
      .populate('matches.systemRecord')
      .populate('matches.uploadedRecord')
      .populate('unmatchedRecords');
    
    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Reconciliation result not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: { result }
    });
  } catch (error) {
    next(error);
  }
};

exports.getReconciliationResults = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, startDate, endDate } = req.query;
    
    const query = {};
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    const results = await ReconciliationResult.find(query)
      .populate('uploadJob')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await ReconciliationResult.countDocuments(query);
    
    res.status(200).json({
      success: true,
      data: {
        data: results,
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

exports.manualCorrection = async (req, res, next) => {
  try {
    const { recordId } = req.params;
    const { field, value, matchStatus } = req.body;
    
    const record = await Record.findById(recordId);
    
    if (!record) {
      return res.status(404).json({
        success: false,
        error: 'Record not found'
      });
    }
    
    // Store old value
    const oldValue = record[field];
    
    // Update record
    record[field] = value;
    if (matchStatus) {
      record.status = matchStatus;
    }
    record.lastModifiedBy = req.user.id;
    
    await record.save();
    
    // Create audit log
    await createAuditLog({
      action: 'CORRECT',
      entity: 'RECORD',
      entityId: record._id,
      userId: req.user.id,
      changes: {
        oldValue: { [field]: oldValue },
        newValue: { [field]: value },
        changedFields: [field]
      }
    });
    
    res.status(200).json({
      success: true,
      data: { record }
    });
  } catch (error) {
    next(error);
  }
};

exports.getRecordDetails = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const record = await Record.findById(id)
      .populate('matchDetails.matchedWith')
      .populate('duplicateOf')
      .populate('createdBy', 'name email')
      .populate('lastModifiedBy', 'name email');
    
    if (!record) {
      return res.status(404).json({
        success: false,
        error: 'Record not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: { record }
    });
  } catch (error) {
    next(error);
  }
};

exports.getComparisonView = async (req, res, next) => {
  try {
    const { uploadJobId } = req.params;
    const { page = 1, limit = 50, status } = req.query;
    
    const query = { uploadJob: uploadJobId };
    if (status) query.status = status;
    
    const records = await Record.find(query)
      .populate('matchDetails.matchedWith')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await Record.countDocuments(query);
    
    // Group by status for summary
    const statusSummary = await Record.aggregate([
      { $match: { uploadJob: new mongoose.Types.ObjectId(uploadJobId) } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    res.status(200).json({
      success: true,
      data: {
        data: records,
        summary: statusSummary.reduce((acc, curr) => {
          acc[curr._id] = curr.count;
          return acc;
        }, {}),
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
