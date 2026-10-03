import type { IntentionalThree, Surface } from '../types.ts';

/**
 * Surface `catalog.`, sở hữu bởi lane 16.C (L2).
 *
 * Phủ BẢY màn: năm trang danh mục dùng chung một bộ component
 * (`/lessons` `/labs` `/playgrounds` `/paths` `/quiz`), cộng `/games` và
 * `/problems`. Hai màn sau có thanh công cụ riêng nhưng vẫn là màn chọn bài,
 * nên chuỗi của chúng ở cùng surface này theo §1.7 (chọn file theo MÀN HÌNH).
 *
 * ⛔ LUẬT GÕ PHÍM CỦA CẢ GÓI: không U+2014, U+2013, U+2015 ở bất kỳ đâu, kể cả
 * chú thích. Ba chuỗi cũ trong `catalog-labels.ts` mang U+2014 đã được viết
 * lại bằng dấu phẩy hoặc dấu chấm, không bằng một ký tự thay thế trông giống.
 *
 * ## Bốn bộ chọn biên tập trả về KHOÁ, không trả về câu
 *
 * `describeCatalogEmpty`, `describePageScope`, `describeSortScope`,
 * `describeResultCount` ở lại `apps/web/src/components/catalog/catalog-labels.ts`
 * nhưng đổi kiểu trả về thành `{ key, params }` theo §1.6. Mọi NHÁNH của chúng
 * vì vậy là một mục tĩnh trong bản đồ này, nên bộ dò quét được toàn bộ thay vì
 * chỉ nhánh mà probe đi vào.
 *
 * ⚠ Hợp đồng §1.6 nói bốn hàm đó “đi cùng sang packages/copy”. Chúng KHÔNG
 * sang được, và lý do là cơ học: `package.json` của gói này khai đúng bốn lối
 * vào (`.`, `./types`, `./registry`, `./scan`), không có lối nào chở được một
 * hàm khai trong `surfaces/`, và cả `package.json` lẫn `t.ts` đều là file của
 * L0 mà §6.1 cấm lane chạm. Thứ §1.6 thật sự mua là “mọi nhánh là một khoá
 * tĩnh trong bản đồ”, và điều đó đạt được đầy đủ khi bản đồ ở đây còn nhánh ở
 * bên kia: bộ dò đọc bản đồ, không đọc bộ chọn. Đã báo lead.
 *
 * ## Cái KHÔNG ở đây, và vì sao
 *
 * - **Ba mức độ khó** ở `common.difficulty.*` (L0 sở hữu). Chép sang đây là
 *   dựng nguồn sự thật thứ hai cho một hợp đồng dữ liệu.
 * - **Tiêu đề và mô tả của bốn game** ở lại `app/games/games-catalog.ts`. Phép
 *   thử 2 của §5.1: số bản sao bị chặn bởi số GAME, không bởi số màn hình. Một
 *   game là một bó mã kèm chữ của nó, cùng hạng với một mục nội dung.
 * - **Nhãn độ khó và chủ đề của `/problems`** ở lại `packages/games`
 *   (`PROBLEM_DIFFICULTY_LABELS`, `PROBLEM_TOPIC_LABELS`). Package đó nằm ngoài
 *   phạm vi P16 theo §8 của `phase-16.md`, và §5.1 cấm trích chữ ra khỏi nó.
 */
