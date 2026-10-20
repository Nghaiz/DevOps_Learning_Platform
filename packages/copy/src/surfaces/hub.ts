import type { ErrorEntry, IntentionalThree, Surface } from '../types.ts';

/**
 * Surface `hub.`: trang tổng quan của từng mục cha (`/learn`, `/practice`, `/judge`,
 * `/studio`). Tên và câu dẫn của mục nằm ở `shell.section.*`, tên và mô tả từng trang
 * con nằm ở `shell.nav.*`; ở đây chỉ có chữ RIÊNG của trang tổng quan: nút hành động,
 * đơn vị đếm, tiêu đề các khối động.
 */
export const hub = {
  'hub.doors.label': (p: { section: string }) => `Các phần của mục ${p.section}`,

  // ── Đơn vị đi cạnh con số ở mỗi cửa vào ─────────────────────────────────
  'hub.unit.paths': 'lộ trình',
  'hub.unit.lessons': 'bài học',
  'hub.unit.quizzes': 'bộ câu hỏi',
  'hub.unit.labs': 'lab',
  'hub.unit.playgrounds': 'loại máy',
  'hub.unit.problems': 'đề',
  'hub.unit.games': 'game',
  'hub.unit.drafts': 'bản nháp',

  // ── Học ─────────────────────────────────────────────────────────────────
  'hub.learn.start': 'Chọn một bài học',
  'hub.learn.paths': 'Xem lộ trình',

  // ── Thực hành ───────────────────────────────────────────────────────────
  'hub.practice.start': 'Chọn một lab',
  'hub.practice.playground': 'Mở sân chơi',
  'hub.practice.rule.title': 'Trước khi mở máy',
  'hub.practice.rule.expiry': 'Máy tự tắt khi hết giờ. File trong máy mất theo, còn điểm và tiến độ vẫn được giữ.',
  'hub.practice.rule.shared': 'Cụm dùng chung cả lớp. Xong việc thì tắt máy ở Trang của tôi để nhường chỗ.',
  'hub.practice.rule.size': 'Bài có IDE hoặc lab Kubernetes cần máy lớn hơn, nên số chỗ cho chúng ít hơn.',
  'hub.practice.rule.window': 'Cần terminal to hơn thì tách nó ra cửa sổ riêng. Vẫn là máy đó, không tốn thêm chỗ.',

  // ── Luyện đề ────────────────────────────────────────────────────────────
  'hub.judge.start': 'Vào kho đề',
  'hub.judge.by-game': 'Đề theo trò chơi',
  'hub.judge.by-game-description': 'Mỗi đề là một màn chơi có mục tiêu chấm tự động. Bấm để xem đề của riêng game đó.',
  'hub.judge.game-open': (p: { game: string }) => `Đề ${p.game}`,

  // ── Soạn bài ────────────────────────────────────────────────────────────
  'hub.studio.new-lesson': 'Viết bài mới',
  'hub.studio.new-problem': 'Ra đề mới',
  'hub.studio.recent': 'Sửa gần đây',
  'hub.studio.recent-description': 'Năm bài bạn đụng tới gần nhất, kể cả bản nháp.',
  'hub.studio.recent-empty-title': 'Bạn chưa soạn bài nào',
  'hub.studio.recent-empty-body': 'Bài đầu tiên bắt đầu từ một bản nháp. Chưa xuất bản thì người học chưa thấy.',
  'hub.studio.updated': (p: { when: string }) => `Sửa lúc ${p.when}`,
  'hub.studio.steps': (p: { n: number }) => `${String(p.n)} bước`,

  'hub.error.studio-load': (p: { reason: string }): ErrorEntry => ({
    what: `Không tải được danh sách bài của bạn: ${p.reason}`,
    next: 'Bấm Thử lại. Bài vẫn còn nguyên, chỉ là trang chưa đọc được.',
  }),
} as const satisfies Surface<'hub'>;

export const hubIntentionalThree = {} as const satisfies IntentionalThree;
