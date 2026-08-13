import '@testing-library/jest-dom/vitest';

/**
 * Nạp matcher của `@testing-library/jest-dom` (`toBeInTheDocument`,
 * `toBeDisabled`, `toHaveAttribute`, …).
 *
 * Đường import PHẢI là `/vitest`, không phải bare `@testing-library/jest-dom`:
 * bản bare đăng ký vào `expect` của Jest. Với vitest nó chạy nhưng KHÔNG gắn
 * matcher nào, và triệu chứng là `expect(...).toBeInTheDocument is not a
 * function` ở giữa một file test trông hoàn toàn bình thường.
 */
