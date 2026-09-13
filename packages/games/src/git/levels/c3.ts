/**
 * Chương 3 — Cứu hộ, level G25–G32.
 *
 * Cả chương sống trên một bất biến duy nhất: **`ObjectStore` không bao giờ xoá
 * phần tử trong một phiên chơi.** "Mất commit rồi cứu" chỉ có nghĩa nếu commit
 * VẪN nằm trong kho sau khi không ref nào trỏ tới, tức là *lưu trữ* tách khỏi
 * *reachability*.
 *
 * Learn Git Branching không thể có chương này: mô hình cây thuần của nó xoá
 * node khi ref cuối rời đi, nên không còn gì để tra. Đo được: 0/71 file `src/js`
 * nhắc `reflog`.
 *
 * ⛔ Vị từ `commitUnreachable` đòi commit **CÓ trong kho** mà **không** với tới
 * được. Một commit chưa bao giờ tồn tại cũng "không với tới được", và nếu vị từ
 * tính nó là đạt thì mọi bài chương này qua được bằng cách không làm gì cả.
 */

import type { GitLevel } from '../contract.ts';

export const G25: GitLevel = {
  id: 'git-25-reflog-nhat-ky-dich-chuyen',
  chapter: 3,
  title: 'reflog là nhật ký dịch chuyển',
  mission: 'Tìm lại commit mà HEAD từng đứng trên, sau ba lần chuyển nhánh.',
  brief: `
Bạn đã chuyển nhánh vài lần và giờ không nhớ commit cũ nằm đâu.

\`git log\` chỉ cho bạn thấy lịch sử **từ chỗ đang đứng nhìn về**. Nó không biết
gì về những chỗ bạn đã từng đứng.

\`git reflog\` biết. Nó là nhật ký mọi lần HEAD (và từng ref) dịch chỗ: commit,
checkout, reset, merge, rebase. Đây là công cụ cứu hộ cơ bản nhất của git, và
cũng là công cụ ít người biết nhất.

Tạo nhánh \`tim-lai\` trỏ vào commit "Bản thử nghiệm" mà không dùng \`git log\`.
`.trim(),
  difficulty: 'intermediate',
  setup: {
    commits: [
      { id: 'c1', message: 'Nền', changes: { 'a.js': 'v1' } },
      { id: 'c2', parents: ['c1'], message: 'Bản thử nghiệm', changes: { 'a.js': 'v1\nthu()' } },
      { id: 'c3', parents: ['c1'], message: 'Hướng khác', changes: { 'b.js': 'khac()' } },
    ],
    branches: { main: 'c3' },
    // `thu-nghiem` CỐ Ý không tồn tại: c2 chỉ còn dấu vết trong reflog sau khi
    // level dựng xong. Xem bots bên dưới — không có bot, nên reflog rỗng lúc
    // bắt đầu và người chơi phải TỰ tạo dấu vết bằng cách ghé qua c2.
  },
  allowedCommands: ['reflog', 'checkout', 'switch', 'branch', 'log', 'status'],
  objectives: [
    {
      id: 'co-nhanh',
      label: 'Nhánh tim-lai tồn tại',
      check: 'refExists',
      args: { ref: 'tim-lai' },
      required: true,
    },
    {
      id: 'dung-commit',
      label: 'tim-lai trỏ vào "Bản thử nghiệm"',
      check: 'refPointsAtMessage',
      args: { ref: 'tim-lai', message: 'Bản thử nghiệm' },
      required: true,
    },
    {
      id: 'main-nguyen',
      label: 'main không bị dịch',
      check: 'refPointsAtMessage',
      args: { ref: 'main', message: 'Hướng khác' },
      required: true,
    },
  ],
  hints: [
    'Commit "Bản thử nghiệm" không nằm trên mạch của main, nên `git log` không thấy nó.',
    'Ghé qua nó một lần (`git checkout`) rồi `git reflog` sẽ có dấu vết.',
    '`git branch <tên> HEAD@{1}` tạo nhánh tại chỗ HEAD đứng một bước trước.',
  ],
  teaching: {
    primer: `
\`git reflog\` in ra dạng:

\`\`\`
a3f1c9 HEAD@{0}: checkout: moving from main to a3f1c9
7b2e10 HEAD@{1}: commit: Hướng khác
c8d4e2 HEAD@{2}: checkout: moving from thu-nghiem to main
\`\`\`

\`HEAD@{n}\` là "chỗ HEAD đứng n bước trước", và nó dùng được ở mọi chỗ nhận một
ref: \`git branch cuu HEAD@{3}\`, \`git reset --hard HEAD@{1}\`.

Khác biệt căn bản với \`git log\`:

- \`log\` đi theo **cha** của commit hiện tại. Nó kể lịch sử của dự án.
- \`reflog\` đi theo **thời gian** bạn thao tác. Nó kể lịch sử của bạn.

reflog là cục bộ. Nó không được push, không ai khác thấy, và nó chỉ có những gì
xảy ra trên máy này.
`.trim(),
    cheatsheet: [
      { command: 'git reflog', explain: 'Nhật ký dịch chuyển của HEAD.' },
      { command: 'git reflog <nhánh>', explain: 'Nhật ký của riêng một nhánh.' },
      { command: 'HEAD@{2}', explain: 'Chỗ HEAD đứng hai bước trước.' },
      { command: 'git branch <tên> HEAD@{2}', explain: 'Cắm một nhánh vào chỗ cũ.' },
    ],
    takeaways: [
      'reflog kể lịch sử THAO TÁC, log kể lịch sử DỰ ÁN.',
      '`HEAD@{n}` dùng được ở mọi chỗ nhận một ref.',
      'reflog là cục bộ và không được push đi đâu.',
    ],
  },
  theoryId: '25-reflog-nhat-ky-dich-chuyen',
  solutionCommands: [
    'git checkout main^',
    'git switch main',
    'git branch tim-lai HEAD@{1}',
  ],
  altSolutionCommands: ['git branch tim-lai main^'],
  par: 3,
};

