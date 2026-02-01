const mongoose = require('mongoose');

const recordSchema = new mongoose.Schema({
  // Source identification
  source: {
    type: String,
    enum: ['system', 'upload'],
    required: true
  },
  uploadJob: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UploadJob',
    required: function() {
      return this.source === 'upload';
    }
  },
  
  // Transaction data
  transactionId: {
    type: String,
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  referenceNumber: {
    type: String,
    required: true,
    index: true
  },
  date: {
    type: Date,
    required: true
  },
  
  // Additional fields (flexible)
  additionalData: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Reconciliation status
  status: {
    type: String,
    enum: ['pending', 'matched', 'partially_matched', 'unmatched', 'duplicate'],
    default: 'pending'
  },
  
  // Matching information
  matchDetails: {
    matchedWith: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Record'
    },
    matchType: {
      type: String,
      enum: ['exact', 'partial', 'none']
    },
    confidenceScore: {
      type: Number,
      min: 0,
      max: 100
    },
    varianceAmount: {
      type: Number
    },
    variancePercentage: {
      type: Number
    }
  },
  
  // Duplicate detection
  isDuplicate: {
    type: Boolean,
    default: false
  },
  duplicateOf: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Record'
  },
  duplicateGroup: {
    type: String
  },
  
  // Audit fields
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  version: {
    type: Number,
    default: 1
  }
}, {
  timestamps: true
});

// Compound indexes for efficient querying
recordSchema.index({ transactionId: 1, source: 1 });
recordSchema.index({ referenceNumber: 1, source: 1 });
recordSchema.index({ status: 1, source: 1 });
recordSchema.index({ date: 1 });
recordSchema.index({ uploadJob: 1 });

// Pre-save hook to update version
recordSchema.pre('save', function(next) {
  if (this.isModified()) {
    this.version += 1;
  }
  next();
});

module.exports = mongoose.model('Record', recordSchema);
