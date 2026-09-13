/**
 * Chương 2 — Làm việc nhóm, level G13–G24.
 *
 * Hai kho. Nội dung file thật. Bot đồng đội hành động theo đồng hồ logic.
 *
 * Đây là chương tạo khác biệt. Đo trực tiếp trên mã nguồn (design §3.1):
 * Learn Git Branching có **0 file** nhắc merge conflict và *không thể* có —
 * mô hình `workingChanges: {path → status}` của nó không mang nội dung file.
 * LGB có cờ `--force` nhưng **không có hậu quả**: không gì biến mất, không ai
 * mất việc.
 *
 * ⛔ Plan §7: hết thời gian thì cắt SỐ LƯỢNG level, cơ chế conflict KHÔNG CẮT.
 *
 * ⛔ Bot TẤT ĐỊNH. Chúng chạy kịch bản khai sẵn ở `setup.bots`, không dùng
 * `world.rng`. Một đồng đội hành động khác nhau giữa hai lần phát lại là hỏng
 * thẳng việc chấm lại phía máy chủ (P18).
 */

import type { GitLevel } from '../contract.ts';

/** Lịch sử gốc dùng lại ở nhiều level chương 2 — một kho đã có ba commit chung. */
const BASE_HISTORY = [
  { id: 'c1', message: 'Khởi tạo dự án', changes: { 'README.md': '# Dự án', 'app.js': 'start()' } },
  { id: 'c2', parents: ['c1'], message: 'Thêm cấu hình', changes: { 'config.yml': 'port: 8080\nhost: localhost' } },
  { id: 'c3', parents: ['c2'], message: 'Viết tài liệu', changes: { 'README.md': '# Dự án\n\nHướng dẫn chạy.' } },
] as const;

export const G13: GitLevel = {
  id: 'git-13-clone-kho-thu-hai',
  chapter: 2,
  title: 'Clone dựng kho thứ hai',
  mission: 'Tạo nhánh local theo dõi nhánh phat-trien của origin.',
  brief: `
Kho vừa được clone. Nhìn đồ thị: có **hai khối không gian** tách rời. Bên phải
là \`origin\`, bên trái là kho của bạn.

Clone không tạo nhánh local cho mọi nhánh của origin. Nó tạo đúng một nhánh
(\`main\`) và một loạt **ref theo dõi** \`origin/*\` — đó là bản ghi nhớ của bạn
về origin, không phải nhánh của bạn.

origin có nhánh \`phat-trien\` mà bạn chưa có bản local. Tạo nó.
`.trim(),
  difficulty: 'basic',
  setup: {
    commits: [
      ...BASE_HISTORY,
      { id: 'd1', parents: ['c3'], message: 'Bắt đầu tính năng mới', changes: { 'feature.js': 'v1' } },
    ],
    branches: { main: 'c3' },
    origin: { branches: { main: 'c3', 'phat-trien': 'd1' } },
  },
  allowedCommands: ['branch', 'switch', 'checkout', 'log', 'status', 'fetch', 'remote'],
  objectives: [
    {
      id: 'co-nhanh-local',
      label: 'Có nhánh local tên phat-trien',
      check: 'refExists',
      args: { ref: 'phat-trien' },
      required: true,
    },
    {
      id: 'dung-cho',
      label: 'phat-trien trỏ đúng commit của origin',
      check: 'refPointsAtMessage',
      args: { ref: 'phat-trien', message: 'Bắt đầu tính năng mới' },
      required: true,
    },
    {
      id: 'main-nguyen',
      label: 'main không bị dịch',
      check: 'refPointsAtMessage',
      args: { ref: 'main', message: 'Viết tài liệu' },
      required: true,
    },
  ],
  hints: [
    '`git branch -a` liệt kê cả ref theo dõi của origin.',
    '`git switch -c <tên> origin/<tên>` tạo nhánh local bắt đầu từ ref theo dõi.',
  ],
  teaching: {
    primer: `
Sau \`git clone\`, kho của bạn có:

\`\`\`
refs/heads/main               ← nhánh CỦA BẠN, bạn commit lên nó
refs/remotes/origin/main      ← bạn NHỚ origin đang ở đâu
refs/remotes/origin/phat-trien
\`\`\`

Ref \`origin/*\` là ảnh chụp, không phải kết nối sống. Chúng chỉ đổi khi bạn
\`fetch\` hoặc \`push\`. Bạn không commit lên chúng được.

Muốn làm việc trên một nhánh của origin thì tạo nhánh local bắt đầu từ ref theo
dõi tương ứng.
`.trim(),
    cheatsheet: [
      { command: 'git branch -a', explain: 'Liệt kê cả nhánh local lẫn ref theo dõi.' },
      { command: 'git switch -c <tên> origin/<tên>', explain: 'Tạo nhánh local từ ref theo dõi.' },
      { command: 'git remote', explain: 'Xem kho từ xa đã đăng ký.' },
    ],
    takeaways: [
      'Clone tạo một nhánh local, không tạo hết.',
      '`origin/x` là ảnh chụp bạn nhớ, không phải nhánh bạn làm việc.',
    ],
  },
  theoryId: '13-clone-kho-thu-hai',
  solutionCommands: ['git switch -c phat-trien origin/phat-trien'],
  altSolutionCommands: ['git branch phat-trien origin/phat-trien'],
  par: 1,
};