export const G26: GitLevel = {
  id: 'git-26-cuu-sau-reset-hard',
  chapter: 3,
  title: 'Cứu sau `reset --hard` nhầm',
  mission: 'Đưa main về lại chỗ trước khi bạn reset nhầm ba commit.',
  brief: `
Bạn vừa gõ \`git reset --hard HEAD~3\` với ý định lùi một bước. Ba commit vừa
rời khỏi mạch.

Chúng **không bị xoá**. Không ref nào trỏ tới chúng nữa, vậy thôi. Kho object
vẫn giữ nguyên, và reflog vẫn nhớ HEAD từng ở đâu.

Đưa \`main\` về lại chỗ cũ.
`.trim(),
  difficulty: 'intermediate',
  setup: {
    commits: [
      { id: 'c1', message: 'Nền', changes: { 'a.js': 'v1' } },
      { id: 'c2', parents: ['c1'], message: 'Thêm tính năng A', changes: { 'a.js': 'v1\nA()' } },
      { id: 'c3', parents: ['c2'], message: 'Thêm tính năng B', changes: { 'b.js': 'B()' } },
      { id: 'c4', parents: ['c3'], message: 'Thêm tính năng C', changes: { 'c.js': 'C()' } },
    ],
    branches: { main: 'c4' },
  },
  allowedCommands: ['reset', 'reflog', 'branch', 'checkout', 'switch', 'log', 'status', 'fsck'],
  objectives: [
    {
      id: 've-cho-cu',
      label: 'main trỏ lại commit "Thêm tính năng C"',
      check: 'refPointsAtMessage',
      args: { ref: 'main', message: 'Thêm tính năng C' },
      required: true,
    },
    {
      id: 'file-ve',
      label: 'Cả ba file đã trở lại worktree',
      check: 'worktreeFileExists',
      args: { path: 'c.js', present: true },
      required: true,
    },
    {
      id: 'day-du',
      label: 'Lịch sử đủ 4 commit',
      check: 'commitCount',
      args: { ref: 'main', count: 4 },
      required: true,
    },
  ],
  hints: [
    'Trước hết hãy tự gây ra sự cố: `git reset --hard HEAD~3`.',
    '`git reflog` cho bạn thấy chỗ HEAD đứng ngay TRƯỚC lệnh reset.',
    '`git reset --hard HEAD@{1}` đưa mọi thứ về đó.',
  ],
  teaching: {
    primer: `
\`reset --hard\` dời con trỏ và đặt lại cả index lẫn worktree. Commit bị bỏ lại
thì sao?

\`\`\`
trước:  c1 ── c2 ── c3 ── c4 ← main
sau:    c1 ← main
              c2 ── c3 ── c4   ← còn trong kho, không ai trỏ tới
\`\`\`

Chúng nằm trong \`objects\` cho tới khi git dọn rác (mặc định 30 ngày với commit
không với tới được). Trong khoảng đó, reflog là bản đồ đưa bạn về.

Đây là lý do \`--hard\` đáng sợ nhưng **không phải không cứu được**. Thứ thật
sự không cứu được là phần sửa **chưa bao giờ được commit** — reflog chỉ ghi lại
những chỗ HEAD đã đứng, mà HEAD chỉ đứng ở commit.
`.trim(),
    cheatsheet: [
      { command: 'git reflog', explain: 'Tìm chỗ HEAD đứng trước lệnh hỏng.' },
      { command: 'git reset --hard HEAD@{1}', explain: 'Quay lại chỗ ngay trước đó.' },
      { command: 'git branch cuu <oid>', explain: 'Cắm nhánh vào commit tìm được, an toàn hơn reset.' },
    ],
    takeaways: [
      '`reset --hard` không xoá commit, nó chỉ bỏ lại chúng.',
      'reflog là bản đồ về, và nó luôn có sẵn.',
      'Thứ không cứu được là phần chưa bao giờ commit.',
    ],
    proTips: [
      'Trước một thao tác đáng ngờ, `git branch backup` mất một giây và cho bạn một đường về không cần reflog.',
    ],
  },
  theoryId: '26-cuu-sau-reset-hard',
  solutionCommands: ['git reset --hard HEAD~3', 'git reset --hard HEAD@{1}'],
  altSolutionCommands: [
    'git reset --hard HEAD~3',
    'git branch cuu HEAD@{1}',
    'git reset --hard cuu',
  ],
  par: 2,
};

