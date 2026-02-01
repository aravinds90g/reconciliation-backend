const Record = require('../models/Record');
const ReconciliationResult = require('../models/ReconciliationResult');
const { createAuditLog } = require('./auditService');

class ReconciliationService {
  constructor(config = {}) {
    this.config = {
      exactMatchThreshold: 100, // 100% match
      partialMatchThreshold: 98, // ±2% variance
      amountVariancePercentage: 2,
      ...config
    };
  }

  async reconcileUpload(uploadJobId, userId) {
    try {
      console.log(`Starting reconciliation for upload job: ${uploadJobId}`);
      
      // Get all records from this upload
      const uploadedRecords = await Record.find({ 
        uploadJob: uploadJobId,
        source: 'upload'
      }).lean();

      if (!uploadedRecords || uploadedRecords.length === 0) {
        console.log(`No uploaded records found for job: ${uploadJobId}`);
        throw new Error('No records found for this upload job');
      }

      // Get all system records
      const systemRecords = await Record.find({ 
        source: 'system' 
      }).lean();

      console.log(`Found ${uploadedRecords.length} uploaded records and ${systemRecords.length} system records`);

      const result = {
        matches: [],
        unmatchedRecords: [],
        duplicateGroups: new Map(),
        startedAt: Date.now(),
        summary: {
          totalRecords: uploadedRecords.length,
          matched: 0,
          partiallyMatched: 0,
          unmatched: 0,
          duplicates: 0
        }
      };

      // Find duplicates within uploaded records
      const duplicates = this.findDuplicates(uploadedRecords);
      result.duplicateGroups = duplicates;
      result.summary.duplicates = duplicates.size;

      // Process each uploaded record
      for (const uploadedRecord of uploadedRecords) {
        // Skip if marked as duplicate
        if (this.isDuplicate(uploadedRecord.transactionId, duplicates)) {
          continue;
        }

        // Find matches
        const match = await this.findMatch(uploadedRecord, systemRecords);
        
        if (match.matchType === 'exact') {
          result.summary.matched++;
          result.matches.push({
            ...match,
            uploadedRecord: uploadedRecord._id,
            systemRecord: match.systemRecord._id
          });

          // Update record status
          await this.updateRecordStatus(uploadedRecord._id, 'matched', match, userId);
        } else if (match.matchType === 'partial') {
          result.summary.partiallyMatched++;
          result.matches.push({
            ...match,
            uploadedRecord: uploadedRecord._id,
            systemRecord: match.systemRecord._id
          });

          await this.updateRecordStatus(uploadedRecord._id, 'partially_matched', match, userId);
        } else {
          result.summary.unmatched++;
          result.unmatchedRecords.push(uploadedRecord._id);

          await this.updateRecordStatus(uploadedRecord._id, 'unmatched', null, userId);
        }
      }

      // Calculate accuracy percentage
      result.summary.accuracyPercentage = this.calculateAccuracy(result.summary);

      // Save reconciliation result
      const reconciliationResult = await this.saveResult(
        uploadJobId, 
        result, 
        userId
      );

      console.log(`Reconciliation completed for upload job: ${uploadJobId}`);
      return reconciliationResult;

    } catch (error) {
      console.error(`Reconciliation failed for upload job ${uploadJobId}:`, error);
      throw error;
    }
  }

  findDuplicates(records) {
    const duplicateGroups = new Map();
    const transactionMap = new Map();

    records.forEach(record => {
      const key = record.transactionId;
      if (!transactionMap.has(key)) {
        transactionMap.set(key, []);
      }
      transactionMap.get(key).push(record);
    });

    // Filter groups with more than 1 record
    for (const [transactionId, groupRecords] of transactionMap) {
      if (groupRecords.length > 1) {
        duplicateGroups.set(transactionId, {
          transactionId,
          records: groupRecords.map(r => r._id),
          count: groupRecords.length
        });
      }
    }

    return duplicateGroups;
  }

  isDuplicate(transactionId, duplicateGroups) {
    return duplicateGroups.has(transactionId);
  }

  async findMatch(uploadedRecord, systemRecords) {
    // First check for exact match
    for (const systemRecord of systemRecords) {
      if (this.isExactMatch(uploadedRecord, systemRecord)) {
        return {
          systemRecord,
          matchType: 'exact',
          confidenceScore: 100,
          matchedFields: ['transactionId', 'amount', 'referenceNumber', 'date'],
          mismatchedFields: []
        };
      }
    }

    // Check for partial matches
    let bestMatch = null;
    let highestScore = 0;

    for (const systemRecord of systemRecords) {
      const score = this.calculateMatchScore(uploadedRecord, systemRecord);
      
      if (score > highestScore && score >= this.config.partialMatchThreshold) {
        highestScore = score;
        bestMatch = systemRecord;
      }
    }

    if (bestMatch) {
      const mismatchedFields = this.getMismatchedFields(uploadedRecord, bestMatch);
      return {
        systemRecord: bestMatch,
        matchType: 'partial',
        confidenceScore: highestScore,
        matchedFields: this.getMatchedFields(uploadedRecord, bestMatch),
        mismatchedFields
      };
    }

    return {
      systemRecord: null,
      matchType: 'none',
      confidenceScore: 0,
      matchedFields: [],
      mismatchedFields: []
    };
  }

