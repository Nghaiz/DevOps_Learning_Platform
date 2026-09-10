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

  // ── Đoạn dẫn của bảy màn ──────────────────────────────────────────────
  'catalog.lead.lessons': 'Mỗi bài mở một sandbox riêng. Tiến độ chỉ mình bạn thấy.',
  'catalog.lead.labs':
    'Mỗi lab giao một tập nhiệm vụ độc lập. Làm theo thứ tự bất kỳ, tự chấm từng nhiệm vụ rồi nộp bài khi sẵn sàng.',
  'catalog.lead.playgrounds':
    'Sandbox trống, không bài, không chấm điểm. Thử lệnh trước khi vào một bài học hoặc lab thật.',
  'catalog.lead.paths':
    'Nhiều bài gom theo thứ tự. Mở lộ trình để thấy phần nào đã mở khoá và phần nào còn chờ.',
  'catalog.lead.quiz':
    'Bộ câu hỏi tự chấm. Nộp xong mới thấy điểm và giải thích; trong lúc làm bài, đáp án không nằm trong dữ liệu trình duyệt nhận.',
  'catalog.lead.games':
    'Game chạy hoàn toàn trong trình duyệt: không tốn sandbox, không cần đăng nhập, tiến độ lưu ngay trên máy bạn. Độ khó ghi trên thẻ là mức lúc BẮT ĐẦU, mỗi game còn tăng dần qua nhiều level.',
  'catalog.lead.problems':
    'Mỗi bài là một cluster hỏng hoặc một yêu cầu cần dựng. Không có phần giảng: bạn tự biết hoặc tự tra, rồi thao tác cho tới khi mọi mục tiêu xanh.',

  // ── Thanh công cụ ─────────────────────────────────────────────────────
  'catalog.toolbar.all': 'Tất cả',
  'catalog.toolbar.difficulty-legend': 'Độ khó',
  'catalog.toolbar.tier-legend': 'Sandbox',
  'catalog.toolbar.topic-legend': 'Chủ đề',

  /*
   * Nhãn nói “trong trang” NGAY TRÊN điều khiển, không chờ tới câu cảnh báo
   * bên dưới: không procedure danh mục nào nhận tham số sắp xếp, nên một nhãn
   * “Sắp xếp” trần đã là lời khẳng định về một thứ tự toàn kho mà sản phẩm
   * không có.
   */
  'catalog.toolbar.sort-label': 'Sắp xếp (trong trang)',

  /*
   * Cùng lý do như nhãn sắp xếp, và mạnh hơn một bậc: người ta tin một ô tìm
   * hơn tin một ô sắp xếp. Không nói “trong trang” ở đây thì một kết quả rỗng
   * đọc thành “kho không có”, trong khi nó chỉ có nghĩa là “trang đang mở
   * không có”.
   */
  'catalog.toolbar.search-label': 'Tìm trong trang',
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
  'catalog.empty.games.body': 'Bốn game vẫn ở đó, bỏ bớt điều kiện lọc để xem lại toàn bộ.',

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

  'catalog.games.soon': 'Sắp có',
  'catalog.games.difficulty-legend': 'Độ khó khi bắt đầu',
  'catalog.games.no-sandbox': 'Không tốn sandbox',
  'catalog.games.no-login': 'Không cần đăng nhập',
  'catalog.games.count': (p: { shown: number }) => `${p.shown} game`,
  'catalog.games.count-filtered': (p: { shown: number }) => `${p.shown} game khớp bộ lọc`,
  'catalog.games.challenge-title': 'Thử thách CTF, thứ nằm cạnh game và tốn chỗ thật',
  'catalog.games.challenge-cta': 'Xem Lab',

  // ── Bài tập (`/problems`) ─────────────────────────────────────────────
  /*
   * ⚠ Ô tìm của `/problems` là ô tìm THẬT: `problems.list` nhận
   * `filter.query` và lọc trên toàn bộ kho. Nó KHÔNG dùng
   * `catalog.toolbar.search-label` (“Tìm trong trang”) vì câu đó nói về một
   * giới hạn mà màn này không có, và một cảnh báo sai chỗ dạy người dùng bỏ
   * qua cảnh báo đúng chỗ.
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

  // ── Khung chờ tải ─────────────────────────────────────────────────────
  'catalog.loading.grid': 'Đang tải danh sách',
} as const satisfies Surface<'catalog'>;

export const catalogIntentionalThree = {
  'catalog.tier':
    '2026-09-10: đúng ba runtime tồn tại trong hợp đồng dữ liệu SandboxTierName (sysbox, gvisor, kata), kiểm tại packages/shared-types/src/scenario.ts. Hạng thứ tư nào cũng phải sửa schema trước, và lúc đó nhóm này thôi là ba.',
  'catalog.status':
    '2026-09-10: đúng ba trạng thái tồn tại trong PROGRESS_STATUSES tại apps/web/src/server/trpc/routers/lessons.ts dòng 61 (not-started, in-progress, completed). Trang danh mục đọc thẳng giá trị đó, nên nhóm này bằng đúng miền dữ liệu chứ không phải một lựa chọn trình bày.',
  'catalog.error-hint':
    '2026-09-10: đúng ba câu vì CatalogErrorKind là union đóng ba nhánh (retryable, stale-cursor, unknown) tại apps/web/src/components/catalog/catalog-error-kind.ts. Hai lớp lỗi đòi hành động ngược nhau và nhánh thứ ba cố ý nói ít; thêm một câu thứ tư là thêm một nhánh phân loại, không phải thêm một câu.',
} as const satisfies IntentionalThree;