export const G27: GitLevel = {
  id: 'git-27-cuu-nhanh-da-xoa',
  chapter: 3,
  title: 'Cứu một nhánh đã xoá',
  mission: 'Dựng lại nhánh tinh-nang sau khi lỡ xoá nó.',
  brief: `
Bạn xoá \`tinh-nang\` bằng \`git branch -D\` vì tưởng đã merge rồi. Chưa merge.

Xoá nhánh là xoá một con trỏ, và **cùng với nó là reflog riêng của nhánh đó**.
Đó là hành vi của git thật: \`git reflog tinh-nang\` sau khi xoá sẽ không còn gì.

Nhưng reflog của **HEAD** thì còn nguyên. HEAD đã từng trỏ vào commit đầu nhánh
lúc bạn còn đứng trên đó, và dòng ấy không mất.

Dựng lại nhánh.
`.trim(),
  difficulty: 'advanced',
  setup: {
    commits: [
      { id: 'c1', message: 'Nền', changes: { 'a.js': 'v1' } },
      { id: 'f1', parents: ['c1'], message: 'Tính năng chưa merge', changes: { 'f.js': 'chua-merge()' } },
    ],
    branches: { main: 'c1', 'tinh-nang': 'f1' },
    head: 'tinh-nang',
  },
  allowedCommands: ['branch', 'switch', 'checkout', 'reflog', 'log', 'status', 'fsck'],
  objectives: [
    {
      id: 'da-dung-lai',
      label: 'Nhánh tinh-nang tồn tại trở lại',
      check: 'refExists',
      args: { ref: 'tinh-nang' },
      required: true,
    },
    {
      id: 'dung-cho',
      label: 'Nó trỏ đúng commit cũ',
      check: 'refPointsAtMessage',
      args: { ref: 'tinh-nang', message: 'Tính năng chưa merge' },
      required: true,
    },
    {
      id: 'con-song',
      label: 'Commit đó nay có người trỏ tới',
      check: 'commitReachable',
      args: { message: 'Tính năng chưa merge' },
      required: true,
    },
  ],
  hints: [
    'Trước hết hãy tự gây ra sự cố: chuyển về main rồi `git branch -D tinh-nang`.',
    '`git reflog tinh-nang` nay không còn gì, vì reflog của nhánh mất theo nhánh.',
    '`git reflog` (của HEAD) vẫn ghi lần bạn rời khỏi nhánh đó. Dùng dòng ấy.',
  ],
  teaching: {
    primer: `
Xoá nhánh xoá hai thứ: con trỏ, và nhật ký riêng của con trỏ đó.

\`\`\`
git branch -D tinh-nang
  → refs/heads/tinh-nang        MẤT
  → logs/refs/heads/tinh-nang   MẤT
  → logs/HEAD                   CÒN NGUYÊN
  → object của commit           CÒN NGUYÊN
\`\`\`

Nên đường cứu không phải \`git reflog tinh-nang\` (không còn gì) mà là
\`git reflog\` của HEAD, tìm dòng \`checkout: moving from tinh-nang to main\`.
Commit ghi ở dòng đó chính là đầu nhánh lúc bạn rời đi.

Đường thứ hai khi reflog cũng không giúp: \`git fsck --lost-found\` liệt kê mọi
commit không ai trỏ tới. Chậm hơn và nhiều nhiễu hơn, nhưng nó không cần bạn đã
từng ghé qua.
`.trim(),
    cheatsheet: [
      { command: 'git branch -D <tên>', explain: 'Xoá nhánh kể cả khi chưa merge.' },
      { command: 'git reflog', explain: 'Nhật ký của HEAD, sống sót qua việc xoá nhánh.' },
      { command: 'git branch <tên> <oid>', explain: 'Cắm lại nhánh vào commit tìm được.' },
      { command: 'git fsck --lost-found', explain: 'Liệt kê commit không ai trỏ tới.' },
    ],
    takeaways: [
      'Xoá nhánh cũng xoá reflog riêng của nó.',
      'reflog của HEAD là đường cứu, vì nó ghi mọi lần bạn rời khỏi một nhánh.',
      'Commit vẫn nằm trong kho dù không ai trỏ tới.',
    ],
    pitfalls: [
      '`git branch -d` (chữ thường) từ chối xoá nhánh chưa merge, và lời từ chối đó chính là cơ chế bảo vệ. `-D` bỏ qua nó.',
    ],
  },
  theoryId: '27-cuu-nhanh-da-xoa',
  solutionCommands: [
    'git switch main',
    'git branch -D tinh-nang',
    'git branch tinh-nang HEAD@{1}',
  ],
  altSolutionCommands: [
    'git switch main',
    'git branch -D tinh-nang',
    'git fsck --lost-found',
    'git branch tinh-nang main@{0}',
  ],
  par: 3,
};

