const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');

function notFound(req, res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

function toApiError(err) {
  if (err instanceof ApiError) return err;
  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.fromEntries(Object.entries(err.errors).map(([field, e]) => [field, e.message]));
    return new ApiError(400, 'Validation failed', { code: 'VALIDATION_ERROR', details });
  }
  if (err instanceof mongoose.Error.CastError) {
    return new ApiError(400, `Invalid value for ${err.path}`, { code: 'INVALID_ID' });
  }
  if (err && err.code === 11000) {
    const fields = Object.keys(err.keyValue || {}).join(', ');
    return new ApiError(409, `Duplicate value for ${fields || 'unique field'}`, { code: 'DUPLICATE' });
  }
  if (err && err.type === 'entity.parse.failed') {
    return new ApiError(400, 'Malformed JSON body', { code: 'BAD_JSON' });
  }
  return new ApiError(err.status || 500, err.status ? err.message : 'Internal server error', { code: 'INTERNAL' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const apiError = toApiError(err);
  if (apiError.status >= 500) console.error(err);
  res.status(apiError.status).json({
    error: {
      message: apiError.message,
      code: apiError.code,
      ...(apiError.details ? { details: apiError.details } : {}),
    },
  });
}

module.exports = { notFound, errorHandler };
