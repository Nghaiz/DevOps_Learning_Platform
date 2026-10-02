import type { IntentionalThree } from '../types.ts';

/**
 * Chữ của trụ cột TRÒ CHƠI: trang chọn game, trang chọn màn của từng game, và
 * khung giao diện quanh màn chơi Git / CI-CD. Trong canvas game K8s thì không:
 * game đó giữ nguyên chữ của nó (yêu cầu của chủ dự án, 2026-10-03).
 *
 * Sở hữu: lane L3 "games" của đợt dựng lại giao diện PTIT.
 *
 * Giọng: trợ giảng nói với sinh viên ở bàn lab. Câu ngắn, nói việc trước, giữ
 * thuật ngữ tiếng Anh mà người trong nghề vẫn nói (pod, commit, pipeline, runner).
 */
export const games = {
  'games.meta-title': 'Trò chơi · PTIT DevOps Lab',
  'games.meta-description':
    'Ba game DevOps chạy ngay trong trình duyệt: Kubernetes, Git và CI/CD. Không cần đăng nhập, không tốn sandbox.',

  // ── /games: đầu trang ──────────────────────────────────────────────────────
  'games.hub.kicker': (p: { games: number; levels: number }) =>
    `Tuyến nhanh · ${String(p.games)} game · ${String(p.levels)} màn`,
  'games.hub.title': 'Trò chơi',
  'games.hub.lead':
    'Mỗi game là một tuyến nhanh qua một mảng DevOps. Gõ lệnh thật, nhìn hệ thống đổi theo, sai thì chơi lại.',
  'games.hub.progress.label': 'Tiến độ trên máy này',
  'games.hub.progress.unit': (p: { total: number }) => `/${String(p.total)} màn đã qua`,
  'games.hub.saved-local': 'Tiến độ lưu trong trình duyệt của bạn, đổi máy là bắt đầu lại.',

  // ── /games: lọc và tìm ─────────────────────────────────────────────────────
  'games.hub.filter.label': 'Chủ đề',
  'games.hub.filter.all': 'Tất cả',
  'games.hub.search.label': 'Tìm game',
  'games.hub.search.placeholder': 'Tên game hoặc chủ đề',
  'games.hub.count': (p: { shown: number }) => `${String(p.shown)} game`,
  'games.hub.count-filtered': (p: { shown: number }) => `${String(p.shown)} game khớp bộ lọc`,
  'games.hub.clear': 'Bỏ lọc',
  'games.hub.empty.title': 'Không có game nào khớp bộ lọc.',
  'games.hub.empty.body': 'Bỏ bớt điều kiện hoặc xoá ô tìm để xem lại toàn bộ.',
  'games.hub.none-playable': (p: { topic: string }) =>
    `${p.topic} chưa có game chơi được. Game đang dựng nằm ở cuối trang.`,
  'games.hub.playable-label': 'Game chơi được',

  // ── Hai điều mọi game đều nói ra trước khi bấm ─────────────────────────────
  'games.fact.no-sandbox': 'Không tốn sandbox',
  'games.fact.no-login': 'Không cần đăng nhập',

  // ── Chủ đề (thuật ngữ hạ tầng giữ tiếng Anh, chỉ "Mạng" có bản Việt phổ thông)
  'games.topic.kubernetes': 'Kubernetes',
  'games.topic.cicd': 'CI/CD',
  'games.topic.network': 'Mạng',
  'games.topic.container': 'Container',
  'games.topic.git': 'Git',

  // ── Từng game ──────────────────────────────────────────────────────────────
  'games.k8s.name': 'Kubernetes Arena',
  'games.k8s.blurb':
    'Dựng rồi cứu một cluster mô phỏng bằng kubectl. Mỗi màn là một cluster hỏng theo một kiểu khác.',
  'games.k8s.meta-title': 'Kubernetes Arena · PTIT DevOps Lab',
  'games.k8s.meta-description':
    'Bài thực hành kubectl trên cluster mô phỏng chạy trong trình duyệt: tạo pod, phơi service, chịu sự cố.',
  'games.git.name': 'Phòng thí nghiệm Git',
  'games.git.blurb':
    'Gõ lệnh git thật trên một kho mô phỏng. Nắn lịch sử, làm việc nhóm qua remote, cứu commit tưởng đã mất.',
  'games.git.meta-title': 'Phòng thí nghiệm Git · PTIT DevOps Lab',
  'games.git.meta-description':
    'Gõ lệnh git trên kho mô phỏng chạy trong trình duyệt và xem đồ thị commit đổi theo từng lệnh.',
  'games.cicd.name': 'Xưởng đường ống CI/CD',
  'games.cicd.blurb':
    'Soạn workflow YAML, chạy mô phỏng rồi đọc ba trục: thời gian chờ, số commit qua mỗi giờ và runner-phút. Nửa sau đưa artifact qua các môi trường.',
  'games.cicd.meta-title': 'Xưởng đường ống CI/CD · PTIT DevOps Lab',
  'games.cicd.meta-description':
    'Soạn workflow, chạy mô phỏng và tối ưu pipeline theo ba trục: thời gian chờ, thông lượng, runner-phút.',
  'games.cicd.level-title': (p: { title: string }) => `${p.title} · Xưởng đường ống CI/CD`,
  'games.maze.name': 'Mê cung mạng',
  'games.maze.blurb':
    'Đưa gói tin từ pod này sang pod kia qua một mê cung NetworkPolicy: mở đúng đường cần mở, đóng phần còn lại.',
  'games.forge.name': 'Lò rèn Image',
  'games.forge.blurb':
    'Ghép một Dockerfile chạy được rồi rèn cho nhỏ lại. Mỗi layer thừa là một điểm trừ, mỗi lần cache trượt cũng vậy.',

  // ── Dải giới thiệu một game trên /games ────────────────────────────────────
  'games.band.kicker': (p: { n: string; topic: string }) => `Tuyến ${p.n} · ${p.topic}`,
  'games.band.facts': (p: { levels: number; chapters: number }) =>
    `${String(p.levels)} màn, chia ${String(p.chapters)} chương.`,
  'games.band.facts-label': 'Màn chơi',
  'games.band.difficulty': 'Độ khó',
  'games.band.progress.none': 'Chưa chơi màn nào.',
  'games.band.progress.some': (p: { done: number; total: number }) =>
    `Đã qua ${String(p.done)}/${String(p.total)} màn.`,
  'games.band.progress.all': (p: { total: number }) => `Đã qua cả ${String(p.total)} màn.`,
  'games.band.progress.aria': (p: { name: string }) => `Tiến độ ${p.name}`,
  'games.band.cta.play': 'Chơi',
  'games.band.cta.continue': 'Chơi tiếp',
  'games.band.cta.replay': 'Chơi lại',
  'games.band.cta.levels': 'Xem các màn',

  // ── Game chưa chơi được ────────────────────────────────────────────────────
  'games.soon.title': 'Đang dựng',
  'games.soon.kicker': 'Chưa chơi được',
  'games.soon.badge': 'Sắp có',
  'games.soon.note': 'Đã có bản thiết kế, chưa có màn chơi. Hai game này sẽ mở ở các đợt sau.',

  // ── Lối sang phần có chấm điểm ─────────────────────────────────────────────
  'games.practice.title': 'Luyện đề',
  'games.practice.kicker': 'Có chấm điểm',
  'games.practice.problems.title': 'Bài tập',
  'games.practice.problems.sub':
    'Đề cho cả ba game, chấm tự động. Nộp lời giải và xem từng testcase qua hay trượt.',
  'games.practice.exams.title': 'Kỳ thi',
  'games.practice.exams.sub': 'Lịch thi của lớp, bài đang làm và kết quả các lần thi trước.',

  // ── Lối cho tác giả ────────────────────────────────────────────────────────
  'games.studio.title': 'Xưởng soạn',
  'games.studio.kicker': 'Dành cho tác giả',
  'games.studio.problem.title': 'Soạn đề bài',
  'games.studio.problem.sub': 'Đề cho K8s, Git hoặc CI/CD, có testcase chấm tự động.',
  'games.studio.builder.title': 'Dựng màn chơi Git',
  'games.studio.builder.sub': 'Vẽ kho ban đầu, đặt mục tiêu, chơi thử ngay trên trang.',
  'games.studio.lesson.title': 'Soạn bài học',
  'games.studio.lesson.sub': 'Bài học và lab chạy trên sandbox thật.',

  // ── Trạng thái một màn, dùng chung cho ba game ─────────────────────────────
  'games.state.done': 'Đã qua',
  'games.state.playing': 'Đang làm',
  'games.state.new': 'Chưa chơi',
  'games.state.next': 'Màn tiếp',
  'games.chapter.progress': (p: { done: number; total: number }) =>
    `${String(p.done)}/${String(p.total)} màn`,
  'games.level.minutes': (p: { n: number }) => `~${String(p.n)} phút`,

  // ── /games/k8s: trang chọn màn (ngoài canvas game) ─────────────────────────
  'games.k8s.campaign.kicker': (p: { levels: number; chapters: number }) =>
    `Trò chơi · K8S · ${String(p.levels)} màn · ${String(p.chapters)} chương`,
  'games.k8s.campaign.lead':
    'Thực hành kubectl trên một cluster mô phỏng chạy ngay trong trình duyệt. Màn sau dựa vào điều màn trước vừa dạy, nên đi theo thứ tự.',
  'games.k8s.campaign.back': 'Tất cả trò chơi',
  'games.k8s.campaign.start': (p: { title: string }) => `Bắt đầu: ${p.title}`,
  'games.k8s.campaign.continue': (p: { title: string }) => `Tiếp tục: ${p.title}`,
  'games.k8s.campaign.all-done': (p: { total: number }) =>
    `Bạn đã qua cả ${String(p.total)} màn. Chọn màn bất kỳ để chơi lại.`,
  'games.k8s.campaign.board': (p: { n: string; name: string }) => `Chương ${p.n}: ${p.name}`,
  'games.k8s.campaign.loading': 'Đang dựng cluster mô phỏng…',
  'games.k8s.campaign.chapters': 'Các chương',
  'games.k8s.chapter.1.name': 'Nền tảng',
  'games.k8s.chapter.1.blurb': 'Tạo pod, đọc trạng thái, đọc log. Những việc làm mỗi ngày.',
  'games.k8s.chapter.2.name': 'Khối lượng công việc',
  'games.k8s.chapter.2.blurb': 'Giao việc cho controller, rồi cứu chúng khi rollout hỏng.',
  'games.k8s.chapter.3.name': 'Mạng',
  'games.k8s.chapter.3.blurb': 'Service, Ingress, DNS, và những lần gọi mà không ai trả lời.',
  'games.k8s.chapter.4.name': 'Cấu hình và lưu trữ',
  'games.k8s.chapter.4.blurb': 'Tách cấu hình và secret khỏi image, gắn ổ đĩa bền.',
  'games.k8s.chapter.5.name': 'Vận hành thật',
  'games.k8s.chapter.5.blurb': 'Scheduler, hạn mức, và lý do một pod mãi không được xếp lịch.',
  'games.k8s.chapter.6.name': 'Sự cố',
  'games.k8s.chapter.6.blurb': 'Probe, NetworkPolicy, RBAC, HPA. Chẩn đoán trên cụm gần với thật.',
  'games.k8s.chapter.other': 'Chương khác',

  // ── /games/git: trang chọn màn ─────────────────────────────────────────────
  'games.git.campaign.kicker': (p: { levels: number; chapters: number }) =>
    `Trò chơi · GIT · ${String(p.levels)} màn · ${String(p.chapters)} chương`,
  'games.git.campaign.lead':
    'Gõ lệnh git thật trên một kho mô phỏng chạy trong trình duyệt. Đồ thị commit vẽ lại sau từng lệnh, và mỗi lượt chơi bắt đầu lại từ kho ban đầu.',
  'games.git.campaign.start': (p: { title: string }) => `Bắt đầu: ${p.title}`,
  'games.git.campaign.continue': (p: { title: string }) => `Tiếp tục: ${p.title}`,
  'games.git.campaign.all-done': (p: { total: number }) =>
    `Bạn đã qua cả ${String(p.total)} màn. Chọn màn bất kỳ để chơi lại.`,
  'games.git.campaign.sandbox': 'Sandbox & Builder',
  'games.git.campaign.sandbox-sub': 'Kho trống để gõ lệnh tự do, kèm trình dựng màn chơi cho tác giả.',
  'games.git.campaign.objectives': (p: { n: number }) => `${String(p.n)} mục tiêu`,
  'games.git.chapter.1.name': 'Nắn lịch sử',
  'games.git.chapter.1.blurb': 'Commit, nhánh, merge và rebase. Đọc đồ thị trước khi sửa nó.',
  'games.git.chapter.2.name': 'Làm việc nhóm',
  'games.git.chapter.2.blurb': 'Remote, fetch, pull, push, và những lần hai người cùng sửa một chỗ.',
  'games.git.chapter.3.name': 'Cứu hộ',
  'games.git.chapter.3.blurb': 'reflog, reset, cherry-pick. Tìm lại commit tưởng đã mất.',
  'games.git.chapter.title': (p: { n: number; name: string }) => `Chương ${String(p.n)} · ${p.name}`,

  // ── Git: màn chờ và màn lỗi của chế độ làm bài ─────────────────────────────
  'games.git.status.loading-title': 'Đang chuẩn bị kho Git',
  'games.git.status.error-title': 'Chưa mở được bài này',
  'games.git.status.loading-oj': 'Đang nạp đề bài OJ…',
  'games.git.status.retry': 'Thử lại',
  'games.git.status.back': 'Về bài tập',

  // ── Git: màn chơi ──────────────────────────────────────────────────────────
  'games.git.play.back': 'Danh sách màn',
  'games.git.play.back-builder': 'Về Builder',
  'games.git.play.crumb-oj': 'Bài OJ',
  'games.git.play.crumb-trial': 'Chơi thử',
  'games.git.play.moves': (p: { n: number }) => `${String(p.n)} lệnh`,
  'games.git.play.run-solution': 'Chạy lời giải mẫu',
  'games.git.play.verdict': (p: { passed: number; total: number }) =>
    `Mục tiêu ${String(p.passed)}/${String(p.total)}`,
  'games.git.play.verdict-done': (p: { passed: number; total: number }) =>
    `Xong ${String(p.passed)}/${String(p.total)}`,
  'games.git.play.server-graded': 'Chấm trên máy chủ',
  'games.git.play.loading-3d': 'Đang nạp cảnh 3D…',
  'games.git.play.scene-label': (p: { title: string }) => `Đồ thị commit của màn ${p.title}`,
  'games.git.play.ran': (p: { command: string }) => `${p.command} · đã chạy`,
  'games.git.play.ran-error': 'Lệnh chưa chạy được. Đọc thông báo ở terminal.',
  'games.git.play.undo-done': 'Đã hoàn tác một bước.',
  'games.git.play.undo-none': 'Chưa có bước nào để hoàn tác.',
  'games.git.play.redo-done': 'Đã làm lại một bước.',
  'games.git.play.redo-none': 'Chưa có bước nào để làm lại.',
  'games.git.play.undo': 'Hoàn tác',
  'games.git.play.redo': 'Làm lại',
  'games.git.play.terminal': 'Terminal',

  'games.git.win.aria': 'Đã qua màn',
  'games.git.win.kicker': 'Đã qua màn',
  'games.git.win.title': 'Kho đã đúng hình cần có.',
  'games.git.win.summary': (p: { passed: number; total: number; moves: number }) =>
    `Đạt ${String(p.passed)}/${String(p.total)} mục tiêu sau ${String(p.moves)} lệnh.`,
  'games.git.win.stay': 'Ở lại xem kho',
  'games.git.win.next': 'Màn tiếp',
  'games.git.win.back': 'Về danh sách màn',
  'games.git.win.back-builder': 'Về Builder',

  'games.git.panel.aria': 'Đề bài và cẩm nang',
  'games.git.panel.tabs': 'Nội dung bên cạnh màn chơi',
  'games.git.panel.mission': 'Nhiệm vụ',
  'games.git.panel.mission-oj': 'Đề bài',
  'games.git.panel.guide': 'Cẩm nang',
  'games.git.panel.refs': 'Refs',
  'games.git.panel.goal': 'Cần làm',
  'games.git.panel.goal-oj': 'Đề bài OJ',
  'games.git.panel.progress': 'Tiến độ mục tiêu',
  'games.git.panel.objectives': 'Mục tiêu',
  'games.git.panel.criteria': 'Tiêu chí chấm',
  'games.git.panel.bonus': 'Thưởng',
  'games.git.panel.met': 'đã đạt',
  'games.git.panel.unmet': 'chưa đạt',
  'games.git.panel.on-server': 'chấm ở máy chủ',
  'games.git.panel.last-result': 'Kết quả lần nộp gần nhất',
  'games.git.panel.no-result': 'Chưa nộp lần nào. Làm xong đề bài rồi bấm Nộp bài.',
  'games.git.panel.hints': 'Gợi ý',
  'games.git.panel.no-hints': 'Màn này không có gợi ý.',
  'games.git.panel.hint-open': (p: { n: number }) => `Mở gợi ý ${String(p.n)}`,
  'games.git.panel.hint-pending': 'Đang mở…',
  'games.git.panel.hint-error': (p: { message: string }) => `Không mở được: ${p.message}`,
  'games.git.panel.guide-kicker': 'Cẩm nang',
  'games.git.panel.guide-title': 'Lệnh của màn này',
  'games.git.panel.keys':
    'Gõ lệnh ở terminal rồi Enter. Mũi tên lên/xuống xem lại lệnh cũ, Ctrl/Cmd + Z để hoàn tác.',
  'games.git.panel.tools': 'Lệnh dùng trong màn',
  'games.git.panel.no-tools': 'Tra cú pháp ở nút Thư viện lệnh dưới terminal.',
  'games.git.panel.theory': (p: { title: string; minutes: number }) =>
    `${p.title} · ${String(p.minutes)} phút đọc`,
  'games.git.panel.refs-kicker': 'Định vị trong kho',
  'games.git.panel.refs-title': 'HEAD đang ở đâu',
  'games.git.panel.detached': 'Detached HEAD: bạn đang đứng thẳng trên một commit, không trên nhánh nào.',
  'games.git.panel.attached': 'HEAD đi theo nhánh hiện tại. Bấm một ref để tìm commit của nó trên đồ thị.',

  // ── /games/cicd: trang chọn màn ────────────────────────────────────────────
  'games.cicd.campaign.kicker': (p: { levels: number; chapters: number }) =>
    `Trò chơi · CI · ${String(p.levels)} màn · ${String(p.chapters)} chương`,
  'games.cicd.campaign.lead':
    'Soạn workflow bằng YAML, chạy mô phỏng rồi đọc ba trục: thời gian chờ của một commit, số commit qua được mỗi giờ và runner-phút tiêu tốn. Ba trục không suy ra được từ nhau, mỗi màn dạy một cách chúng kéo nhau.',
  'games.cicd.campaign.start': (p: { title: string }) => `Bắt đầu: ${p.title}`,
  'games.cicd.campaign.continue': (p: { title: string }) => `Tiếp tục: ${p.title}`,
  'games.cicd.campaign.all-done': (p: { total: number }) =>
    `Bạn đã qua cả ${String(p.total)} màn. Chọn màn bất kỳ để chơi lại.`,
  'games.cicd.campaign.sandbox': 'Bàn thử tự do',
  'games.cicd.campaign.sandbox-sub': 'Soạn workflow bất kỳ, chạy mô phỏng, không có đề và không chấm.',
  'games.cicd.campaign.editable': 'Sửa được',
  'games.cicd.chapter.ci.title': 'Chương CI: thời gian chờ',
  'games.cicd.chapter.ci.blurb':
    'Dựng và tối ưu đường ống tích hợp: đồ thị job, runner, cache, job hay hỏng vặt, ma trận.',
  'games.cicd.chapter.cd.title': 'Chương CD: môi trường',
  'games.cicd.chapter.cd.blurb':
    'Đưa artifact qua các môi trường: thăng hạng, cổng duyệt, chiến lược phát hành, GitOps, che secret.',

  // ── /games/cicd/<màn>: thanh trên và khung bảng nổi ────────────────────────
  'games.cicd.hud.bar-aria': 'Thanh điều khiển màn chơi',
  'games.cicd.hud.exit': 'Danh sách màn',
  'games.cicd.hud.chapter': (p: { id: string; chapter: string }) => `${p.id} · chương ${p.chapter}`,
  'games.cicd.hud.run': 'Chạy thử',
  'games.cicd.hud.next': 'Màn tiếp',
  'games.cicd.hud.mode-group': 'Chế độ vẽ',
  'games.cicd.hud.quality': 'Chất lượng',
  'games.cicd.hud.overlays': 'Lớp phủ',
  'games.cicd.hud.close-all': 'Thu hết',
  'games.cicd.hud.help': 'Trợ giúp',
  'games.cicd.hud.close-panel': (p: { title: string }) => `Đóng bảng ${p.title}`,
  'games.cicd.quality.low': 'Thấp',
  'games.cicd.quality.medium': 'Vừa',
  'games.cicd.quality.high': 'Cao',
  'games.cicd.quality.aria': 'Chất lượng cảnh 3D',
  'games.cicd.panel.editor': 'Ô soạn',
  'games.cicd.panel.mission': 'Đề bài',
  'games.cicd.panel.inspector': 'Thông số',
  'games.cicd.panel.result': 'Kết quả',
  'games.cicd.panel.tools': 'Bảng núm',
  'games.cicd.panel.learn': 'Bài học',
  'games.cicd.panel.minimap': 'Bản đồ',
} as const;

export const gamesIntentionalThree: IntentionalThree = {};