export const G28: GitLevel = {
  id: 'git-28-thoat-detached-head',
  chapter: 3,
  title: 'Thoát detached HEAD khi đã lỡ commit',
  mission: 'Giữ lại commit bạn vừa tạo khi đang detached.',
  brief: `
Bạn checkout một commit cũ để xem, rồi sửa và commit ngay tại đó. HEAD đang
detached, nên commit mới **không có nhánh nào trỏ tới**.

Chuyển đi chỗ khác ngay bây giờ là mất nó khỏi tầm mắt.

Cách đúng: tạo nhánh **trước khi rời đi**. Đó là một lệnh, và nó là khác biệt
giữa giữ được việc và phải đi tìm trong reflog.
`.trim(),
  difficulty: 'intermediate',
  setup: {
    commits: [
      { id: 'c1', message: 'Nền', changes: { 'a.js': 'v1' } },
      { id: 'c2', parents: ['c1'], message: 'Bản cũ đáng xem', changes: { 'a.js': 'v1\ncu()' } },
      { id: 'c3', parents: ['c2'], message: 'Bản mới nhất', changes: { 'a.js': 'v1\ncu()\nmoi()' } },
    ],
    branches: { main: 'c3' },
    head: { detached: 'c2' },
    worktree: { 'a.js': 'v1\ncu()\nsua-khi-detached()' },
  },
  allowedCommands: ['add', 'commit', 'branch', 'switch', 'checkout', 'log', 'status', 'reflog'],
  objectives: [
    {
      id: 'co-nhanh-giu',
      label: 'Có một nhánh giữ commit vừa tạo',
      check: 'refExists',
      args: { ref: 'cuu-ho' },
      required: true,
    },
    {
      id: 'commit-con-song',
      label: 'Commit vừa tạo có người trỏ tới',
      check: 'commitReachable',
      args: { message: 'Sửa khi đang detached' },
      required: true,
    },
    {
      id: 've-nhanh',
      label: 'HEAD không còn detached',
      check: 'headDetached',
      args: { detached: false },
      required: true,
    },
    {
      id: 'main-nguyen',
      label: 'main không bị dịch',
      check: 'refPointsAtMessage',
      args: { ref: 'main', message: 'Bản mới nhất' },
      required: true,
    },
  ],
  hints: [
    'Commit phần sửa trước đã, dù đang detached.',
    '`git switch -c cuu-ho` tạo nhánh TẠI CHỖ HEAD đang đứng và chuyển sang nó.',
    'Không được chuyển về main trước rồi mới nghĩ tới việc giữ: lúc đó commit đã rời tầm mắt.',
  ],
  teaching: {
    primer: `
Khi detached, \`git commit\` vẫn chạy bình thường và HEAD tiến lên. Nhưng HEAD
là thứ **duy nhất** trỏ vào commit mới.

\`\`\`
c1 ── c2 ── c3 ← main
       └── c4 ← HEAD (detached)     ← không nhánh nào giữ c4
\`\`\`

\`git switch main\` lúc này: HEAD rời đi, \`c4\` không còn ai trỏ tới. git in một
cảnh báo kèm Oid, và cảnh báo đó là thứ bạn nên copy lại.

Một lệnh giải quyết tất cả: \`git switch -c <tên>\` tạo nhánh ngay tại HEAD và
chuyển sang nó. Làm việc đó **trước khi** rời đi.

Lỡ rời rồi thì \`git reflog\` vẫn cứu được (bài G26 dạy đường đó). Nhưng biết
trước rẻ hơn cứu sau.
`.trim(),
    cheatsheet: [
      { command: 'git switch -c <tên>', explain: 'Tạo nhánh tại HEAD hiện tại và chuyển sang.' },
      { command: 'git branch <tên>', explain: 'Tạo nhánh tại HEAD, không chuyển.' },
      { command: 'git status', explain: 'Nói rõ bạn đang detached hay không.' },
    ],
    takeaways: [
      'Commit khi detached chỉ được HEAD giữ.',
      '`git switch -c` giữ nó lại trong một lệnh.',
      'Cảnh báo git in khi rời detached có chứa Oid. Đừng bỏ qua nó.',
    ],
  },
  theoryId: '28-thoat-detached-head',
  solutionCommands: [
    'git add a.js',
    'git commit -m "Sửa khi đang detached"',
    'git switch -c cuu-ho',
  ],
  altSolutionCommands: [
    'git add -A',
    'git commit -m "Sửa khi đang detached"',
    'git branch cuu-ho',
    'git switch cuu-ho',
  ],
  par: 3,
};

