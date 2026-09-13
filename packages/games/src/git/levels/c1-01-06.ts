/**
 * Chương 1 — Nắn lịch sử, level G01–G06.
 *
 * Một kho, không `origin`. Bản đồ chủ đề: design doc §3.4.
 *
 * ⛔ Mỗi level phải có `solutionCommands` VÀ `altSolutionCommands` chạy được và
 * khác đường đi. Ô nghiệm thu AC-8 chạy lời giải thứ nhất cho cả 32 level;
 * AC-9 chạy lời giải thứ hai. Không có chúng thì "level qua được" là một lời
 * khai, không phải một phép đo.
 *
 * ⛔ Hai lời giải phải khác THẬT, không chỉ đảo thứ tự hai lệnh độc lập. Đảo thứ
 * tự chứng minh được đúng con số không: nó không phân biệt nổi bộ chấm theo
 * trạng thái với bộ chấm theo mẫu lệnh, mà đó là cả lý do AC-9 tồn tại.
 */

import type { GitLevel } from '../contract.ts';

export const G01: GitLevel = {
  id: 'git-01-commit-la-object',
  chapter: 1,
  title: 'Commit là một object bất biến',
  mission: 'Tạo commit đầu tiên cho file ghi-chu.md.',
  brief: `
Kho này vừa được \`git init\`. Có một file \`ghi-chu.md\` nằm trong worktree mà
git chưa biết tới.

Một commit không phải "bản lưu". Nó là một **object** được đặt tên bằng chính
băm nội dung của nó: đổi một ký tự là ra một tên khác hẳn, và tên cũ vẫn trỏ
tới nội dung cũ. Đó là thứ làm git không bao giờ mất dữ liệu một cách âm thầm.

Đưa file vào vùng staging rồi tạo commit.
`.trim(),
  difficulty: 'basic',
  setup: {
    worktree: {
      'ghi-chu.md': 'Ngày đầu học git.\nChưa biết gì cả.',
    },
  },
  allowedCommands: ['init', 'add', 'commit', 'status', 'log'],
  objectives: [
    {
      id: 'co-commit',
      label: 'Nhánh main trỏ vào một commit',
      check: 'refExists',
      args: { ref: 'main' },
      required: true,
    },
    {
      id: 'file-trong-commit',
      label: 'ghi-chu.md nằm trong commit đó',
      check: 'pathStaged',
      args: { path: 'ghi-chu.md' },
      required: true,
    },
    {
      id: 'khong-con-gi-cho',
      label: 'Không còn gì đang chờ commit',
      check: 'indexClean',
      required: true,
    },
  ],
  hints: [
    'git chưa theo dõi file nào. `git status` sẽ nói cho bạn biết nó đang thấy gì.',
    '`git add <file>` đưa file vào vùng staging.',
    '`git commit -m "lời nhắn"` đóng vùng staging lại thành một commit.',
  ],
  teaching: {
    primer: `
Ba lệnh, ba việc khác nhau:

- \`git status\` hỏi git đang thấy gì. Không đổi gì cả.
- \`git add\` chép nội dung file vào **vùng staging** (index).
- \`git commit\` đóng vùng staging thành một object commit.

Tên của commit (\`Oid\`) tính từ nội dung: cùng cây, cùng cha, cùng lời nhắn,
cùng thời điểm logic thì ra cùng một tên. Đổi bất cứ thứ gì là tên đổi.
`.trim(),
    cheatsheet: [
      { command: 'git status', explain: 'Xem git đang thấy gì ở ba vùng.' },
      { command: 'git add <file>', explain: 'Đưa nội dung file vào vùng staging.' },
      { command: 'git commit -m "..."', explain: 'Đóng vùng staging thành một commit.' },
    ],
    takeaways: [
      'Commit là object bất biến, tên của nó là băm nội dung.',
      '`add` và `commit` là hai việc khác nhau, không phải một việc chia hai bước cho vui.',
      'Cùng nội dung luôn ra cùng Oid, nên không có hai commit "giống nhau nhưng khác nhau".',
    ],
    pitfalls: [
      '`git commit` khi chưa `add` gì sẽ báo không có gì để commit. Nó không tự lấy file trong worktree, và đó là chủ ý: bạn chọn cái gì vào commit, không phải git chọn hộ.',
    ],
  },
  theoryId: '01-commit-la-object',
  solutionCommands: ['git add ghi-chu.md', 'git commit -m "Ghi chú đầu tiên"'],
  altSolutionCommands: ['git add -A', 'git commit -m "Bắt đầu"'],
  par: 2,
};

