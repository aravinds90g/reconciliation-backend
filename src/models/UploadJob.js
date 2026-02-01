const mongoose = require('mongoose');

const uploadJobSchema = new mongoose.Schema({
  jobId: {
    type: String,
    required: true,
    unique: true
  },
  filename: {
    type: String,
    required: true
  },
  originalName: {
    type: String,
    required: true
  },
  fileType: {
    type: String,
    enum: ['csv', 'excel', 'xlsx', 'xls'],
    required: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'completed_with_errors', 'failed', 'cancelled'],
    default: 'pending'
  },
  totalRecords: {
    type: Number,
    default: 0
  },
  processedRecords: {
    type: Number,
    default: 0
  },
  columnMapping: {
    type: Map,
    of: String,
    default: {}
  },
  mandatoryFields: {
    type: [String],
    default: ['transactionId', 'amount', 'referenceNumber', 'date']
  },
  validationErrors: [{
    row: Number,
    field: String,
    error: String,
    value: String
  }],
  error: {
    type: String
  },
  processingStartedAt: {
    type: Date
  },
  processingCompletedAt: {
    type: Date
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// Indexes
uploadJobSchema.index({ uploadedBy: 1, createdAt: -1 });
uploadJobSchema.index({ status: 1 });
uploadJobSchema.index({ createdAt: -1 });

module.exports = mongoose.model('UploadJob', uploadJobSchema);