export const G14: GitLevel = {
  id: 'git-14-origin-main-hay-origin-main',
  chapter: 2,
  title: '`origin/main` khác `origin main`',
  mission: 'Đưa ref theo dõi khớp lại với origin mà không đụng nhánh local.',
  brief: `
Đồng đội đã push một commit lên origin. Ref theo dõi \`origin/main\` của bạn vẫn
nhớ trạng thái cũ, nên đồ thị đang nói dối.

Hai thứ trông giống nhau và hoàn toàn khác nhau:

- \`origin/main\` là **một tên duy nhất**, có dấu gạch chéo bên trong. Nó là ref
  theo dõi.
- \`origin main\` là **hai đối số rời**: một remote và một nhánh.

Cập nhật ref theo dõi. Nhánh local của bạn phải nguyên vẹn.
`.trim(),
  difficulty: 'intermediate',
  setup: {
    commits: [
      ...BASE_HISTORY,
      { id: 'o1', parents: ['c3'], message: 'Đồng đội sửa cấu hình', author: 'Linh', changes: { 'config.yml': 'port: 9090\nhost: localhost' } },
    ],
    branches: { main: 'c3' },
    origin: { branches: { main: 'o1' }, tracking: { main: 'c3' } },
  },
  allowedCommands: ['fetch', 'log', 'status', 'branch', 'diff'],
  objectives: [
    {
      id: 'tracking-khop',
      label: 'origin/main đã khớp với origin thật',
      check: 'trackingUpToDate',
      args: { ref: 'main' },
      required: true,
    },
    {
      id: 'local-nguyen',
      label: 'Nhánh main local KHÔNG dịch chỗ',
      check: 'refPointsAtMessage',
      args: { ref: 'main', message: 'Viết tài liệu' },
      required: true,
    },
    {
      id: 'worktree-nguyen',
      label: 'File trong worktree không bị đụng',
      check: 'worktreeFileEquals',
      args: { path: 'config.yml', lines: ['port: 8080', 'host: localhost'] },
      required: true,
    },
  ],
  hints: [
    'Bạn cần lệnh chỉ cập nhật ref theo dõi, không đụng nhánh local.',
    '`git fetch` làm đúng việc đó. `git pull` thì làm thêm một việc nữa.',
  ],
  teaching: {
    primer: `
\`\`\`
git push origin main
          └──┬──┘ └┬─┘
          remote  nhánh      ← HAI đối số

git log origin/main
        └────┬────┘
        một tên ref          ← MỘT đối số
\`\`\`

Chỗ nguy hiểm: gõ \`git push origin/main\` sẽ **báo lỗi** nên bạn thấy ngay.
Nhưng gõ \`git log origin main\` thì **chạy trơn tru** và cho kết quả sai (nó
hiểu là "log của hai ref"). Sai âm thầm khó phát hiện hơn sai ồn ào.
`.trim(),
    cheatsheet: [
      { command: 'git fetch', explain: 'Cập nhật ref theo dõi. Không đụng nhánh local, không đụng worktree.' },
      { command: 'git log origin/main', explain: 'Xem origin đang ở đâu theo bản ghi nhớ của bạn.' },
      { command: 'git status', explain: 'Nói bạn đi trước hay sau origin bao nhiêu commit.' },
    ],
    takeaways: [
      '`origin/main` là một tên; `origin main` là hai đối số.',
      'fetch cập nhật bản ghi nhớ, không đụng việc của bạn.',
    ],
  },
  theoryId: '14-origin-main-hay-origin-main',
  solutionCommands: ['git fetch'],
  altSolutionCommands: ['git fetch origin main'],
  par: 1,
};

export const G15: GitLevel = {
  id: 'git-15-fetch-khac-pull',
  chapter: 2,
  title: 'fetch khác pull',
  mission: 'Lấy commit của đồng đội về và hợp vào nhánh của bạn.',
  brief: `
Lần này bạn muốn commit của đồng đội **thật sự** vào nhánh của mình.

\`fetch\` chỉ cập nhật bản ghi nhớ. Để nhánh local tiến lên, phải hợp nhất thêm
một bước. \`pull\` gộp hai việc đó lại.

Biết hai bước bên trong \`pull\` là gì thì lúc nó hỏng bạn còn biết hỏng ở đâu.
`.trim(),
  difficulty: 'intermediate',
  setup: {
    commits: [
      ...BASE_HISTORY,
      { id: 'o1', parents: ['c3'], message: 'Đồng đội thêm kiểm thử', author: 'Linh', changes: { 'test.js': 'assert(1)' } },
    ],
    branches: { main: 'c3' },
    origin: { branches: { main: 'o1' }, tracking: { main: 'c3' } },
  },
  allowedCommands: ['fetch', 'pull', 'merge', 'log', 'status', 'diff'],
  objectives: [
    {
      id: 'local-tien',
      label: 'main local đã có commit của đồng đội',
      check: 'refPointsAtMessage',
      args: { ref: 'main', message: 'Đồng đội thêm kiểm thử' },
      required: true,
    },
    {
      id: 'file-ve',
      label: 'File test.js đã có trong worktree',
      check: 'worktreeFileExists',
      args: { path: 'test.js', present: true },
      required: true,
    },
    {
      id: 'thang',
      label: 'Lịch sử thẳng, không sinh commit merge thừa',
      check: 'historyLinear',
      args: { ref: 'main' },
      required: true,
    },
  ],
  hints: [
    'Nhánh của bạn chưa đi đâu kể từ lúc tách, nên hợp nhất lần này là fast-forward.',
    '`git pull` = `git fetch` + hợp nhất.',
  ],
  teaching: {
    primer: `
\`\`\`
git pull  ≡  git fetch  +  git merge origin/<nhánh>
\`\`\`

Tách ra có ích khi bạn muốn **nhìn trước khi nhập**: fetch rồi
\`git log main..origin/main\` để xem sắp nhận gì, rồi mới merge.

Ở bài này nhánh của bạn chưa có commit riêng nào, nên merge chỉ dời con trỏ
(fast-forward) và lịch sử vẫn thẳng.
`.trim(),
    cheatsheet: [
      { command: 'git pull', explain: 'fetch rồi hợp nhất, một lệnh.' },
      { command: 'git fetch && git merge origin/main', explain: 'Cùng việc, hai bước, nhìn được ở giữa.' },
      { command: 'git log main..origin/main', explain: 'Xem mình sắp nhận những commit nào.' },
    ],
    takeaways: [
      'pull là fetch cộng một bước hợp nhất.',
      'Tách hai bước cho bạn cơ hội xem trước.',
    ],
  },
  theoryId: '15-fetch-khac-pull',
  solutionCommands: ['git pull'],
  altSolutionCommands: ['git fetch', 'git merge origin/main'],
  par: 1,
};

export const G16: GitLevel = {
  id: 'git-16-push-bi-tu-choi',
  chapter: 2,
  title: 'Push bị từ chối vì non-fast-forward',
  mission: 'Đưa commit của bạn lên origin sau khi đã nhận việc của đồng đội.',
  brief: `
Bạn có một commit mới. Đồng đội cũng đã push một commit khác lên origin. Hai
mạch đã rẽ.

\`git push\` sẽ **bị từ chối**. Đó không phải lỗi của bạn: git đang bảo rằng đẩy
lên lúc này sẽ làm commit của đồng đội mất người trỏ tới.

Cách đúng: lấy việc của họ về trước, hợp nhất, rồi mới push.
`.trim(),
  difficulty: 'intermediate',
  setup: {
    commits: [
      ...BASE_HISTORY,
      { id: 'me', parents: ['c3'], message: 'Tôi sửa app.js', changes: { 'app.js': 'start()\nlog()' } },
      { id: 'o1', parents: ['c3'], message: 'Linh sửa README', author: 'Linh', changes: { 'README.md': '# Dự án\n\nHướng dẫn chạy.\nCài đặt.' } },
    ],
    branches: { main: 'me' },
    origin: { branches: { main: 'o1' }, tracking: { main: 'c3' } },
  },
  allowedCommands: ['push', 'pull', 'fetch', 'merge', 'rebase', 'log', 'status'],
  objectives: [
    {
      id: 'origin-co-cua-toi',
      label: 'origin đã có commit của bạn',
      check: 'originRefPointsAtMessage',
      args: { ref: 'main', message: 'Tôi sửa app.js' },
      required: false,
    },
    {
      id: 'giu-viec-dong-doi',
      label: 'Commit của Linh KHÔNG bị mất',
      check: 'commitReachable',
      args: { message: 'Linh sửa README' },
      required: true,
    },
    {
      id: 'giu-viec-toi',
      label: 'Commit của bạn cũng còn',
      check: 'commitReachable',
      args: { message: 'Tôi sửa app.js' },
      required: true,
    },
    {
      id: 'dong-bo',
      label: 'Ref theo dõi khớp origin',
      check: 'trackingUpToDate',
      args: { ref: 'main' },
      required: true,
    },
  ],
  hints: [
    'Thử `git push` trước để đọc thông báo từ chối. Nó nói rõ phải làm gì.',
    '`git pull` lấy việc của họ về và hợp nhất với việc của bạn.',
    'Sau khi hợp nhất xong thì `git push` mới đi được.',
  ],
  teaching: {
    primer: `
git từ chối push khi commit ở origin **không phải tổ tiên** của commit bạn đẩy
lên. Nếu cho phép, con trỏ \`main\` ở origin sẽ nhảy sang mạch của bạn và commit
của đồng đội không còn ai trỏ tới.

\`\`\`
origin/main:  c3 ── o1        ← Linh
local main:   c3 ── me        ← bạn
                    ✗ push: o1 sẽ mất người trỏ
\`\`\`

Cách đúng luôn là **nhận trước, đẩy sau**: pull (merge hoặc rebase), rồi push.

Cờ \`--force\` bỏ qua phép kiểm này. Bài G20 cho bạn thấy nó làm gì.
`.trim(),
    cheatsheet: [
      { command: 'git push', explain: 'Đẩy nhánh hiện tại lên origin.' },
      { command: 'git pull', explain: 'Nhận việc của người khác trước khi đẩy.' },
      { command: 'git status', explain: 'Nói bạn đi trước/sau origin bao nhiêu.' },
    ],
    takeaways: [
      'Push bị từ chối là git bảo vệ việc của người khác.',
      'Nhận trước, đẩy sau. Đó là thứ tự duy nhất an toàn.',
    ],
  },
  theoryId: '16-push-bi-tu-choi',
  solutionCommands: ['git pull', 'git push'],
  altSolutionCommands: ['git fetch', 'git rebase origin/main', 'git push'],
  par: 2,
};