export const G02: GitLevel = {
  id: 'git-02-ba-vung',
  chapter: 1,
  title: 'Ba vùng: worktree, index, HEAD',
  mission: 'Chỉ đưa sửa đổi của doc.md vào commit, giữ nguyên tmp.log.',
  brief: `
Kho đã có một commit. Bạn vừa sửa hai file: \`doc.md\` là việc thật, \`tmp.log\`
là file rác sinh ra lúc chạy thử.

git giữ **ba vùng khác nhau** cho cùng một file: worktree (cái bạn đang sửa),
index (cái sắp vào commit), và HEAD (cái đã commit). Ba vùng này độc lập, và
chính sự độc lập đó cho bạn chọn được đưa gì vào lịch sử.

Commit sửa đổi của \`doc.md\`, để \`tmp.log\` nguyên trạng ngoài lịch sử.
`.trim(),
  difficulty: 'basic',
  setup: {
    commits: [
      {
        id: 'c1',
        message: 'Bản nháp đầu',
        changes: { 'doc.md': 'Chương 1\n\nChưa viết gì.' },
      },
    ],
    branches: { main: 'c1' },
    worktree: {
      'doc.md': 'Chương 1\n\nĐã viết xong phần mở đầu.',
      'tmp.log': 'DEBUG: 42\nDEBUG: 43',
    },
  },
  allowedCommands: ['add', 'commit', 'status', 'diff', 'log', 'reset'],
  objectives: [
    {
      id: 'doc-da-commit',
      label: 'Bản mới của doc.md đã nằm trong commit',
      check: 'refPointsAtMessage',
      args: { ref: 'main', message: 'Viết xong phần mở đầu' },
      required: false,
    },
    {
      id: 'hai-commit',
      label: 'Lịch sử có đúng 2 commit',
      check: 'commitCount',
      args: { ref: 'main', count: 2 },
      required: true,
    },
    {
      id: 'tmp-con-ngoai',
      label: 'tmp.log vẫn nằm ngoài lịch sử, chưa được track',
      check: 'worktreeFileExists',
      args: { path: 'tmp.log', present: true },
      required: true,
    },
    {
      id: 'tmp-khong-staged',
      label: 'tmp.log không nằm trong vùng staging',
      check: 'indexClean',
      required: true,
    },
  ],
  hints: [
    '`git status` hiện hai cột riêng: "đã staged" và "chưa staged". Đọc kỹ cột nào là cột nào.',
    '`git add` nhận tên file cụ thể, không bắt buộc phải `add` tất cả.',
    'Nếu lỡ `add` cả hai thì `git reset tmp.log` gỡ riêng file đó khỏi vùng staging.',
  ],
  teaching: {
    primer: `
\`\`\`
worktree  →  index  →  HEAD
 (đang sửa)  (sắp vào)  (đã xong)
\`\`\`

\`git add\` đẩy từ trái sang giữa. \`git commit\` đẩy từ giữa sang phải.

Điều khiến người học lạc: \`git status\` nói về **hai khoảng cách** cùng lúc.
"Changes to be committed" là index so với HEAD. "Changes not staged" là worktree
so với index. Cùng một file có thể xuất hiện ở cả hai dòng, và điều đó hoàn toàn
hợp lệ: bạn đã \`add\` một bản, rồi sửa tiếp.
`.trim(),
    cheatsheet: [
      { command: 'git status', explain: 'Hai cột, hai khoảng cách khác nhau.' },
      { command: 'git diff', explain: 'worktree so với index: cái sẽ KHÔNG vào commit tới.' },
      { command: 'git diff --staged', explain: 'index so với HEAD: cái SẼ vào commit tới.' },
      { command: 'git reset <file>', explain: 'Gỡ một file khỏi vùng staging, không đụng worktree.' },
    ],
    takeaways: [
      'Ba vùng là ba nơi khác nhau, không phải ba cách gọi một nơi.',
      '`git diff` và `git diff --staged` trả lời hai câu hỏi khác nhau.',
      'Bạn chọn cái gì vào lịch sử. Đó là công dụng của index, không phải thủ tục thừa.',
    ],
    pitfalls: [
      '`git add .` tiện nhưng nó nuốt cả file rác. Nhiều kho có file build, file log, file secret bị commit nhầm đúng theo cách này.',
    ],
  },
  theoryId: '02-ba-vung',
  solutionCommands: ['git add doc.md', 'git commit -m "Viết xong phần mở đầu"'],
  altSolutionCommands: [
    'git add -A',
    'git reset tmp.log',
    'git commit -m "Viết xong phần mở đầu"',
  ],
  par: 2,
};

