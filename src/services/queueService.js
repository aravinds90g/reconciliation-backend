const Queue = require('bull');
const Redis = require('ioredis');
const ReconciliationService = require('./reconciliationService');
const UploadJob = require('../models/UploadJob');

// Redis connection
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: 3,
  enableReadyCheck: false
};

// Create queues
const reconciliationQueue = new Queue('reconciliation', { 
  redis: redisConfig,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000
    },
    removeOnComplete: true,
    removeOnFail: false
  }
});

const fileProcessingQueue = new Queue('file-processing', {
  redis: redisConfig,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'fixed',
      delay: 5000
    },
    timeout: 300000, // 5 minutes timeout
    removeOnComplete: true,
    removeOnFail: false
  }
});

// Process reconciliation jobs
reconciliationQueue.process(5, async (job) => { // Process 5 jobs concurrently
  try {
    const { jobId, userId } = job.data;
    
    console.log(`Processing reconciliation job: ${jobId}`);
    
    const reconciliationService = new ReconciliationService();
    const result = await reconciliationService.reconcileUpload(jobId, userId);
    
    // Update upload job status
    await UploadJob.findOneAndUpdate(
      { jobId },
      { 
        $set: { 
          'metadata.lastReconciliation': new Date(),
          'metadata.reconciliationResult': result._id
        }
      }
    );
    
    return result;
  } catch (error) {
    console.error(`Reconciliation job failed: ${error.message}`);
    throw error;
  }
});

// Process file processing jobs
fileProcessingQueue.process(3, async (job) => {
  try {
    const { filePath, userId, columnMapping } = job.data;
    
    console.log(`Processing file: ${filePath}`);
    
    // Your file processing logic here
    // This would be called from the upload controller
    
    return { success: true, filePath };
  } catch (error) {
    console.error(`File processing failed: ${error.message}`);
    throw error;
  }
});

// Event listeners
reconciliationQueue.on('completed', (job, result) => {
  console.log(`Reconciliation job ${job.id} completed successfully`);
});

reconciliationQueue.on('failed', (job, error) => {
  console.error(`Reconciliation job ${job.id} failed:`, error.message);
  
  // Update upload job status to failed
  if (job.data.jobId) {
    UploadJob.findOneAndUpdate(
      { jobId: job.data.jobId },
      { 
        status: 'failed',
        error: error.message
      }
    ).catch(err => console.error('Failed to update job status:', err));
  }
});

reconciliationQueue.on('stalled', (job) => {
  console.warn(`Reconciliation job ${job.id} stalled`);
});

fileProcessingQueue.on('completed', (job, result) => {
  console.log(`File processing job ${job.id} completed`);
});

fileProcessingQueue.on('failed', (job, error) => {
  console.error(`File processing job ${job.id} failed:`, error.message);
});

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log('Shutting down queues gracefully...');
  
  await reconciliationQueue.close();
  await fileProcessingQueue.close();
  
  console.log('Queues closed');
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

module.exports = {
  reconciliationQueue,
  fileProcessingQueue,
  processReconciliationQueue: reconciliationQueue
};
