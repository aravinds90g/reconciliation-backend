const UploadJob = require('../models/UploadJob');
const ReconciliationResult = require('../models/ReconciliationResult');
const Record = require('../models/Record');
const User = require('../models/User');

exports.getDashboardSummary = async (req, res, next) => {
  try {
    const { startDate, endDate, uploadedBy } = req.query;
    
    const matchQuery = {};
    const uploadQuery = {};
    
    // Date filter
    if (startDate || endDate) {
      const dateFilter = {};
      if (startDate) dateFilter.$gte = new Date(startDate);
      if (endDate) dateFilter.$lte = new Date(endDate);
      
      matchQuery.createdAt = dateFilter;
      uploadQuery.createdAt = dateFilter;
    }
    
    // Uploaded by filter
    if (uploadedBy) {
      uploadQuery.uploadedBy = uploadedBy;
      // Get upload jobs by this user
      const userUploadJobs = await UploadJob.find({ uploadedBy }).select('_id');
      matchQuery.uploadJob = { $in: userUploadJobs.map(job => job._id) };
    }
    
    // Get upload stats
    const uploadStats = await UploadJob.aggregate([
      { $match: uploadQuery },
      {
        $group: {
          _id: null,
          totalUploads: { $sum: 1 },
          totalRecords: { $sum: '$totalRecords' },
          processing: { $sum: { $cond: [{ $eq: ['$status', 'processing'] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } }
        }
      }
    ]);
    
    // Get reconciliation stats
    const reconStats = await ReconciliationResult.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalReconciliations: { $sum: 1 },
          avgAccuracy: { $avg: '$summary.accuracyPercentage' },
          totalMatched: { $sum: '$summary.matched' },
          totalPartiallyMatched: { $sum: '$summary.partiallyMatched' },
          totalUnmatched: { $sum: '$summary.unmatched' },
          totalDuplicates: { $sum: '$summary.duplicates' }
        }
      }
    ]);
    
    // Get recent activities
    const recentUploads = await UploadJob.find(uploadQuery)
      .populate('uploadedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(5);
    
    // Get user list for filter
    const users = await User.find({ 
      role: { $in: ['admin', 'analyst'] } 
    }).select('name email _id');
    
    const result = {
      uploads: uploadStats[0] || {
        totalUploads: 0,
        totalRecords: 0,
        processing: 0,
        completed: 0,
        failed: 0
      },
      reconciliation: reconStats[0] || {
        totalReconciliations: 0,
        avgAccuracy: 0,
        totalMatched: 0,
        totalPartiallyMatched: 0,
        totalUnmatched: 0,
        totalDuplicates: 0
      },
      recentUploads,
      users
    };
    
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

exports.getChartData = async (req, res, next) => {
  try {
    const { period = '7d' } = req.query;
    
    let dateRange;
    const endDate = new Date();
    const startDate = new Date();
    
    switch (period) {
      case '1d':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      default:
        startDate.setDate(startDate.getDate() - 7);
    }
    
    // Get daily upload counts
    const uploadsByDay = await UploadJob.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          count: { $sum: 1 },
          totalRecords: { $sum: '$totalRecords' }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Get reconciliation accuracy trend
    const accuracyTrend = await ReconciliationResult.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          avgAccuracy: { $avg: '$summary.accuracyPercentage' },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Get status distribution
    const statusDistribution = await Record.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    res.status(200).json({
      success: true,
      data: {
        uploadsByDay,
        accuracyTrend,
        statusDistribution
      }
    });
  } catch (error) {
    next(error);
  }
};