export const G17: GitLevel = {
  id: 'git-17-conflict-dau-tien',
  chapter: 2,
  title: 'Conflict đầu tiên',
  mission: 'Giải xung đột trong config.yml và hoàn tất merge.',
  brief: `
Bạn và Linh cùng sửa **đúng một dòng** trong \`config.yml\`. Bạn đổi port thành
3000, Linh đổi thành 9090.

git không đoán được ai đúng, nên nó dừng lại và hỏi. Đó là **conflict**.

Khảo sát ICTERI 2014 ghi nhận 32% sinh viên xếp conflict vào nhóm khó nhất, và
cách họ xử lý là **clone lại kho sạch rồi chép tay** — tác giả gọi thẳng là "một
giải pháp rất không may". Câu trả lời tiêu cực duy nhất trong khảo sát là trải
nghiệm mất việc.

Conflict không phải kho hỏng. Nó là git thành thật nói rằng nó không đoán thay
bạn được.
`.trim(),
  difficulty: 'advanced',
  setup: {
    commits: [
      ...BASE_HISTORY,
      { id: 'me', parents: ['c3'], message: 'Tôi đổi port sang 3000', changes: { 'config.yml': 'port: 3000\nhost: localhost' } },
      { id: 'o1', parents: ['c3'], message: 'Linh đổi port sang 9090', author: 'Linh', changes: { 'config.yml': 'port: 9090\nhost: localhost' } },
    ],
    branches: { main: 'me' },
    origin: { branches: { main: 'o1' }, tracking: { main: 'c3' } },
  },
  allowedCommands: ['pull', 'fetch', 'merge', 'checkout', 'add', 'commit', 'status', 'diff', 'log'],
  objectives: [
    {
      id: 'khong-con-marker',
      label: 'config.yml không còn dấu xung đột',
      check: 'noConflictMarkers',
      args: { path: 'config.yml' },
      required: true,
    },
    {
      id: 'da-xong',
      label: 'Không còn thao tác merge dở dang',
      check: 'noPendingOp',
      required: true,
    },
    {
      id: 'co-merge',
      label: 'Đã có commit merge nối hai mạch',
      check: 'hasMergeCommit',
      args: { ref: 'main' },
      required: true,
    },
    {
      id: 'giu-ca-hai',
      label: 'Cả hai commit gốc vẫn còn trong lịch sử',
      check: 'commitReachable',
      args: { message: 'Linh đổi port sang 9090' },
      required: true,
    },
  ],
  hints: [
    '`git pull` sẽ dừng lại và báo xung đột. Đọc kỹ nó nói file nào.',
    'Mở file ra: bạn sẽ thấy cả ba phiên bản, ngăn bằng `<<<<<<<`, `|||||||`, `=======`, `>>>>>>>`.',
    'Chọn một phiên bản (hoặc viết bản thứ ba), xoá hết dấu ngăn, rồi `git add` và `git commit`.',
  ],
  teaching: {
    primer: `
File xung đột trông thế này:

\`\`\`
<<<<<<< HEAD
port: 3000
||||||| tổ tiên chung
port: 8080
=======
port: 9090
>>>>>>> origin/main
\`\`\`

Ba khối, ba phiên bản: của bạn, của **tổ tiên chung**, của họ. Khối giữa là thứ
làm bạn quyết định được: thấy giá trị gốc là 8080 thì biết cả hai đều cố ý đổi,
không ai vô tình.

Giải xung đột nghĩa là: sửa file thành thứ bạn MUỐN (có thể là bản thứ ba mà
không ai viết), xoá hết dấu ngăn, rồi \`add\` để báo git là đã xong.

Không thích thì \`git merge --abort\` quay về trạng thái trước, không mất gì.
`.trim(),
    cheatsheet: [
      { command: 'git status', explain: 'Liệt kê file nào đang xung đột.' },
      { command: 'git add <file>', explain: 'Báo git rằng file này đã giải xong.' },
      { command: 'git commit', explain: 'Chốt commit merge sau khi giải hết.' },
      { command: 'git merge --abort', explain: 'Bỏ hẳn, quay về trước khi merge.' },
    ],
    takeaways: [
      'Conflict là git từ chối đoán, không phải kho hỏng.',
      'Ba khối marker cho bạn cả ba phiên bản, gồm tổ tiên chung.',
      'Bạn được quyền viết bản thứ ba không giống bên nào.',
      '`--abort` luôn có sẵn, nên thử giải không bao giờ là rủi ro.',
    ],
    pitfalls: [
      'Clone lại kho sạch rồi chép tay là phản xạ phổ biến nhất và cũng là cách mất việc phổ biến nhất. Conflict giải được tại chỗ, và `--abort` là mạng lưới an toàn.',
    ],
  },
  theoryId: '17-conflict-dau-tien',
  solutionCommands: [
    'git pull',
    'git checkout --theirs config.yml',
    'git add config.yml',
    // ⚠ `git commit` KHÔNG kết thúc merge ở engine này: `ops/basic.ts` từ chối
    // khi `repo.pending !== null`, và việc đóng một thao tác dở dang thuộc về
    // `ops/merge.ts`. Khác git thật một chút, và khác có chủ ý — nó làm ranh
    // giới giữa hai tầng nhìn thấy được thay vì ẩn trong một lệnh.
    'git merge --continue',
  ],
  altSolutionCommands: [
    'git fetch',
    'git merge origin/main',
    'git checkout --ours config.yml',
    'git add config.yml',
    'git merge --continue',
  ],
  par: 4,
};

