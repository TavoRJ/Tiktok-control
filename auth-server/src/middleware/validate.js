/**
 * Zod validation middleware factory
 * @param {import('zod').ZodSchema} schema 
 */
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const formattedErrors = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: formattedErrors
      });
    }
    req.body = result.data;
    next();
  };
}

module.exports = validate;
