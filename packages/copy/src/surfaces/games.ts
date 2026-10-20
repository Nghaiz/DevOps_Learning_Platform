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
  'games.meta-title': 'Trò chơi',
  'games.meta-description':
    'Ba game DevOps chạy ngay trong trình duyệt: Kubernetes, Git và CI/CD. Không cần đăng nhập, không tốn sandbox.',

  // ── /games: đầu trang ──────────────────────────────────────────────────────
  'games.hub.summary': (p: { games: number; levels: number }) =>
    `${String(p.games)} game chơi được, ${String(p.levels)} màn`,
  'games.hub.title': 'Trò chơi',
  'games.hub.lead':
    'Mỗi game dựng một hệ thống mô phỏng ngay trong trình duyệt. Bạn gõ lệnh thật, nhìn nó đổi theo, sai thì chơi lại từ đầu.',
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
  'games.k8s.meta-title': 'Kubernetes Arena',
  'games.k8s.meta-description':
    'Bài thực hành kubectl trên cluster mô phỏng chạy trong trình duyệt: tạo pod, phơi service, chịu sự cố.',
  'games.git.name': 'Phòng thí nghiệm Git',
  'games.git.blurb':
    'Gõ lệnh git thật trên một kho mô phỏng. Nắn lịch sử, làm việc nhóm qua remote, cứu commit tưởng đã mất.',
  'games.git.meta-title': 'Phòng thí nghiệm Git',
  'games.git.meta-description':
    'Gõ lệnh git trên kho mô phỏng chạy trong trình duyệt và xem đồ thị commit đổi theo từng lệnh.',
  'games.cicd.name': 'Xưởng đường ống CI/CD',
  'games.cicd.blurb':
    'Soạn workflow YAML, chạy mô phỏng rồi đọc ba trục: thời gian chờ, số commit qua mỗi giờ và runner-phút. Nửa sau đưa artifact qua các môi trường.',
  'games.cicd.meta-title': 'Xưởng đường ống CI/CD',
  'games.cicd.meta-description':
    'Soạn workflow, chạy mô phỏng và tối ưu pipeline theo ba trục: thời gian chờ, thông lượng, runner-phút.',
  'games.cicd.level-title': (p: { title: string }) => `${p.title} | Xưởng đường ống CI/CD`,
  'games.maze.name': 'Mê cung mạng',
  'games.maze.blurb':
    'Đưa gói tin từ pod này sang pod kia qua một mê cung NetworkPolicy: mở đúng đường cần mở, đóng phần còn lại.',
  'games.forge.name': 'Lò rèn Image',
  'games.forge.blurb':
    'Ghép một Dockerfile chạy được rồi rèn cho nhỏ lại. Mỗi layer thừa là một điểm trừ, mỗi lần cache trượt cũng vậy.',

  // ── Dải giới thiệu một game trên /games ────────────────────────────────────
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
  'games.soon.badge': 'Sắp có',
  'games.soon.note': 'Đã có bản thiết kế, chưa có màn chơi. Hai game này sẽ mở ở các đợt sau.',

  // ── Lối sang phần có chấm điểm ─────────────────────────────────────────────
  'games.practice.title': 'Luyện đề',
  'games.practice.note': 'Quen tay rồi thì sang phần có chấm điểm. Kết quả lưu vào tài khoản của bạn.',
  'games.practice.problems.title': 'Bài tập',
  'games.practice.problems.sub':
    'Đề cho cả ba game, chấm tự động. Nộp lời giải và xem từng testcase qua hay trượt.',
  'games.practice.exams.title': 'Kỳ thi',
  'games.practice.exams.sub': 'Lịch thi của lớp, bài đang làm và kết quả các lần thi trước.',

  // ── Lối cho tác giả ────────────────────────────────────────────────────────
  'games.studio.title': 'Xưởng soạn',
  'games.studio.note': 'Soạn đề, dựng màn Git và viết bài học cho sinh viên của bạn.',
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
  'games.campaign.summary': (p: { levels: number; chapters: number }) =>
    `${String(p.levels)} màn, ${String(p.chapters)} chương`,
  'games.campaign.progress': (p: { done: number; total: number }) => `Đã qua ${String(p.done)}/${String(p.total)} màn`,
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
  'games.git.chapter.title': (p: { n: number; name: string }) => `Chương ${String(p.n)}: ${p.name}`,

  // ── Git: màn chờ và màn lỗi của chế độ làm bài ─────────────────────────────
  'games.git.status.loading-title': 'Đang chuẩn bị kho Git',
  'games.git.status.error-title': 'Chưa mở được bài này',
  'games.git.status.loading-oj': 'Đang nạp đề bài OJ…',
  'games.git.status.retry': 'Thử lại',
  'games.git.status.back': 'Về bài tập',

  // ── Git: màn chơi ──────────────────────────────────────────────────────────
  'games.git.play.back': 'Danh sách màn',
  'games.git.play.back-builder': 'Về Builder',
  'games.git.play.back-problems': 'Trang bài tập',
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

  // ── Git: chế độ làm bài OJ ─────────────────────────────────────────────────
  'games.git.oj.no-testcase':
    'Bài này chưa có testcase nên chưa chấm được. Bạn vẫn chơi và luyện tay được; nhờ báo giúp tác giả bài.',
  'games.git.oj.loading': 'Đang nạp đề bài và dựng kho Git…',
  'games.git.oj.load-error': (p: { code: string; reason: string }) => `Không mở được bài ${p.code}: ${p.reason}`,
  'games.git.oj.no-data': 'không có dữ liệu',
  'games.git.oj.submitting': 'Đang chấm…',
  'games.git.oj.submit': 'Nộp bài',
  'games.git.oj.hidden-case': 'Testcase ẩn, chưa hiện tên',
  'games.git.oj.submit-error': (p: { message: string }) => `Chưa nộp được: ${p.message}`,
  'games.git.oj.ce': (p: { reason: string }) => `CE: ${p.reason}`,
  'games.git.oj.ce-default': 'lượt chơi không chạy tới nơi nên chưa chấm được.',
  'games.git.oj.ac': (p: { passed: number; total: number }) =>
    `AC (${String(p.passed)}/${String(p.total)}): qua hết testcase.`,
  'games.git.oj.wa': (p: { passed: number; total: number }) => `WA (${String(p.passed)}/${String(p.total)})`,

  // ── Git: bản đồ commit 2D ──────────────────────────────────────────────────
  'games.git.map.aria': 'Bản đồ lịch sử Git',
  'games.git.map.title': 'Đồ thị commit',
  'games.git.map.zoom-out': 'Thu nhỏ',
  'games.git.map.zoom': 'Tỉ lệ bản đồ',
  'games.git.map.zoom-in': 'Phóng to',
  'games.git.map.zoom-reset': 'Đặt lại tỉ lệ',
  'games.git.map.effects': 'Hiệu ứng bản đồ',
  'games.git.map.empty-title': 'Kho chưa có commit nào.',
  'games.git.map.empty-body': 'Đọc nhiệm vụ rồi tạo commit đầu tiên.',
  'games.git.map.inspector': (p: { oid: string }) => `Commit ${p.oid}`,
  'games.git.map.inspector-close': 'Đóng thông tin commit',
  'games.git.map.author': 'Tác giả',
  'games.git.map.parents': 'Commit cha',
  'games.git.map.root': 'Commit gốc',
  'games.git.map.files': 'Thư mục làm việc',
  'games.git.map.files-changed': (p: { n: number }) => `${String(p.n)} file thay đổi, mở để xem`,
  'games.git.map.zone.worktree': '01 · Working tree',
  'games.git.map.zone.index': '02 · Staging area',
  'games.git.map.zone.head': '03 · HEAD',
  'games.git.map.zone.next-worktree': 'git add →',
  'games.git.map.zone.next-index': 'git commit →',
  'games.git.map.zone.next-head': 'Đã ghi vào lịch sử',
  'games.git.map.zone.empty': 'Chưa có file',
  'games.git.map.file.unchanged': 'Sạch',
  'games.git.map.file.modified': 'Đã sửa',
  'games.git.map.file.added': 'Thêm',
  'games.git.map.file.deleted': 'Xoá',
  'games.git.map.file.untracked': 'Mới',
  'games.git.map.file.conflicted': 'Xung đột',
  'games.git.map.legend.fresh': '+ Mới',
  'games.git.map.legend.duplicate': '= Bản sao',
  'games.git.map.legend.conflict': '! Xung đột',
  'games.git.map.legend.keys': 'Bấm một commit để xem · mũi tên để di chuyển',

  // ── Git: terminal và thư viện lệnh ─────────────────────────────────────────
  'games.git.console.log': 'Kết quả lệnh',
  'games.git.console.empty': 'Kho đã sẵn sàng. Gõ một lệnh git để bắt đầu.',
  'games.git.console.empty-keys':
    'Thư viện lệnh để tra cú pháp · mũi tên lên/xuống xem lại lệnh · Ctrl/Cmd + Z hoàn tác',
  'games.git.console.library': 'Thư viện lệnh',
  'games.git.console.library-aria': 'Thư viện lệnh Git',
  'games.git.console.library-close': 'Đóng thư viện lệnh',
  'games.git.console.library-help':
    'Bấm một lệnh để điền vào ô, thêm tham số rồi Enter. Chỉ hiện các lệnh màn này cho dùng.',
  'games.git.console.search': 'Tìm lệnh Git',
  'games.git.console.search-placeholder': 'Tên lệnh hoặc việc cần làm',
  'games.git.console.no-match': 'Không có lệnh nào khớp.',
  'games.git.console.placeholder': 'Gõ lệnh git…',
  'games.git.console.run': 'Chạy lệnh',
  'games.git.console.run-short': 'Chạy',

  // ── Git: sandbox và Builder ────────────────────────────────────────────────
  'games.git.sandbox.back': 'Danh sách màn',
  'games.git.sandbox.kicker': 'Sandbox',
  'games.git.sandbox.title': 'Kho thử tự do',
  'games.git.sandbox.builder-open': 'Mở Level Builder',
  'games.git.sandbox.builder-close': 'Đóng Level Builder',
  'games.git.sandbox.strip':
    'Không có đề, không chấm. Tạo nhánh, dựng lịch sử, rồi nếu muốn thì biến nó thành một màn chơi.',
  'games.git.sandbox.mode': 'Tự do',
  'games.git.sandbox.scene-label': 'Đồ thị commit của sandbox',
  'games.git.sandbox.panel-aria': 'Bảng công cụ sandbox',
  'games.git.sandbox.panel-builder': 'Level Builder',
  'games.git.sandbox.panel-lab': 'Công cụ sandbox',
  'games.git.sandbox.panel-builder-sub': 'Soạn đề, chơi thử, lưu bản nháp',
  'games.git.sandbox.panel-lab-sub': 'Chọn kho ban đầu, bật origin, xuất và nhập cây',
  'games.git.sandbox.scenario': 'Kho ban đầu',
  'games.git.sandbox.scenario-select': 'Chọn kịch bản khởi tạo',
  'games.git.sandbox.rebuild-note':
    'Đổi kho ban đầu, bật hay tắt origin, hoặc nhập một cây đều dựng lại kho từ đầu, và xoá luôn các bước hoàn tác.',
  'games.git.sandbox.actions': 'Thao tác',
  'games.git.sandbox.reset': 'Đặt lại',
  'games.git.sandbox.undo': 'Hoàn tác một bước',
  'games.git.sandbox.origin-off': 'Tắt origin',
  'games.git.sandbox.origin-on': 'Bật origin',
  'games.git.sandbox.origin-state-on': 'origin: đang bật',
  'games.git.sandbox.origin-state-off': 'origin: đang tắt',
  'games.git.sandbox.origin-empty':
    'Kho chưa có commit nào nên origin không có gì để trỏ vào. Tạo một commit trước.',
  'games.git.sandbox.export': 'Xuất cây',
  'games.git.sandbox.export-aria': 'Chuỗi JSON của cây hiện tại',
  'games.git.sandbox.import': 'Nhập cây',
  'games.git.sandbox.import-aria': 'Dán chuỗi JSON của một cây đã xuất',
  'games.git.sandbox.import-placeholder': 'Dán chuỗi đã xuất vào đây',
  'games.git.sandbox.import-run': 'Nhập',
  'games.git.sandbox.import-bad': 'Không đọc được chuỗi này. Nó phải là bản xuất từ chính màn sandbox.',

  // ── Git: nhãn đồ thị dùng chung cho cảnh 2D và 3D ──────────────────────────
  // Nhãn trạng thái commit được games-git-colorblind.spec.ts chép nguyên văn để
  // tìm nút theo aria-label. Đổi chữ ở đây thì sửa bảng ACCENTS trong spec đó.
  'games.git.accent.normal': 'commit thường',
  'games.git.accent.head': 'HEAD đang ở đây',
  'games.git.accent.fresh': 'vừa được tạo',
  'games.git.accent.orphaned': 'đã mất, không ref nào trỏ tới',
  'games.git.accent.duplicate': 'bản sao của một commit khác',
  'games.git.accent.conflicted': 'đang xung đột',
  'games.git.edge.parent': 'cha thứ nhất',
  'games.git.edge.merge-parent': 'cha thứ hai của commit merge',
  'games.git.edge.cherry-source': 'nguồn của bản sao',
  'games.git.edge.remote-mirror': 'cùng commit ở kho kia',
  'games.git.ref.branch': 'nhánh',
  'games.git.ref.remote': 'nhánh theo dõi từ xa',
  'games.git.ref.tag': 'tag',
  'games.git.ref.head': 'HEAD',
  'games.git.repo.local': 'Kho trên máy bạn (local)',
  'games.git.repo.origin': 'Kho từ xa (origin)',

  // ── Git: cảnh 2D ───────────────────────────────────────────────────────────
  'games.git.scene.commit': (p: { oid: string; message: string }) => `Commit ${p.oid}: ${p.message}`,
  'games.git.scene.reachable': 'còn với tới được',
  'games.git.scene.lost': 'đã mất, chỉ còn trong kho object',
  'games.git.scene.no-refs': 'không ref nào trỏ tới',
  'games.git.scene.pointed-by': (p: { names: string }) => `được trỏ tới bởi ${p.names}`,
  'games.git.scene.author': (p: { name: string }) => `tác giả ${p.name}`,
  'games.git.scene.label': 'Đồ thị commit của kho Git',
  'games.git.scene.region': (p: { label: string; n: number }) => `${p.label}, ${String(p.n)} commit`,
  'games.git.scene.two-repos': 'hai kho tách rời: kho trên máy bạn và kho từ xa',
  'games.git.scene.one-repo': 'một kho duy nhất',
  'games.git.scene.detached': 'HEAD đang ở trạng thái detached: nó trỏ thẳng vào một commit, không qua nhánh nào.',
  'games.git.scene.attached': 'HEAD đang trỏ vào một nhánh.',
  'games.git.scene.summary': (p: { nodes: number; edges: number; repos: string; head: string }) =>
    `Đồ thị commit gồm ${String(p.nodes)} commit và ${String(p.edges)} liên kết, xếp thành ${p.repos}. ${p.head} Dùng Tab để đi qua từng commit; mũi tên trái và phải đi theo quan hệ cha con; mũi tên lên và xuống đổi làn nhánh; Enter để chọn.`,
  'games.git.scene.more-refs': (p: { n: number }) => `+${String(p.n)} refs`,

  // ── Git: nút chọn chế độ vẽ ────────────────────────────────────────────────
  'games.git.mode.group': 'Chế độ hiển thị đồ thị',
  'games.git.mode.full-2d': 'Sơ đồ 2D',
  'games.git.mode.full-3d': 'Cảnh 3D',
  'games.git.mode.switch': (p: { mode: string }) => `Chuyển sang ${p.mode}.`,
  'games.git.mode.soon': (p: { mode: string }) =>
    `${p.mode} sắp có. Bản 2D là chế độ đầy đủ, không phải bản rút gọn.`,
  'games.git.mode.soon-label': (p: { mode: string }) => `${p.mode}, sắp có`,

  // ── Git: cảnh 3D ───────────────────────────────────────────────────────────
  'games.git.plate.unchanged': 'không đổi',
  'games.git.plate.modified': 'đã sửa',
  'games.git.plate.added': 'mới thêm',
  'games.git.plate.deleted': 'đã xoá',
  'games.git.plate.untracked': 'git chưa theo dõi',
  'games.git.plate.conflicted': 'đang xung đột',
  'games.git.plate.zone-worktree': 'Worktree · đang sửa',
  'games.git.plate.zone-index': 'Index · đã stage',
  'games.git.plate.zone-head': 'HEAD · đã commit',
  'games.git.scene3d.ref': (p: { kind: string; name: string }) => `${p.kind} ${p.name}`,
  'games.git.scene3d.ref-current': (p: { kind: string; name: string }) => `${p.kind} ${p.name}, đang đứng ở đây`,
  'games.git.scene3d.lane': (p: { name: string }) => `làn nhánh ${p.name}`,
  'games.git.scene3d.viewport': 'Khung nhìn 3D, điều khiển bằng bàn phím',
  'games.git.scene3d.keys':
    'Q và E xoay qua tám góc nhìn cố định. Dấu cộng và dấu trừ phóng to, thu nhỏ. Phím 0 đưa camera về khung nhìn toàn cảnh. Phím T nhảy tới ref kế tiếp, Shift T nhảy ngược lại. Các phím số từ 1 đến 9 nhảy thẳng tới ref tương ứng; ref của nhánh đang đứng luôn là phím 1.',
  'games.git.scene3d.label': 'Sơ đồ 3D của kho Git',

  // ── /games/cicd: trang chọn màn ────────────────────────────────────────────
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

  // ── /games/cicd/<màn>: thân màn chơi ───────────────────────────────────────
  'games.cicd.play.scene-label': (p: { title: string }) => `Đồ thị đường ống của màn ${p.title}`,
  'games.cicd.play.yaml-label': (p: { title: string }) => `Workflow YAML của màn ${p.title}`,
  'games.cicd.play.inspector-title': 'Thông số job',
  'games.cicd.play.editor-title': 'Ô soạn workflow',
  'games.cicd.play.run-first': (p: { passes: number }) =>
    `Bấm Chạy thử để mô phỏng ${String(p.passes)} lượt và xem ba trục.`,
  'games.cicd.play.hints': 'Gợi ý',
  'games.cicd.play.hint-open': (p: { n: number; total: number }) =>
    `Mở gợi ý ${String(p.n)}/${String(p.total)}`,
  'games.cicd.play.no-hints-open': 'Chưa mở gợi ý nào.',
  'games.cicd.play.hint-error': (p: { message: string }) => `Chưa lấy được gợi ý: ${p.message}`,
  'games.cicd.play.hint-pending': 'Đang lấy gợi ý…',
  'games.cicd.play.theory': (p: { title: string; minutes: number }) =>
    `Bài lý thuyết: ${p.title} · ${String(p.minutes)} phút`,
  'games.cicd.play.no-minimap': 'Chưa có đồ thị để thu nhỏ.',
  'games.cicd.play.submit-aria': 'Nộp bài',
  'games.cicd.play.no-submit':
    'Chưa nộp lần nào. Ba trục ở trên là của lượt chạy thử, không phải điểm bài.',
  'games.cicd.play.history-aria': 'Lịch sử các lượt chạy',
  'games.cicd.play.history': (p: { n: number }) => `Lịch sử (${String(p.n)})`,
  'games.cicd.play.history-empty': 'Chưa chạy lượt nào.',
  'games.cicd.play.h.parse': (p: { n: number }) => `Không quét được YAML (${String(p.n)} lỗi)`,
  'games.cicd.play.h.engine': 'Workflow không chạy được',
  'games.cicd.play.h.shape': 'Job không khớp màn, chưa chấm',
  'games.cicd.play.h.cd': 'Chính sách CD không hợp lệ',
  'games.cicd.play.h.empty': 'Chưa có job nào để chạy',
  'games.cicd.play.h.won': 'Đạt',
  'games.cicd.play.h.lost': 'Chưa đạt',
  'games.cicd.play.h.ran': 'Đã chạy',
  'games.cicd.play.h.throughput': (p: { v: string }) => `② ${p.v}/giờ`,
  'games.cicd.play.h.runner': (p: { v: string }) => `③ ${p.v} runner-phút`,

  // ── CI/CD: bảng kết quả một lượt chạy ──────────────────────────────────────
  'games.cicd.result.aria': 'Kết quả lượt chạy',
  'games.cicd.result.parse-title': 'Không quét được YAML',
  'games.cicd.result.parse-count': (p: { n: number }) =>
    `${String(p.n)} chỗ cần sửa. Workflow chưa chạy lượt nào.`,
  'games.cicd.result.line-col': (p: { line: number; column: number }) =>
    `Dòng ${String(p.line)}, cột ${String(p.column)}:`,
  'games.cicd.result.empty-before': 'Pipeline chưa có job nào nên chưa có gì để đo. Thêm một job vào mục',
  'games.cicd.result.empty-after': 'rồi chạy lại.',
  'games.cicd.result.shape-title': 'Job không khớp màn',
  'games.cicd.result.shape-note': 'Workflow chưa được chấm.',
  'games.cicd.result.engine-title': 'Workflow không chạy được',
  'games.cicd.result.cd-title': 'Chính sách CD không hợp lệ',
  'games.cicd.result.cd-body': (p: { simulator: string; message: string }) =>
    `Bộ mô phỏng “${p.simulator}” không nhận giá trị trên bảng núm CD: ${p.message}`,
  'games.cicd.result.won': 'Đạt',
  'games.cicd.result.lost': 'Chưa đạt',
  'games.cicd.result.won-note': 'Đã xong mọi mục tiêu bắt buộc.',
  'games.cicd.result.lost-note': (p: { n: number }) => `Còn ${String(p.n)} mục tiêu bắt buộc chưa đạt.`,
  'games.cicd.result.lead-label': '① Lead time',
  'games.cicd.result.lead-hint': 'Thời gian từ lúc push một commit tới lúc pipeline xanh.',
  'games.cicd.result.throughput-label': '② Thông lượng',
  'games.cicd.result.throughput-hint': 'Số commit qua được trong một giờ khi hàng đợi dồn.',
  'games.cicd.result.throughput-value': (p: { v: string }) => `${p.v} commit/giờ`,
  'games.cicd.result.runner-label': '③ Runner-phút',
  'games.cicd.result.runner-hint': 'Số phút runner mà một lượt chạy tiêu tốn.',
  'games.cicd.result.runner-value': (p: { v: string }) => `${p.v} runner-phút`,
  'games.cicd.result.target-max': (p: { par: string; cap: string }) => `Mục tiêu ≤ ${p.par} · trần ${p.cap}`,
  'games.cicd.result.target-min': (p: { par: string; floor: string }) => `Mục tiêu ≥ ${p.par} · sàn ${p.floor}`,
  'games.cicd.result.spread': (p: { p90: string; max: string }) => `p90 ${p.p90} · cao nhất ${p.max}`,
  'games.cicd.result.gate-label': 'Ngưỡng đạt: tỉ lệ lượt xanh',
  'games.cicd.result.gate-detail': (p: { min: string; green: number; total: number }) =>
    `cần ≥ ${p.min} · ${String(p.green)}/${String(p.total)} lượt mô phỏng xanh`,
  'games.cicd.result.objectives': 'Mục tiêu',
  'games.cicd.result.sr-won': 'Đạt:',
  'games.cicd.result.sr-lost': 'Chưa đạt:',
  'games.cicd.result.bonus': '(thưởng)',

  // ── CI/CD: số đo chương CD ─────────────────────────────────────────────────
  'games.cicd.cd-metrics.aria': 'Số đo phát hành và vận hành',
  'games.cicd.cd-metrics.title': 'Phát hành và vận hành',
  'games.cicd.cd-metrics.missing-params': (p: { strategy: string; n: number }) =>
    `Chiến lược “${p.strategy}” thiếu tham số nên kịch bản ${String(p.n)} không chạy được.`,
  'games.cicd.cd-metrics.scenario-bad': (p: { n: number; passes: number }) =>
    `Kịch bản ${String(p.n)} · bản ứng viên LỖI · ${String(p.passes)} lượt`,
  'games.cicd.cd-metrics.scenario-good': (p: { n: number; passes: number }) =>
    `Kịch bản ${String(p.n)} · bản ứng viên tốt · ${String(p.passes)} lượt`,
  'games.cicd.cd-metrics.recovery': 'Phục hồi lâu nhất',
  'games.cicd.cd-metrics.no-rollback': 'không cần rollback',
  'games.cicd.cd-metrics.peak': 'Số máy cao nhất',
  'games.cicd.cd-metrics.peak-value': (p: { n: number }) => `${String(p.n)} máy`,
  'games.cicd.cd-metrics.bad-promoted': 'Lượt bản lỗi lọt lên',
  'games.cicd.cd-metrics.good-aborted': 'Lượt bản tốt bị hủy nhầm',
  'games.cicd.cd-metrics.schema-rollback': 'Lượt rollback trên schema mới',
  'games.cicd.cd-metrics.gitops-title': (p: { beats: number; horizon: string }) =>
    `Đối soát · ${String(p.beats)} nhịp trong ${p.horizon}`,
  'games.cicd.cd-metrics.longest-drift': 'Lệch lâu nhất',
  'games.cicd.cd-metrics.heal-fights': 'Lần giằng co với controller',
  'games.cicd.cd-metrics.unseen-drift': 'Đoạn lệch không ai thấy',
  'games.cicd.cd-metrics.drift-closed': (p: { field: string; from: number; to: number; cause: string }) =>
    `${p.field}: lệch từ giây ${String(p.from)} tới giây ${String(p.to)} · do ${p.cause}`,
  'games.cicd.cd-metrics.drift-open': (p: { field: string; from: number; cause: string }) =>
    `${p.field}: lệch từ giây ${String(p.from)} tới hết giờ · do ${p.cause}`,
  'games.cicd.cd-metrics.masking-title': 'Log sau khi che',
  'games.cicd.cd-metrics.leaks': 'chỗ rò',

  // ── CI/CD: bảng núm chương CD ──────────────────────────────────────────────
  'games.cicd.cd.title': 'Bảng điều khiển phát hành',
  'games.cicd.cd.lead':
    'Các chính sách này không nằm trong workflow. Chúng chạy trên kịch bản của màn, cùng lượt với nút Chạy thử.',
  'games.cicd.cd.release': 'Phát hành',
  'games.cicd.cd.strategy': 'Chiến lược phát hành',
  'games.cicd.cd.on-bad': 'Khi phát hiện bản lỗi',
  'games.cicd.cd.on-bad-rollback': 'Lùi về bản cũ (rollback)',
  'games.cicd.cd.on-bad-roll-forward': 'Dựng bản sửa rồi đẩy tiếp (roll-forward)',
  'games.cicd.cd.rolling-batch': 'Rolling: số máy thay mỗi đợt',
  'games.cicd.cd.canary': 'Canary',
  'games.cicd.cd.canary-weight': '% lưu lượng vào bản ứng viên',
  'games.cicd.cd.canary-interval': 'Độ dài một khoảng đo (giây)',
  'games.cicd.cd.canary-intervals': 'Số khoảng đo trước khi quyết định',
  'games.cicd.cd.canary-delta': 'Ngưỡng hủy: lỗi canary cao hơn nhóm đối chứng (điểm %)',
  'games.cicd.cd.gitops': 'Đối soát',
  'games.cicd.cd.reconcile': 'Chu kỳ đối soát (giây)',
  'games.cicd.cd.self-heal': 'Tự sửa khi phát hiện lệch',
  'games.cicd.cd.ignore-fields': 'Trường không đối soát',
  'games.cicd.cd.masking': 'Che secret',
  'games.cicd.cd.masking-title': 'Che secret trong log',
  'games.cicd.cd.masking-note': 'Bộ che chỉ thay những chuỗi đã đăng ký dưới đây.',
  'games.cicd.cd.form.raw': 'nguyên văn',
  'games.cicd.cd.form.base64': 'base64',
  'games.cicd.cd.form.url': 'mã hoá URL',
  'games.cicd.cd.form.reversed': 'đảo ngược',

  // ── CI/CD: núm không nằm trong YAML ────────────────────────────────────────
  'games.cicd.overrides.title': 'Núm không nằm trong YAML',
  'games.cicd.overrides.lead':
    'Hai núm dưới đây không có khoá tương ứng trong workflow. Chúng đi thẳng vào engine cùng lượt chạy.',
  'games.cicd.overrides.retries': 'Số lần chạy lại',
  'games.cicd.overrides.retries-title': 'Chạy lại khi hỏng',
  'games.cicd.overrides.retries-note':
    'Chạy lại cứu được lỗi chập chờn của hạ tầng, nhưng không cứu được lỗi thật. Với lỗi thật, nó chỉ làm lượt chạy lâu hơn và tốn thêm runner-phút.',
  'games.cicd.overrides.no-jobs': 'Workflow chưa có job nào.',
  'games.cicd.overrides.cache': 'Cache',
  'games.cicd.overrides.cache-note':
    'Bạn chọn những đầu vào được băm vào khoá cache. Nội dung cache thật sự phụ thuộc vào đâu là chuyện của màn, không sửa được. Khoá rộng hơn mức đó thì hiếm khi trúng, hẹp hơn thì có ngày trúng phải bản đã ôi.',
  'games.cicd.overrides.no-cache': 'Chưa có bước nào dùng được cache.',
  'games.cicd.overrides.cache-saves': (p: { n: number }) =>
    `Trúng cache thì tiết kiệm tối đa ${String(p.n)} tick.`,
  'games.cicd.overrides.key-parts': 'Khoá cache gồm những đầu vào nào',
  'games.cicd.overrides.changes-every': (p: { n: number }) => `(đổi sau mỗi ${String(p.n)} commit)`,

  // ── CI/CD: tra nhanh và chèn nhanh ─────────────────────────────────────────
  'games.cicd.cheatsheet.title': 'Tra nhanh',
  'games.cicd.cheatsheet.panel': 'Bảng điều khiển',
  'games.cicd.snippet.group': 'Chèn nhanh',
  'games.cicd.snippet.title': 'Chèn nhanh dưới dòng con trỏ',
  'games.cicd.snippet.note': 'Mẩu YAML chèn vào dòng ngay dưới con trỏ. Nhớ sửa tên job cho hợp với màn.',
  'games.cicd.snippet.job': 'Job mới',
  'games.cicd.snippet.job-hint': 'Một job chạy trên một máy. Job khác gọi tới nó bằng tên trong "needs".',
  'games.cicd.snippet.job-step': 'Biên dịch',
  'games.cicd.snippet.needs': 'Cạnh phụ thuộc',
  'games.cicd.snippet.needs-hint':
    'Job này chỉ bắt đầu khi mọi job trong "needs" đã xong. Bỏ một cạnh thừa là cách rẻ nhất để rút ngắn đường găng.',
  'games.cicd.snippet.runs-on': 'Chọn hạng runner',
  'games.cicd.snippet.runs-on-hint':
    'Hạng runner quyết định job xếp hàng ở nhóm máy nào. Đòi một hạng mà màn không có thì workflow không chạy được.',
  'games.cicd.snippet.step': 'Bước mới trong job',
  'games.cicd.snippet.step-hint':
    'Các bước trong một job chạy lần lượt trên cùng một máy. Muốn chạy song song thì tách thành job riêng.',
  'games.cicd.snippet.step-name': 'Kiểm thử đơn vị',
  'games.cicd.snippet.continue': 'Job không chặn',
  'games.cicd.snippet.continue-hint':
    'Job hỏng mà không đánh trượt cả lượt. Dùng cho việc chỉ để báo tin (lint, quét), đừng dùng để giấu một lỗi thật.',
  'games.cicd.snippet.matrix': 'Chạy theo matrix',
  'games.cicd.snippet.matrix-hint':
    'Một job nhân thành nhiều bản chạy song song, mỗi bản một tổ hợp giá trị. Xong sớm hơn, nhưng runner-phút tăng theo đúng số bản.',

  // ── CI/CD: lỗi khuôn job và lỗi đồ thị ─────────────────────────────────────
  'games.cicd.error.unknown-job': (p: { job: string; known: string }) =>
    `Màn này không có job "${p.job}". Các job màn này có: ${p.known}.`,
  'games.cicd.error.unknown-steps': (p: { job: string; steps: string }) =>
    `Các bước của job "${p.job}" (${p.steps}) không khớp cách chia nào mà màn này chấm được. Giữ nguyên id và thứ tự bước; đổi tên hay bỏ bước thì không được chấm.`,
  'games.cicd.error.no-steps': 'không có bước nào',
  'games.cicd.error.unknown-jobs': (p: { jobs: string }) =>
    `Tập job (${p.jobs}) không khớp phương án nào mà màn này chấm được: đang thiếu hoặc thừa job. Bỏ hẳn một job kiểm thử cũng không được tính.`,
  'games.cicd.error.no-jobs': 'rỗng',
  'games.cicd.error.no-run':
    'Engine không dựng được lượt mô phỏng nào từ workflow này. Xem lại workflow có job nào không, và workload có cấp đúng hạng runner không.',
  'games.cicd.error.cycle': (p: { path: string }) =>
    `Phụ thuộc vòng tròn: ${p.path}. Không job nào trong vòng này chạy được, vì job nào cũng đang đợi một job khác trong chính vòng đó.`,
  'games.cicd.error.unknown-needs': (p: { stage: string; missing: string }) =>
    `Job "${p.stage}" khai "needs: ${p.missing}" nhưng không có job nào tên "${p.missing}". Kiểm tra chính tả; tên job phân biệt chữ hoa chữ thường.`,
  'games.cicd.error.no-runner': (p: { stage: string; runner: string }) =>
    `Job "${p.stage}" đòi runner hạng "${p.runner}" nhưng màn này không có hạng đó. Xem lại giá trị "runs-on".`,

  // ── CI/CD: chế độ làm bài OJ ───────────────────────────────────────────────
  'games.cicd.oj.no-testcase':
    'Bài này chưa có testcase nên chưa chấm được. Bạn vẫn mở ra luyện tay được; nhờ báo giúp tác giả bài.',
  'games.cicd.oj.retry': 'Thử lại',
  'games.cicd.oj.loading': 'Đang nạp đề bài và dựng pipeline…',
  'games.cicd.oj.load-error': (p: { code: string; reason: string }) => `Không mở được bài ${p.code}: ${p.reason}`,
  'games.cicd.oj.no-data': 'không có dữ liệu',
  'games.cicd.oj.spec-missing': (p: { code: string; part: string }) =>
    `Đề bài ${p.code} thiếu phần "${p.part}" nên chưa dựng được màn chơi. Lỗi nằm ở đề, không phải ở bạn. Nhờ báo giúp tác giả bài.`,
  'games.cicd.oj.spec-not-object': 'toàn bộ đề (initialState không phải object)',
  'games.cicd.oj.mission': (p: { code: string }) => `Bài ${p.code}: sửa pipeline cho qua hết tiêu chí chấm.`,
  'games.cicd.oj.submitting': 'Đang nộp và chấm…',
  'games.cicd.oj.submit': 'Nộp bài',
  'games.cicd.oj.hidden-case': 'Testcase ẩn, chưa có tên',
  'games.cicd.oj.submit-error': (p: { message: string }) => `Chưa nộp được: ${p.message}`,
  'games.cicd.oj.ce': (p: { reason: string }) => `CE: ${p.reason}`,
  'games.cicd.oj.ce-default': 'lượt chơi không chạy tới nơi nên chưa chấm được.',
  'games.cicd.oj.ac': (p: { passed: number; total: number }) =>
    `AC (${String(p.passed)}/${String(p.total)}): qua hết testcase.`,
  'games.cicd.oj.wa': (p: { passed: number; total: number }) => `WA (${String(p.passed)}/${String(p.total)})`,

  // ── CI/CD: bàn thử tự do ───────────────────────────────────────────────────
  'games.cicd.sandbox.title': 'Bàn thử tự do',
  'games.cicd.sandbox.no-data': 'Chưa có dữ liệu màn nào nên bàn thử không có sân đo để chạy.',
  'games.cicd.sandbox.lead':
    'Không mục tiêu, không giới hạn số lượt. Kho máy và lịch commit mượn của màn đầu cho sân đo ổn định; mọi job chạy với thời lượng mặc định.',
  'games.cicd.sandbox.runs': (p: { n: number }) => `Đã chạy ${String(p.n)} lượt`,
  'games.cicd.sandbox.yaml-label': 'Workflow YAML của bàn thử tự do',
  'games.cicd.sandbox.run-first': 'Bấm Chạy thử để mô phỏng và xem ba trục.',
  'games.cicd.sandbox.seed-step': 'Tải mã',

  // ── CI/CD: bảng ba trục thường trực ────────────────────────────────────────
  'games.cicd.axes.aria': 'Ba trục điểm',
  'games.cicd.axes.none': 'Chưa chạy lượt nào.',
  'games.cicd.axes.parse': 'YAML chưa quét được nên chưa có gì để chấm.',
  'games.cicd.axes.empty': 'Chưa có job nào để chạy.',
  'games.cicd.axes.shape': 'Job không khớp màn nên chưa chấm.',
  'games.cicd.axes.engine': 'Đồ thị không chạy được nên chưa có lượt nào để chiếu ra ba trục.',
  'games.cicd.axes.cd': 'Chính sách CD không hợp lệ.',
  'games.cicd.axes.lead': 'Lead time',
  'games.cicd.axes.lead-unit': 'p50 một commit',
  'games.cicd.axes.throughput': 'Thông lượng',
  'games.cicd.axes.throughput-unit': 'commit mỗi giờ',
  'games.cicd.axes.runner': 'Runner-phút',
  'games.cicd.axes.runner-unit': 'mỗi lượt mô phỏng',
  'games.cicd.axes.green-rate': (p: { rate: string }) => `Tỷ lệ lượt xanh: ${p.rate}`,

  // ── CI/CD: màn giới thiệu trục và phím tắt ─────────────────────────────────
  'games.cicd.intro.figure-cd': 'Hình: trục dọc chia thành ba dải môi trường, dải trên cùng là prod',
  'games.cicd.intro.figure-ci': 'Hình: trục dọc là thời gian chờ hàng đợi, job càng cao thì chờ càng lâu',
  'games.cicd.intro.figure-slow': 'chờ lâu',
  'games.cicd.intro.figure-fast': 'chạy ngay',
  'games.cicd.intro.title-cd': 'Chiều dọc vừa đổi nghĩa: từ thời gian chờ sang môi trường',
  'games.cicd.intro.title-ci': 'Cách đọc sân chơi ở chương CI',
  'games.cicd.intro.cd-p1-before': 'Suốt chương CI, job nằm càng cao nghĩa là nó',
  'games.cicd.intro.cd-p1-strong': 'chờ hàng đợi',
  'games.cicd.intro.cd-p1-after': 'càng lâu. Sang chương CD, chiều dọc không còn nói về thời gian nữa.',
  'games.cicd.intro.cd-p2-before': 'Giờ nó là',
  'games.cicd.intro.cd-p2-strong': 'dải môi trường',
  'games.cicd.intro.cd-p2-after':
    ': dưới cùng là dev, giữa là staging, trên cùng là prod. Job đi lên nghĩa là bản build được thăng hạng lên môi trường cao hơn, không phải nó chạy chậm hơn.',
  'games.cicd.intro.cd-p3':
    'Chiều ngang giữ nguyên ở cả hai chương: càng sang phải thì càng phụ thuộc vào nhiều thứ phía trước.',
  'games.cicd.intro.ci-p1': 'Chiều ngang là thứ tự phụ thuộc: càng sang phải, job càng phải đợi nhiều thứ phía trước.',
  'games.cicd.intro.ci-p2-before': 'Chiều dọc là',
  'games.cicd.intro.ci-p2-strong': 'thời gian chờ hàng đợi',
  'games.cicd.intro.ci-p2-after':
    ': job nằm càng cao thì đã sẵn sàng từ lâu mà vẫn chưa có máy để chạy. Thêm máy cứu được chỗ đó, và cũng đốt thêm runner-phút ở chính chỗ đó.',
  'games.cicd.intro.keys-title': 'Phím tắt',
  'games.cicd.intro.keys-note': 'Thao tác nào cũng có nút bấm, đi tới bằng phím Tab được. Phím tắt chỉ là đường ngắn hơn.',
  'games.cicd.intro.start': 'Đã hiểu, vào màn',
  'games.cicd.intro.skip': 'Bỏ qua',
  'games.cicd.intro.reopen': 'Muốn xem lại thì bấm nút Trợ giúp trên thanh trên cùng.',

  // ── CI/CD: phím tắt (mô tả hiện trên màn trợ giúp) ─────────────────────────
  'games.cicd.keys.run': 'Chạy thử workflow đang soạn',
  'games.cicd.keys.deselect': 'Bỏ chọn job đang chọn',
  'games.cicd.keys.editor': 'Ô soạn workflow',
  'games.cicd.keys.mission': 'Đề bài và mục tiêu',
  'games.cicd.keys.inspector': 'Thông số job đang chọn',
  'games.cicd.keys.result': 'Kết quả lượt chạy',
  'games.cicd.keys.tools': 'Bảng núm',
  'games.cicd.keys.learn': 'Bài học và cẩm nang',
  'games.cicd.keys.minimap': 'Bản đồ thu nhỏ',
  'games.cicd.keys.close-all': 'Thu hết lớp phủ, để sân trống',
  'games.cicd.keys.mode-2d': 'Chuyển sang cảnh 2D',
  'games.cicd.keys.mode-3d': 'Chuyển sang cảnh 3D',
  'games.cicd.keys.help': 'Mở màn trợ giúp này',

  // ── CI/CD: bảng thông số một job ───────────────────────────────────────────
  'games.cicd.inspector.blocked-none': 'Chạy ngay khi sẵn sàng, không phải chờ gì.',
  'games.cicd.inspector.blocked-dep': (p: { instance: string }) =>
    `Chờ "${p.instance}" xong (phụ thuộc xong muộn nhất).`,
  'games.cicd.inspector.blocked-runner': (p: { runner: string; instance: string }) =>
    `Chờ runner hạng "${p.runner}" vì "${p.instance}" đang giữ chỗ.`,
  'games.cicd.inspector.cause-flake': (p: { nature: string }) =>
    `Đỏ giả (${p.nature}). Chạy lại có thể xanh, nhưng lần chạy lại nào cũng đốt runner-phút.`,
  'games.cicd.inspector.cause-missing-output': (p: { step: string; output: string }) =>
    `Bước "${p.step}" cần artifact "${p.output}", mà job này không phụ thuộc (kể cả gián tiếp) vào job tạo ra nó.`,
  'games.cicd.inspector.cause-stale-cache': (p: { cache: string; step: string }) =>
    `Trúng khoá cache "${p.cache}" nhưng nội dung đã ôi: bước "${p.step}" chạy trên bản cũ. Khoá đang quá hẹp, không phải quá rộng.`,
  'games.cicd.inspector.cause-upstream': (p: { stage: string }) =>
    `Job phía trên "${p.stage}" đỏ và chặn đường, nên job này không chạy.`,
  'games.cicd.inspector.cause-approval': 'Cổng phê duyệt bị từ chối. Chạy lại không cứu được.',
  'games.cicd.inspector.empty':
    'Chưa chọn job nào. Bấm một node trên sân, hoặc chọn một chấm trên bản đồ thu nhỏ (đi được bằng phím Tab).',
  'games.cicd.inspector.no-data': 'Chưa có số liệu cho job này. Bấm Chạy thử để engine mô phỏng một lượt.',
  'games.cicd.inspector.duration': 'Thời lượng',
  'games.cicd.inspector.wait': 'Chờ máy',
  'games.cicd.inspector.runner': 'Runner-phút',
  'games.cicd.inspector.attempts': 'Số lần thử',
  'games.cicd.inspector.retried': '(có thử lại)',
  'games.cicd.inspector.cache': 'Cache',
  'games.cicd.inspector.cache-none': 'job này không khai cache',
  'games.cicd.inspector.cache-hit': 'trúng ở mọi bước có khai',
  'games.cicd.inspector.cache-miss': 'trượt ở ít nhất một bước',
  'games.cicd.inspector.env': 'Môi trường',
  'games.cicd.inspector.failed-step': (p: { step: string }) => `Bước gãy: ${p.step}.`,
  'games.cicd.inspector.steps': (p: { n: number }) => `Các bước đã chạy (${String(p.n)})`,
  'games.cicd.inspector.step-hit': 'cache trúng',
  'games.cicd.inspector.step-miss': 'cache trượt',

  // ── CI/CD: bản đồ thu nhỏ, đề bài, đồ thị trống ────────────────────────────
  'games.cicd.minimap.count': (p: { n: number }) => `${String(p.n)} thực thể`,
  'games.cicd.minimap.axis.env': 'dọc là dải môi trường',
  'games.cicd.minimap.axis.lanes': 'dọc là làn job song song',
  'games.cicd.mission.objectives': 'Mục tiêu',
  'games.cicd.mission.required': 'Bắt buộc',
  'games.cicd.mission.optional': 'Thưởng',
  'games.cicd.mission.bonus': '(thưởng)',
  'games.cicd.mission.state.unscored': 'chưa chấm',
  'games.cicd.mission.state.met': 'đã đạt',
  'games.cicd.mission.state.failing': 'còn trượt',
  'games.cicd.scene.no-jobs': 'Workflow chưa có job nào. Thêm một job vào ô soạn để đồ thị hiện ra ở đây.',
  'games.cicd.scene.cycle':
    'Phụ thuộc vòng tròn: một nhóm job đang đợi lẫn nhau nên không job nào chạy được và đồ thị không xếp được thứ tự. Gỡ một "needs" trong vòng đó là đồ thị hiện lại.',
  'games.cicd.scene.build-failed': 'Chưa dựng được đồ thị từ workflow này. Bấm Chạy thử để xem engine báo lỗi cụ thể.',

  // ── CI/CD: cảnh 2D ─────────────────────────────────────────────────────────
  'games.cicd.scene.edge-dependency': 'phụ thuộc',
  'games.cicd.scene.edge-machine': 'chờ máy chạy',
  'games.cicd.scene.seconds': (p: { s: number }) => `${String(p.s)} giây`,
  'games.cicd.scene.minutes': (p: { m: number; s: number }) => `${String(p.m)} phút ${String(p.s)} giây`,
  'games.cicd.scene.unreleased': 'chưa phát hành',
  'games.cicd.scene.attempt': (p: { n: number }) => `lần ${String(p.n)}`,
  'games.cicd.scene.wait': (p: { n: number }) => `chờ máy ${String(p.n)} tick`,
  'games.cicd.scene.label': 'Đồ thị đường ống CI/CD',
  'games.cicd.scene.desc-count': (p: { nodes: number; edges: number }) =>
    `Đồ thị có ${String(p.nodes)} job và ${String(p.edges)} liên kết.`,
  'games.cicd.scene.desc-critical': (p: { n: number }) => `Đường găng gồm ${String(p.n)} đoạn.`,
  'games.cicd.scene.desc-critical-time': (p: { n: number; time: string }) =>
    `Đường găng gồm ${String(p.n)} đoạn, lượt chạy hết ${p.time}.`,
  'games.cicd.scene.desc-no-critical': 'Lượt chạy chưa tính được đường găng nào.',
  'games.cicd.scene.desc-machine':
    'Đường găng đi qua một đoạn chờ máy chạy: muốn nhanh hơn thì thêm máy, sửa đồ thị không đổi được gì.',
  'games.cicd.scene.layer': (p: { n: number }) => `tầng ${String(p.n)}`,
  'games.cicd.scene.critical': (p: { n: number }) => `Đường găng · ${String(p.n)} đoạn`,
  'games.cicd.scene.critical-time': (p: { n: number; time: string }) =>
    `Đường găng · ${String(p.n)} đoạn · lượt chạy hết ${p.time}`,
  'games.cicd.scene.critical-machine':
    'Có đoạn CHỜ MÁY trên đường găng. Thêm máy chạy thì nhanh hơn, sửa đồ thị thì không.',
  'games.cicd.scene.keys':
    'Tab: đi giữa các job · ←→: theo phụ thuộc · ↑↓: sang làn kề · Enter: chọn · I: xem chi tiết · + − 0: thu phóng · Esc: thoát',
  'games.cicd.scene.detail-title': (p: { name: string }) => `Bên trong ${p.name}`,
  'games.cicd.scene.detail-ready': (p: { v: string }) => `sẵn sàng: ${p.v}`,
  'games.cicd.scene.detail-start': (p: { v: string }) => `bắt đầu: ${p.v}`,
  'games.cicd.scene.detail-end': (p: { v: string }) => `kết thúc: ${p.v}`,
  'games.cicd.scene.detail-attempt': (p: { n: number }) => `lần thử: ${String(p.n)}`,
  'games.cicd.scene.detail-no-env': 'không phát hành',
  'games.cicd.scene.detail-env': (p: { env: string }) => `môi trường: ${p.env}`,

  // ── CI/CD: cảnh 3D ─────────────────────────────────────────────────────────
  'games.cicd.scene.label-3d': 'Đồ thị đường ống CI/CD, chế độ 3D',
  'games.cicd.scene.group-3d': (p: { label: string }) =>
    `${p.label}. Dùng phím mũi tên để đi giữa các job, Enter để chọn, Escape để bỏ chọn.`,
  'games.cicd.scene.desc-3d': (p: { nodes: number; edges: number }) =>
    `Đồ thị có ${String(p.nodes)} job và ${String(p.edges)} quan hệ phụ thuộc.`,
  'games.cicd.scene.colors-fallback': 'Không đọc được một số màu chủ đề nên cảnh đang dùng màu dự phòng.',
  'games.cicd.scene.rotate-left': (p: { angle: string }) => `Xoay cảnh sang trái. ${p.angle}`,
  'games.cicd.scene.rotate-right': (p: { angle: string }) => `Xoay cảnh sang phải. ${p.angle}`,
  'games.cicd.scene.angle.ne': 'Góc nhìn 1 trên 4, từ hướng đông bắc',
  'games.cicd.scene.angle.se': 'Góc nhìn 2 trên 4, từ hướng đông nam',
  'games.cicd.scene.angle.sw': 'Góc nhìn 3 trên 4, từ hướng tây nam',
  'games.cicd.scene.angle.nw': 'Góc nhìn 4 trên 4, từ hướng tây bắc',
} as const;

export const gamesIntentionalThree: IntentionalThree = {
  'games.soon':
    '2026-10-20: khối game đang dựng có đúng ba vai trò chữ (tiêu đề khối, câu ghi chú, nhãn trên từng dòng). Đây là ba phần của một khối giao diện, không phải một danh sách ba ý.',
  'games.cicd.mission.state':
    '2026-10-03: ba trạng thái của một mục tiêu là đúng ba giá trị của ObjectiveState (chưa chấm, đạt, trượt), không phải liệt kê theo thói quen.',
};