export const G18: GitLevel = {
  id: 'git-18-conflict-khong-phai-loi',
  chapter: 2,
  title: 'Conflict không phải lỗi: đọc, chọn, hoặc rút lui',
  mission: 'Dọn sạch dấu xung đột còn sót và đưa worktree về đúng bản của bạn.',
  brief: `
Lần này có xung đột ở **hai file cùng lúc**, và bạn quyết định chưa giải bây giờ.

Việc cần chứng minh: rút lui khỏi một merge đang dở là an toàn tuyệt đối. Không
mất commit, không mất file, kho trở lại đúng trạng thái trước khi bạn gõ lệnh.

Biết điều này là điều kiện để dám thử. Người không biết \`--abort\` sẽ tránh
merge, và tránh merge là tránh làm việc nhóm.
`.trim(),
  difficulty: 'intermediate',
  setup: {
    commits: [
      ...BASE_HISTORY,
      { id: 'me', parents: ['c3'], message: 'Tôi sửa hai file', changes: { 'config.yml': 'port: 3000\nhost: localhost', 'app.js': 'start()\nmine()' } },
      { id: 'o1', parents: ['c3'], message: 'Linh cũng sửa hai file', author: 'Linh', changes: { 'config.yml': 'port: 9090\nhost: localhost', 'app.js': 'start()\nhers()' } },
    ],
    branches: { main: 'me' },
    origin: { branches: { main: 'o1' }, tracking: { main: 'c3' } },
    /*
     * ⚠ Worktree bắt đầu Ở TRẠNG THÁI CÒN MARKER, và đó là một bản sửa thiết kế
     * chứ không phải trang trí.
     *
     * Bản đầu của level này đặt mục tiêu "không còn thao tác dở dang + file về
     * đúng bản của bạn", rồi bảo người chơi merge và `--abort`. Ô nghiệm thu
     * "level đã thắng sẵn lúc mở ra" bắt ngay: `--abort` khôi phục về đúng
     * trạng thái ban đầu, nên trạng thái ĐÍCH bằng trạng thái ĐẦU và level qua
     * được bằng cách KHÔNG LÀM GÌ.
     *
     * Đó là lỗi thật, không phải lỗi của phép đo. Một level mà "không làm gì"
     * cũng thắng thì nó không dạy gì cả, và bộ chấm theo trạng thái không có
     * cách nào phân biệt — đúng như thiết kế, vì nó cố ý không đọc lệnh đã gõ.
     *
     * Cách sửa giữ nguyên bài học ("rút lui là an toàn"): cho người chơi bắt
     * đầu Ở GIỮA đống đổ nát mà một lần merge hỏng để lại, và việc phải làm là
     * dọn nó. Phần `--abort` chuyển sang bài giảng, nơi nó thuộc về.
     */
    worktree: {
      'config.yml': [
        '<<<<<<< HEAD',
        'port: 3000',
        '||||||| tổ tiên chung',
        'port: 8080',
        '=======',
        'port: 9090',
        '>>>>>>> origin/main',
        'host: localhost',
      ],
      'app.js': ['start()', 'mine()'],
    },
  },
  allowedCommands: ['merge', 'fetch', 'pull', 'checkout', 'status', 'diff', 'log', 'add', 'commit', 'write'],
  objectives: [
    {
      id: 'khong-do-dang',
      label: 'Không còn thao tác merge dở dang',
      check: 'noPendingOp',
      required: true,
    },
    {
      id: 've-cho-cu',
      label: 'main vẫn ở đúng commit của bạn',
      check: 'refPointsAtMessage',
      args: { ref: 'main', message: 'Tôi sửa hai file' },
      required: true,
    },
    {
      id: 'file-nguyen',
      label: 'config.yml trở lại đúng bản của bạn, không còn marker',
      check: 'worktreeFileEquals',
      args: { path: 'config.yml', lines: ['port: 3000', 'host: localhost'] },
      required: true,
    },
    {
      id: 'app-nguyen',
      label: 'app.js cũng trở lại đúng bản của bạn',
      check: 'worktreeFileEquals',
      args: { path: 'app.js', lines: ['start()', 'mine()'] },
      required: true,
    },
    {
      id: 'da-thu',
      label: 'Bạn đã thật sự thử merge (reflog có dấu vết)',
      check: 'reflogHasOp',
      args: { ref: 'HEAD', op: 'merge' },
      required: false,
    },
  ],
  hints: [
    'Trước hết `git fetch` rồi `git merge origin/main` để rơi vào trạng thái xung đột.',
    '`git status` lúc này liệt kê cả hai file đang xung đột.',
    '`git merge --abort` đưa mọi thứ về đúng như trước.',
  ],
  teaching: {
    primer: `
Trong lúc merge đang dở, git giữ một trạng thái riêng: nó nhớ HEAD cũ là gì,
đang trộn cái gì vào, và file nào chưa giải.

Ba đường ra:

- **Giải xong** → \`add\` từng file → \`commit\`.
- **Rút lui** → \`git merge --abort\` → về đúng trước khi gõ.
- **Bỏ dở giữa chừng** → không có đường này. git sẽ chặn hầu hết lệnh khác cho
  tới khi bạn chọn một trong hai đường trên.

Đường thứ ba bị chặn là cố ý: một kho ở trạng thái nửa merge mà bạn quên mất sẽ
sinh ra commit rất kỳ lạ về sau.
`.trim(),
    cheatsheet: [
      { command: 'git merge origin/main', explain: 'Trộn ref theo dõi vào nhánh hiện tại.' },
      { command: 'git status', explain: 'Liệt kê file chưa giải xung đột.' },
      { command: 'git merge --abort', explain: 'Rút lui hoàn toàn, không mất gì.' },
    ],
    takeaways: [
      '`--abort` là an toàn tuyệt đối, kho trở lại y như trước.',
      'git chặn lệnh khác khi đang merge dở, để bạn không quên mất.',
      'Dám thử merge là điều kiện để làm việc nhóm.',
    ],
  },
  theoryId: '18-conflict-khong-phai-loi',
  solutionCommands: ['git checkout -- config.yml'],
  altSolutionCommands: ['git write config.yml -c "port: 3000"', 'git write config.yml -c "host: localhost" --append'],
  par: 3,
};