export const G03: GitLevel = {
  id: 'git-03-add-khong-phai-tao-file',
  chapter: 1,
  title: '`add` không phải "tạo file"',
  mission: 'Commit sửa đổi của một file đã có sẵn từ trước.',
  brief: `
\`cau-hinh.yml\` đã nằm trong lịch sử từ commit đầu. Bạn vừa sửa nó.

Nhiều người học đọc \`git add\` là "thêm file vào kho" và nghĩ nó chỉ dùng cho
file mới. Sai lầm đó làm họ bí ngay lần sửa thứ hai: file đã có rồi, "thêm" cái
gì nữa?

\`add\` không thêm file. Nó **chép nội dung hiện tại vào vùng staging** — và
việc đó cần làm lại sau mỗi lần sửa, dù file cũ hay mới.
`.trim(),
  difficulty: 'basic',
  setup: {
    commits: [
      {
        id: 'c1',
        message: 'Cấu hình ban đầu',
        changes: { 'cau-hinh.yml': 'port: 8080\ndebug: false' },
      },
    ],
    branches: { main: 'c1' },
    worktree: { 'cau-hinh.yml': 'port: 9090\ndebug: true' },
  },
  allowedCommands: ['add', 'commit', 'status', 'diff', 'log'],
  objectives: [
    {
      id: 'da-commit',
      label: 'Bản sửa của cau-hinh.yml đã vào lịch sử',
      check: 'commitCount',
      args: { ref: 'main', count: 2 },
      required: true,
    },
    {
      id: 'sach',
      label: 'Không còn sửa đổi nào đang chờ',
      check: 'worktreeClean',
      required: true,
    },
    {
      id: 'noi-dung-dung',
      label: 'File trong worktree giữ đúng nội dung mới',
      check: 'worktreeFileEquals',
      args: { path: 'cau-hinh.yml', lines: ['port: 9090', 'debug: true'] },
      required: true,
    },
  ],
  hints: [
    'File này đã được track từ trước. `git status` xếp nó vào nhóm nào?',
    '`add` chép nội dung HIỆN TẠI vào staging. File cũ hay mới không quan trọng.',
  ],
  teaching: {
    primer: `
Tên lệnh \`add\` gây hiểu nhầm, và bạn không phải người đầu tiên vấp.

Nó làm đúng một việc: **chụp nội dung file lúc này và đặt vào index**. Với file
chưa track thì đó cũng là lúc git bắt đầu theo dõi nó, nên nghe giống "thêm
file". Với file đã track thì nó chỉ là cập nhật bản chụp.

Hệ quả thực dụng: sửa file sau khi đã \`add\` thì phải \`add\` lại, nếu không
bản cũ mới là bản vào commit.
`.trim(),
    cheatsheet: [
      { command: 'git add <file>', explain: 'Chụp nội dung hiện tại vào index, file cũ hay mới đều vậy.' },
      { command: 'git diff', explain: 'Xem phần đã sửa mà CHƯA add.' },
    ],
    takeaways: [
      '`add` là "chụp lại", không phải "thêm vào".',
      'Sửa tiếp sau khi add thì phải add lại.',
    ],
    pitfalls: [
      'Sửa file → `add` → sửa tiếp → `commit`. Commit sẽ chứa bản GIỮA, không phải bản cuối. `git diff` sau khi add sẽ nói cho bạn biết điều đó, nếu bạn nhìn.',
    ],
  },
  theoryId: '03-add-khong-phai-tao-file',
  solutionCommands: ['git add cau-hinh.yml', 'git commit -m "Đổi port và bật debug"'],
  altSolutionCommands: ['git add .', 'git commit -m "Cập nhật cấu hình"'],
  par: 2,
};