export const catalog = {
  // ── Danh từ của năm loại danh mục ──────────────────────────────────────
  //
  // Tập cố định bởi `CatalogKind`, đúng 5 giá trị, nên nhóm này không rơi vào
  // luật đúng ba. Loại từ dính liền danh từ: `bộ câu hỏi` chứ không phải
  // `câu hỏi`, vì thứ đếm được ở trang `/quiz` là bộ.
  'catalog.noun.lessons': 'bài học',
  'catalog.noun.labs': 'lab',
  'catalog.noun.playgrounds': 'sân chơi',
  'catalog.noun.paths': 'lộ trình',
  'catalog.noun.quiz': 'bộ câu hỏi',

  /*
   * ── Hạng sandbox ─────────────────────────────────────────────────────────
   *
   * Tier giữ NGUYÊN tên kỹ thuật, không dịch và không kèm lời hứa (“nhẹ hơn”,
   * “an toàn hơn”). Ba runtime này khác nhau ở thứ đo được trên hạ tầng cụ
   * thể, và một tính từ dán ở đây sẽ là một khẳng định mà trang danh mục không
   * có dữ liệu để bảo vệ.
   */
  'catalog.tier.sysbox': 'Sysbox',
  'catalog.tier.gvisor': 'gVisor',
  'catalog.tier.kata': 'Kata',

  /*
   * ── Chủ đề ──────────────────────────────────────────────────────────────
   *
   * Đúng bảy giá trị của `CONTENT_TOPICS` (packages/shared-types). Tên công cụ
   * giữ tiếng Anh; hai mảng có từ tiếng Việt quen tai thì dùng từ đó.
   */
  'catalog.topic.linux': 'Linux',
  'catalog.topic.bash': 'Bash',
  'catalog.topic.git': 'Git',
  'catalog.topic.docker': 'Docker',
  'catalog.topic.kubernetes': 'Kubernetes',
  'catalog.topic.observability': 'Giám sát',
  'catalog.topic.networking': 'Mạng',

  'catalog.status.not-started': 'Chưa bắt đầu',
  'catalog.status.in-progress': 'Đang học',
  'catalog.status.completed': 'Đã xong',

  'catalog.title.lessons': 'Bài học',
  'catalog.title.labs': 'Lab',
  'catalog.title.playgrounds': 'Sân chơi',
  'catalog.title.paths': 'Lộ trình',
  'catalog.title.quiz': 'Trắc nghiệm',

  /**
   * Tiêu đề tài liệu của các trang danh mục: chữ trên tab trình duyệt và trong
   * kết quả tìm kiếm, nên nó mang cả tên sản phẩm. Phân cách bằng dấu chấm giữa.
   */
  'catalog.meta-title.lessons': 'Bài học · DevOps Learning Platform',
  'catalog.meta-title.labs': 'Lab · DevOps Learning Platform',
  'catalog.meta-title.playgrounds': 'Sân chơi · DevOps Learning Platform',
  'catalog.meta-title.paths': 'Lộ trình · DevOps Learning Platform',
  'catalog.meta-title.quiz': 'Trắc nghiệm · DevOps Learning Platform',

  /**
   * Mô tả tài liệu, chỉ vài trang có. Đặt dưới tiền tố của TỪNG trang chứ không
   * gom thành `catalog.meta-description.*`: gom lại thì số thành viên là chuyện
   * tình cờ, và cổng nhóm ba sẽ đòi một lời khai cho một con số không đóng.
   */

  /*
   * Nhãn mono trên đầu trang: tên section, rồi số mục THẬT. Số tới từ máy chủ
   * (tổng đã xuất bản) hoặc từ danh sách đã tải hết; không có số thì chỉ in tên
   * section, không in một con số đoán.
   */
  'catalog.kicker': (p: { section: string; n: number; noun: string }) =>
    `${p.section} · ${p.n} ${p.noun}`,

  'catalog.lead.lessons':
    'Làm theo từng bước, gõ lệnh trên máy ảo của riêng bạn. Bước nào cũng có nút Kiểm tra.',
  'catalog.lead.labs':
    'Đề chỉ nói cần đạt trạng thái gì, cách làm do bạn chọn. Máy chấm từng nhiệm vụ bằng script.',
  'catalog.lead.playgrounds':
    'Máy trống có hạn giờ. Thử lệnh, dựng thử một hệ thống, hỏng thì mở máy khác.',
  'catalog.lead.paths':
    'Bài học, lab và trắc nghiệm xếp sẵn theo thứ tự. Đi hết một tuyến là nắm được một mảng.',
  'catalog.lead.quiz':
    'Vài câu hỏi ngắn để tự kiểm lại phần vừa học. Nộp bài xong mới thấy đáp án và giải thích.',

  // ── Thanh công cụ ─────────────────────────────────────────────────────
  'catalog.toolbar.all': 'Tất cả',
  'catalog.toolbar.topic-legend': 'Chủ đề',
  'catalog.toolbar.difficulty-legend': 'Độ khó',
  'catalog.toolbar.tier-legend': 'Sandbox',
  'catalog.toolbar.sort-label': 'Sắp xếp',
  'catalog.toolbar.search-label': 'Tìm theo tên',
  'catalog.toolbar.search-placeholder': 'Tên hoặc mô tả',

  /*
   * Tên của vùng `role="search"`. BẮT BUỘC khác nhau giữa các màn: nhiều màn có
   * cùng một vùng tìm kiếm, nên một tên chung sẽ cho cây hỗ trợ tiếp cận nhiều
   * vùng “search” không phân biệt được.
   */
  'catalog.toolbar.search-region': (p: { noun: string }) => `Tìm trong danh sách ${p.noun}`,

  /*
   * Câu nhắc phạm vi, đúng MỘT câu, đứng ngay dưới ô tìm và chỉ hiện khi nó có
   * tin: đang tìm hoặc đang sắp xếp, và danh sách còn phần chưa tải. Máy chủ
   * không nhận từ khoá lẫn thứ tự tự chọn, nên cả hai chỉ chạy trên phần đã tải.
   */
  'catalog.toolbar.scope': (p: { loaded: number; noun: string }) =>
    `Tìm và sắp xếp trong ${p.loaded} ${p.noun} đã tải. Bấm Xem thêm để tải tiếp.`,

  'catalog.sort.stock': 'Mặc định',
  'catalog.sort.title': 'Tên, A tới Z',
  'catalog.sort.difficulty': 'Dễ trước',
  'catalog.sort.duration': 'Ngắn trước',
  'catalog.sort.steps': 'Ít bước trước',
  'catalog.sort.tasks': 'Ít nhiệm vụ trước',
  'catalog.sort.questions': 'Ít câu trước',
  'catalog.sort.parts': 'Ít phần trước',
  'catalog.sort.ttl': 'Hạn giờ ngắn trước',

  // ── Thông tin mono trên một dòng của bảng ─────────────────────────────
  //
  // `unit.step` và `unit.task` của common chở hai ô còn lại, nên nơi gọi dùng
  // thẳng khoá `unit.*` cho chúng và không có bản sao ở đây.
  'catalog.meta.duration': (p: { minutes: number }) => `~${p.minutes} phút`,
  'catalog.meta.threshold': (p: { percent: number }) => `Đạt từ ${p.percent}%`,
  'catalog.meta.questions': (p: { n: number }) => `${p.n} câu`,
  'catalog.meta.parts': (p: { n: number }) => `${p.n} phần`,
  'catalog.meta.ttl': (p: { minutes: number }) => `Hạn ${p.minutes} phút`,

  'catalog.flag.leaderboard': 'Có xếp hạng',
  'catalog.flag.sequential': 'Học tuần tự',

  'catalog.board.label': (p: { noun: string }) => `Danh sách ${p.noun}`,
  'catalog.loading.list': 'Đang tải danh sách',

  /*
   * ── Xem thêm ─────────────────────────────────────────────────────────────
   *
   * Danh sách tải thêm theo từng lượt, không phân trang. Máy chủ trả
   * `nextCursor` (còn hay hết) chứ không trả tổng, nên dòng đếm nói về phần
   * ĐANG HIỆN và nói “còn nữa”, không in một tổng tự đoán.
   *
   * `catalog.pager.page` là tiêu đề của ô lỗi khi một lượt tải thêm hỏng: các
   * mục đã hiện vẫn ở đó, chỉ lượt đó không về.
   */
  'catalog.pager.more': 'Xem thêm',
  'catalog.pager.page': (p: { page: number }) => `Không tải được lượt thứ ${p.page}`,

  'catalog.count.plain': (p: { shown: number; noun: string }) => `${p.shown} ${p.noun}`,
  'catalog.count.more': (p: { shown: number; noun: string }) =>
    `Đang hiện ${p.shown} ${p.noun}, còn nữa`,
  'catalog.count.filtered': (p: { shown: number; noun: string }) =>
    `${p.shown} ${p.noun} khớp bộ lọc`,
  'catalog.count.filtered-more': (p: { shown: number; noun: string }) =>
    `${p.shown} ${p.noun} khớp bộ lọc, còn nữa`,
  'catalog.count.searched': (p: { shown: number; loaded: number; noun: string }) =>
    `${p.shown} trong ${p.loaded} ${p.noun} đã tải khớp từ khoá`,

  /*
   * ── Trạng thái rỗng ─────────────────────────────────────────────────────
   *
   * Năm ca, và chúng KHÁC NHAU ở việc người đọc phải làm gì tiếp. Thứ tự kiểm
   * là một phần của hợp đồng, và nó nằm ở `describeCatalogEmpty`.
   *
   * Ca `search` không gộp được vào ca `filter`: bộ lọc chạy ở máy chủ nên
   * “không khớp” là câu trả lời về cả kho đã lọc, còn ô tìm chạy trên phần đã
   * tải nên “không khớp” chỉ nói về phần đó.
   */
  'catalog.empty.page.title': 'Danh sách vừa thay đổi',
  'catalog.empty.page.body':
    'Nội dung đã đổi kể từ lúc bạn mở trang. Tải lại từ đầu để xem bản mới.',

  'catalog.empty.filter.title': (p: { noun: string }) => `Chưa có ${p.noun} nào khớp bộ lọc`,
  'catalog.empty.filter.body': 'Bỏ bớt điều kiện xem.',

  'catalog.empty.search.title': (p: { noun: string }) =>
    `Chưa thấy ${p.noun} nào khớp từ khoá trong phần đã tải`,
  'catalog.empty.search.body': (p: { loaded: number }) =>
    `Mới tìm trong ${p.loaded} mục. Bấm Xem thêm rồi tìm lại, hoặc xoá từ khoá.`,

  'catalog.empty.search-last.title': (p: { noun: string }) =>
    `Không có ${p.noun} nào khớp từ khoá`,
  'catalog.empty.search-last.body': (p: { loaded: number }) =>
    `Đã tìm hết ${p.loaded} mục. Thử từ khác, hoặc xoá từ khoá để xem lại cả danh sách.`,

  'catalog.empty.blank.title': (p: { noun: string }) => `Chưa có ${p.noun} nào`,
  'catalog.empty.author.body': (p: { noun: string }) =>
    `Bạn có quyền soạn bài. Tạo ${p.noun} đầu tiên trong Xưởng soạn rồi xuất bản, người học sẽ thấy nó ở đây.`,

  /*
   * Gợi ý cho người học khi một trụ cột còn trống. Mỗi gợi ý trỏ sang một trụ
   * cột KHÁC; trỏ về chính trang đang rỗng là một vòng lặp, không phải lối ra.
   */
  'catalog.empty.learner.lessons':
    'Chưa có bài nào được xuất bản. Trong lúc chờ, mở một sân chơi để gõ lệnh trên máy trống.',
  'catalog.empty.learner.labs':
    'Chưa có lab nào được xuất bản. Bài học có phần thực hành từng bước, bắt đầu ở đó trước.',
  'catalog.empty.learner.playgrounds':
    'Chưa có sân chơi nào. Bài học cũng mở máy ảo riêng, bạn vẫn gõ lệnh thật được ở đó.',
  'catalog.empty.learner.paths':
    'Chưa có lộ trình nào được xuất bản. Bạn vẫn chọn được từng bài lẻ theo ý mình.',
  'catalog.empty.learner.quiz':
    'Chưa có bộ câu hỏi nào được xuất bản. Làm một lab để tự kiểm bằng thao tác thật.',

  'catalog.action.first-page': 'Tải lại từ đầu',
  'catalog.action.author': 'Mở Xưởng soạn',
  'catalog.action.browse-lessons': 'Xem bài học',
  'catalog.action.browse-labs': 'Xem lab',
  'catalog.action.browse-playgrounds': 'Mở sân chơi',
  'catalog.action.clear-search': 'Xoá từ khoá',
  'catalog.action.clear-filter': 'Xoá bộ lọc',

  'catalog.error-title.lessons': 'Không tải được danh sách bài học',
  'catalog.error-title.labs': 'Không tải được danh sách lab',
  'catalog.error-title.playgrounds': 'Không tải được danh sách sân chơi',
  'catalog.error-title.paths': 'Không tải được danh sách lộ trình',
  'catalog.error-title.quiz': 'Không tải được danh sách trắc nghiệm',

  /*
   * Câu phụ dưới ô lỗi, một câu cho mỗi lớp lỗi mà `describeCatalogError` phân
   * biệt. Lượt tải đầu của lớp thử lại được KHÔNG có câu nào: `message` của máy
   * chủ đã nói chuyện gì xảy ra và nút Thử lại đã là bước tiếp theo.
   */
  'catalog.error-hint.stale-cursor': (p: { page: number }) =>
    `Mốc tải tiếp của lượt ${p.page} không còn trong kho, nên thử lại vẫn ra lỗi này. Tải lại từ đầu để đọc tiếp.`,
  'catalog.error-hint.retryable-midway': (p: { page: number }) =>
    `Các mục đã hiện vẫn giữ nguyên. Thử lại sẽ tải đúng lượt ${p.page}.`,
  'catalog.error-hint.unknown-midway':
    'Nếu thử lại vẫn lỗi, tải lại từ đầu.',

  // ── Nhãn verdict và ô nộp bài của một bài tập ──────────────────────────
  //
  // Phần còn lại của màn `/problems` đã chuyển sang `problem.oj.*` (surface
  // problem). Mười bốn khoá dưới đây ở lại vì sân k8s (bị đóng băng) và một
  // test logic vẫn gọi chúng.
  'catalog.problem.verdict-ac': 'AC',
  'catalog.problem.verdict-wa': (p: { passed: number; total: number }) =>
    `WA (${p.passed}/${p.total})`,
  'catalog.problem.verdict-ce': 'CE',
  'catalog.problem.verdict-ac-note': 'Qua hết testcase.',
  'catalog.problem.verdict-wa-note': (p: { failed: number }) =>
    `Còn ${p.failed} testcase chưa qua:`,
  'catalog.problem.verdict-ce-note': 'Lượt chơi không chạy tới nơi nên chưa chấm được.',
  'catalog.problem.verdict-region': 'Kết quả lượt nộp',
  'catalog.problem.verdict-unnamed': 'Testcase ẩn chưa hiện tên',

  'catalog.problem.subs-verdict-ungraded': 'Chưa chấm theo testcase',

  'catalog.problem.submit-region': 'Nộp bài',
  'catalog.problem.submit-action': 'Nộp bài',
  'catalog.problem.submit-pending': 'Đang nộp bài…',
  'catalog.problem.submit-failed': 'Chưa nộp được bài',
  'catalog.problem.submit-kept':
    'Lượt chơi vẫn còn nguyên, bấm thử lại là nộp lại đúng lượt này.',


  // ── Chi tiết một lộ trình (`/paths/[id]`) ─────────────────────────────
  //
  // Ổ khoá vẽ trên màn này là HÌNH ẢNH của một luật chạy ở server, không phải
  // chính luật đó: `state` tới từ `paths.get` và cổng thi hành là
  // `paths.openItem`. Câu chữ ở đây vì vậy không được hứa hay từ chối điều gì,
  // nó chỉ thuật lại thứ server vừa nói.
  'catalog.path.back': 'Tất cả lộ trình',
  'catalog.path.loading': 'Đang tải lộ trình',
  'catalog.path.error-title': 'Không mở được lộ trình này',
  'catalog.path.sequential': 'Học tuần tự: phần sau mở khi phần trước đạt',
  'catalog.path.open': 'Mở',
  'catalog.path.reload': 'Tải lại',
  'catalog.path.empty-title': 'Lộ trình này chưa có phần nào',
  'catalog.path.empty-body':
    'Người soạn chưa xếp bài vào đây. Trong lúc chờ, bạn chọn bài lẻ ở trang Bài học.',
  'catalog.path.empty-cta': 'Xem bài học',
  'catalog.path.stations': 'Các phần của lộ trình',
  'catalog.path.meter': 'Tiến độ lộ trình',

  // Ba loại mắt xích và ba trạng thái: hai union đóng, xem `catalogIntentionalThree`.
  'catalog.path.kind.lesson': 'Bài học',
  'catalog.path.kind.lab': 'Lab',
  'catalog.path.kind.quiz': 'Trắc nghiệm',
  'catalog.path.state.passed': 'Đã đạt',
  'catalog.path.state.available': 'Đã mở',
  'catalog.path.state.locked': 'Còn khoá',

  'catalog.path.note-locked': 'Còn khoá, hoàn thành phần trước thì phần này tự mở.',

  /*
   * `title === null` = mắt xích trỏ tới nội dung không còn nạp được. Câu này
   * hiện ra thay vì lọc mục đó đi: một lộ trình thủng là chuyện người soạn
   * phải thấy. Nó ĐỘC LẬP với ổ khoá, một item vừa khoá vừa thủng hiện cả hai.
   */
  'catalog.path.note-missing':
    'Không nạp được nội dung này (đã lưu trữ hoặc sai mã). Báo người soạn lộ trình.',

  /*
   * Nhãn nói ĐÚNG thứ hệ thống biết: đã đạt bao nhiêu phần trên bao nhiêu, và
   * phần nào nên làm tiếp. Nó KHÔNG biết người học đã bỏ ra bao lâu, nên không
   * có nhãn thời lượng nào ở màn này.
   */
  'catalog.path.progress': (p: { passed: number; total: number }) =>
    `Đã đạt ${p.passed}/${p.total} phần`,
  'catalog.path.next': (p: { name: string }) => `Nên làm tiếp: ${p.name}`,
  'catalog.path.next-action': 'Làm tiếp',
  'catalog.path.all-done': 'Bạn đã đạt tất cả các phần của lộ trình này.',
  'catalog.path.open-failed': (p: { reason: string }) =>
    `${p.reason} Bấm Tải lại để xem trạng thái mới nhất.`,

  /*
   * ── Làm một bộ câu hỏi (`/quiz/[id]`) ────────────────────────────────────
   *
   * ⛔ KHÔNG có khoá nào ở đây nói một lựa chọn là đúng hay sai TRƯỚC khi nộp.
   * `QuizForLearner` khai `isCorrect`/`explanation` là `never`, nên client
   * không có dữ liệu để suy, và một câu chữ nằm sẵn ở đây sẽ là lối duy nhất
   * để lộ điều đó ra. Ba nhãn `reveal.*` chỉ dựng được sau khi `quiz.submit`
   * trả kết quả.
   */
  'catalog.quiz.back': 'Trắc nghiệm',
  'catalog.quiz.loading-title': 'Đang tải',
  'catalog.quiz.loading-sr': 'Đang tải bộ câu hỏi',
  'catalog.quiz.error-title': 'Không mở được bộ câu hỏi này',

  /*
   * Quy tắc chấm hiện TRƯỚC câu hỏi đầu tiên, và câu chữ chọn theo
   * `quiz.multipleAnswerRule` TRONG PAYLOAD: server sở hữu luật chấm, nên một
   * câu FE tự viết sẽ trôi khỏi cách chấm thật ở lần đầu tiên server đổi luật.
   */
  'catalog.quiz.grading-title': 'Cách chấm',
  'catalog.quiz.rule-all-or-nothing':
    'Câu nhiều đáp án: phải chọn ĐÚNG và ĐỦ mọi đáp án đúng mới được tính điểm, không có điểm một phần.',
  'catalog.quiz.threshold': (p: { percent: number }) =>
    `Đạt từ ${p.percent}% số câu. Làm lại bao nhiêu lần cũng được.`,

  'catalog.quiz.question': (p: { n: number }) => `Câu ${p.n}`,

  /*
   * Tiến độ TRẢ LỜI, không phải tiến độ ĐÚNG: một nhãn "5/5 câu" cạnh nút Nộp
   * rất dễ đọc thành "5/5 đúng", nên nhãn phải tự nói ra nó đếm câu ĐÃ CHỌN.
   */
  'catalog.quiz.progress': (p: { answered: number; total: number }) =>
    `Đã chọn đáp án cho ${p.answered}/${p.total} câu`,
  'catalog.quiz.progress-caveat': (p: { blank: number }) =>
    `Còn ${p.blank} câu chưa chọn. Vẫn nộp được, câu bỏ trống tính là sai.`,

  // Phiếu trả lời dính đáy trang: mỗi ô là một câu, bấm để nhảy tới câu đó.
  'catalog.quiz.sheet': 'Phiếu trả lời',
  'catalog.quiz.sheet-cell': (p: { n: number; state: string }) => `Câu ${p.n}, ${p.state}`,
  'catalog.quiz.cell.answered': 'đã chọn',
  'catalog.quiz.cell.blank': 'chưa chọn',

  /*
   * Ba vai trò của một lựa chọn sau khi nộp có nhãn chữ; vai trò thứ tư
   * (`none`) cố ý không có, vì nó là trạng thái trước khi nộp. "Bỏ lỡ một đáp
   * án đúng" và "chọn một đáp án sai" là HAI chuyện khác nhau.
   */
  'catalog.quiz.reveal.correct': 'Bạn chọn đúng',
  'catalog.quiz.reveal.missed': 'Đáp án đúng, bạn chưa chọn',
  'catalog.quiz.reveal.wrong-pick': 'Bạn chọn, nhưng sai',

  'catalog.quiz.pick-one': 'Chọn một đáp án',
  'catalog.quiz.pick-many': 'Chọn mọi đáp án đúng',
  'catalog.quiz.answer-correct': 'Đúng',
  'catalog.quiz.answer-wrong': 'Chưa đúng',
  'catalog.quiz.explanation': 'Giải thích',

  'catalog.quiz.submit': 'Nộp bài',
  'catalog.quiz.restart': 'Làm lại từ đầu',

  /*
   * Hai khoá cho một thông báo, vì nửa đầu chở câu lỗi của máy chủ còn nửa sau
   * là câu của chúng ta. Ghép thành một khoá thì bản đồ phải đoán câu kia có
   * kết thúc bằng dấu chấm hay không.
   */
  'catalog.quiz.submit-failed': (p: { reason: string }) => `Không nộp được bài: ${p.reason}`,
  'catalog.quiz.submit-failed-note':
    'Các lựa chọn vẫn còn nguyên, bấm Nộp bài để thử lại.',

  // Mốc đi kèm điểm: "60%" một mình không nói được đạt hay chưa.
  'catalog.quiz.result-title': 'Kết quả',
  'catalog.quiz.score': (p: { correct: number; total: number; percent: number }) =>
    `${p.correct}/${p.total} câu · ${p.percent}%`,
  'catalog.quiz.score-meter': 'Điểm bài làm',
  'catalog.quiz.verdict-pass': (p: { threshold: number }) => `Đạt (mốc ${p.threshold}%)`,
  'catalog.quiz.verdict-fail': (p: { threshold: number }) => `Chưa đạt (mốc ${p.threshold}%)`,
  'catalog.quiz.attempt-number': (p: { n: number }) => `Lần làm thứ ${p.n}`,
} as const satisfies Surface<'catalog'>;

