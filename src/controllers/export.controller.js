const Record = require('../models/Record');
const UploadJob = require('../models/UploadJob');
const ReconciliationResult = require('../models/ReconciliationResult');
const { createAuditLog } = require('../services/auditService');
const { parse } = require('json2csv');

exports.exportRecords = async (req, res, next) => {
  try {
    const { uploadJobId, format = 'json', status } = req.query;

    if (!uploadJobId) {
      return res.status(400).json({
        success: false,
        error: 'uploadJobId is required'
      });
    }

    const query = { uploadJobId };
    if (status) query.status = status;

    const records = await Record.find(query);

    // Create audit log
    await createAuditLog({
      action: 'EXPORT',
      entity: 'RECORDS',
      entityId: uploadJobId,
      userId: req.user.id,
      changes: {
        format,
        recordCount: records.length
      }
    });

    if (format === 'csv') {
      const csv = parse(records);
      res.header('Content-Type', 'text/csv');
      res.header('Content-Disposition', `attachment; filename="records-${Date.now()}.csv"`);
      return res.send(csv);
    }

    // Default JSON
    res.header('Content-Type', 'application/json');
    res.header('Content-Disposition', `attachment; filename="records-${Date.now()}.json"`);
    res.json({
      success: true,
      data: {
        totalRecords: records.length,
        records
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.exportReconciliationResults = async (req, res, next) => {
  try {
    const { jobId, format = 'json' } = req.query;

    const query = {};
    if (jobId) query.uploadJob = jobId;

    const results = await ReconciliationResult.find(query)
      .populate('uploadJob')
      .populate('matches.systemRecord')
      .populate('matches.uploadedRecord');

    // Create audit log
    await createAuditLog({
      action: 'EXPORT',
      entity: 'RECONCILIATION_RESULTS',
      entityId: jobId || 'all',
      userId: req.user.id,
      changes: {
        format,
        resultCount: results.length
      }
    });

    if (format === 'csv') {
      // Flatten results for CSV
      const flatResults = results.map(r => ({
        'Job ID': r.uploadJob?._id,
        'Total Matched': r.matches?.length || 0,
        'Accuracy': `${r.accuracy || 0}%`,
        'Unmatched': r.unmatchedRecords?.length || 0,
        'Created At': new Date(r.createdAt).toISOString()
      }));
      const csv = parse(flatResults);
      res.header('Content-Type', 'text/csv');
      res.header('Content-Disposition', `attachment; filename="reconciliation-${Date.now()}.csv"`);
      return res.send(csv);
    }

    res.header('Content-Type', 'application/json');
    res.header('Content-Disposition', `attachment; filename="reconciliation-${Date.now()}.json"`);
    res.json({
      success: true,
      data: {
        totalResults: results.length,
        results
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.exportDashboardData = async (req, res, next) => {
  try {
    const { startDate, endDate, format = 'json' } = req.query;

    const query = {};
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const uploads = await UploadJob.find(query).countDocuments();
    const records = await Record.find(query).countDocuments();
    const reconciliations = await ReconciliationResult.find(query).countDocuments();

    const exportData = {
      exportDate: new Date().toISOString(),
      period: { startDate, endDate },
      summary: {
        totalUploads: uploads,
        totalRecords: records,
        totalReconciliations: reconciliations
      }
    };

    // Create audit log
    await createAuditLog({
      action: 'EXPORT',
      entity: 'DASHBOARD',
      entityId: null,
      userId: req.user.id,
      changes: {
        format,
        ...exportData.summary
      }
    });

    if (format === 'csv') {
      const csv = parse([exportData.summary]);
      res.header('Content-Type', 'text/csv');
      res.header('Content-Disposition', `attachment; filename="dashboard-${Date.now()}.csv"`);
      return res.send(csv);
    }

    res.header('Content-Type', 'application/json');
    res.header('Content-Disposition', `attachment; filename="dashboard-${Date.now()}.json"`);
    res.json({
      success: true,
      data: exportData
    });
  } catch (error) {
    next(error);
  }
};