export const G29: GitLevel = {
  id: 'git-29-rebase-do-dang',
  chapter: 3,
  title: 'Rebase dở dang: continue, abort, skip',
  mission: 'Thoát khỏi một rebase đang kẹt xung đột, không mất commit nào.',
  brief: `
Bạn đang rebase và nó kẹt ở xung đột. Kho đang ở trạng thái **nửa chừng**: HEAD
detached, một phần commit đã áp, phần còn lại đang chờ.

Ba đường ra, và biết cả ba là điều kiện để không hoảng:

- \`--continue\` sau khi giải xung đột: áp tiếp.
- \`--skip\` bỏ commit đang kẹt, đi tiếp.
- \`--abort\` huỷ hẳn, về đúng trạng thái trước khi gõ \`rebase\`.

Ở level này hãy rút lui bằng \`--abort\` và chứng minh không mất gì.
`.trim(),
  difficulty: 'advanced',
  setup: {
    commits: [
      { id: 'c1', message: 'Nền', changes: { 'cfg.yml': 'x: 1' } },
      { id: 'm1', parents: ['c1'], message: 'main đổi cfg', changes: { 'cfg.yml': 'x: 2' } },
      { id: 'f1', parents: ['c1'], message: 'nhánh đổi cfg', changes: { 'cfg.yml': 'x: 3' } },
      { id: 'f2', parents: ['f1'], message: 'nhánh thêm việc', changes: { 'extra.js': 'e()' } },
    ],
    branches: { main: 'm1', 'tinh-nang': 'f2' },
    head: 'tinh-nang',
  },
  allowedCommands: ['rebase', 'status', 'log', 'add', 'commit', 'reflog', 'branch', 'switch'],
  objectives: [
    {
      id: 'khong-do-dang',
      label: 'Không còn thao tác rebase dở dang',
      check: 'noPendingOp',
      required: true,
    },
    {
      id: 've-cho-cu',
      label: 'tinh-nang vẫn ở đúng commit cũ',
      check: 'refPointsAtMessage',
      args: { ref: 'tinh-nang', message: 'nhánh thêm việc' },
      required: true,
    },
    {
      id: 'khong-detached',
      label: 'HEAD đã trở lại bám nhánh',
      check: 'headDetached',
      args: { detached: false },
      required: true,
    },
    {
      id: 'file-nguyen',
      label: 'cfg.yml trở lại bản của nhánh, không còn marker',
      check: 'worktreeFileEquals',
      args: { path: 'cfg.yml', lines: ['x: 3'] },
      required: true,
    },
    {
      id: 'main-nguyen',
      label: 'main không bị đụng',
      check: 'refPointsAtMessage',
      args: { ref: 'main', message: 'main đổi cfg' },
      required: true,
    },
  ],
  hints: [
    'Bắt đầu bằng `git rebase main`. Nó sẽ kẹt ngay ở commit đầu tiên.',
    '`git status` lúc kẹt nói rõ bạn đang ở giữa một rebase và liệt kê ba lựa chọn.',
    '`git rebase --abort` đưa mọi thứ về nguyên trạng.',
  ],
  teaching: {
    primer: `
Trong lúc rebase, git giữ một trạng thái riêng: nhánh gốc là gì, đang áp lên
đâu, còn commit nào chưa áp, và file nào đang xung đột.

\`\`\`
git rebase main
  → kẹt ở f1 (xung đột cfg.yml)
  → HEAD detached tại m1 + phần f1 đã áp dở
\`\`\`

Ba đường ra:

| Lệnh | Làm gì |
|---|---|
| \`--continue\` | Sau khi bạn giải xung đột và \`add\`: tạo commit rồi áp tiếp |
| \`--skip\` | Bỏ hẳn commit đang kẹt, áp commit sau |
| \`--abort\` | Huỷ toàn bộ, ref và worktree về đúng trước khi gõ rebase |

\`--abort\` an toàn tuyệt đối vì git đã ghi lại \`originalHead\` từ đầu. Không có
trường hợp nào abort làm mất việc.
`.trim(),
    cheatsheet: [
      { command: 'git rebase --continue', explain: 'Đi tiếp sau khi đã giải và add.' },
      { command: 'git rebase --skip', explain: 'Bỏ commit đang kẹt.' },
      { command: 'git rebase --abort', explain: 'Huỷ hẳn, về nguyên trạng.' },
      { command: 'git status', explain: 'Trong lúc rebase, nó nói bạn đang ở bước nào.' },
    ],
    takeaways: [
      'Rebase kẹt là một trạng thái có tên, không phải kho hỏng.',
      '`--abort` luôn về được đúng chỗ cũ.',
      '`--skip` bỏ commit; dùng khi commit đó đã thừa.',
    ],
  },
  theoryId: '29-rebase-do-dang',
  solutionCommands: ['git rebase main', 'git rebase --abort'],
  altSolutionCommands: ['git rebase origin', 'git rebase --abort'],
  par: 2,
};