  isExactMatch(record1, record2) {
    return (
      record1.transactionId === record2.transactionId &&
      record1.amount === record2.amount &&
      record1.referenceNumber === record2.referenceNumber &&
      Math.abs(new Date(record1.date) - new Date(record2.date)) < 1000 // Same date within 1 second
    );
  }

  calculateMatchScore(uploadedRecord, systemRecord) {
    let score = 0;
    const fieldWeights = {
      transactionId: 40,
      referenceNumber: 35,
      amount: 20,
      date: 5
    };

    // Check transaction ID
    if (uploadedRecord.transactionId === systemRecord.transactionId) {
      score += fieldWeights.transactionId;
    }

    // Check reference number
    if (uploadedRecord.referenceNumber === systemRecord.referenceNumber) {
      score += fieldWeights.referenceNumber;
    }

    // Check amount with variance
    const amountVariance = Math.abs(uploadedRecord.amount - systemRecord.amount);
    const amountVariancePercent = (amountVariance / systemRecord.amount) * 100;
    
    if (amountVariancePercent <= this.config.amountVariancePercentage) {
      score += fieldWeights.amount * (1 - amountVariancePercent / 100);
    }

    // Check date (within same day)
    const date1 = new Date(uploadedRecord.date).toDateString();
    const date2 = new Date(systemRecord.date).toDateString();
    if (date1 === date2) {
      score += fieldWeights.date;
    }

    return Math.min(100, score);
  }

  getMatchedFields(record1, record2) {
    const matchedFields = [];
    
    if (record1.transactionId === record2.transactionId) matchedFields.push('transactionId');
    if (record1.referenceNumber === record2.referenceNumber) matchedFields.push('referenceNumber');
    if (record1.amount === record2.amount) matchedFields.push('amount');
    
    const date1 = new Date(record1.date).toDateString();
    const date2 = new Date(record2.date).toDateString();
    if (date1 === date2) matchedFields.push('date');

    return matchedFields;
  }

  getMismatchedFields(record1, record2) {
    const mismatchedFields = [];
    
    if (record1.transactionId !== record2.transactionId) {
      mismatchedFields.push({
        field: 'transactionId',
        uploadedValue: record1.transactionId,
        systemValue: record2.transactionId
      });
    }
    
    if (record1.referenceNumber !== record2.referenceNumber) {
      mismatchedFields.push({
        field: 'referenceNumber',
        uploadedValue: record1.referenceNumber,
        systemValue: record2.referenceNumber
      });
    }
    
    if (record1.amount !== record2.amount) {
      mismatchedFields.push({
        field: 'amount',
        uploadedValue: record1.amount,
        systemValue: record2.amount,
        variance: Math.abs(record1.amount - record2.amount),
        variancePercentage: (Math.abs(record1.amount - record2.amount) / record2.amount) * 100
      });
    }
    
    const date1 = new Date(record1.date);
    const date2 = new Date(record2.date);
    if (date1.toDateString() !== date2.toDateString()) {
      mismatchedFields.push({
        field: 'date',
        uploadedValue: record1.date,
        systemValue: record2.date
      });
    }

    return mismatchedFields;
  }

  calculateAccuracy(summary) {
    const totalProcessed = summary.matched + summary.partiallyMatched + summary.unmatched;
    if (totalProcessed === 0) return 0;

    // Weight exact matches higher than partial matches
    const weightedScore = (summary.matched * 1.0 + summary.partiallyMatched * 0.5);
    return Math.round((weightedScore / totalProcessed) * 100);
  }

  async updateRecordStatus(recordId, status, matchDetails = null, userId) {
    const updateData = {
      status,
      lastModifiedBy: userId
    };

    if (matchDetails) {
      updateData.matchDetails = {
        matchedWith: matchDetails.systemRecord?._id,
        matchType: matchDetails.matchType,
        confidenceScore: matchDetails.confidenceScore
      };
    }

    await Record.findByIdAndUpdate(recordId, updateData);

    // Create audit log
    await createAuditLog({
      action: 'UPDATE',
      entity: 'RECORD',
      entityId: recordId,
      userId,
      changes: {
        oldValue: { status: 'pending' },
        newValue: { status },
        changedFields: ['status']
      }
    });
  }

  async saveResult(uploadJobId, result, userId) {
    const reconciliationResult = new ReconciliationResult({
      uploadJob: uploadJobId,
      summary: result.summary,
      matches: result.matches,
      unmatchedRecords: result.unmatchedRecords,
      duplicateGroups: Array.from(result.duplicateGroups.values()),
      processingTime: Date.now() - result.startedAt,
      completedAt: new Date(),
      rulesApplied: this.config
    });

    await reconciliationResult.save();

    // Create audit log
    await createAuditLog({
      action: 'RECONCILE',
      entity: 'RECONCILIATION',
      entityId: reconciliationResult._id,
      userId,
      changes: {
        newValue: result.summary
      }
    });

    return reconciliationResult;
  }
}

module.exports = ReconciliationService;
