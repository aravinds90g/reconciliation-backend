const { createAuditLog } = require('../services/auditService');

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

const errorHandler = (err, req, res, next) => {
  // Log error
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    body: req.body,
    user: req.user ? req.user.id : 'unauthenticated'
  });

  // Create audit log for server errors
  if (err.statusCode >= 500 && req.user) {
    createAuditLog({
      action: 'ERROR',
      entity: 'SYSTEM',
      entityId: null,
      userId: req.user.id,
      changes: {
        error: err.message,
        path: req.path,
        method: req.method
      },
      source: 'api'
    }).catch(logError => {
      console.error('Failed to create error audit log:', logError);
    });
  }

  // Set default values
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // Send error response
  if (process.env.NODE_ENV === 'development') {
    res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        status: err.status,
        statusCode: err.statusCode,
        stack: err.stack
      }
    });
  } else {
    // Production: Don't leak error details
    if (err.isOperational) {
      res.status(err.statusCode).json({
        success: false,
        error: {
          message: err.message,
          status: err.status
        }
      });
    } else {
      // Programming or unknown errors
      console.error('ERROR 💥:', err);
      res.status(500).json({
        success: false,
        error: {
          message: 'Something went wrong!',
          status: 'error'
        }
      });
    }
  }
};

// Handle specific Mongoose errors
const handleMongoError = (err) => {
  let error = { ...err };
  error.message = err.message;

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = `Resource not found with id of ${err.value}`;
    error = new AppError(message, 404);
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const value = err.keyValue[field];
    const message = `Duplicate field value: ${value}. Please use another value for ${field}`;
    error = new AppError(message, 400);
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(el => el.message);
    const message = `Invalid input data: ${errors.join('. ')}`;
    error = new AppError(message, 400);
  }

  return error;
};

// Handle JWT errors
const handleJWTError = () =>
  new AppError('Invalid token. Please log in again!', 401);

const handleJWTExpiredError = () =>
  new AppError('Your token has expired! Please log in again.', 401);

module.exports = {
  errorHandler,
  AppError,
  handleMongoError,
  handleJWTError,
  handleJWTExpiredError
};
