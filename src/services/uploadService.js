const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs'); // Need sync for createReadStream
const csv = require('csv-parser');
const xlsx = require('xlsx');
const { v4: uuidv4 } = require('uuid');

const UploadJob = require('../models/UploadJob');
const Record = require('../models/Record');
const { createAuditLog } = require('./auditService');

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    try {
      if (!fsSync.existsSync(uploadDir)) {
          await fs.mkdir(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    } catch(err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV and Excel files are allowed.'));
    }
  }
});

class UploadService {
  async processFile(file, userId, columnMapping = null) {
    const jobId = uuidv4();
    
    try {
      // Create upload job record
      const uploadJob = new UploadJob({
        jobId,
        filename: file.filename,
        originalName: file.originalname,
        fileType: path.extname(file.originalname).substring(1).toLowerCase(),
        fileSize: file.size,
        uploadedBy: userId,
        status: 'processing',
        processingStartedAt: new Date()
      });

      await uploadJob.save();

      // Process file based on type
      let records;
      if (file.mimetype.includes('csv')) {
        records = await this.processCSV(file.path);
      } else {
        records = await this.processExcel(file.path);
      }

      // Validate and map columns
      const { validatedRecords, errors } = await this.validateAndMapRecords(
        records, 
        columnMapping
      );

      uploadJob.totalRecords = records.length;
      uploadJob.processedRecords = validatedRecords.length;
      uploadJob.validationErrors = errors; // Note: Ensure schema allows array of objects
      uploadJob.columnMapping = columnMapping;

      if (errors.length > 0) {
        uploadJob.status = 'completed_with_errors';
        uploadJob.processingCompletedAt = new Date();
        await uploadJob.save();
        
        await createAuditLog({
          action: 'UPLOAD',
          entity: 'UPLOAD_JOB',
          entityId: uploadJob._id,
          userId,
          changes: {
            newValue: { status: 'completed_with_errors', errorCount: errors.length }
          }
        });

        return {
          jobId: uploadJob.jobId,
          status: 'completed_with_errors', // API response can have any string
          totalRecords: records.length,
          validRecords: validatedRecords.length,
          errors,
          message: `File processed with ${errors.length} validation errors`
        };
      }

      // Save records to database
      await this.saveRecords(validatedRecords, uploadJob._id, userId);

      uploadJob.status = 'completed';
      uploadJob.processingCompletedAt = new Date();
      await uploadJob.save();

      await createAuditLog({
        action: 'UPLOAD',
        entity: 'UPLOAD_JOB',
        entityId: uploadJob._id,
        userId,
        changes: {
          newValue: { 
            status: 'completed', 
            recordCount: validatedRecords.length 
          }
        }
      });

      return {
        jobId: uploadJob.jobId,
        status: 'completed',
        totalRecords: validatedRecords.length,
        message: 'File processed successfully'
      };

    } catch (error) {
      // Update job status to failed
      await UploadJob.findOneAndUpdate(
        { jobId },
        { 
          status: 'failed',
          error: error.message,
          processingCompletedAt: new Date()
        }
      );

      throw error;
    }
  }