export const G04: GitLevel = {
  id: 'git-04-nhanh-la-con-tro',
  chapter: 1,
  title: 'Nhánh là con trỏ, không phải thư mục',
  mission: 'Tạo nhánh tinh-nang trỏ cùng chỗ với main, rồi chuyển sang nó.',
  brief: `
Kho có ba commit trên \`main\`.

Khảo sát 26 sinh viên (Isomöttönen & Cochez, ICTERI 2014) ghi nhận một nhầm lẫn
lặp đi lặp lại: người học tưởng **nhánh là thư mục** và gõ \`cd feature\` để
"vào nhánh". Không có thư mục nào cả.

Một nhánh là một **con trỏ 41 byte** vào một commit. Tạo nhánh không sao chép gì
hết: hai nhánh trỏ cùng một commit là chuyện hoàn toàn bình thường.

Tạo \`tinh-nang\` và chuyển sang nó. Quan sát: không file nào đổi.
`.trim(),
  difficulty: 'basic',
  setup: {
    commits: [
      { id: 'c1', message: 'Khởi tạo', changes: { 'app.js': 'console.log(1)' } },
      { id: 'c2', parents: ['c1'], message: 'Thêm hàm chào', changes: { 'app.js': 'console.log(1)\nfunction chao() {}' } },
      { id: 'c3', parents: ['c2'], message: 'Sửa lỗi chính tả', changes: { 'doc.md': 'Tài liệu' } },
    ],
    branches: { main: 'c3' },
  },
  allowedCommands: ['branch', 'switch', 'checkout', 'status', 'log'],
  objectives: [
    {
      id: 'co-nhanh',
      label: 'Nhánh tinh-nang tồn tại',
      check: 'refExists',
      args: { ref: 'tinh-nang' },
      required: true,
    },
    {
      id: 'cung-cho',
      label: 'tinh-nang và main trỏ cùng một commit',
      check: 'refsEqual',
      args: { a: 'tinh-nang', b: 'main' },
      required: true,
    },
    {
      id: 'dang-o-do',
      label: 'HEAD đang bám vào tinh-nang',
      check: 'refsEqual',
      args: { a: 'HEAD', b: 'tinh-nang' },
      required: true,
    },
    {
      id: 'khong-detached',
      label: 'HEAD không ở trạng thái detached',
      check: 'headDetached',
      args: { detached: false },
      required: true,
    },
  ],
  hints: [
    '`git branch <tên>` tạo con trỏ mới tại chỗ HEAD đang đứng.',
    '`git switch <tên>` chuyển HEAD sang bám vào con trỏ đó.',
    '`git switch -c <tên>` làm cả hai việc trong một lệnh.',
  ],
  teaching: {
    primer: `
Một nhánh trong git là một file chứa đúng một dòng: tên của một commit.

\`\`\`
refs/heads/main       →  a3f1c9...
refs/heads/tinh-nang  →  a3f1c9...     ← cùng chỗ, không sao chép gì
\`\`\`

Tạo nhánh là ghi thêm một dòng. Xoá nhánh là xoá một dòng. Cả hai đều không
chạm vào commit nào.

HEAD là con trỏ tới **con trỏ**: nó nói bạn đang đứng trên nhánh nào. Chuyển
nhánh là đổi chỗ HEAD bám, rồi cập nhật worktree cho khớp commit mới.
`.trim(),
    cheatsheet: [
      { command: 'git branch', explain: 'Liệt kê nhánh, dấu * là nhánh hiện tại.' },
      { command: 'git branch <tên>', explain: 'Tạo con trỏ mới tại HEAD, KHÔNG chuyển sang.' },
      { command: 'git switch <tên>', explain: 'Chuyển HEAD sang bám nhánh đó.' },
      { command: 'git switch -c <tên>', explain: 'Tạo rồi chuyển, một lệnh.' },
    ],
    takeaways: [
      'Nhánh là con trỏ tới một commit, không phải bản sao thư mục.',
      'Tạo nhánh rẻ đến mức không đáng cân nhắc, vì nó không sao chép gì.',
      'HEAD nói bạn đang đứng ở đâu; nhánh nói commit nào là mới nhất của mạch đó.',
    ],
    proTips: [
      'Không có `cd` nào cả. Chuyển nhánh là `git switch`, và nó đổi nội dung thư mục hiện tại tại chỗ.',
    ],
  },
  theoryId: '04-nhanh-la-con-tro',
  solutionCommands: ['git branch tinh-nang', 'git switch tinh-nang'],
  altSolutionCommands: ['git switch -c tinh-nang'],
  par: 2,
};

