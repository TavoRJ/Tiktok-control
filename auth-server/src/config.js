const path = require('path');
const dotenv = require('dotenv');
const { z } = require('zod');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const configSchema = z.object({
  PORT: z.string().transform((val) => parseInt(val, 10)).default('4000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 chars'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 chars'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  ADMIN_API_KEY: z.string().min(8, 'ADMIN_API_KEY must be configured'),
  GOOGLE_CLIENT_ID: z.string().optional().default('dev_google_client_id_tavlive_2026.apps.googleusercontent.com'),
  GOOGLE_CLIENT_SECRET: z.string().optional().default('dev_google_client_secret_tavlive_2026'),
  DB_PATH: z.string().optional().default(process.env.DB_FILE_PATH || './data/tavlive_auth.db'),
  DB_FILE_PATH: z.string().optional().default('./data/tavlive_auth.db')
});

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid Environment Configuration:', parsed.error.format());
  process.exit(1);
}

module.exports = parsed.data;