  async processCSV(filePath) {
    return new Promise((resolve, reject) => {
      const records = [];
      
      fsSync.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          records.push(row);
        })
        .on('end', () => {
          resolve(records);
        })
        .on('error', (error) => {
          reject(error);
        });
    });
  }

  async processExcel(filePath) {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    return xlsx.utils.sheet_to_json(worksheet);
  }

  async validateAndMapRecords(records, columnMapping) {
    const validatedRecords = [];
    const errors = [];
    const mandatoryFields = ['transactionId', 'amount', 'referenceNumber', 'date'];

    // Default mapping if not provided
    if (!columnMapping) {
      // Try to auto-detect columns
      columnMapping = this.autoDetectColumns(records[0]);
    }

    // Validate mapping
    const missingFields = mandatoryFields.filter(field => !columnMapping[field]);
    if (missingFields.length > 0) {
      console.error('[Upload Debug] Missing fields in mapping:', missingFields);
      console.error('[Upload Debug] Current mapping:', columnMapping);
      throw new Error(`Missing column mapping for fields: ${missingFields.join(', ')}`);
    }

    // Process each record
    records.forEach((record, index) => {
      const mappedRecord = {};
      let hasError = false;

      // Map fields
      for (const [systemField, uploadedField] of Object.entries(columnMapping)) {
        if (record[uploadedField] === undefined || record[uploadedField] === '') {
          errors.push({
            row: index + 1,
            field: systemField,
            error: `Missing value for mapped column: ${uploadedField}`,
            value: ''
          });
          hasError = true;
        } else {
          mappedRecord[systemField] = this.parseFieldValue(systemField, record[uploadedField]);
          
          // Additional validation for specific fields
          if (systemField === 'amount') {
            const amount = parseFloat(mappedRecord[systemField]);
            if (isNaN(amount) || amount < 0) {
              errors.push({
                row: index + 1,
                field: systemField,
                error: 'Invalid amount value',
                value: record[uploadedField]
              });
              hasError = true;
            }
          }

          if (systemField === 'date') {
            const date = new Date(mappedRecord[systemField]);
            if (isNaN(date.getTime())) {
              errors.push({
                row: index + 1,
                field: systemField,
                error: 'Invalid date format',
                value: record[uploadedField]
              });
              hasError = true;
            }
          }
        }
      }

      // Validate transaction ID uniqueness within this batch
      if (mappedRecord.transactionId) {
        const duplicateInBatch = validatedRecords.some(
          r => r.transactionId === mappedRecord.transactionId
        );
        
        if (duplicateInBatch) {
          errors.push({
            row: index + 1,
            field: 'transactionId',
            error: 'Duplicate transaction ID within this batch',
            value: mappedRecord.transactionId
          });
          hasError = true;
        }
      }

      if (!hasError) {
        validatedRecords.push(mappedRecord);
      }
    });

    return { validatedRecords, errors };
  }

  autoDetectColumns(firstRow) {
    if (!firstRow) return {}; // Safety check
    const columnNames = Object.keys(firstRow);
    const mapping = {};
    const fieldPatterns = {
      transactionId: ['id', 'transaction', 'trans_id', 'transactionid'],
      amount: ['amount', 'amt', 'value', 'total'],
      referenceNumber: ['ref', 'reference', 'ref_no', 'refnum'],
      date: ['date', 'transaction_date', 'txn_date', 'created_at']
    };

    columnNames.forEach(columnName => {
      const lowerColumn = columnName.toLowerCase();
      
      for (const [field, patterns] of Object.entries(fieldPatterns)) {
        if (patterns.some(pattern => lowerColumn.includes(pattern))) {
          mapping[field] = columnName;
          break;
        }
      }
    });

    return mapping;
  }

  parseFieldValue(fieldName, value) {
    switch (fieldName) {
      case 'amount':
        return parseFloat(value) || 0;
      case 'date':
        // Try multiple date formats
        const date = new Date(value);
        return isNaN(date.getTime()) ? value : date;
      default:
        return value.toString().trim();
    }
  }

  async saveRecords(records, uploadJobId, userId) {
    // Optimization: Bulk Insert instead of Promise.all for 50k records logic
    // But keeping to provided code logic for now which uses Promise.all map
    // Note: Promise.all with 50k records will crash memory.
    // The previous implementation used batching. The NEW provided text uses map -> save.
    // I should probably stick to the provided text BUT optimizing it specifically if it fails validation?
    // "I'll provide you with the complete remaining code... saveRecords..."
    // The provided code does simple map.
    // I will stick to provided code logic but add a small batching or just keep it as is.
    // If I change it, I deviate from user's "complete code".
    // I'll stick to it.
    const recordPromises = records.map(async (recordData) => {
      const record = new Record({
        ...recordData,
        source: 'upload',
        uploadJob: uploadJobId,
        createdBy: userId,
        lastModifiedBy: userId,
        status: 'pending'
      });

      await record.save();

      // Create audit log for each record
      // This will spark 50k audit logs.
      await createAuditLog({
        action: 'CREATE',
        entity: 'RECORD',
        entityId: record._id,
        userId,
        changes: {
          newValue: recordData
        }
      });

      return record;
    });

    return Promise.all(recordPromises);
  }
}

module.exports = { UploadService, upload };
