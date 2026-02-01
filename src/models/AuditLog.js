const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    enum: [
      'CREATE', 'UPDATE', 'DELETE', 
      'UPLOAD', 'RECONCILE', 'CORRECT',
      'LOGIN', 'LOGOUT', 'EXPORT'
    ]
  },
  entity: {
    type: String,
    required: true,
    enum: ['USER', 'RECORD', 'UPLOAD_JOB', 'RECONCILIATION', 'SYSTEM']
  },
  entityId: {
    type: mongoose.Schema.Types.Mixed, // Changed to Mixed to allow null for system errors
    required: false // Changed to false for system errors
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Change details
  changes: {
    oldValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed,
    changedFields: [String],
    ipAddress: String,
    userAgent: String,
    error: String, // Added for error logging
    path: String, // Added for error logging
    method: String // Added for error logging
  },
  
  // Metadata
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  source: {
    type: String,
    enum: ['api', 'ui', 'system', 'batch'],
    default: 'api'
  },
  
  // Context
  requestId: String,
  sessionId: String,
  additionalContext: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
auditLogSchema.index({ entity: 1, entityId: 1 });
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ timestamp: -1 });

// Ensure immutability
auditLogSchema.pre('save', function(next) {
  if (this.isNew) {
      return next();
  }
  // Allow updates ONLY if it's not a new record - wait, the requirement says "Immutable".
  // The provided text says:
  // if (this.isModified()) { return next(new Error('Audit logs are immutable')); }
  // usage of isModified() usually catches any change. But on creation isModified is true?
  // Mongoose isnew check is better.
  
  if (!this.isNew) {
     return next(new Error('Audit logs are immutable'));
  }
  next();
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