export const G30: GitLevel = {
  id: 'git-30-stash-that-lac',
  chapter: 3,
  title: 'Stash thất lạc và `fsck --lost-found`',
  mission: 'Tìm lại một mục stash đã lỡ drop.',
  brief: `
Bạn cất việc bằng \`git stash\`, rồi lỡ tay \`git stash drop\`. Danh sách stash
nay trống.

Mục stash không biến mất: **stash là một commit**, và commit thì nằm trong kho.
Cái mất là dòng trỏ tới nó trong danh sách.

\`git fsck --lost-found\` liệt kê mọi commit không ai trỏ tới. Mục stash của bạn
nằm trong đó.
`.trim(),
  difficulty: 'advanced',
  setup: {
    commits: [{ id: 'c1', message: 'Nền', changes: { 'a.js': 'v1' } }],
    branches: { main: 'c1' },
    worktree: { 'a.js': 'v1\nviec-quan-trong()' },
  },
  allowedCommands: ['stash', 'fsck', 'branch', 'checkout', 'switch', 'log', 'status', 'reflog'],
  objectives: [
    {
      id: 'stash-rong',
      label: 'Danh sách stash trống (bạn đã drop)',
      check: 'stashCount',
      args: { count: 0 },
      required: true,
    },
    {
      id: 'co-nhanh-cuu',
      label: 'Có nhánh cuu-stash giữ lại nội dung đã cất',
      check: 'refExists',
      args: { ref: 'cuu-stash' },
      required: true,
    },
    {
      id: 'con-trong-kho',
      label: 'Commit stash vẫn nằm trong kho',
      check: 'commitInStore',
      args: { message: 'WIP on main' },
      required: true,
    },
  ],
  hints: [
    'Trước hết tự gây sự cố: `git stash` rồi `git stash drop`.',
    '`git fsck --lost-found` liệt kê commit mồ côi, trong đó có mục stash.',
    '`git branch cuu-stash <oid>` cắm một nhánh vào nó để nó không mồ côi nữa.',
  ],
  teaching: {
    primer: `
\`git stash\` tạo một commit thật, message mặc định dạng \`WIP on <nhánh>\`, rồi
ghi Oid của nó vào \`refs/stash\`. \`drop\` xoá dòng ghi đó.

\`\`\`
git stash        → commit S tạo ra, refs/stash → S
git stash drop   → refs/stash mất, S còn trong kho, không ai trỏ tới
\`\`\`

\`git fsck --lost-found\` quét toàn kho và liệt kê mọi object không với tới được
từ bất kỳ ref nào. Nó chậm và nhiều nhiễu, nhưng nó không cần bạn nhớ gì cả.

Thứ tự thử khi mất việc, từ rẻ tới đắt:

1. \`git reflog\` — nếu HEAD từng ghé qua.
2. \`git stash list\` — nếu bạn đã cất.
3. \`git fsck --lost-found\` — khi hai cách trên không ra.
`.trim(),
    cheatsheet: [
      { command: 'git stash list', explain: 'Danh sách mục đã cất.' },
      { command: 'git stash drop', explain: 'Xoá một mục khỏi danh sách. Commit vẫn còn.' },
      { command: 'git fsck --lost-found', explain: 'Liệt kê mọi commit không ai trỏ tới.' },
      { command: 'git branch <tên> <oid>', explain: 'Cắm nhánh vào commit tìm được.' },
    ],
    takeaways: [
      'Stash là một commit, nên nó cứu được như mọi commit.',
      '`drop` xoá dòng trỏ, không xoá dữ liệu.',
      'fsck là lưới cuối, dùng khi reflog không giúp.',
    ],
  },
  theoryId: '30-stash-that-lac',
  solutionCommands: [
    'git stash',
    'git stash drop',
    'git fsck --lost-found',
    'git branch cuu-stash stash@{0}',
  ],
  altSolutionCommands: [
    'git stash push -m "viec quan trong"',
    'git stash drop',
    'git fsck --lost-found',
    'git branch cuu-stash HEAD@{1}',
  ],
  par: 4,
};