export const G19: GitLevel = {
  id: 'git-19-rebase-truoc-khi-push',
  chapter: 2,
  title: 'Rebase trước khi push cho lịch sử thẳng',
  mission: 'Đưa commit của bạn lên origin với lịch sử tuyến tính, không commit merge.',
  brief: `
Cùng tình huống G16: hai mạch đã rẽ. Lần này nhóm của bạn có quy ước lịch sử
phải thẳng, không có commit merge cho việc thường ngày.

\`git pull --rebase\` lấy việc của họ về rồi **dựng lại** commit của bạn lên
trên. Kết quả là một mạch thẳng, không có ngã ba.

Cái giá: Oid commit của bạn đổi. Việc đó an toàn ở đây vì bạn chưa push chúng
đi đâu cả.
`.trim(),
  difficulty: 'intermediate',
  setup: {
    commits: [
      ...BASE_HISTORY,
      { id: 'me', parents: ['c3'], message: 'Tôi thêm hàm log', changes: { 'app.js': 'start()\nlog()' } },
      { id: 'o1', parents: ['c3'], message: 'Linh thêm kiểm thử', author: 'Linh', changes: { 'test.js': 'assert(1)' } },
    ],
    branches: { main: 'me' },
    origin: { branches: { main: 'o1' }, tracking: { main: 'c3' } },
  },
  allowedCommands: ['pull', 'fetch', 'rebase', 'push', 'log', 'status'],
  objectives: [
    {
      id: 'thang',
      label: 'Lịch sử main thẳng, không có commit merge',
      check: 'historyLinear',
      args: { ref: 'main' },
      required: true,
    },
    {
      id: 'co-ca-hai',
      label: 'Cả commit của bạn và của Linh đều còn',
      check: 'commitReachable',
      args: { message: 'Linh thêm kiểm thử' },
      required: true,
    },
    {
      id: 'cua-toi-con',
      label: 'Commit của bạn còn (dù Oid đã đổi)',
      check: 'commitReachable',
      args: { message: 'Tôi thêm hàm log' },
      required: true,
    },
    {
      id: 'da-len-origin',
      label: 'origin đã nhận',
      check: 'trackingUpToDate',
      args: { ref: 'main' },
      required: true,
    },
  ],
  hints: [
    '`git pull --rebase` thay vì `git pull`.',
    'Sau khi rebase xong thì push đi được vì mạch của bạn nay nối thẳng sau mạch của họ.',
  ],
  teaching: {
    primer: `
\`\`\`
pull (merge):   c3 ─┬─ me ─┬─ M       ← có ngã ba
                    └─ o1 ─┘

pull --rebase:  c3 ── o1 ── me'       ← thẳng
\`\`\`

\`me'\` là commit mới: cùng nội dung, cha khác, Oid khác.

An toàn vì \`me\` chưa từng rời máy bạn. Nếu nó đã được push và người khác đã
lấy về thì rebase sẽ tạo ra đúng bài G20.
`.trim(),
    cheatsheet: [
      { command: 'git pull --rebase', explain: 'Lấy về rồi dựng lại việc của bạn lên trên.' },
      { command: 'git rebase origin/main', explain: 'Cùng việc, sau khi đã fetch.' },
      { command: 'git log --oneline --graph', explain: 'Đối chiếu hình dạng lịch sử.' },
    ],
    takeaways: [
      'rebase trước khi push cho lịch sử thẳng.',
      'An toàn khi và chỉ khi commit của bạn chưa được chia sẻ.',
    ],
  },
  theoryId: '19-rebase-truoc-khi-push',
  solutionCommands: ['git pull --rebase', 'git push'],
  altSolutionCommands: ['git fetch', 'git rebase origin/main', 'git push'],
  par: 2,
};

export const G20: GitLevel = {
  id: 'git-20-force-push-huy-viec',
  chapter: 2,
  title: 'Force-push huỷ việc đồng đội',
  mission: 'Đẩy lịch sử đã viết lại lên origin, rồi nhìn xem commit của Linh đi đâu.',
  brief: `
Bạn đã rebase một nhánh **đã push**. Giờ push thường bị từ chối, vì origin có
commit mà mạch mới của bạn không chứa.

Có một cách bỏ qua phép kiểm đó: \`--force\`. Nó ghi đè con trỏ ở origin bằng
con trỏ của bạn.

Level này muốn bạn **làm điều đó và nhìn hậu quả**. Commit của Linh sẽ không còn
nhánh nào trỏ tới. Nó vẫn nằm trong kho, nhưng trên màn hình của Linh thì việc
của cô ấy vừa biến mất.

Đây là bài mà Learn Git Branching không thể dạy: nó có cờ \`--force\` nhưng
không có hậu quả nào.
`.trim(),
  difficulty: 'advanced',
  setup: {
    commits: [
      ...BASE_HISTORY,
      { id: 'me1', parents: ['c3'], message: 'Việc của tôi', changes: { 'app.js': 'start()\nmine()' } },
      { id: 'me2', parents: ['c3'], message: 'Việc của tôi, bản đã dọn', changes: { 'app.js': 'start()\nmine()\n// dọn' } },
      { id: 'o1', parents: ['me1'], message: 'Linh dựa trên việc của tôi', author: 'Linh', changes: { 'extra.js': 'them()' } },
    ],
    branches: { main: 'me2' },
    origin: { branches: { main: 'o1' }, tracking: { main: 'o1' } },
  },
  allowedCommands: ['push', 'fetch', 'log', 'status', 'reflog', 'branch'],
  objectives: [
    {
      id: 'da-day-len',
      label: 'origin nay trỏ vào bản đã dọn của bạn',
      check: 'originRefPointsAtMessage',
      args: { ref: 'main', message: 'Việc của tôi, bản đã dọn' },
      required: true,
    },
    {
      id: 'linh-mat-nguoi-tro',
      label: 'Commit của Linh KHÔNG còn nhánh nào trỏ tới',
      check: 'commitUnreachable',
      args: { message: 'Linh dựa trên việc của tôi' },
      required: true,
    },
    {
      id: 'linh-con-trong-kho',
      label: 'Nhưng nó VẪN nằm trong kho, chưa mất hẳn',
      check: 'commitInStore',
      args: { message: 'Linh dựa trên việc của tôi' },
      required: true,
    },
  ],
  hints: [
    '`git push` thường sẽ bị từ chối. Đọc thông báo.',
    '`git push --force` bỏ qua phép kiểm và ghi đè.',
    'Sau khi push xong, thử `git log origin/main` để thấy commit của Linh đã rời khỏi mạch.',
  ],
  teaching: {
    primer: `
\`\`\`
trước:  c3 ── me1 ── o1     ← origin/main (việc của Linh dựa trên me1)
        c3 ── me2           ← main của bạn (đã rebase)

sau --force:
        c3 ── me2           ← origin/main
              o1            ← không ai trỏ tới
\`\`\`

Commit \`o1\` không bị xoá. Nó nằm trong kho object và sẽ nằm đó cho tới khi
git dọn rác. Nhưng **Linh không biết điều đó**, và với cô ấy thì việc đã biến
mất.

Đây là lý do quy tắc "đừng rebase nhánh đã chia sẻ" tồn tại. Không phải vì rebase
xấu, mà vì force-push sau rebase là thứ phá việc người khác.

Bài G21 cho bạn một cờ an toàn hơn. Bài G31 dạy Linh cách cứu.
`.trim(),
    cheatsheet: [
      { command: 'git push --force', explain: 'Ghi đè con trỏ ở origin. Không hỏi lại.' },
      { command: 'git log origin/main', explain: 'Xem origin nay đang ở mạch nào.' },
      { command: 'git reflog', explain: 'Dấu vết còn lại của commit đã rời mạch.' },
    ],
    takeaways: [
      '`--force` ghi đè con trỏ ở origin, làm commit của người khác mất người trỏ.',
      'Commit không bị xoá, nhưng với người kia thì không còn thấy được.',
      'Đây là hậu quả thật của việc rebase một nhánh đã chia sẻ.',
    ],
    pitfalls: [
      '`--force` trên nhánh chính của một dự án nhiều người là cách nhanh nhất làm hỏng buổi làm việc của cả nhóm. Trên nhánh riêng của bạn thì hoàn toàn bình thường.',
    ],
  },
  theoryId: '20-force-push-huy-viec',
  solutionCommands: ['git push --force'],
  altSolutionCommands: ['git push -f origin main'],
  par: 1,
};

