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
  // Tập cố định bởi `CatalogKind`, đúng 5 giá trị (§5.2), nên nhóm này không
  // rơi vào luật đúng ba. Loại từ dính liền danh từ theo §1.5: `bộ câu hỏi`
  // chứ không phải `câu hỏi`, vì thứ đếm được ở trang `/quiz` là bộ.
  'catalog.noun.lessons': 'bài học',
  'catalog.noun.labs': 'lab',
  'catalog.noun.playgrounds': 'sân chơi',
  'catalog.noun.paths': 'lộ trình',
  'catalog.noun.quiz': 'bộ câu hỏi',

  /*
   * ── Hạng sandbox ─────────────────────────────────────────────────────────
   *
   * Chuyển NGUYÊN VĂN khối chú thích của `catalog-labels.ts:10-15`, vì nó là
   * chuẩn biên tập chứ không phải một ghi chú kỹ thuật:
   *
   *   Tier giữ NGUYÊN tên kỹ thuật, không dịch và không kèm lời hứa (“nhẹ
   *   hơn”, “an toàn hơn”). Ba runtime này khác nhau ở thứ đo được trên hạ
   *   tầng cụ thể, và một tính từ dán ở đây sẽ là một khẳng định mà trang danh
   *   mục không có dữ liệu để bảo vệ.
   */
  'catalog.tier.sysbox': 'Sysbox',
  'catalog.tier.gvisor': 'gVisor',
  'catalog.tier.kata': 'Kata',

  // ── Trạng thái tiến độ của một bài ────────────────────────────────────
  'catalog.status.not-started': 'Chưa bắt đầu',
  'catalog.status.in-progress': 'Đang học',
  'catalog.status.completed': 'Đã xong',

  // ── Tiêu đề bảy màn ───────────────────────────────────────────────────
  'catalog.title.lessons': 'Bài học',
  'catalog.title.labs': 'Lab',
  'catalog.title.playgrounds': 'Sân chơi',
  'catalog.title.paths': 'Lộ trình',
  'catalog.title.quiz': 'Quiz',
  'catalog.title.games': 'Games',
  'catalog.title.problems': 'Bài tập',

  /**
   * Tiêu đề tài liệu của tám trang danh mục.
   *
   * Tách khỏi `catalog.title.*` vì hai thứ khác nhau: `title` là chữ trên
   * trang, còn cái này là chữ trên tab trình duyệt và trong kết quả tìm kiếm,
   * nên nó phải mang cả tên sản phẩm. Phân cách bằng dấu chấm giữa chứ không phải gạch
   * ngang dài, theo luật giọng văn và theo đúng mười khoá meta-title mà bốn
   * lane khác đã viết.
   *
   * `catalog.problem.meta-title` KHÔNG thuộc nhóm này: nó là trang chi tiết và
   * nhận tham số `code`, còn tám khoá đây là trang danh sách và là hằng.
   */
  'catalog.meta-title.lessons': 'Bài học · DevOps Learning Platform',
  'catalog.meta-title.labs': 'Lab · DevOps Learning Platform',
  'catalog.meta-title.playgrounds': 'Sân chơi · DevOps Learning Platform',
  'catalog.meta-title.paths': 'Lộ trình · DevOps Learning Platform',
  'catalog.meta-title.quiz': 'Quiz · DevOps Learning Platform',
  'catalog.meta-title.games': 'Games · DevOps Learning Platform',
  'catalog.meta-title.games-k8s': 'Kubernetes Arena · DevOps Learning Platform',
  'catalog.meta-title.games-git': 'Phòng thí nghiệm Git · DevOps Learning Platform',
  'catalog.meta-title.games-cicd': 'Đường ống CI/CD · DevOps Learning Platform',
  'catalog.meta-title.problems': 'Bài tập · DevOps Learning Platform',

  /**
   * Mô tả tài liệu, chỉ ba trang có. Đặt dưới tiền tố của TỪNG trang chứ không
   * gom thành `catalog.meta-description.*`: gom lại thì đó là một nhóm đúng ba
   * thành viên, và T3 sẽ đòi một lời khai rằng ba là con số đóng. Ba ở đây
   * không đóng, nó chỉ là ba trang tình cờ có mô tả. Khai bừa một nhóm ba cố ý
   * là nói dối chính cái cổng đang hỏi.
   */
  'catalog.problems.meta-description':
    'Danh sách bài tập Kubernetes có lọc theo độ khó, chủ đề, tag và trạng thái của bạn.',
  'catalog.games.meta-description':
    'Game DevOps chạy trong trình duyệt: không tốn sandbox, không cần đăng nhập. Thử thách CTF nằm cạnh, và nó tốn một sandbox.',
  'catalog.games.k8s-meta-description':
    'Dựng và cứu một cluster Kubernetes qua từng level, ngay trong trình duyệt.',
  'catalog.games.git-meta-description':
    'Gõ lệnh git thật trên một kho mô phỏng: nắn lịch sử, giải conflict, cứu commit đã mất.',
  'catalog.games.cicd-meta-description':
    'Xếp job CI thành đồ thị phụ thuộc rồi chỉnh cho nhanh và ổn định: runner, cache, retry, đường găng.',

  // ── Đoạn dẫn của bảy màn ──────────────────────────────────────────────
  'catalog.lead.lessons': 'Mỗi bài mở một sandbox riêng. Tiến độ chỉ mình bạn thấy.',
  'catalog.lead.labs':
    'Giải quyết nhiệm vụ trên môi trường thật.',
  'catalog.lead.playgrounds':
    'Môi trường trống để thử lệnh và dựng hệ thống.',
  'catalog.lead.paths':
    'Học theo thứ tự, theo dõi từng chặng.',
  'catalog.lead.quiz':
    'Trả lời câu hỏi. Xem điểm và giải thích sau khi nộp.',
  'catalog.lead.games':
    'Game chạy hoàn toàn trong trình duyệt: không tốn sandbox, không cần đăng nhập, tiến độ lưu ngay trên máy bạn. Độ khó ghi trên thẻ là mức lúc BẮT ĐẦU, mỗi game còn tăng dần qua nhiều level.',
  'catalog.lead.problems':
    'Chọn game, tìm bài phù hợp và nộp lời giải.',

  // ── Thanh công cụ ─────────────────────────────────────────────────────
  'catalog.toolbar.all': 'Tất cả',
  'catalog.toolbar.difficulty-legend': 'Độ khó',
  'catalog.toolbar.tier-legend': 'Sandbox',

  /*
   * Nhãn nói “trong trang” NGAY TRÊN điều khiển, không chờ tới câu cảnh báo
   * bên dưới: không procedure danh mục nào nhận tham số sắp xếp, nên một nhãn
   * “Sắp xếp” trần đã là lời khẳng định về một thứ tự toàn kho mà sản phẩm
   * không có.
   */
  'catalog.toolbar.sort-label': 'Sắp xếp (trong trang)',

  'catalog.toolbar.search-placeholder': 'Tên hoặc mô tả',

  /*
   * Tên của vùng `role="search"`. BẮT BUỘC khác nhau giữa các màn: bảy màn có
   * cùng một vùng tìm kiếm, nên một tên chung sẽ cho cây hỗ trợ tiếp cận bảy
   * vùng “search” không phân biệt được.
   */
  'catalog.toolbar.search-region': (p: { noun: string }) => `Tìm trong danh sách ${p.noun}`,
  'catalog.toolbar.search-region-games': 'Tìm trong danh sách game',

  // ── Nhãn thứ tự sắp xếp ───────────────────────────────────────────────
  'catalog.sort.stock': 'Thứ tự kho',
  'catalog.sort.title': 'Tên A tới Z',
  'catalog.sort.difficulty': 'Dễ đến khó',
  'catalog.sort.duration': 'Ngắn đến dài',
  'catalog.sort.steps': 'Ít bước đến nhiều',
  'catalog.sort.tasks': 'Ít nhiệm vụ đến nhiều',
  'catalog.sort.questions': 'Ít câu đến nhiều',
  'catalog.sort.parts': 'Ít phần đến nhiều',
  'catalog.sort.ttl': 'TTL ngắn đến dài',

  // ── Ô thông tin trên thẻ ──────────────────────────────────────────────
  //
  // `unit.step` và `unit.task` của L0 chở đúng hai trong số này, nên nơi gọi
  // dùng thẳng khoá `unit.*` cho chúng và không có bản sao ở đây. Năm ô còn
  // lại mang thêm chữ ngoài con số nên chúng là slot riêng.
  'catalog.meta.duration': (p: { minutes: number }) => `~${p.minutes} phút`,
  'catalog.meta.threshold': (p: { percent: number }) => `Đạt từ ${p.percent}%`,
  'catalog.meta.questions': (p: { n: number }) => `${p.n} câu`,
  'catalog.meta.parts': (p: { n: number }) => `${p.n} phần`,
  'catalog.meta.ttl': (p: { minutes: number }) => `Tự đóng sau ${p.minutes} phút`,

  // ── Nhãn cho thuộc tính chỉ một số mục có ─────────────────────────────
  'catalog.flag.leaderboard': 'Có xếp hạng',
  'catalog.flag.sequential': 'Học tuần tự',

  // ── Phân trang ────────────────────────────────────────────────────────
  'catalog.pager.region': 'Phân trang danh mục',
  'catalog.pager.first': 'Về đầu',
  'catalog.pager.page': (p: { page: number }) => `Trang ${p.page}`,
  'catalog.pager.end': 'Hết danh sách',

  /*
   * ── Câu tự đính chính phạm vi ────────────────────────────────────────────
   *
   * Chuyển NGUYÊN VĂN khối chú thích của `catalog-labels.ts:39-50`:
   *
   *   Câu này KHÔNG được khẳng định tổng số mục trong kho. Server trả
   *   `nextCursor` (còn hay hết) chứ không trả tổng; một dòng kiểu “5/42 bài”
   *   sẽ là con số bịa, đúng hạng lỗi nhãn khẳng định quá dữ liệu mà P2 đã trả
   *   giá.
   *
   *   Trang 1 mà không còn trang sau thì KHÔNG in dòng nào: danh sách trước
   *   mắt CHÍNH LÀ toàn bộ kết quả, không có gì để đính chính.
   */
  'catalog.scope.page-more': (p: { page: number; shown: number; noun: string }) =>
    `Trang ${p.page} · ${p.shown} ${p.noun}. Danh sách còn tiếp, bấm “Tiếp” để xem phần sau.`,
  'catalog.scope.page-last': (p: { page: number; shown: number; noun: string }) =>
    `Trang ${p.page} · ${p.shown} ${p.noun}. Đây là trang cuối.`,
  'catalog.scope.sort': (p: { shown: number }) =>
    `Sắp xếp chỉ áp dụng cho ${p.shown} mục của trang này. Máy chủ trả theo thứ tự kho, nên trang sau có thể chứa mục lẽ ra đứng trước.`,
  'catalog.scope.search': (p: { loaded: number }) =>
    `Ô tìm chỉ soi ${p.loaded} mục của trang này. Máy chủ không nhận từ khoá, nên một mục khớp ở trang sau vẫn không hiện ra đây.`,

  // ── Dòng đếm kết quả ──────────────────────────────────────────────────
  //
  // Bốn tổ hợp viết thành bốn mục tĩnh thay vì một câu ghép tại chỗ: ghép
  // chuỗi ở nơi gọi thì ba trong bốn nhánh không đi qua cổng nào.
  'catalog.count.plain': (p: { shown: number; noun: string }) => `${p.shown} ${p.noun}`,
  'catalog.count.in-page': (p: { shown: number; noun: string }) =>
    `${p.shown} ${p.noun} trong trang này`,
  'catalog.count.filtered': (p: { shown: number; noun: string }) =>
    `${p.shown} ${p.noun} khớp bộ lọc`,
  'catalog.count.filtered-in-page': (p: { shown: number; noun: string }) =>
    `${p.shown} ${p.noun} khớp bộ lọc trong trang này`,

  /*
   * ── Trạng thái rỗng ─────────────────────────────────────────────────────
   *
   * Năm ca, và chúng KHÁC NHAU ở việc người đọc phải làm gì tiếp. Thứ tự kiểm
   * là một phần của hợp đồng, và nó nằm ở `describeCatalogEmpty`.
   *
   * Ca `search` là ca MỚI của 16.C và nó không gộp được vào ca `filter`: bộ
   * lọc chạy ở server nên “không khớp” là câu trả lời về cả kho đã lọc, còn ô
   * tìm chạy trên trang đang mở nên “không khớp” chỉ nói về trang đó. Gộp hai
   * ca là để một trong hai câu nói quá dữ liệu nó có.
   */
  'catalog.empty.page.title': (p: { page: number; noun: string }) =>
    `Trang ${p.page} không còn ${p.noun} nào`,
  'catalog.empty.page.body':
    'Nội dung có thể vừa thay đổi kể từ lúc bạn mở trang. Quay về đầu danh sách để xem lại.',

  'catalog.empty.filter.title': (p: { noun: string }) => `Không có ${p.noun} nào khớp bộ lọc`,
  'catalog.empty.filter.body':
    'Kho vẫn có thể còn mục khác, bỏ bớt điều kiện lọc để xem rộng hơn.',

  'catalog.empty.search.title': (p: { noun: string }) =>
    `Không có ${p.noun} nào trong trang này khớp từ khoá`,
  'catalog.empty.search.body': (p: { loaded: number }) =>
    `Ô tìm chỉ soi ${p.loaded} mục đã tải. Bấm “Tiếp” để sang trang sau rồi tìm lại, hoặc xoá từ khoá để xem cả trang.`,

  'catalog.empty.search-last.title': (p: { noun: string }) =>
    `Không có ${p.noun} nào khớp từ khoá`,
  'catalog.empty.search-last.body': (p: { loaded: number }) =>
    `Đã soi hết ${p.loaded} mục của danh sách. Xoá từ khoá để xem lại toàn bộ.`,

  'catalog.empty.blank.title': (p: { noun: string }) => `Chưa có ${p.noun} nào`,
  'catalog.empty.author.body': (p: { noun: string }) =>
    `Bạn có quyền soạn bài. Mở trang Soạn bài để tạo ${p.noun} đầu tiên, rồi xuất bản để người học thấy nó ở đây.`,

  /*
   * Gợi ý cho người học khi một trụ cột còn trống. Mỗi gợi ý trỏ sang một trụ
   * cột KHÁC; trỏ về chính trang đang rỗng là một vòng lặp, không phải một lối
   * ra.
   */
  'catalog.empty.learner.lessons':
    'Chưa có bài nào được xuất bản. Trong lúc chờ, mở một sân chơi để luyện lệnh trong sandbox trống.',
  'catalog.empty.learner.labs':
    'Chưa có lab nào được xuất bản. Bài học có sẵn phần thực hành từng bước, bắt đầu ở đó trước.',
  'catalog.empty.learner.playgrounds':
    'Chưa có sân chơi nào. Bài học cũng mở sandbox riêng, nên bạn vẫn gõ lệnh thật được ở đó.',
  'catalog.empty.learner.paths':
    'Chưa có lộ trình nào được xuất bản. Bạn vẫn chọn được từng bài lẻ theo ý mình.',
  'catalog.empty.learner.quiz':
    'Chưa có bộ câu hỏi nào được xuất bản. Làm một lab để tự kiểm bằng thao tác thật trước đã.',

  'catalog.empty.games.title': 'Không có game nào khớp bộ lọc',
  /*
   * ⚠ Bản cũ viết "Bốn game vẫn ở đó". `games-catalog.ts` có NĂM mục, nên câu
   * đó đã sai từ lúc mục thứ năm được thêm, và sai trong im lặng: không cổng
   * nào đếm giúp một con số nằm trong văn xuôi. Bỏ số đi là cách duy nhất làm
   * câu này không hỏng lại ở lần thêm game tiếp theo; cần nói số thì dùng
   * `catalog.games.count`, khoá đó nhận tham số.
   */
  'catalog.empty.games.body': 'Các game vẫn ở đó, bỏ bớt điều kiện lọc để xem lại toàn bộ.',

  // ── Nhãn hành động của trạng thái rỗng ────────────────────────────────
  'catalog.action.first-page': 'Về đầu danh sách',
  'catalog.action.author': 'Mở trang Soạn bài',
  'catalog.action.browse-lessons': 'Xem bài học',
  'catalog.action.browse-labs': 'Xem lab',
  'catalog.action.browse-playgrounds': 'Mở sân chơi',
  'catalog.action.clear-search': 'Xoá từ khoá',
  'catalog.action.clear-filter': 'Xoá bộ lọc',

  // ── Tiêu đề ô lỗi ─────────────────────────────────────────────────────
  'catalog.error-title.lessons': 'Không tải được danh sách bài học',
  'catalog.error-title.labs': 'Không tải được danh sách lab',
  'catalog.error-title.playgrounds': 'Không tải được danh sách sân chơi',
  'catalog.error-title.paths': 'Không tải được danh sách lộ trình',
  'catalog.error-title.quiz': 'Không tải được danh sách quiz',
  'catalog.error-title.problems': 'Không tải được danh sách bài',

  /*
   * Câu phụ dưới ô lỗi, một câu cho mỗi lớp lỗi mà `describeCatalogError` phân
   * biệt. Trang 1 của lớp thử lại được KHÔNG có câu nào, và đó là chủ ý: chính
   * `message` của server đã nói “Chưa đọc được kho nội dung” và nút Thử lại đã
   * là bước tiếp theo, nên một dòng nữa ở đây chỉ chép lại câu ngay phía trên.
   */
  'catalog.error-hint.stale-cursor': (p: { page: number }) =>
    `Mốc phân trang của trang ${p.page} không còn trong kho, nên tải lại sẽ ra đúng lỗi này. Quay về đầu danh sách để đọc tiếp.`,
  'catalog.error-hint.retryable-midway': (p: { page: number }) =>
    `Chỗ đang đọc được giữ nguyên. Thử lại sẽ nạp lại đúng trang ${p.page}, không đưa bạn về đầu.`,
  'catalog.error-hint.unknown-midway':
    'Nếu thử lại vẫn lỗi, quay về đầu danh sách để đọc tiếp.',

  // ── Games ─────────────────────────────────────────────────────────────
  //
  // Thuật ngữ hạ tầng GIỮ tiếng Anh (`Kubernetes`, `CI/CD`, `container`): dịch
  // chúng ra tiếng Việt là tạo một từ vựng thứ hai mà không tài liệu nào ngoài
  // kia dùng. Chỉ `network` có bản tiếng Việt đủ phổ thông.
  'catalog.games.topic.kubernetes': 'Kubernetes',
  'catalog.games.topic.cicd': 'CI/CD',
  'catalog.games.topic.network': 'Mạng',
  'catalog.games.topic.container': 'Container',
  // `git` là chủ đề THỨ NĂM, thêm ở P17. Giữ tiếng Anh vì đó là tên công cụ,
  // không phải một khái niệm cần dịch.
  'catalog.games.topic.git': 'Git',

  'catalog.games.soon': 'Sắp có',
  'catalog.games.difficulty-legend': 'Độ khó khi bắt đầu',
  'catalog.games.no-sandbox': 'Không tốn sandbox',
  'catalog.games.no-login': 'Không cần đăng nhập',
  'catalog.games.count': (p: { shown: number }) => `${p.shown} game`,
  'catalog.games.count-filtered': (p: { shown: number }) => `${p.shown} game khớp bộ lọc`,
  /*
   * ⛔ `catalog.games.challenge-title` và `catalog.games.challenge-cta` ĐÃ XOÁ
   * 2026-09-16. Chúng mô tả một khối "Thử thách CTF → Xem Lab" nằm cạnh danh
   * sách game; bản dựng lại `4f6d3ba` bỏ khối đó và thay bằng thẻ studio
   * ("Tạo thử thách của bạn" → Problem creator / Level builder / Soạn bài học),
   * là một thứ khác hẳn về nghĩa.
   *
   * Cổng `dead-key` cho hai đường: nối vào chỗ đáng ra phải dùng, hoặc xoá.
   * Ở đây KHÔNG có chỗ đáng ra phải dùng, và nhét chúng lên thẻ studio là gắn
   * chữ CTF vào một khối nói về soạn bài, tức làm bản đồ nói dối để cổng xanh.
   * Muốn khối CTF quay lại thì thêm khoá cùng lúc với khối đó, không phải giữ
   * sẵn chữ cho một giao diện chưa ai định dựng.
   */

  // ── Bài tập (`/problems`) ─────────────────────────────────────────────
  /*
   * ⚠ Ô tìm của `/problems` là ô tìm THẬT: `problems.list` nhận
   * `filter.query` và lọc trên toàn bộ kho. Nên nó có nhãn riêng nói “trong
   * kho”, không mượn câu “trong trang” của các màn lọc-tại-chỗ: một cảnh báo
   * sai chỗ dạy người dùng bỏ qua cảnh báo đúng chỗ.
   */
  'catalog.problems.search-region': 'Tìm trong kho bài tập',
  'catalog.problems.search-label': 'Tìm theo mã bài hoặc tên',
  'catalog.problems.search-placeholder': 'K8S-0042 hoặc pod treo',
  'catalog.problems.order-label': 'Sắp xếp theo',
  'catalog.problems.direction-label': 'Chiều',
  'catalog.problems.difficulty-legend': 'Độ khó',
  'catalog.problems.status-legend': 'Trạng thái của bạn',
  'catalog.problems.topic-legend': 'Chủ đề',
  'catalog.problems.topic-hint': 'Chọn nhiều chủ đề = bài khớp BẤT KỲ chủ đề nào.',

  /*
    Bộ chọn game của khối lọc chủ đề (§18 khối 6).

    Câu `game-hint` nói ra đúng thứ điều khiển này LÀM, và nó cố ý KHÔNG hứa lọc
    danh sách bài theo game: chọn "Git Game" chỉ đổi danh sách chủ đề bên dưới.
    Hứa thừa một vế ở đây là dạy người dùng đọc sai mọi lần sau , họ sẽ chọn
    game rồi chờ bảng đổi, thấy nó không đổi, và kết luận trang hỏng.

    Tên game để dạng NGƯỜI DÙNG đọc ("Kubernetes Game") chứ không phải id kỹ
    thuật (`k8s`): id là chuyện của kho lưu, còn đây là một danh sách người ta
    phải nhận ra tên trong đó.

    Ba khoá lồng dưới `catalog.problems.game`, và 19.H là lượt làm cổng
    rule-of-three BẬT LÊN đúng như đoạn trên đã đoán. Lời khai nằm ở
    `catalogIntentionalThree` cuối file; đọc nó trước khi thêm khoá thứ tư, vì
    thêm khoá thứ tư sẽ làm chính dòng miễn trừ đó thành ôi và T3 đòi xoá.

    Khoá lồng (`game.cicd`) chứ không phẳng (`game-cicd`) là CHỦ Ý: cổng gom
    theo tiền tố chỉ cắt ở dấu chấm, nên một nhóm ba đặt tên phẳng đi qua vô
    hình. Đặt lồng là cách duy nhất để cổng nhìn thấy nhóm này.
  */
  'catalog.problems.game-legend': 'Game',
  'catalog.problems.game-hint': 'Chọn game để đổi danh sách chủ đề bên dưới.',
  'catalog.problems.game.k8s': 'Kubernetes Game',
  'catalog.problems.game.git': 'Git Game',
  'catalog.problems.game.cicd': 'CI/CD Game',

  /*
   * Nhãn của HÀNG NÚT chọn game ở đầu trang, khoá riêng chứ không mượn
   * `game-legend`.
   *
   * Hai điều khiển này chở cùng một giá trị nhưng KHÔNG cùng một câu: hàng nút
   * ở đầu trang đứng một mình nên nhãn của nó phải tự nói ra đây là game của
   * cái gì, còn `game-legend` đứng ngay trên danh sách chủ đề trong khối lọc
   * chi tiết nên một chữ "Game" là đủ. Dùng chung một khoá thì sửa nhãn cho
   * một chỗ sẽ đổi chỗ kia, đúng cái bẫy mà khối chú thích của nhóm `col-*`
   * bên dưới đã ghi.
   *
   * ⚠ Hai bộ chọn game cùng hiện trên một màn là một chỗ THỪA có thật, không
   * phải ý đồ của bản đồ chữ. Đã ghi vào báo cáo chặng cho lead quyết.
   */
  'catalog.problems.game-switch-label': 'Game của bài tập',

  /*
   * Thanh `<details>` gom bốn khối lọc phụ. Tách làm hai khoá vì vế thứ hai chỉ
   * hiện khi có bộ lọc đang bật; nhét cả hai vào một khoá thì nơi gọi phải cắt
   * chuỗi để giấu nửa sau. Dấu chấm giữa là DẤU NỐI nên nó ở nơi gọi, không ở
   * đây, cùng luật với `joinTopics`.
   */
  'catalog.problems.advanced-summary': 'Bộ lọc chi tiết',
  'catalog.problems.advanced-active': 'Đang áp dụng',

  'catalog.problems.tag-legend': 'Tag',
  'catalog.problems.tag-hint': 'Chọn nhiều tag = bài phải có ĐỦ mọi tag.',
  'catalog.problems.tag-placeholder': 'ví dụ: ingress',
  'catalog.problems.tag-add': 'Thêm',
  'catalog.problems.tag-remove': (p: { tag: string }) => `Bỏ tag ${p.tag}`,
  'catalog.problems.scope-more': (p: { shown: number; page: number }) =>
    `Đang xem ${p.shown} bài của trang ${p.page}, còn trang sau.`,
  'catalog.problems.scope-last': (p: { shown: number; page: number }) =>
    `Đang xem ${p.shown} bài của trang ${p.page}, đã hết danh sách.`,
  'catalog.problems.empty-filter-title': 'Không bài nào khớp bộ lọc',
  'catalog.problems.empty-filter-body':
    'Nhiều tag phải khớp ĐỦ, còn nhiều chủ đề chỉ cần khớp một. Thu hẹp tag trước khi bỏ chủ đề.',
  'catalog.problems.empty-blank-title': 'Chưa có bài tập nào được đăng',
  'catalog.problems.empty-blank-body':
    'Trong lúc chờ, các level của Kubernetes Game dạy đúng những thao tác mà bài tập ở đây sẽ hỏi.',
  'catalog.problems.empty-cta': 'Mở Kubernetes Game',

  /*
   * ── Bảng danh sách bài ───────────────────────────────────────────────────
   *
   * Chín tiêu đề cột là chín slot RIÊNG, không dùng lại bốn khoá
   * `catalog.problems.*-legend` ở trên dù bốn trong số chúng đang trùng chữ.
   * Một `legend` là nhãn của một bộ lọc nhiều lựa chọn, một `col` là tên cột
   * của bảng; chúng đổi vì hai lý do khác nhau, và dùng chung một khoá nghĩa
   * là sửa nhãn bộ lọc thì tiêu đề bảng đổi theo mà không ai định thế.
   *
   * ## Chín khoá, SÁU cột, từ 2026-09-16
   *
   * `docs/frontend-practice-redesign.md` chốt bảng SÁU cột: mã bài và tên bài
   * gộp vào cột đầu, còn chủ đề và tag xuống dòng phụ ngay dưới tên bài. Chín
   * khoá ở lại đủ chín, và không khoá nào thành mồ côi, vì phép gộp KHÔNG bỏ
   * dữ liệu nào đi, nó chỉ đổi chỗ đặt nhãn:
   *
   * · `col-code` + `col-title` ghép bằng dấu chấm giữa thành tiêu đề cột đầu.
   *   Một cột chở hai thứ thì tiêu đề nói cả hai; để mỗi `col-title` là nói
   *   thiếu đúng cái mà người ta quét mắt tìm trước tiên.
   * · `col-topics` + `col-tags` thành nhãn của dòng phụ. Trước khi gộp, hai
   *   cột riêng đã tự phân biệt; sau khi gộp, hai danh sách nằm cạnh nhau dùng
   *   chung một dấu ngăn nên KHÔNG còn phân biệt được. Nhãn ở đây trả lại đúng
   *   thứ phép gộp lấy mất.
   * · `no-tag` vì thế cũng sống lại: một nhãn "Tag" đứng trước chỗ trống đọc ra
   *   như màn hình vỡ, chứ không đọc ra là bài này không có tag nào.
   */
  'catalog.problems.table-caption': 'Bấm vào tên bài để xem đề và bắt đầu làm.',
  'catalog.problems.col-code': 'Mã bài',
  'catalog.problems.col-title': 'Tên bài',
  'catalog.problems.col-difficulty': 'Độ khó',
  'catalog.problems.col-topics': 'Chủ đề',
  'catalog.problems.col-tags': 'Tag',
  'catalog.problems.col-acceptance': 'Tỉ lệ giải',
  'catalog.problems.col-solvers': 'Người giải',
  'catalog.problems.col-time-limit': 'Hạn giờ',
  'catalog.problems.col-status': 'Trạng thái',

  /*
   * Ô tag rỗng: CHỮ, không phải một ký tự gạch.
   *
   * Bản cũ vẽ U+2014 trần trong ô. Nó không sang được bản đồ này vì luật gõ
   * phím của cả gói cấm ba ký tự gạch dài, nhưng đổi sang chữ không phải một
   * lượt lách cổng: trình đọc màn hình đọc ký tự đó ra thành tên của nó (hoặc
   * bỏ qua hẳn), nên ô đó vốn đã không nói được điều nó định nói.
   */
  'catalog.problems.no-tag': 'Không có',
  /*
   * Ngưỡng cắt nằm ở `problems-table.tsx` (`VISIBLE_TAGS`), không ở đây: đó là
   * một ràng buộc BỀ RỘNG của ô bảng, không phải một quyết định biên tập.
   */
  'catalog.problems.tags-more': (p: { n: number }) => `còn ${p.n} tag nữa`,

  /*
   * Ba trạng thái của NGƯỜI ĐANG XEM. Bằng đúng miền của union
   * `ProblemViewerStatus` trong `packages/games`, và `Record<ProblemViewerStatus,
   * TextKey>` ở `problem-labels.ts` giữ hai bên khớp nhau: thêm trạng thái thứ
   * tư vào hợp đồng thì bảng khoá đỏ ngay, chứ không lặng lẽ mất khỏi bộ lọc.
   */
  'catalog.problems.viewer.solved': 'Đã giải',
  'catalog.problems.viewer.attempted': 'Đã thử',
  'catalog.problems.viewer.untouched': 'Chưa động tới',

  /*
   * Bốn khoá sắp xếp của hợp đồng, KHÔNG có `title`: collation Postgres không
   * khớp JavaScript với tiếng Việt có dấu, mà lệch thứ tự dưới phân trang
   * keyset nghĩa là mất dòng trong im lặng.
   */
  'catalog.problems.order-code': 'Mã bài',
  'catalog.problems.order-difficulty': 'Độ khó',
  'catalog.problems.order-solvers': 'Số người giải',
  'catalog.problems.order-created': 'Ngày thêm',
  'catalog.problems.direction-asc': 'Tăng dần',
  'catalog.problems.direction-desc': 'Giảm dần',

  /*
   * ── Bốn con số của một hàng, dựng thành chữ ───────────────────────────────
   *
   * "0%" và "chưa ai thử" là HAI câu khác nhau, và hợp đồng cho cả hai cùng một
   * số 0 (`acceptanceRate` = 0 khi `attemptCount` = 0). In "0%" lúc chưa ai thử
   * là nói rằng bài này ai cũng trượt: một câu sai, và sai theo hướng làm người
   * học né bài. Nhánh chọn nằm ở `formatAcceptance`, hai câu nằm ở đây.
   */
  'catalog.problems.acceptance-none': 'Chưa ai thử',
  'catalog.problems.acceptance-percent': (p: { percent: number }) => `${p.percent}%`,
  'catalog.problems.time-unlimited': 'Không giới hạn',
  'catalog.problems.duration.seconds': (p: { seconds: number }) => `${p.seconds} giây`,
  'catalog.problems.duration.minutes': (p: { minutes: number }) => `${p.minutes} phút`,
  'catalog.problems.duration.both': (p: { minutes: number; seconds: number }) =>
    `${p.minutes} phút ${p.seconds} giây`,

  // ── Chi tiết một bài tập (`/problems/[code]`) ─────────────────────────
  //
  // Số nhiều `catalog.problems.*` là màn DANH SÁCH, số ít `catalog.problem.*`
  // là màn CHI TIẾT. Cùng cách chia như `catalog.noun.paths` so với
  // `catalog.path.*`.
  //
  // Thẻ `<title>` dựng từ MÃ chứ không từ tên bài: lấy tên đòi một lượt gọi máy
  // chủ thứ hai chỉ để điền thẻ, trong khi mã bài đã là thứ người ta đọc cho
  // nhau nghe ("làm được K8S-0042 chưa?") và nó không bao giờ đổi.
  'catalog.problem.meta-title': (p: { code: string }) => `${p.code} · Bài tập · DevOps Learning Platform`,

  /*
   * `NOT_FOUND` gồm cả bài `draft`: hợp đồng nói bài nháp không hiện với người
   * học KỂ CẢ khi họ biết URL, nên máy chủ trả "không có" chứ không phải "không
   * được xem". Câu ở đây phải giữ đúng ranh giới đó, vì phân biệt hai câu chính
   * là rò rỉ sự tồn tại của bài.
   */
  'catalog.problem.not-found-title': (p: { code: string }) => `Không có bài nào mã ${p.code}`,
  'catalog.problem.not-found-body':
    'Mã bài có dạng K8S-0042. Kiểm tra lại đường dẫn, hoặc tìm bài từ danh sách.',
  'catalog.problem.back': 'Về danh sách bài',
  /*
   * Lối về của KHUNG TRANG, khác `catalog.problem.back` ở trên vốn là nhãn nút
   * trong khối lỗi/không-tìm-thấy.
   *
   * Hai câu khác nhau vì hai chỗ đứng khác nhau: nút trong khối lỗi là lối
   * thoát duy nhất còn lại nên nó nói đủ câu, còn lối về ở đầu trang nằm cạnh
   * nội dung bài và phải ngắn để không tranh chỗ với tên bài. Mũi tên nằm
   * TRONG chuỗi chứ không ở nơi gọi: nó là một phần của nhãn người đọc thấy,
   * và tách ra thì bản đồ không còn chở trọn câu mà màn hình hiện.
   */
  'catalog.problem.back-lobby': '← Bài tập OJ',
  'catalog.problem.error-title': 'Không tải được bài',
  'catalog.problem.loading': 'Đang tải bài tập',

  /*
   * ── Ba tab của trang chi tiết ────────────────────────────────────────────
   *
   * Nhãn TAB, không dùng lại tiêu đề khối bên trong (`hints-title`,
   * `subs-title`, `tests-title`) dù `tab-hints` đang trùng chữ với
   * `hints-title`. Một tab là nhãn ĐIỀU HƯỚNG, phải ngắn và ngang hàng với hai
   * tab kia; một tiêu đề khối là nhãn NỘI DUNG, đọc khi đã ở trong khối. Chúng
   * đổi vì hai lý do khác nhau, và `subs-title` ("Lượt nộp của bạn") đã cho
   * thấy chỗ lệch: một tab mang câu đó sẽ dài gấp đôi hai tab còn lại.
   *
   * Đặt PHẲNG dưới `catalog.problem` chứ không lồng thành
   * `catalog.problem.tab.*`. Lồng vào thì ba tab thành một nhóm ba mà cổng T3
   * nhìn thấy và đòi một dòng miễn trừ, trong khi đây không phải một phân loại
   * ba: số tab là số khối nội dung của trang, và khối thứ tư nào cũng chỉ là
   * thêm một khối. Khối chú thích cuối file ghi đúng chuyện đã xảy ra khi có
   * người khai miễn trừ cho một nhóm mà cổng chưa từng dựng ra.
   */
  'catalog.problem.tabs-label': 'Chi tiết bài tập',
  'catalog.problem.tab-checks': 'Điều kiện chấm',
  'catalog.problem.tab-hints': 'Gợi ý',
  'catalog.problem.tab-submissions': 'Lịch sử nộp',

  /*
   * ── Đầu trang bản Git ────────────────────────────────────────────────────
   *
   * Trang chi tiết đổi hẳn khung khi bài thuộc game Git (`git-oj-lobby`), và
   * năm chuỗi này là chữ của khung đó. Chúng ở `catalog.problem.*` vì đây là
   * MÀN chi tiết bài tập, theo luật chọn file theo màn hình ở đầu file, chứ
   * không phải ở `catalog.games.*` vốn nói về thẻ game trong danh mục.
   *
   * `GIT` và `ODYSSEY` tách hai khoá vì nơi gọi tô đậm nửa sau. Gộp một khoá
   * thì nơi gọi phải cắt chuỗi để tô, đúng lý do đã tách
   * `time-limit-lead` với `time-limit-note`.
   */
  'catalog.problem.git-brand-name': 'GIT',
  'catalog.problem.git-brand-suffix': 'ODYSSEY',
  'catalog.problem.git-brand-tagline': 'ĐẤU TRƯỜNG THỬ THÁCH',
  'catalog.problem.git-lead': 'Giải bài Git bằng lệnh.',
  'catalog.problem.git-grading-note': 'CHẤM BÀI TRÊN MÁY CHỦ',

  /*
   * Ba con số trong một câu, và câu này KHÔNG được rút gọn thành "tỉ lệ giải X%":
   * mẫu số là thứ nói cho người đọc biết con số kia đáng tin tới đâu. 50% trên
   * hai lượt thử và 50% trên hai nghìn lượt là hai điều khác nhau.
   */
  'catalog.problem.stats': (p: { acceptance: string; solvers: number; attempts: number }) =>
    `Tỉ lệ giải ${p.acceptance} · ${p.solvers} người đã giải trên ${p.attempts} người đã thử`,

  /*
   * Hạn giờ nói TRƯỚC khi bấm, không phải sau. Người đọc đề rồi mới biết bài
   * chạy đồng hồ đã mất một phần thời gian của chính lượt đó. Tách hai nửa vì
   * nửa đầu in đậm còn nửa sau không, và một khoá chở cả hai sẽ buộc nơi gọi
   * cắt chuỗi để tô đậm.
   */
  'catalog.problem.time-limit-lead': (p: { limit: string }) => `Bài này có hạn giờ: ${p.limit}.`,
  'catalog.problem.time-limit-note':
    'Đồng hồ bắt đầu chạy khi bạn mở đấu trường, không phải khi bạn đọc đề.',

  'catalog.problem.statement': 'Đề bài',
  'catalog.problem.start': 'Bắt đầu làm bài',

  /*
   * ── Gợi ý CÓ GIÁ ─────────────────────────────────────────────────────────
   *
   * Giá nói ngay trên nhãn nút, không nấp trong một hộp thoại xác nhận hiện ra
   * sau cú bấm đầu. Số điểm là THAM SỐ chứ không viết cứng: mỗi gợi ý có mức
   * trừ riêng do người soạn đặt.
   */
  'catalog.problem.hints-title': 'Gợi ý',
  'catalog.problem.hints-none': 'Bài này không có gợi ý, đề đã nói đủ.',
  'catalog.problem.hints-cost': 'Mở một gợi ý là trừ điểm của lượt làm bài, và không hoàn lại được.',
  'catalog.problem.hints-spent': (p: { count: number; points: number }) =>
    `Bạn đã mở ${p.count} gợi ý, tổng trừ ${p.points} điểm.`,
  'catalog.problem.hint-ordinal': (p: { n: number }) => `Gợi ý ${p.n}`,
  'catalog.problem.hint-revealed': (p: { points: number }) => `Đã mở · trừ ${p.points} điểm`,
  'catalog.problem.hint-reveal': (p: { points: number }) => `Mở gợi ý (trừ ${p.points} điểm)`,
  // Đường của tác giả và người duyệt: đọc được mà chưa trả điểm. Nói ra thay vì
  // để trống, vì một ô không có nhãn nào đọc ra như một chỗ render thiếu.
  'catalog.problem.hint-author-preview': 'Bạn viết gợi ý này, nên đọc không mất điểm.',

  // ── Lịch sử nộp của chính người đang xem ──────────────────────────────
  'catalog.problem.subs-title': 'Lượt nộp của bạn',
  'catalog.problem.subs-error-title': 'Không tải được lịch sử nộp',
  'catalog.problem.subs-empty':
    'Bạn chưa nộp lượt nào cho bài này. Mở đấu trường và thao tác cho tới khi mọi mục tiêu xanh.',
  'catalog.problem.subs-col-at': 'Thời điểm',
  'catalog.problem.subs-col-result': 'Kết quả',
  'catalog.problem.subs-col-score': 'Điểm',
  'catalog.problem.subs-col-duration': 'Thời gian làm',
  'catalog.problem.subs-col-moves': 'Số nước',
  'catalog.problem.subs-col-hints': 'Gợi ý đã mở',

  /*
   * Kết quả của một LƯỢT NỘP, không phải trạng thái của người xem. Trùng chữ
   * với `catalog.problems.viewer.solved` là trùng ngẫu nhiên: "Đã giải" ở đây
   * nói về một lượt cụ thể, còn ở kia nói về toàn bộ lịch sử của người dùng với
   * bài này, và cặp đối lập cũng khác ("Chưa đạt" so với "Chưa động tới").
   */
  'catalog.problem.subs-solved': 'Đã giải',
  'catalog.problem.subs-failed': 'Chưa đạt',
  'catalog.problem.subs-more': 'Còn lượt nộp cũ hơn không hiện ở trang này.',

  /*
    ── Testcase (18.B.4) ───────────────────────────────────────────────────

    Nhãn testcase ẩn KHÔNG nằm ở đây và không thể nằm ở đây: nó là nội dung
    của từng bài, do tác giả viết, và máy chủ chỉ gửi nó xuống sau khi người
    làm đã nộp. Chỗ này chỉ có chữ của KHUNG.
  */
  'catalog.problem.tests-title': 'Testcase',
  'catalog.problem.tests-count': (p: { total: number }) =>
    `Bài này chấm bằng ${p.total} testcase. Phải qua hết mới được AC.`,
  'catalog.problem.tests-hidden-note': (p: { hidden: number }) =>
    `${p.hidden} testcase bị ẩn: bạn chỉ thấy tên chúng sau khi nộp bài.`,
  'catalog.problem.tests-hidden-why':
    'Testcase ẩn để một lượt nộp không trở thành một lượt dò đáp án.',
  'catalog.problem.tests-hidden-item': 'Chưa hiện, nộp bài rồi mới thấy',
  'catalog.problem.tests-hidden-badge': 'Ẩn',
  'catalog.problem.tests-empty': 'Bài này chưa có testcase nào nên chưa chấm được.',

  /*
    ── Verdict (18.B.3, 18.B.5) ────────────────────────────────────────────

    Ba nhãn vì `PROBLEM_VERDICTS` có đúng ba giá trị, xem catalogIntentionalThree.

    ⛔ `WA` KHÔNG có bản không mẫu số. Mẫu số là thứ nói cho người làm biết họ
    còn cách bao xa, nên nó nằm TRONG câu chứ không ghép ngoài JSX. Và `CE` cố
    ý KHÔNG nhận tham số nào: lượt chơi không chạy tới nơi thì `passed`/`total`
    không nói lên gì, nên không có phân số nào để in.
  */
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

  /*
    Verdict đọc lại từ LỊCH SỬ nộp bài (18.C).

    `subs-verdict-ungraded` KHÔNG phải một cách nói khác của `CE`, và đó là cả
    lý do nó tồn tại. `problemVerdictOf(_, 0)` trả `CE`, và điều đó ĐÚNG với vai
    trò một verdict lúc CHẤM. Nhưng cột `total` mặc định `0`, nên trong lịch sử
    một `total === 0` gộp BA nguyên nhân khác hẳn nhau: lượt thật sự không chấm
    được, dòng ghi trước 18.C khi cột chưa tồn tại, và bài chưa có testcase nào.

    `CE` nghĩa là lỗi cú pháp. In nó lên một lượt nộp cũ là nói với người chơi
    rằng bài của họ sai cú pháp trong khi không hề. Một nhãn sai theo hướng đổ
    lỗi cho người dùng tệ hơn hẳn một nhãn mờ, nên nhãn này cố ý chỉ nói đúng
    thứ nó biết, và không đoán nguyên nhân nào trong ba.

    ⛔ Phân biệt được ba nguyên nhân đó cần một cột thứ ba trên
    `problem_submissions`. Đừng đổi chữ ở đây để giả vờ đã phân biệt được.
  */
  'catalog.problem.subs-col-verdict': 'Verdict',
  'catalog.problem.subs-verdict-ungraded': 'Chưa chấm theo testcase',

  /*
    ── Nộp bài từ đấu trường (18.C) ────────────────────────────────────────

    Nhóm này ra đời cùng chỗ gọi `problems.submit` ĐẦU TIÊN của ứng dụng. Tới
    2026-09-14 đấu trường chưa từng nộp bài về máy chủ, nên `verdict-*` ở trên
    có test mà chưa có màn hình nào.

    ⛔ `submit-kept` KHÔNG phải một câu an ủi. Nó nói một sự thật kiểm chứng
    được: nhật ký lượt chơi vẫn nằm trong engine, nên bấm thử lại nộp lại ĐÚNG
    lượt đó chứ không bắt chơi lại. Bỏ câu này thì một lượt nộp hỏng đọc ra như
    mất lượt, và người chơi thoát ra chơi lại từ đầu mà không cần phải thế.
  */
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
  'catalog.path.back': 'Lộ trình',
  'catalog.path.loading': 'Đang tải lộ trình',
  'catalog.path.error-title': 'Không mở được lộ trình này',
  'catalog.path.sequential': 'Học tuần tự: phần sau mở khi phần trước đạt',
  'catalog.path.open': 'Mở',
  'catalog.path.reload': 'Tải lại',
  'catalog.path.empty-title': 'Lộ trình này chưa có phần nào',
  'catalog.path.empty-body':
    'Người soạn chưa xếp nội dung vào đây. Bạn có thể học tự do ở danh mục bài học.',
  'catalog.path.empty-cta': 'Xem danh mục bài học',
  'catalog.path.kind-lesson': 'Bài học',
  'catalog.path.state-passed': 'Đã đạt',
  'catalog.path.state-available': 'Mở',
  'catalog.path.state-locked': 'Còn khoá',
  'catalog.path.note-locked': 'Còn khoá, hoàn thành phần trước đó thì phần này tự mở.',

  /*
   * `title === null` = mắt xích trỏ tới nội dung không còn nạp được. Câu này
   * hiện ra thay vì lọc mục đó đi: một lộ trình thủng là chuyện người soạn
   * phải thấy. Nó ĐỘC LẬP với ổ khoá, một item vừa khoá vừa thủng hiện cả hai.
   */
  'catalog.path.note-missing':
    'Không nạp được nội dung này (đã lưu trữ hoặc sai mã), hãy báo người soạn lộ trình.',

  /*
   * Nhãn nói ĐÚNG thứ hệ thống biết: đã đạt bao nhiêu phần trên bao nhiêu, và
   * phần nào nên làm tiếp. Nó KHÔNG biết người học đã bỏ ra bao lâu, nên không
   * có nhãn thời lượng nào ở màn này. Bẫy đã trả giá ở P2: một nhãn từng nói
   * “4/4 bước” từ đúng một lượt chấm.
   */
  'catalog.path.progress': (p: { passed: number; total: number }) =>
    `Đã đạt ${p.passed}/${p.total} phần`,
  'catalog.path.ordinal': (p: { n: number; kind: string }) => `${p.n}. ${p.kind}`,
  'catalog.path.next': (p: { name: string }) => `Nên làm tiếp: ${p.name}`,
  'catalog.path.all-done': 'Bạn đã đạt tất cả các phần của lộ trình này.',
  'catalog.path.open-failed': (p: { reason: string }) =>
    `${p.reason} Bấm “Tải lại” để xem trạng thái mới nhất.`,

  /*
   * ── Làm một bộ câu hỏi (`/quiz/[id]`) ────────────────────────────────────
   *
   * Số nhiều `catalog.title.quiz` là màn DANH SÁCH, `catalog.quiz.*` là màn
   * LÀM BÀI. Cùng cách chia như `catalog.problems.*` so với `catalog.problem.*`.
   *
   * ⛔ KHÔNG có khoá nào ở đây nói một lựa chọn là đúng hay sai TRƯỚC khi nộp.
   * `QuizForLearner` khai `isCorrect`/`explanation` là `never`, nên client
   * không có dữ liệu để suy, và một câu chữ nằm sẵn ở đây sẽ là lối duy nhất
   * để lộ điều đó ra. Ba nhãn `reveal-*` chỉ dựng được sau khi `quiz.submit`
   * trả kết quả.
   */
  'catalog.quiz.back': 'Quiz',
  'catalog.quiz.loading-title': 'Đang tải',
  'catalog.quiz.loading-sr': 'Đang tải quiz',
  'catalog.quiz.error-title': 'Không mở được quiz này',

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

  /*
   * Tiến độ TRẢ LỜI, không phải tiến độ ĐÚNG. Bẫy P2 ở dạng quiz: một nhãn
   * "đã làm 5/5 câu" cạnh nút Nộp rất dễ đọc thành "5/5 đúng", nên nhãn phải tự
   * nói ra nó đếm câu ĐÃ CHỌN.
   */
  'catalog.quiz.progress': (p: { answered: number; total: number }) =>
    `Đã chọn đáp án cho ${p.answered}/${p.total} câu`,
  'catalog.quiz.progress-caveat': (p: { blank: number }) =>
    `Còn ${p.blank} câu chưa chọn, câu bỏ trống tính là sai và vẫn nằm ở mẫu số.`,

  /*
   * Bốn vai trò của một lựa chọn sau khi nộp, ba trong số đó có nhãn chữ.
   * "Bỏ lỡ một đáp án đúng" và "chọn một đáp án sai" là HAI chuyện khác nhau,
   * và gộp chúng thành "sai" bỏ mất đúng thứ người học cần để hiểu mình sai ở
   * đâu. Vai trò `none` cố ý không có nhãn: nó là trạng thái trước khi nộp.
   */
  'catalog.quiz.reveal-correct': 'Bạn chọn đúng',
  'catalog.quiz.reveal-missed': 'Đáp án đúng, bạn chưa chọn',
  'catalog.quiz.reveal-wrong-pick': 'Bạn chọn nhưng không đúng',

  'catalog.quiz.pick-one': 'Chọn một đáp án',
  'catalog.quiz.pick-many': 'Chọn nhiều đáp án',
  'catalog.quiz.answer-correct': 'Đúng',
  'catalog.quiz.answer-wrong': 'Chưa đúng',

  'catalog.quiz.submit': 'Nộp bài',
  'catalog.quiz.submit-with-blanks': 'Bạn vẫn nộp được khi còn câu bỏ trống, chúng sẽ tính là sai.',
  'catalog.quiz.restart': 'Làm lại từ đầu',

  /*
   * Hai khoá cho một thông báo, vì nửa đầu chở câu lỗi của máy chủ còn nửa sau
   * là câu của chúng ta. Ghép thành một khoá thì bản đồ phải đoán câu kia có
   * kết thúc bằng dấu chấm hay không, và đoán sai ra hai dấu chấm liền nhau.
   */
  'catalog.quiz.submit-failed': (p: { reason: string }) => `Không nộp được bài: ${p.reason}`,
  'catalog.quiz.submit-failed-note':
    'Các lựa chọn của bạn vẫn còn trên màn hình, bấm Nộp bài để thử lại.',

  // Mốc đi kèm điểm: "60%" một mình không nói được đạt hay chưa.
  'catalog.quiz.score': (p: { correct: number; total: number; percent: number }) =>
    `${p.correct}/${p.total} câu · ${p.percent}%`,
  'catalog.quiz.verdict-pass': (p: { threshold: number }) => `Đạt (mốc ${p.threshold}%)`,
  'catalog.quiz.verdict-fail': (p: { threshold: number }) => `Chưa đạt (mốc ${p.threshold}%)`,
  'catalog.quiz.attempt-number': (p: { n: number }) => `Lần làm thứ ${p.n}`,

  // ── Khung chờ tải ─────────────────────────────────────────────────────
  'catalog.loading.grid': 'Đang tải danh sách',
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
  'catalog.problems.viewer':
    '2026-09-10: ProblemViewerStatus là union đóng ba thành viên (solved, attempted, untouched) trong packages/games, và Record<ProblemViewerStatus, TextKey> ở problem-labels.ts giữ hai bên khớp. Thành viên thứ tư phải sửa union trước.',
  'catalog.problems.duration':
    '2026-09-10: formatDuration có đúng ba hình dạng đầu ra vì một khoảng thời gian chỉ rơi vào ba ca: dưới một phút, tròn phút, và có dư giây. Không phải một phân loại ba, mà là ba nhánh của một phép chia.',
  'catalog.tier':
    '2026-09-10: đúng ba runtime tồn tại trong hợp đồng dữ liệu SandboxTierName (sysbox, gvisor, kata), kiểm tại packages/shared-types/src/scenario.ts. Hạng thứ tư nào cũng phải sửa schema trước, và lúc đó nhóm này thôi là ba.',
  'catalog.status':
    '2026-09-10: đúng ba trạng thái tồn tại trong PROGRESS_STATUSES tại apps/web/src/server/trpc/routers/lessons.ts dòng 61 (not-started, in-progress, completed). Trang danh mục đọc thẳng giá trị đó, nên nhóm này bằng đúng miền dữ liệu chứ không phải một lựa chọn trình bày.',
  'catalog.error-hint':
    '2026-09-10: đúng ba câu vì CatalogErrorKind là union đóng ba nhánh (retryable, stale-cursor, unknown) tại apps/web/src/components/catalog/catalog-error-kind.ts. Hai lớp lỗi đòi hành động ngược nhau và nhánh thứ ba cố ý nói ít; thêm một câu thứ tư là thêm một nhánh phân loại, không phải thêm một câu.',
  'catalog.problems.game':
    '2026-09-16: ba nhãn vì đúng ba game có từ vựng chủ đề để bộ chọn đổi qua lại (k8s, git, cicd), và ba KHÔNG PHẢI một con số đóng. GameId có sáu thành viên tại packages/games/src/core/types.ts dòng 31; ba cái còn lại (pipeline, netpol, dockerfile) chưa có plugin bài nên chưa có gì để chọn. Game thứ tư có plugin sẽ làm nhóm này thành bốn và dòng miễn trừ này thành ôi, và lúc đó việc phải làm là XOÁ nó, không phải sửa số.',
} as const satisfies IntentionalThree;

