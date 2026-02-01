const mongoose = require('mongoose');

const reconciliationResultSchema = new mongoose.Schema({
  uploadJob: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UploadJob',
    required: true,
    unique: true
  },
  
  // Summary statistics
  summary: {
    totalRecords: {
      type: Number,
      default: 0
    },
    matched: {
      type: Number,
      default: 0
    },
    partiallyMatched: {
      type: Number,
      default: 0
    },
    unmatched: {
      type: Number,
      default: 0
    },
    duplicates: {
      type: Number,
      default: 0
    },
    accuracyPercentage: {
      type: Number,
      default: 0
    }
  },
  
  // Detailed matches
  matches: [{
    systemRecord: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Record'
    },
    uploadedRecord: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Record'
    },
    matchType: {
      type: String,
      enum: ['exact', 'partial']
    },
    confidenceScore: Number,
    matchedFields: [String],
    mismatchedFields: [{
      field: String,
      systemValue: mongoose.Schema.Types.Mixed,
      uploadedValue: mongoose.Schema.Types.Mixed
    }]
  }],
  
  // Unmatched records
  unmatchedRecords: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Record'
  }],
  
  // Duplicates
  duplicateGroups: [{
    transactionId: String,
    records: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Record'
    }],
    count: Number
  }],
  
  // Processing metadata
  processingTime: {
    type: Number // in milliseconds
  },
  startedAt: {
    type: Date
  },
  completedAt: {
    type: Date
  },
  rulesApplied: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ReconciliationResult', reconciliationResultSchema);
