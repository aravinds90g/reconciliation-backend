const Joi = require('joi');

const authSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  name: Joi.string().min(2).max(50).required(),
  role: Joi.string().valid('admin', 'analyst', 'viewer')
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

const uploadSchema = Joi.object({
  columnMapping: Joi.object().pattern(
    Joi.string(),
    Joi.string()
  ).optional()
});

const reconciliationConfigSchema = Joi.object({
  exactMatchThreshold: Joi.number().min(0).max(100).default(100),
  partialMatchThreshold: Joi.number().min(0).max(100).default(98),
  amountVariancePercentage: Joi.number().min(0).max(100).default(2)
});

const manualCorrectionSchema = Joi.object({
  field: Joi.string().required(),
  value: Joi.any().required(),
  matchStatus: Joi.string().valid('matched', 'partially_matched', 'unmatched', 'duplicate')
});

exports.validateAuth = (data) => authSchema.validate(data);
exports.validateLogin = (data) => loginSchema.validate(data);
exports.validateUpload = (data) => uploadSchema.validate(data);
exports.validateReconciliationConfig = (data) => reconciliationConfigSchema.validate(data);
exports.validateManualCorrection = (data) => manualCorrectionSchema.validate(data);
