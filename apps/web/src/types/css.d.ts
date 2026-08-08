// TypeScript 6.0 bỏ việc tự suy ra kiểu cho side-effect import của file không
// phải mã nguồn: `import './globals.css'` giờ báo TS2882 nếu không có khai báo
// module. Bundler (Next/Turbopack) vẫn xử lí bình thường — đây thuần tuý là
// khoảng trống ở phía type, không phải thay đổi hành vi lúc chạy.
//
// Thân khai báo để RỖNG có chủ đích, không phải `any`. Repo chưa dùng CSS
// Modules; nếu sau này ai đó viết `import styles from './x.module.css'` thì
// module rỗng làm nó lỗi ngay lúc type-check ("không có default export") thay
// vì âm thầm cho `styles` kiểu `any` rồi hỏng lúc chạy. Khi thật sự cần CSS
// Modules, thêm một khai báo riêng cho `*.module.css` với kiểu
// `Record<string, string>` — đừng nới cái này thành `any`.
declare module '*.css' {}