export const G05: GitLevel = {
  id: 'git-05-head-va-detached',
  chapter: 1,
  title: 'HEAD và detached HEAD',
  mission: 'Đứng thẳng lên một commit cũ, không qua nhánh nào.',
  brief: `
HEAD thường bám vào một nhánh. Nhưng nó cũng trỏ thẳng vào một commit được, và
lúc đó git gọi là **detached HEAD**.

Trạng thái này không hỏng. Nó chỉ có nghĩa "bạn đang xem một điểm trong lịch sử,
không đứng trên mạch phát triển nào". Commit tạo ra lúc detached sẽ không có
nhánh nào trỏ tới, và đó là chỗ người ta hay mất việc.

Chuyển HEAD tới commit "Thêm hàm chào" bằng chính tên của nó.
`.trim(),
  difficulty: 'basic',
  setup: {
    commits: [
      { id: 'c1', message: 'Khởi tạo', changes: { 'app.js': 'let a = 1' } },
      { id: 'c2', parents: ['c1'], message: 'Thêm hàm chào', changes: { 'app.js': 'let a = 1\nfunction chao() {}' } },
      { id: 'c3', parents: ['c2'], message: 'Thêm test', changes: { 'test.js': 'test()' } },
    ],
    branches: { main: 'c3' },
  },
  allowedCommands: ['checkout', 'switch', 'log', 'status', 'branch'],
  objectives: [
    {
      id: 'detached',
      label: 'HEAD đang ở trạng thái detached',
      check: 'headDetached',
      args: { detached: true },
      required: true,
    },
    {
      id: 'dung-commit',
      label: 'HEAD trỏ vào commit "Thêm hàm chào"',
      check: 'refPointsAtMessage',
      args: { ref: 'HEAD', message: 'Thêm hàm chào' },
      required: true,
    },
    {
      id: 'main-nguyen',
      label: 'main không bị dịch chỗ',
      check: 'refPointsAtMessage',
      args: { ref: 'main', message: 'Thêm test' },
      required: true,
    },
  ],
  hints: [
    '`git log` cho bạn tên (Oid) của từng commit. Bảy ký tự đầu là đủ.',
    '`git checkout <oid>` trỏ HEAD thẳng vào commit đó.',
    '`git switch --detach <oid>` là cách viết rõ nghĩa hơn cho cùng việc.',
  ],
  teaching: {
    primer: `
Hai trạng thái của HEAD:

\`\`\`
bám nhánh:   HEAD → refs/heads/main → commit
detached:    HEAD → commit
\`\`\`

Khi bám nhánh, \`git commit\` đẩy cả nhánh tiến lên. Khi detached, commit mới
chỉ có HEAD trỏ tới, và chuyển đi chỗ khác là không còn gì trỏ tới nó nữa.

git cảnh báo khi bạn vào detached, và lời cảnh báo đó không phải báo lỗi. Nó là
một lời nhắc: tạo commit ở đây thì nhớ tạo nhánh trước khi rời đi.
`.trim(),
    cheatsheet: [
      { command: 'git log --oneline', explain: 'Xem Oid rút gọn của từng commit.' },
      { command: 'git checkout <oid>', explain: 'Trỏ HEAD thẳng vào một commit.' },
      { command: 'git switch --detach <oid>', explain: 'Cùng việc, viết rõ ý định hơn.' },
      { command: 'git switch <nhánh>', explain: 'Quay lại bám một nhánh.' },
    ],
    takeaways: [
      'detached HEAD là một trạng thái hợp lệ, không phải một lỗi.',
      'Commit tạo lúc detached không có nhánh nào giữ, nên nó dễ mất.',
      'Nhánh là thứ giữ commit lại. Không nhánh thì chỉ còn reflog.',
    ],
    pitfalls: [
      'Commit khi đang detached rồi `git switch main` là cách mất việc kinh điển. Commit vẫn còn trong kho, nhưng bạn phải biết tìm nó ở đâu (bài G28 dạy chỗ đó).',
    ],
  },
  theoryId: '05-head-va-detached',
  solutionCommands: ['git checkout HEAD~1'],
  altSolutionCommands: ['git switch --detach main~1'],
  par: 1,
};

