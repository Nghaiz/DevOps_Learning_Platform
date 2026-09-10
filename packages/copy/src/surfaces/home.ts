import type { IntentionalThree, Surface } from '../types.ts';

/**
 * Surface `home.`, sở hữu bởi lane 16.E (L4).
 *
 * Phủ MỘT màn: `/` cộng ảnh xem trước `opengraph-image.tsx` của chính màn đó.
 * Ảnh OG ở cùng đây theo §1.7 (chọn file theo MÀN HÌNH) vì chữ trên ảnh là chữ
 * của trang chủ, chỉ đi qua một bộ dựng khác.
 *
 * ⛔ LUẬT GÕ PHÍM CỦA CẢ GÓI: không U+2014, U+2013, U+2015 ở bất kỳ đâu, kể cả
 * chú thích. Ba chuỗi cũ mang U+2014 đã được viết lại bằng dấu phẩy, không bằng
 * một ký tự thay thế trông giống: `catalog-stats.tsx:35`, `:41` và dòng `alt`
 * của `opengraph-image.tsx:34`.
 *
 * ## Hình dạng khoá được chọn để cổng T3 NHÌN THẤY nhóm ba
 *
 * `groupBySiblingPrefix` gom theo tiền tố bỏ phân đoạn CUỐI, nên một nhóm ba
 * đặt tên phẳng (`home.step-login`, `home.step-pick`, `home.step-run`) rơi vào
 * cùng rổ với mọi khoá `home.*` khác và đi qua T3 vô hình. Ba bước ở dải "Bắt
 * đầu thế nào" vì vậy tách thành hai nhóm lồng, `home.step-title.*` và
 * `home.step-body.*`, mỗi nhóm đúng ba thành viên, mỗi nhóm khai một dòng trong
 * `homeIntentionalThree`. Cùng hình dạng mà `92804b7` đã dựng cho lane 16.C.
 *
 * Chiều ngược lại cũng phải giữ: các nhóm KHÔNG phải ba (bảy chặng, bốn luận
 * điểm, bốn ô số liệu) không được vô tình co về ba lúc biên tập. Co về ba thì
 * cổng đỏ, và lúc đó câu trả lời là xem lại nội dung chứ không phải thêm một
 * dòng miễn trừ.
 *
 * ## Dải "Nền tảng này làm gì cho bạn" nay có BỐN luận điểm, không phải ba
 *
 * Bản cũ (`value-props.tsx:6`) tự khai "ba luận điểm" và đó đúng là hình dạng
 * mà luật V5 tồn tại để chặn. Luận điểm thứ tư không phải chữ độn: "không cài
 * gì trên máy bạn" là câu trả lời cho phản đối đầu tiên của người mới, và trước
 * đây nó bị chôn trong thân bước một của dải "Bắt đầu thế nào". Đưa nó lên
 * đúng hạng, rồi bước một nói việc mà bước một thật sự làm.
 */
