const AuditLog = require('../models/AuditLog');

exports.getAuditLogs = async (req, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      entity, 
      entityId, 
      action,
      userId,
      startDate,
      endDate 
    } = req.query;
    
    const query = {};
    
    if (entity) query.entity = entity;
    if (entityId) query.entityId = entityId;
    if (action) query.action = action;
    if (userId) query.userId = userId;
    
    // Date range filter
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }
    
    const auditLogs = await AuditLog.find(query)
      .populate('userId', 'name email')
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await AuditLog.countDocuments(query);
    
    res.status(200).json({
      success: true,
      data: {
        data: auditLogs,
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

exports.getRecordAuditTrail = async (req, res, next) => {
  try {
    const { recordId } = req.params;
    
    const auditLogs = await AuditLog.find({ 
      entity: 'RECORD',
      entityId: recordId
    })
    .populate('userId', 'name email')
    .sort({ timestamp: -1 });
    
    // Format for timeline view
    const timeline = auditLogs.map(log => ({
      id: log._id,
      action: log.action,
      timestamp: log.timestamp,
      user: log.userId,
      changes: log.changes,
      source: log.source
    }));
    
    res.status(200).json({
      success: true,
      data: { timeline }
    });
  } catch (error) {
    next(error);
  }
};

exports.getEntityAuditSummary = async (req, res, next) => {
  try {
    const { entity, entityId } = req.query;
    
    const query = {};
    if (entity) query.entity = entity;
    if (entityId) query.entityId = entityId;
    
    const summary = await AuditLog.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            action: '$action',
            date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.action',
          dailyStats: {
            $push: {
              date: '$_id.date',
              count: '$count'
            }
          },
          total: { $sum: '$count' }
        }
      }
    ]);
    
    res.status(200).json({
      success: true,
      data: { summary }
    });
  } catch (error) {
    next(error);
  }
};