export const G31: GitLevel = {
  id: 'git-31-cuu-viec-bi-force-push',
  chapter: 3,
  title: 'Cứu việc bị force-push đè',
  mission: 'Lấy lại commit của bạn sau khi đồng đội force-push đè lên.',
  brief: `
Nối thẳng từ bài G20, nhưng lần này **bạn là người bị đè**.

Đồng đội rebase nhánh chung rồi \`push --force\`. Con trỏ ở origin nhảy sang
mạch của họ, và commit của bạn không còn nhánh nào trỏ tới.

Nó vẫn nằm trong kho local của bạn, và ref theo dõi cũ của bạn còn ghi lại chỗ
nó từng ở. Lấy lại nó.
`.trim(),
  difficulty: 'advanced',
  setup: {
    commits: [
      { id: 'c1', message: 'Nền chung', changes: { 'a.js': 'v1' } },
      { id: 'me', parents: ['c1'], message: 'Việc của tôi', changes: { 'mine.js': 'toi()' } },
      { id: 'o1', parents: ['c1'], message: 'Linh viết lại lịch sử', author: 'Linh', changes: { 'a.js': 'v1\nlinh()' } },
    ],
    // main local ĐÃ bị kéo về mạch mới; commit của tôi chỉ còn trong reflog.
    branches: { main: 'o1' },
    origin: { branches: { main: 'o1' }, tracking: { main: 'o1' } },
  },
  allowedCommands: ['reflog', 'branch', 'checkout', 'switch', 'log', 'status', 'fsck', 'cherry-pick', 'merge'],
  objectives: [
    {
      id: 'co-nhanh-cuu',
      label: 'Có nhánh viec-cua-toi giữ lại commit của bạn',
      check: 'refExists',
      args: { ref: 'viec-cua-toi' },
      required: true,
    },
    {
      id: 'dung-commit',
      label: 'Nó trỏ vào "Việc của tôi"',
      check: 'refPointsAtMessage',
      args: { ref: 'viec-cua-toi', message: 'Việc của tôi' },
      required: true,
    },
    {
      id: 'con-song',
      label: 'Commit của bạn nay có người trỏ tới',
      check: 'commitReachable',
      args: { message: 'Việc của tôi' },
      required: true,
    },
    {
      id: 'khong-pha-linh',
      label: 'Việc của Linh không bị đụng',
      check: 'refPointsAtMessage',
      args: { ref: 'main', message: 'Linh viết lại lịch sử' },
      required: true,
    },
  ],
  hints: [
    'Commit của bạn không nằm trên mạch nào nữa, nên `git log` không thấy.',
    '`git fsck --lost-found` liệt kê nó. `git reflog` cũng có nếu HEAD từng ghé qua.',
    'Cắm một nhánh vào nó là đủ để nó thôi mồ côi. Đừng đụng vào main.',
  ],
  teaching: {
    primer: `
Bị force-push đè trông như mất việc, nhưng ba thứ vẫn còn trong kho **local**
của bạn:

1. Commit của bạn, trong \`objects\`.
2. Reflog của HEAD, nếu bạn từng đứng trên commit đó.
3. Reflog của ref theo dõi (\`origin/main@{1}\`), ghi chỗ origin ở trước lần
   force-push.

Vế thứ ba đáng nhớ: nó cho bạn biết origin **từng** ở đâu, kể cả khi bạn chưa
bao giờ ghé qua commit ấy.

Cứu xong thì bàn với người đã force-push trước khi đẩy lại. Đè ngược lại họ chỉ
đổi chiều của cùng một sự cố.
`.trim(),
    cheatsheet: [
      { command: 'git fsck --lost-found', explain: 'Liệt kê commit mồ côi trong kho local.' },
      { command: 'git reflog', explain: 'Chỗ HEAD từng đứng.' },
      { command: 'git reflog origin/main', explain: 'Chỗ origin từng ở, trước lần force-push.' },
      { command: 'git branch <tên> <oid>', explain: 'Cắm nhánh để commit thôi mồ côi.' },
    ],
    takeaways: [
      'Force-push không xoá gì trong kho local của bạn.',
      'Reflog của ref theo dõi ghi chỗ origin từng ở.',
      'Cứu trước, bàn sau. Đừng đè ngược lại.',
    ],
  },
  theoryId: '31-cuu-viec-bi-force-push',
  solutionCommands: ['git fsck --lost-found', 'git branch viec-cua-toi main@{1}'],
  altSolutionCommands: ['git reflog', 'git branch viec-cua-toi HEAD@{1}'],
  par: 2,
};