export const G06: GitLevel = {
  id: 'git-06-tham-chieu-tuong-doi',
  chapter: 1,
  title: 'Tham chiếu tương đối: `~` và `^`',
  mission: 'Đưa nhánh cu về commit ông của main mà không gõ Oid nào.',
  brief: `
Gõ Oid rất phiền và rất dễ nhầm. git cho bạn nói "lùi n bước" thay vì nói tên.

- \`main~3\` là lùi **3 bước theo cha thứ nhất**.
- \`main^\` là cha thứ nhất, \`main^2\` là cha **thứ hai** (chỉ commit merge mới có).

Hai ký hiệu này hay bị nhầm lẫn với nhau. \`~\` đi thẳng một mạch, \`^\` chọn
ngả rẽ.

Tạo nhánh \`cu\` trỏ vào commit cách \`main\` hai bước.
`.trim(),
  difficulty: 'basic',
  setup: {
    commits: [
      { id: 'c1', message: 'Một', changes: { 'a.txt': '1' } },
      { id: 'c2', parents: ['c1'], message: 'Hai', changes: { 'a.txt': '2' } },
      { id: 'c3', parents: ['c2'], message: 'Ba', changes: { 'a.txt': '3' } },
      { id: 'c4', parents: ['c3'], message: 'Bốn', changes: { 'a.txt': '4' } },
    ],
    branches: { main: 'c4' },
  },
  allowedCommands: ['branch', 'switch', 'checkout', 'log', 'status', 'reset'],
  objectives: [
    {
      id: 'co-cu',
      label: 'Nhánh cu tồn tại',
      check: 'refExists',
      args: { ref: 'cu' },
      required: true,
    },
    {
      id: 'dung-cho',
      label: 'cu trỏ vào commit "Hai"',
      check: 'refPointsAtMessage',
      args: { ref: 'cu', message: 'Hai' },
      required: true,
    },
    {
      id: 'main-nguyen',
      label: 'main vẫn ở commit "Bốn"',
      check: 'refPointsAtMessage',
      args: { ref: 'main', message: 'Bốn' },
      required: true,
    },
  ],
  hints: [
    'Đếm ngược từ main: "Bốn" là main, "Ba" là main~1, vậy "Hai" là gì?',
    '`git branch <tên> <điểm bắt đầu>` tạo nhánh tại một chỗ khác HEAD.',
  ],
  teaching: {
    primer: `
\`\`\`
c1 ← c2 ← c3 ← c4 ← main
      ↑          ↑
   main~2      main
\`\`\`

\`~n\` lùi n bước, mỗi bước đi theo **cha thứ nhất**. Với lịch sử tuyến tính thì
đó là cách duy nhất đi, nên \`~\` luôn cho kết quả bạn đoán được.

\`^n\` chọn **cha thứ n của một commit**. \`HEAD^\` và \`HEAD~1\` cho cùng kết
quả. Khác nhau chỉ lộ ở commit merge: \`HEAD^2\` đi sang nhánh được trộn vào,
còn \`HEAD~2\` vẫn đi thẳng theo mạch chính.

Nối được: \`main~2^2\` là "lùi hai bước, rồi rẽ sang cha thứ hai".
`.trim(),
    cheatsheet: [
      { command: 'git log --oneline', explain: 'Nhìn thấy mạch để đếm bước.' },
      { command: 'git branch <tên> <ref>', explain: 'Tạo nhánh tại một điểm chỉ định.' },
      { command: 'HEAD~2', explain: 'Lùi 2 bước theo cha thứ nhất.' },
      { command: 'HEAD^2', explain: 'Cha thứ hai. Chỉ commit merge mới có.' },
    ],
    takeaways: [
      '`~` đi thẳng, `^` chọn ngả rẽ.',
      'Trên lịch sử tuyến tính, `HEAD^` và `HEAD~1` là một.',
      'Ký hiệu tương đối dùng được ở mọi chỗ nhận một ref.',
    ],
  },
  theoryId: '06-tham-chieu-tuong-doi',
  solutionCommands: ['git branch cu main~2'],
  altSolutionCommands: ['git branch cu HEAD^^'],
  par: 1,
};
