/**
 * Khai báo môi trường cho import CSS side-effect từ gói ngoài
 * (`import 'gooey-search-tabs/styles.css'` ở `search-tabs.tsx`).
 *
 * Vì sao cần: `moduleResolution: NodeNext` phân giải MỌI specifier, kể cả
 * import side-effect, và `dist/index.css` không có khai báo kiểu nào đi kèm —
 * `tsc` báo `TS2307: Cannot find module` và cả package đỏ ở bước typecheck dù
 * runtime hoàn toàn đúng (vite và Next đều xử lý được `.css`).
 *
 * Phạm vi CỐ Ý hẹp: chỉ `*.css`. Không mở rộng sang `*.svg`/`*.png` — hợp đồng
 * §16.A.10 chốt hệ này không dùng ảnh raster, nên một wildcard cho ảnh sẽ là
 * một cánh cửa mở sẵn cho thứ đã bị cấm ở chỗ khác.
 */
declare module '*.css';