export const G21: GitLevel = {
  id: 'git-21-force-with-lease',
  chapter: 2,
  title: '`--force-with-lease`: cùng ý định, khác hậu quả',
  mission: 'Bị lease chặn, rồi làm đúng: lấy việc của Linh về trước khi đẩy.',
  brief: `
Cùng tình huống G20, nhưng lần này bạn dùng cờ an toàn.

\`--force-with-lease\` chỉ ghi đè khi origin **vẫn ở đúng chỗ bạn nhớ**. Nếu có
ai push thêm kể từ lần fetch cuối của bạn, nó từ chối.

Nói cách khác: \`--force\` nói "tôi muốn ghi đè". \`--force-with-lease\` nói
"tôi muốn ghi đè, **nếu không có gì đổi từ lúc tôi nhìn**".

Ở level này Linh đã push sau lần fetch cuối của bạn, nên lệnh phải bị chặn.
`.trim(),
  difficulty: 'advanced',
  setup: {
    commits: [
      ...BASE_HISTORY,
      { id: 'me1', parents: ['c3'], message: 'Việc của tôi', changes: { 'app.js': 'start()\nmine()' } },
      { id: 'me2', parents: ['c3'], message: 'Việc của tôi, bản đã dọn', changes: { 'app.js': 'start()\nmine()\n// dọn' } },
      { id: 'o1', parents: ['me1'], message: 'Linh push sau lần fetch của tôi', author: 'Linh', changes: { 'extra.js': 'them()' } },
    ],
    branches: { main: 'me2' },
    // tracking cố tình LỆCH origin: bạn nhớ me1, origin đã ở o1.
    origin: { branches: { main: 'o1' }, tracking: { main: 'me1' } },
  },
  allowedCommands: ['push', 'fetch', 'rebase', 'log', 'status', 'reflog'],
  objectives: [
    {
      // ⚠ KHÔNG dùng `commitReachable`: vị từ đó đọc kho LOCAL, còn commit của
      // Linh chỉ tồn tại ở `origin`. Đo sai vế thì ô đỏ dù lệnh chạy đúng, và
      // ô nghiệm thu AC-9 đã bắt được đúng chỗ này.
      id: 'linh-con-trong-kho',
      label: 'Commit của Linh vẫn nằm trong kho, cứu lại được',
      check: 'commitInStore',
      args: { message: 'Linh push sau lần fetch của tôi' },
      required: true,
    },
    {
      /*
       * ⚠ Ô này thay cho "origin chưa bị ghi đè" ở bản đầu, và lý do là một lỗi
       * thiết kế mà AC-8 bắt được: nếu trạng thái ĐÍCH là "không có gì đổi" thì
       * level đã thắng sẵn lúc mở ra, và nó qua được bằng cách không làm gì.
       *
       * Bài học vẫn nguyên — người chơi VẪN bị `--force-with-lease` chặn ở lần
       * thử đầu — nhưng level nay đòi họ đi nốt phần còn lại: lấy việc của Linh
       * về, rồi mới đẩy.
       */
      id: 'da-day-len-duoc',
      label: 'origin cuối cùng đã nhận việc của bạn',
      check: 'originRefPointsAtMessage',
      args: { ref: 'main', message: 'Việc của tôi, bản đã dọn' },
      required: true,
    },
    {
      id: 'dong-bo',
      label: 'Ref theo dõi khớp origin',
      check: 'trackingUpToDate',
      args: { ref: 'main' },
      required: true,
    },
  ],
  hints: [
    '`git push --force-with-lease` là cờ cần dùng.',
    'Nó sẽ bị từ chối, và đó chính là kết quả đúng của level này.',
    'Đọc thông báo: nó nói vì sao nó chặn, khác hẳn thông báo non-fast-forward thường.',
  ],
  teaching: {
    primer: `
\`--force-with-lease\` so **ref theo dõi của bạn** với **ref thật ở origin**:

- Khớp ⇒ không ai push kể từ lần fetch của bạn ⇒ cho ghi đè.
- Lệch ⇒ có người đã push ⇒ **từ chối**.

Đó là lý do phải \`fetch\` trước khi dùng nó: fetch cập nhật bản ghi nhớ, và bản
ghi nhớ là thứ cờ này dựa vào.

Cảnh báo có thật: \`git fetch\` rồi \`--force-with-lease\` ngay sẽ luôn thành
công, vì bạn vừa cập nhật bản ghi nhớ lên trạng thái mới nhất. Cờ này bảo vệ bạn
khỏi thứ bạn **chưa nhìn thấy**, không bảo vệ khỏi thứ bạn vừa nhìn rồi bỏ qua.
`.trim(),
    cheatsheet: [
      { command: 'git push --force-with-lease', explain: 'Ghi đè chỉ khi origin chưa đổi kể từ lần fetch cuối.' },
      { command: 'git push --force', explain: 'Ghi đè bất chấp. So sánh hai thông báo.' },
      { command: 'git fetch', explain: 'Cập nhật bản ghi nhớ mà cờ trên dựa vào.' },
    ],
    takeaways: [
      '`--force-with-lease` chặn khi có người push sau lần fetch của bạn.',
      'Nó bảo vệ khỏi cái bạn chưa nhìn thấy, không bảo vệ khỏi cái bạn cố tình bỏ qua.',
      'Mặc định nên dùng nó thay `--force`.',
    ],
  },
  theoryId: '21-force-with-lease',
  /*
   * Hai bước, và bước ĐẦU cố ý thất bại.
   *
   * `--force-with-lease` từ chối vì ref theo dõi của bạn còn nhớ trạng thái cũ.
   * `git fetch` cập nhật bản ghi nhớ đó, và sau đó CÙNG MỘT LỆNH chạy được.
   *
   * Đó chính là câu quan trọng nhất của bài: cờ này bảo vệ bạn khỏi thứ bạn
   * CHƯA NHÌN THẤY, không bảo vệ khỏi thứ bạn đã nhìn rồi vẫn quyết định đè.
   */
  solutionCommands: [
    'git push --force-with-lease',
    'git fetch',
    'git push --force-with-lease',
  ],
  altSolutionCommands: ['git fetch', 'git push --force-with-lease origin main'],
  par: 1,
};

