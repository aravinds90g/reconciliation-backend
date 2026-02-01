const AuditLog = require('../models/AuditLog');

exports.createAuditLog = async (logData) => {
  try {
    const auditLog = new AuditLog({
      ...logData,
      timestamp: new Date()
    });
    
    await auditLog.save();
    return auditLog;
  } catch (error) {
    console.error('Failed to create audit log:', error);
    // Don't throw error for audit log failures to avoid breaking main functionality
    return null;
  }
};

exports.logAction = (action, entity, entityId, userId, changes = {}, context = {}) => {
  return exports.createAuditLog({ // Use exports.createAuditLog to handle self-reference if needed, or just function call
    action,
    entity,
    entityId,
    userId,
    changes,
    source: context.source || 'api',
    requestId: context.requestId,
    sessionId: context.sessionId,
    additionalContext: context.additionalContext || {}
  });
};