export const home = {
  // ── Dải mở đầu ────────────────────────────────────────────────────────
  //
  // Câu tiêu đề giữ NGUYÊN VĂN bản cũ. Nó nói đúng thứ nền tảng làm và không có
  // gì để cải thiện; thay đổi ở lượt này thuần là sức nặng thị giác.
  'home.hero.eyebrow': 'Sandbox Kubernetes dựng riêng, mở trong vài giây',
  'home.hero.title': 'Học DevOps bằng cách gõ lệnh thật',
  'home.hero.lede':
    'Bài học, lab và playground đều chạy trong một sandbox Kubernetes dựng riêng cho bạn, mở trong vài giây và tự dọn khi bạn xong.',
  'home.hero.scroll-hint': 'Cuộn xuống để đi hết một vòng, từ máy của bạn tới lúc traffic chạy qua.',

  /*
   * ── Nút hành động ────────────────────────────────────────────────────────
   *
   * `enter` lồng thêm một bậc vì hai chuỗi đó là hai BIẾN THỂ của cùng một nút,
   * chọn theo `useViewer()`. Người dùng không bao giờ thấy cả hai. Đặt phẳng
   * cạnh `paths` sẽ dựng ra một nhóm ba khoá anh em mô tả hai cái nút, tức một
   * con số ba không có thật.
   *
   * Khách chưa đăng nhập vẫn bấm được nút chính, nhưng nhãn nói thẳng là phải
   * đăng nhập trước: `proxy.ts:163` chuyển họ qua `/login`, và hứa một trang mở
   * ra ngay rồi chuyển hướng là cách nhanh nhất làm người lạ nghĩ trang bị hỏng.
   */
  'home.cta.enter.guest': 'Đăng nhập để bắt đầu',
  'home.cta.enter.member': 'Vào học',
  'home.cta.paths': 'Xem lộ trình',

  /*
   * ── Vòng bảy chặng ───────────────────────────────────────────────────────
   *
   * Bảy chặng theo design §7. Thứ tự là NGHĨA, nên chúng render trong một `<ol>`
   * và cảnh 3D chỉ đi theo đúng thứ tự đó.
   *
   * KHÔNG có khoá mô tả cảnh 3D cho trình đọc màn hình, và đó là quyết định:
   * lớp canvas mang `aria-hidden`, vì nó không chở thông tin nào mà bảy thẻ bên
   * cạnh không có. Một mô tả thứ hai của cùng nội dung là chữ đọc THỪA, không
   * phải chữ thêm.
   */
  'home.loop.heading': 'Một vòng, bảy chặng',
  'home.loop.lede':
    'Đây là đường đi của một thay đổi, từ lúc bạn gõ tới lúc người dùng nhận. Chặng sáu là chặng bạn không phải làm gì.',
  'home.loop.stage-position': (p: { n: number; total: number }) =>
    `Chặng ${p.n} trên ${p.total}`,

  // ── Bảy chặng: tiêu đề ────────────────────────────────────────────────
  'home.stage-title.laptop': 'Máy của bạn',
  'home.stage-title.commit': 'Commit rời khỏi máy',
  'home.stage-title.build': 'Build xếp từng lớp',
  'home.stage-title.push': 'Image lên registry',
  'home.stage-title.schedule': 'Scheduler xếp pod lên node',
  'home.stage-title.heal': 'Một pod chết, cụm tự vá',
  'home.stage-title.serve': 'Traffic chạy qua',

  // ── Bảy chặng: thân ───────────────────────────────────────────────────
  'home.stage-body.laptop':
    'Một con trỏ nhấp nháy trong terminal. Chưa có gì rời khỏi đây, và mọi thứ sau đây bắt đầu từ một lệnh bạn gõ.',
  'home.stage-body.commit':
    'Bạn đẩy nhánh lên. Từ giây này, thứ chạy tiếp không còn nằm trong tay bạn mà nằm trong một quy trình đã khai sẵn.',
  'home.stage-body.build':
    'Mỗi dòng trong Dockerfile là một lớp. Lớp không đổi thì lần build sau dùng lại, nên build thứ hai nhanh hơn build đầu.',
  'home.stage-body.push':
    'Image được gắn thẻ rồi đẩy lên registry. Đây là bản duy nhất mà cụm sẽ kéo về, không phải mã nguồn của bạn.',
  'home.stage-body.schedule':
    'Cụm đọc bản mô tả bạn khai, chọn node còn chỗ, rồi đặt pod xuống. Bạn khai trạng thái muốn có, không khai từng bước làm.',
  'home.stage-body.heal':
    'Không ai gõ gì. Vòng lặp đối chiếu thấy số pod đang chạy thiếu so với bản khai, và nó dựng lại đúng phần thiếu. Đây là lý do Kubernetes tồn tại.',
  'home.stage-body.serve':
    'Service đưa traffic tới các pod đang sống. Vòng khép lại ở đây rồi nối thẳng về chặng một, cho lần thay đổi kế tiếp.',

  // ── Bốn luận điểm ─────────────────────────────────────────────────────
  'home.value.heading': 'Nền tảng này làm gì cho bạn',

  'home.value-title.sandbox': 'Sandbox thật, không phải mô phỏng',
  'home.value-title.grading': 'Chấm bằng cách chạy, không bằng cách đoán',
  'home.value-title.progress': 'Biết mình đang ở đâu',
  'home.value-title.local': 'Không cài gì trên máy bạn',

  'home.value-body.sandbox':
    'Mỗi phiên là một pod riêng có Kubernetes và containerd chạy bên trong. Lệnh bạn gõ là lệnh thật, lỗi bạn gặp là lỗi thật.',
  'home.value-body.grading':
    'Mỗi bước được kiểm bằng chính lệnh chạy trong sandbox của bạn. Sai ở đâu thì kết quả nói ra đúng chỗ đó, thay vì một dấu tích không giải thích gì.',
  'home.value-body.progress':
    'Lộ trình xếp bài theo thứ tự, quiz kiểm lại phần vừa học, và trang Của tôi cộng tiến độ lúc bạn mở, không phải một con số lưu sẵn từ tuần trước.',
  'home.value-body.local':
    'Sandbox dựng phía máy chủ và terminal chạy trong trình duyệt. Không Docker Desktop, không máy ảo, không cụm riêng phải tự nuôi.',

  /*
   * ── Bốn ô số liệu ────────────────────────────────────────────────────────
   *
   * Mô tả từng loại lấy lại nguyên ý chuỗi đang hiện ở chính trang danh mục
   * tương ứng, nên người dùng gặp lại đúng câu đó khi bấm vào.
   *
   * `unknown-count` là chữ chỉ trình đọc màn hình nghe thấy, đi kèm một dấu
   * gạch nối ngắn hiện trên màn hình. Không có nó thì người dùng trình đọc màn
   * hình nghe một ký tự trống ở đúng chỗ đáng lẽ là con số.
   */
  'home.catalog.heading': 'Trong nền tảng có gì',
  'home.catalog.lede': 'Đếm từ nội dung đã xuất bản, ngay lúc bạn mở trang.',
  'home.catalog.unknown-count': 'chưa đọc được số lượng',
  'home.catalog.partial':
    'Một vài con số chưa đọc được vì máy chủ nội dung không trả lời. Phần còn lại của trang vẫn dùng được, tải lại sau ít phút để thấy đủ.',
  'home.catalog.loading': 'Đang đọc số lượng nội dung.',

  'home.catalog-label.lessons': 'Bài học',
  'home.catalog-label.labs': 'Lab',
  'home.catalog-label.playgrounds': 'Playground',
  'home.catalog-label.quizzes': 'Quiz',

  'home.catalog-note.lessons': 'Từng bước có hướng dẫn, mỗi bài mở một sandbox riêng.',
  'home.catalog-note.labs': 'Một tập nhiệm vụ độc lập, tự chấm rồi nộp khi sẵn sàng.',
  'home.catalog-note.playgrounds': 'Sandbox trống, không bài, không chấm, để thử lệnh.',
  'home.catalog-note.quizzes': 'Bộ câu hỏi tự chấm, nộp xong mới thấy điểm và giải thích.',

  // ── Ba bước ───────────────────────────────────────────────────────────
  'home.step.heading': 'Bắt đầu thế nào',

  'home.step-title.signin': 'Đăng nhập',
  'home.step-title.pick': 'Chọn một lộ trình, hoặc một bài lẻ',
  'home.step-title.run': 'Gõ lệnh, hệ thống chấm bằng cách chạy',

  'home.step-body.signin':
    'Một trình duyệt là đủ. Phiên gắn với tài khoản của bạn, nên tiến độ đi theo bạn qua máy khác.',
  'home.step-body.pick':
    'Lộ trình xếp sẵn thứ tự và mở khoá dần. Chưa biết bắt đầu từ đâu thì đi theo lộ trình; đã biết mình thiếu gì thì vào thẳng bài đó.',
  'home.step-body.run':
    'Mỗi bước kiểm bằng chính lệnh chạy trong sandbox của bạn, nên kết quả nói ra sai ở đâu. Xong thì phiên tự dọn.',

  /*
   * ── Ảnh xem trước khi share link ─────────────────────────────────────────
   *
   * Đúng hai dòng, vì ảnh có đúng hai dòng chữ. `alt` KHÔNG phải khoá thứ ba:
   * nó dựng tại nơi gọi bằng cách nối hai dòng này, nên chữ mô tả ảnh không thể
   * trôi khỏi chữ trong ảnh.
   */
  'home.og.title': 'DevOps Learning Platform',
  'home.og.subtitle': 'Học DevOps bằng lab sandbox chạy thật',
} as const satisfies Surface<'home'>;

export const homeIntentionalThree = {
  'home.step-title':
    '2026-09-10: đúng ba bước vì apps/web/src/proxy.ts đặt đúng một cổng đăng nhập trước mọi đường nội dung (redirect ở dòng 163), nên chuỗi việc từ lúc mở trang tới lúc gõ được lệnh là đăng nhập, chọn nội dung, vào phiên chạy. Bỏ cổng đó đi thì nhóm này còn hai bước, không phải ba.',
  'home.step-body':
    '2026-09-10: cùng ba bước với home.step-title và bị chốt bởi cùng một sự thật ở proxy.ts. Hai nhóm tách nhau vì cổng T3 gom theo tiền tố bỏ phân đoạn cuối, nên tiêu đề và thân phải nằm hai nhóm mới nhìn thấy được con số ba.',
} as const satisfies IntentionalThree;