export const G22: GitLevel = {
  id: 'git-22-stash-khi-chuyen-nhanh',
  chapter: 2,
  title: 'Stash khi phải chuyển nhánh giữa chừng',
  mission: 'Cất việc đang dở, chuyển nhánh vá lỗi gấp, rồi lấy việc lại.',
  brief: `
Bạn đang sửa dở \`app.js\`. Có báo lỗi gấp cần vá trên nhánh \`hotfix\` ngay
bây giờ.

Chuyển nhánh lúc worktree đang bẩn sẽ bị chặn, vì nội dung đang sửa sẽ bị đè.

\`git stash\` cất phần đang dở vào một chỗ riêng và trả worktree về sạch. Xong
việc gấp thì \`git stash pop\` lấy lại.

Stash tồn tại vì worktree là **dùng chung** giữa mọi nhánh: bạn chỉ có một thư
mục, dù có mười nhánh.
`.trim(),
  difficulty: 'intermediate',
  setup: {
    commits: [
      ...BASE_HISTORY,
      { id: 'h1', parents: ['c3'], message: 'Nhánh hotfix bắt đầu', changes: { 'hotfix.js': 'chua-va' } },
    ],
    branches: { main: 'c3', hotfix: 'h1' },
    head: 'main',
    worktree: { 'app.js': 'start()\n// đang viết dở, chưa xong' },
  },
  allowedCommands: ['stash', 'switch', 'checkout', 'write', 'add', 'commit', 'status', 'log', 'branch'],
  objectives: [
    {
      id: 've-main',
      label: 'Bạn đã quay lại nhánh main',
      check: 'refsEqual',
      args: { a: 'HEAD', b: 'main' },
      required: true,
    },
    {
      id: 'lay-lai-viec',
      label: 'Phần đang sửa dở đã trở lại worktree',
      check: 'worktreeFileEquals',
      args: { path: 'app.js', lines: ['start()', '// đang viết dở, chưa xong'] },
      required: true,
    },
    {
      id: 'stash-rong',
      label: 'Ngăn stash đã trống',
      check: 'stashCount',
      args: { count: 0 },
      required: true,
    },
    {
      id: 'da-va',
      label: 'Nhánh hotfix đã có commit vá',
      check: 'commitReachable',
      args: { message: 'Vá lỗi gấp' },
      required: true,
    },
  ],
  hints: [
    '`git stash` cất mọi thứ đang sửa dở và trả worktree về sạch.',
    'Sau khi chuyển sang hotfix, sửa file rồi `add` và `commit` như bình thường.',
    '`git stash pop` lấy lại phần đã cất và bỏ nó khỏi ngăn stash.',
  ],
  teaching: {
    primer: `
\`\`\`
git stash          → worktree sạch, phần dở cất vào ngăn
git switch hotfix  → chuyển được vì đã sạch
... vá lỗi, commit ...
git switch main
git stash pop      → phần dở trở lại
\`\`\`

Stash thật ra là một **commit ẩn**: git tạo một commit giữ trạng thái worktree
và index, rồi ghi Oid của nó vào danh sách stash. Đó là lý do stash thất lạc vẫn
cứu được bằng \`git fsck\` (bài G30).

\`pop\` lấy lại rồi bỏ mục; \`apply\` lấy lại và **giữ** mục. Dùng \`apply\` khi
bạn muốn áp cùng một phần dở lên nhiều nhánh.
`.trim(),
    cheatsheet: [
      { command: 'git stash', explain: 'Cất phần đang sửa, worktree về sạch.' },
      { command: 'git stash list', explain: 'Xem các mục đã cất.' },
      { command: 'git stash pop', explain: 'Lấy lại mục mới nhất và bỏ nó.' },
      { command: 'git stash apply', explain: 'Lấy lại nhưng GIỮ mục trong ngăn.' },
    ],
    takeaways: [
      'Stash tồn tại vì worktree dùng chung cho mọi nhánh.',
      'Stash là một commit ẩn, nên nó cứu được bằng fsck.',
      '`pop` bỏ mục, `apply` giữ mục.',
    ],
  },
  theoryId: '22-stash-khi-chuyen-nhanh',
  solutionCommands: [
    'git stash',
    'git switch hotfix',
    'git write hotfix.js -c "da-va"',
    'git add hotfix.js',
    'git commit -m "Vá lỗi gấp"',
    'git switch main',
    'git stash pop',
  ],
  altSolutionCommands: [
    'git stash push -m "dang do"',
    'git checkout hotfix',
    'git write hotfix.js -c "da-va-cach-khac"',
    'git add -A',
    'git commit -m "Vá lỗi gấp"',
    'git checkout main',
    'git stash apply',
    'git stash drop',
  ],
  par: 6,
};

export const G23: GitLevel = {
  id: 'git-23-vong-pr',
  chapter: 2,
  title: 'Vòng pull request',
  mission: 'Mở PR, nhận nhận xét, sửa theo, rồi merge.',
  brief: `
Nhánh \`tinh-nang\` của bạn đã xong và đã push. Quy trình của nhóm là mở pull
request để có người đọc trước khi vào \`main\`.

PR không phải một khái niệm của git. Nó là thứ nhà cung cấp (GitHub, GitLab)
dựng lên trên git: một chỗ để bàn về một tập commit trước khi hợp nhất.

Mở PR, đọc nhận xét của người review, sửa, rồi merge.
`.trim(),
  difficulty: 'intermediate',
  setup: {
    commits: [
      ...BASE_HISTORY,
      { id: 'f1', parents: ['c3'], message: 'Thêm tính năng tìm kiếm', changes: { 'search.js': 'tim()' } },
    ],
    branches: { main: 'c3', 'tinh-nang': 'f1' },
    head: 'tinh-nang',
    origin: { branches: { main: 'c3', 'tinh-nang': 'f1' } },
    bots: [
      {
        atLogicalTime: 2,
        author: 'Linh',
        script: ['git pr review 1 --request-changes -m "Thiếu xử lý chuỗi rỗng"'],
        announce: 'Linh đã để lại nhận xét trên PR #1: thiếu xử lý chuỗi rỗng.',
      },
    ],
  },
  allowedCommands: ['pr', 'write', 'add', 'commit', 'push', 'log', 'status', 'switch', 'checkout'],
  objectives: [
    {
      id: 'pr-da-merge',
      label: 'PR #1 đã ở trạng thái merged',
      check: 'pullRequestState',
      args: { number: 1, state: 'merged' },
      required: true,
    },
    {
      id: 'main-co-tinh-nang',
      label: 'main đã có tính năng tìm kiếm',
      check: 'commitReachable',
      args: { message: 'Thêm tính năng tìm kiếm' },
      required: true,
    },
    {
      id: 'da-sua-theo-nhan-xet',
      label: 'Có commit sửa theo nhận xét',
      check: 'commitReachable',
      args: { message: 'Xử lý chuỗi rỗng' },
      required: true,
    },
  ],
  hints: [
    '`pr open --title "..."` mở PR từ nhánh hiện tại vào main.',
    'Sau khi mở, chạy một lệnh bất kỳ để đồng hồ logic nhích và người review kịp phản hồi.',
    '`pr merge 1` hợp nhất PR sau khi đã sửa.',
  ],
  teaching: {
    primer: `
Vòng PR có bốn nhịp:

1. **Mở** — chọn nhánh nguồn và nhánh đích, đặt tiêu đề.
2. **Review** — người khác đọc và để lại nhận xét, có thể yêu cầu sửa.
3. **Sửa** — bạn commit thêm vào **cùng nhánh** và push; PR tự cập nhật.
4. **Merge** — hợp nhất, thường kèm xoá nhánh nguồn.

Điểm dễ hiểu nhầm: PR theo dõi một **nhánh**, không theo dõi một tập commit cố
định. Push thêm là PR đổi nội dung, không cần mở PR mới.
`.trim(),
    cheatsheet: [
      { command: 'git pr open --title "..."', explain: 'Mở PR từ nhánh hiện tại vào main.' },
      { command: 'git pr list', explain: 'Xem các PR đang mở và trạng thái review.' },
      { command: 'git pr merge <số>', explain: 'Hợp nhất PR.' },
    ],
    takeaways: [
      'PR là lớp của nhà cung cấp, không phải khái niệm của git.',
      'PR theo dõi một nhánh, nên push thêm là cập nhật PR.',
    ],
  },
  theoryId: '23-vong-pr',
  solutionCommands: [
    'git pr open --title "Thêm tính năng tìm kiếm"',
    'git status',
    'git write search.js -c "tim() + guard chuoi rong"',
    'git add search.js',
    'git commit -m "Xử lý chuỗi rỗng"',
    'git push',
    'git pr merge 1',
  ],
  altSolutionCommands: [
    'git pr open --title "Tìm kiếm"',
    'git log',
    'git write search.js -c "tim() + kiem tra rong"',
    'git add -A',
    'git commit -m "Xử lý chuỗi rỗng"',
    'git push origin tinh-nang',
    'git pr merge 1 --squash',
  ],
  par: 6,
};

