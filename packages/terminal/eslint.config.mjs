import base from '../../eslint.config.mjs';

// Khối globals cho `scripts/**/*.mjs` từng nằm ở đây; nó đã lên base khi
// packages/scenario cần đúng thứ đó (rule-of-two, xem eslint.config.mjs gốc).
export default base;
