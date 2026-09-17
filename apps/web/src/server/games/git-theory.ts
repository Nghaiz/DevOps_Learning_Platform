import { join } from 'node:path';

import { GIT_THEORY_IDS, type TheoryDoc } from '@devops-platform/games';

import { loadTheoryDocs } from './theory-docs';

/**
 * Bộ nạp bài lý thuyết của game Git — **chạy ở SERVER, đúng một lần mỗi lần tải
 * trang**.
 *
 * ⛔ Vì sao không fetch lúc chơi: ô nghiệm thu AC-2 của trụ cột ③ là **0 lời gọi
 * backend trong lúc chơi**, đo bằng Playwright network trace. Một `theory.get`
 * qua tRPC lúc người chơi mở hộp bài giảng sẽ phá đúng ô đó.
 *
 * Nên toàn bộ 32 bài đi cùng payload của trang. Tổng ~15.000 từ tiếng Việt,
 * khoảng 100KB thô — chấp nhận được cho một trang mà người ta ở lại hàng chục
 * phút, và rẻ hơn một round-trip cho mỗi lần mở panel.
 *
 * ⚠ `content/` ĐỌC LÚC CHẠY nên Next **không** trace nó vào output standalone.
 * `apps/web/Dockerfile` phải `COPY content ./content` tường minh (dòng 204 hiện
 * có), và `.dockerignore` phải giữ dòng `!content/` + `**` + `/*.md` (dòng 40) để ngoại
 * lệ đó thắng luật loại-mọi-markdown ở trên. Cả hai đã đúng tại thời điểm P17; ô AC-10
 * kiểm một FILE cụ thể chứ không kiểm thư mục, vì `.dockerignore` từng bóc sạch
 * markdown mà `ls` vẫn xanh do thư mục vẫn tồn tại.
 */

const THEORY_DIR = join(process.cwd(), '..', '..', 'content', 'games', 'git', 'theory');

/** Thư mục nội dung, cũng dùng cho phép kiểm trong test và trong AC-10. */
export function gitTheoryDir(): string {
  return THEORY_DIR;
}

/**
 * Đọc cả 32 bài từ đĩa.
 *
 * ⚠ Ném khi bộ kiểm chéo báo lỗi, và đó là chủ ý: một bài trỏ vào level không
 * tồn tại (hoặc một level không bài nào phủ) là lỗi NỘI DUNG, và nó phải nổ ở
 * lúc dựng trang chứ không im lặng cho ra một nút "Bài giảng" bấm vào thì trống.
 * Kiểu lỗi im lặng đó là thứ `validateTheoryDocs` sinh ra để chặn.
 */
export function loadGitTheory(levelIds: readonly string[]): readonly TheoryDoc[] {
  return loadTheoryDocs(THEORY_DIR, 'git', levelIds, 'game Git');
}

/** Danh sách id bài mong đợi, để test khẳng định đĩa khớp hợp đồng. */
export const EXPECTED_THEORY_IDS = GIT_THEORY_IDS;