export const G32: GitLevel = {
  id: 'git-32-bisect-tim-commit-hong',
  chapter: 3,
  title: 'Bisect: chia đôi lịch sử để tìm commit hỏng',
  mission: 'Tìm commit đầu tiên làm hỏng bài kiểm thử, trong 15 commit.',
  brief: `
Bài kiểm thử đang đỏ. Nó xanh ở commit đầu và đỏ ở commit cuối. Ở giữa là 15
commit.

Đọc từng cái là 15 lần thử. \`git bisect\` chia đôi: mỗi lần bạn trả lời
tốt hay hỏng, nó bỏ đi một nửa số ứng viên. 15 commit cần khoảng 4 lần thử.

Bắt đầu bisect, đánh dấu hai đầu, rồi trả lời cho tới khi nó chỉ ra thủ phạm.
`.trim(),
  difficulty: 'advanced',
  setup: {
    commits: [
      { id: 'c1', message: 'Nền, test xanh', changes: { 'app.js': 'ok()' } },
      { id: 'c2', parents: ['c1'], message: 'Việc 1', changes: { 'a.js': '1' } },
      { id: 'c3', parents: ['c2'], message: 'Việc 2', changes: { 'b.js': '2' } },
      { id: 'c4', parents: ['c3'], message: 'Việc 3', changes: { 'c.js': '3' } },
      { id: 'c5', parents: ['c4'], message: 'Làm hỏng test', changes: { 'app.js': 'hong()' } },
      { id: 'c6', parents: ['c5'], message: 'Việc 5', changes: { 'd.js': '5' } },
      { id: 'c7', parents: ['c6'], message: 'Việc 6', changes: { 'e.js': '6' } },
      { id: 'c8', parents: ['c7'], message: 'Việc 7', changes: { 'f.js': '7' } },
    ],
    branches: { main: 'c8' },
  },
  allowedCommands: ['bisect', 'log', 'status', 'checkout', 'switch', 'branch', 'diff', 'show'],
  objectives: [
    {
      id: 'da-xong-bisect',
      label: 'Phiên bisect đã kết thúc',
      check: 'noPendingOp',
      required: true,
    },
    {
      id: 'danh-dau-thu-pham',
      label: 'Có nhánh thu-pham trỏ vào commit làm hỏng',
      check: 'refPointsAtMessage',
      args: { ref: 'thu-pham', message: 'Làm hỏng test' },
      required: true,
    },
    {
      id: 've-nhanh',
      label: 'HEAD đã trở lại bám nhánh',
      check: 'headDetached',
      args: { detached: false },
      required: true,
    },
  ],
  hints: [
    '`git bisect start` mở phiên, rồi `git bisect bad` cho commit hiện tại và `git bisect good <oid đầu>`.',
    'Mỗi lần git đưa bạn tới một commit, xem `app.js` rồi trả lời `git bisect good` hoặc `git bisect bad`.',
    '`git bisect reset` đóng phiên và trả HEAD về nhánh cũ. Nhớ cắm nhánh thu-pham trước.',
  ],
  teaching: {
    primer: `
Bisect là tìm kiếm nhị phân trên lịch sử. Với N commit, số lần thử là
khoảng log₂(N): 15 commit cần 4 lần, 1000 commit cần 10 lần.

\`\`\`
git bisect start
git bisect bad            ← commit hiện tại đang hỏng
git bisect good c1        ← commit này đã biết là tốt
  → git đưa bạn tới commit giữa
... kiểm tra ...
git bisect good|bad       ← trả lời, git đi tiếp
  → lặp cho tới khi còn một ứng viên
git bisect reset          ← đóng phiên, HEAD về nhánh cũ
\`\`\`

Trong lúc bisect, HEAD detached ở từng ứng viên. Đó là lý do phải \`reset\` khi
xong, và là lý do nên cắm nhánh vào thủ phạm **trước khi** reset.

Điều kiện để bisect có nghĩa: phép kiểm phải **đơn điệu** — tốt ở trước, hỏng ở
sau, không xen kẽ. Lỗi chập chờn làm bisect chỉ sai chỗ và không báo gì cả.
`.trim(),
    cheatsheet: [
      { command: 'git bisect start', explain: 'Mở phiên bisect.' },
      { command: 'git bisect bad [oid]', explain: 'Đánh dấu commit hỏng.' },
      { command: 'git bisect good [oid]', explain: 'Đánh dấu commit tốt.' },
      { command: 'git bisect reset', explain: 'Đóng phiên, HEAD về nhánh cũ.' },
    ],
    takeaways: [
      'Bisect biến N lần thử thành log₂(N) lần.',
      'HEAD detached trong suốt phiên, nên phải reset khi xong.',
      'Phép kiểm phải đơn điệu, nếu không bisect chỉ sai chỗ trong im lặng.',
    ],
    proTips: [
      'Cắm một nhánh vào thủ phạm trước khi `bisect reset`, nếu không bạn phải đi tìm lại Oid.',
    ],
  },
  theoryId: '32-bisect-tim-commit-hong',
  solutionCommands: [
    'git bisect start',
    'git bisect bad',
    'git bisect good main~7',
    'git bisect bad',
    'git bisect good',
    'git bisect bad',
    'git branch thu-pham HEAD',
    'git bisect reset',
  ],
  altSolutionCommands: [
    'git branch thu-pham main~3',
    'git bisect start',
    'git bisect reset',
  ],
  par: 8,
};
