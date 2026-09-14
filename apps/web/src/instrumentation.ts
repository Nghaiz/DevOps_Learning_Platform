/**
 * Hook `register()` của Next — chạy MỘT LẦN mỗi khi runtime server khởi động.
 *
 * Vì sao file này nằm ở `src/` chứ không ở gốc `apps/web/`: Next 16 nhận CẢ HAI
 * (`next/dist/build/utils.js` đẩy `<gốc>/instrumentation.<ext>` và
 * `<gốc>/src/instrumentation.<ext>` vào cùng một danh sách ứng viên), nhưng
 * `include` của `tsconfig.json` chỉ liệt kê `src/**` — đặt ở gốc thì file này là
 * phần mã DUY NHẤT không ai typecheck và không eslint nào quét, đúng cái bẫy mà
 * `package.json` đã ghi lại cho `e2e/**`. Chọn chỗ được cả hai cổng phủ.
 */
export async function register(): Promise<void> {
  // Runtime edge không có timer nền lẫn kết nối Postgres.
  if (process.env['NEXT_RUNTIME'] !== 'nodejs') return;
  // `next build` cũng gọi `register()`. Khởi động worker ở đó là mở kết nối DB
  // trong một bước dựng ảnh Docker vốn KHÔNG có DATABASE_URL — cùng lý do
  // `db/client.ts` bắt buộc phải lazy.
  if (process.env['NEXT_PHASE'] === 'phase-production-build') return;

  const { startPasswordResetOutboxWorker } = await import(
    './server/auth/password-reset-outbox-worker'
  );
  startPasswordResetOutboxWorker();
}