/**
 * KHÔNG có dòng `catalog.problem.verdict` ở đây, và đó là kết quả của một phép
 * đo chứ không phải một chỗ bỏ sót.
 *
 * Dòng đó tồn tại từ 18.C với một lý do viết đúng (PROBLEM_VERDICTS có đúng ba
 * thành viên AC/WA/CE). Nhưng nó chưa bao giờ miễn trừ nhóm nào: `scanThree`
 * gom khoá theo tiền tố có dấu chấm, còn ba nhãn verdict đặt PHẲNG
 * (`catalog.problem.verdict-ac`), nên chúng rơi vào nhóm `catalog.problem`
 * vốn đông hàng chục thành viên. Không nhóm nào tên `catalog.problem.verdict`
 * từng được dựng ra để mà miễn trừ.
 *
 * Đổi độ mịn của phép gom KHÔNG cứu được dòng này: tiền tố `catalog.problem.verdict`
 * có năm khoá con phẳng (ac, wa, ce, region, unnamed), tám nếu tính cả ba khoá
 * `-note`. Năm hay tám thì cũng không phải ba.
 *
 * Đường duy nhất làm nó sống lại là ĐẶT LỒNG ba nhãn kia
 * (`catalog.problem.verdict.ac/.wa/.ce`), đúng quy ước mà `surfaces/shell.ts`
 * và `surfaces/me.ts` đã ghi. Việc đó phải sửa chỗ gọi trong
 * `apps/web/src/app/(session)/problems/[code]/`, ngoài phạm vi lượt sửa này.
 * Lúc ai đó làm, dòng miễn trừ cũ nằm nguyên văn trong báo cáo
 * `reports/2026-09-15-lane-copy-gate-report.md` để chép lại.
 */
