/**
 * Global Error Handler Middleware
 * Sanitizes errors so no internal database stack traces or secret keys are leaked.
 */
function errorHandler(err, req, res, next) {
  // Clean log message (avoid printing req.body containing passwords or tokens)
  const sanitizedPath = req.originalUrl || req.url;
  const sanitizedMethod = req.method;
  console.error(`[API ERROR] ${sanitizedMethod} ${sanitizedPath}: ${err.message || 'Internal Server Error'}`);

  const statusCode = err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  res.status(statusCode).json({
    success: false,
    error: isProduction && statusCode === 500 ? 'Internal Server Error' : (err.message || 'An error occurred')
  });
}

module.exports = errorHandler;
