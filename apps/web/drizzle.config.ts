import { defineConfig } from 'drizzle-kit';

const url = process.env['DATABASE_URL'];
if (!url) {
  // Errors over silent fallbacks: chạy migration vào DB mặc định sai còn tệ hơn là dừng.
  throw new Error('DATABASE_URL chưa được đặt — xem apps/web/.env.example');
}

export default defineConfig({
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