export const catalogIntentionalThree = {
  'catalog.tier':
    '2026-09-10: đúng ba runtime tồn tại trong hợp đồng dữ liệu SandboxTierName (sysbox, gvisor, kata), kiểm tại packages/shared-types/src/scenario.ts. Hạng thứ tư nào cũng phải sửa schema trước, và lúc đó nhóm này thôi là ba.',
  'catalog.status':
    '2026-09-10: đúng ba trạng thái tồn tại trong PROGRESS_STATUSES tại apps/web/src/server/trpc/routers/lessons.ts dòng 61 (not-started, in-progress, completed). Trang danh mục đọc thẳng giá trị đó, nên nhóm này bằng đúng miền dữ liệu chứ không phải một lựa chọn trình bày.',
  'catalog.path.kind':
    '2026-10-03: PATH_ITEM_KINDS là union đóng ba thành viên (lesson, lab, quiz) tại packages/shared-types/src/path.ts, và Record<PathItemKind, StaticTextKey> ở path-view.ts giữ hai bên khớp. Loại thứ tư phải sửa enum trước.',
  'catalog.path.state':
    '2026-10-03: PATH_ITEM_STATES là union đóng ba thành viên (locked, available, passed) tại packages/shared-types/src/path.ts; server tính trạng thái, màn này chỉ thuật lại, nên nhóm bằng đúng miền dữ liệu.',
  'catalog.quiz.reveal':
    '2026-10-03: ChoiceReveal ở app/quiz/[id]/answer-view.ts có bốn vai trò và vai trò none cố ý không có nhãn (nó là trạng thái trước khi nộp). Ba nhãn còn lại là đúng ba vai trò lộ ra sau khi chấm.',
  'catalog.error-hint':
    '2026-09-10: đúng ba câu vì CatalogErrorKind là union đóng ba nhánh (retryable, stale-cursor, unknown) tại apps/web/src/components/catalog/catalog-error-kind.ts. Hai lớp lỗi đòi hành động ngược nhau và nhánh thứ ba cố ý nói ít; thêm một câu thứ tư là thêm một nhánh phân loại, không phải thêm một câu.',
} as const satisfies IntentionalThree;