export const G24: GitLevel = {
  id: 'git-24-ba-nut-merge',
  chapter: 2,
  title: 'Ba nút merge, ba hình dạng lịch sử',
  mission: 'Hợp nhất PR bằng squash để main chỉ nhận đúng một commit.',
  brief: `
Nhánh \`tinh-nang\` có ba commit vụn: một cái làm việc, hai cái sửa lỗi chính
tả. Nhóm muốn \`main\` chỉ thấy **một** commit sạch.

Ba nút merge trên PR cho ba kết quả khác nhau:

- **Merge** giữ cả ba commit và thêm một commit merge.
- **Squash** gộp ba thành một commit mới trên main.
- **Rebase** đặt cả ba lên đầu main, thẳng, không commit merge.

Dùng squash.
`.trim(),
  difficulty: 'advanced',
  setup: {
    commits: [
      ...BASE_HISTORY,
      { id: 'f1', parents: ['c3'], message: 'Thêm bộ lọc', changes: { 'filter.js': 'loc()' } },
      { id: 'f2', parents: ['f1'], message: 'typo', changes: { 'filter.js': 'loc()\n// fix' } },
      { id: 'f3', parents: ['f2'], message: 'typo nữa', changes: { 'filter.js': 'loc()\n// fix\n// fix2' } },
    ],
    branches: { main: 'c3', 'tinh-nang': 'f3' },
    head: 'tinh-nang',
    origin: { branches: { main: 'c3', 'tinh-nang': 'f3' } },
  },
  allowedCommands: ['pr', 'log', 'status', 'switch', 'checkout', 'branch', 'fetch', 'pull'],
  objectives: [
    {
      id: 'pr-merged',
      label: 'PR #1 đã merged',
      check: 'pullRequestState',
      args: { number: 1, state: 'merged' },
      required: true,
    },
    {
      // ⚠ `pr merge` trộn ở ORIGIN; kho local không đổi cho tới khi người chơi
      // `pull`. Đo `commitCount` trên `main` local sẽ luôn đỏ dù lệnh chạy
      // đúng — AC-8 bắt được đúng chỗ này.
      id: 'main-o-origin-co-bo-loc',
      label: 'main ở origin đã nhận bộ lọc, gộp thành một commit',
      check: 'originRefPointsAtMessage',
      args: { ref: 'main', message: 'Thêm bộ lọc (#1)' },
      required: true,
    },
    {
      id: 'commit-vun-con-trong-kho',
      label: 'Ba commit vụn vẫn còn trong kho',
      check: 'commitInStore',
      args: { message: 'typo' },
      required: true,
    },
  ],
  hints: [
    '`pr open` trước, rồi chọn kiểu merge.',
    '`pr merge 1 --squash` gộp toàn bộ nhánh thành một commit trên main.',
  ],
  teaching: {
    primer: `
\`\`\`
merge:   main ── M          (M có 2 cha, ba commit vụn hiện trong lịch sử)
squash:  main ── S          (S là một commit mới, ba commit vụn KHÔNG vào main)
rebase:  main ── f1'─f2'─f3'  (ba commit, Oid mới, thẳng)
\`\`\`

Chọn cái nào là quyết định của nhóm, không có cái đúng tuyệt đối:

- **merge** giữ đúng lịch sử đã xảy ra, đổi lại đồ thị rậm.
- **squash** cho \`main\` sạch, đổi lại mất chi tiết từng bước.
- **rebase** giữ từng bước và vẫn thẳng, đổi lại Oid đổi nên PR và commit không
  còn khớp nhau.

Sau squash, ba commit gốc vẫn nằm trong kho của nhánh nguồn. Xoá nhánh là chúng
mất người trỏ tới.
`.trim(),
    cheatsheet: [
      { command: 'git pr merge <số>', explain: 'Merge thường, tạo commit hai cha.' },
      { command: 'git pr merge <số> --squash', explain: 'Gộp cả nhánh thành một commit.' },
      { command: 'git pr merge <số> --rebase', explain: 'Đặt từng commit lên đầu main, thẳng.' },
    ],
    takeaways: [
      'Ba nút merge cho ba hình dạng lịch sử khác nhau.',
      'squash cho main sạch nhưng mất chi tiết từng bước.',
      'Commit gốc không mất, chúng chỉ ở lại nhánh nguồn.',
    ],
  },
  theoryId: '24-ba-nut-merge',
  solutionCommands: ['git pr open --title "Thêm bộ lọc"', 'git pr merge 1 --squash'],
  altSolutionCommands: [
    // ⚠ Tiêu đề PR phải GIỐNG lời giải thứ nhất: `pr merge --squash` đặt lời
    // nhắn là `"<tiêu đề> (#<số>)"`, nên đổi tiêu đề là đổi trạng thái đích.
    // AC-9 bắt được đúng chỗ này khi hai lời giải dùng hai tiêu đề khác nhau.
    'git pr open --title "Thêm bộ lọc"',
    'git pr list',
    'git pr merge 1 --squash',
  ],
  par: 2,
};
