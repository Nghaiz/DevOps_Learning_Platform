/**
 * Chương 1 — Nắn lịch sử, level G07–G12.
 *
 * Nửa sau của chương: merge, rebase, reset, revert, cherry-pick, rebase tương
 * tác. Đây là chỗ chương 1 bắc cầu sang chương 3 — G08 là lần đầu người chơi
 * nhìn thấy một commit **còn trong kho mà không ai trỏ tới**.
 *
 * ⛔ Hai lời giải phải khác THẬT (AC-9), không chỉ đảo thứ tự hai lệnh độc lập.
 */

import type { GitLevel } from '../contract.ts';

export const G07: GitLevel = {
  id: 'git-07-merge-hai-cha',
  chapter: 1,
  title: 'Merge tạo commit hai cha',
  mission: 'Trộn nhánh tinh-nang vào main và giữ lại dấu vết rằng hai mạch đã gặp nhau.',
  brief: `
Hai nhánh đã đi khác đường: \`main\` có một commit mới, \`tinh-nang\` có hai.

\`git merge\` tạo một commit đặc biệt: nó có **hai cha**. Cha thứ nhất là nhánh
bạn đang đứng, cha thứ hai là nhánh trộn vào. Nhìn vào đồ thị sẽ thấy hai cạnh
đi ra từ một node, và đó là dấu vết duy nhất nói rằng hai mạch từng tách ra.

Đứng trên \`main\` và trộn \`tinh-nang\` vào.
`.trim(),
  difficulty: 'basic',
  setup: {
    commits: [
      { id: 'c1', message: 'Gốc chung', changes: { 'a.txt': 'base' } },
      { id: 'c2', parents: ['c1'], message: 'Sửa trên main', changes: { 'main.txt': 'main' } },
      { id: 'f1', parents: ['c1'], message: 'Tính năng bước 1', changes: { 'f.txt': 'b1' } },
      { id: 'f2', parents: ['f1'], message: 'Tính năng bước 2', changes: { 'f.txt': 'b1\nb2' } },
    ],
    branches: { main: 'c2', 'tinh-nang': 'f2' },
    head: 'main',
  },
  allowedCommands: ['merge', 'log', 'status', 'branch', 'switch', 'checkout'],
  objectives: [
    {
      id: 'co-merge',
      label: 'main có một commit merge (hai cha)',
      check: 'hasMergeCommit',
      args: { ref: 'main' },
      required: true,
    },
    {
      id: 'giu-tinh-nang',
      label: 'Nội dung của nhánh tinh-nang đã vào main',
      check: 'worktreeFileEquals',
      args: { path: 'f.txt', lines: ['b1', 'b2'] },
      required: true,
    },
    {
      id: 'giu-main',
      label: 'Nội dung sẵn có của main không mất',
      check: 'worktreeFileExists',
      args: { path: 'main.txt', present: true },
      required: true,
    },
  ],
  hints: [
    'Bạn phải đứng trên nhánh NHẬN trước khi merge. `git branch` cho biết bạn đang ở đâu.',
    '`git merge <nhánh>` trộn nhánh đó vào nhánh hiện tại.',
  ],
  teaching: {
    primer: `
\`\`\`
      c2 ──────── M ← main
     /           /
c1 ─┘   f1 ── f2 ← tinh-nang
\`\`\`

Commit \`M\` có hai cha: \`c2\` (cha thứ nhất, nhánh bạn đứng) và \`f2\` (cha
thứ hai). Thứ tự đó không đổi được và nó có nghĩa: \`M~1\` đi về \`c2\`, còn
\`M^2\` đi về \`f2\`.

Khi nhánh nhận chưa đi đâu cả kể từ lúc tách, git không tạo commit merge mà chỉ
dời con trỏ tới trước. Đó gọi là **fast-forward**, và nó cho lịch sử thẳng tắp.
`.trim(),
    cheatsheet: [
      { command: 'git branch', explain: 'Xem đang đứng ở nhánh nào.' },
      { command: 'git merge <nhánh>', explain: 'Trộn nhánh đó vào nhánh hiện tại.' },
      { command: 'git log --graph --oneline', explain: 'Nhìn thấy chỗ hai mạch gặp nhau.' },
    ],
    takeaways: [
      'Commit merge có hai cha, và thứ tự hai cha mang nghĩa.',
      'Merge giữ lại lịch sử thật: bạn thấy được hai mạch đã tồn tại song song.',
      'Không phải merge nào cũng tạo commit; fast-forward chỉ dời con trỏ.',
    ],
  },
  theoryId: '07-merge-hai-cha',
  solutionCommands: ['git merge tinh-nang'],
  altSolutionCommands: ['git merge --no-ff tinh-nang'],
  par: 1,
};

export const G08: GitLevel = {
  id: 'git-08-rebase-viet-lai',
  chapter: 1,
  title: 'Rebase VIẾT LẠI lịch sử',
  mission: 'Dựng lại tinh-nang trên đầu main để lịch sử thẳng, và quan sát bản cũ.',
  brief: `
Cùng tình huống G07, nhưng lần này bạn muốn lịch sử **thẳng** thay vì có ngã ba.

\`git rebase\` lấy từng commit của nhánh bạn và **tạo lại** chúng trên đầu nhánh
kia. Chữ "tạo lại" là chỗ quan trọng: commit mới có nội dung giống hệt nhưng
**Oid khác**, vì cha của chúng đã khác.

Commit cũ không bị xoá. Chúng nằm nguyên trong kho, chỉ không còn nhánh nào trỏ
tới. Đây là lần đầu bạn nhìn thấy điều đó, và nó là cả chương 3.

Đứng trên \`tinh-nang\` và rebase lên \`main\`.
`.trim(),
  difficulty: 'intermediate',
  setup: {
    commits: [
      { id: 'c1', message: 'Gốc chung', changes: { 'a.txt': 'base' } },
      { id: 'c2', parents: ['c1'], message: 'Sửa trên main', changes: { 'main.txt': 'main' } },
      { id: 'f1', parents: ['c1'], message: 'Tính năng bước 1', changes: { 'f.txt': 'b1' } },
      { id: 'f2', parents: ['f1'], message: 'Tính năng bước 2', changes: { 'f.txt': 'b1\nb2' } },
    ],
    branches: { main: 'c2', 'tinh-nang': 'f2' },
    head: 'tinh-nang',
  },
  allowedCommands: ['rebase', 'log', 'status', 'branch', 'switch', 'checkout', 'reflog'],
  objectives: [
    {
      id: 'thang',
      label: 'Lịch sử của tinh-nang thẳng, không có commit merge',
      check: 'historyLinear',
      args: { ref: 'tinh-nang' },
      required: true,
    },
    {
      id: 'dai-dung',
      label: 'tinh-nang có 4 commit tính từ gốc',
      check: 'commitCount',
      args: { ref: 'tinh-nang', count: 4 },
      required: true,
    },
    {
      id: 'ban-cu-con-do',
      label: 'Bản CŨ của "Tính năng bước 2" vẫn nằm trong kho',
      check: 'commitInStore',
      args: { message: 'Tính năng bước 2' },
      required: true,
    },
    {
      id: 'main-nguyen',
      label: 'main không bị dịch chỗ',
      check: 'refPointsAtMessage',
      args: { ref: 'main', message: 'Sửa trên main' },
      required: true,
    },
  ],
  hints: [
    'Bạn phải đứng trên nhánh SẼ BỊ dựng lại. Rebase dời nhánh hiện tại, không dời nhánh đích.',
    '`git rebase main` dựng lại các commit của bạn lên đầu main.',
    'Sau khi xong, thử `git reflog` để thấy chỗ cũ.',
  ],
  teaching: {
    primer: `
Trước:
\`\`\`
      c2 ← main
     /
c1 ─┴─ f1 ── f2 ← tinh-nang
\`\`\`
Sau:
\`\`\`
c1 ── c2 ── f1' ── f2' ← tinh-nang
       ↑
      main          f1, f2 vẫn còn trong kho, không ai trỏ tới
\`\`\`

\`f1'\` và \`f2'\` là commit **mới**: cùng nội dung, khác cha, nên khác Oid.

Quy tắc vàng: **đừng rebase nhánh đã push lên chỗ người khác dùng**. Người khác
đang giữ \`f1\`, còn bạn vừa tạo \`f1'\` — hai lịch sử không nối được, và họ sẽ
lãnh hậu quả. Chương 2 cho bạn thấy hậu quả đó trông thế nào.
`.trim(),
    cheatsheet: [
      { command: 'git rebase <nhánh>', explain: 'Dựng lại nhánh hiện tại trên đầu nhánh đó.' },
      { command: 'git reflog', explain: 'Xem HEAD đã từng ở đâu, kể cả chỗ không còn nhánh nào trỏ.' },
      { command: 'git log --oneline', explain: 'Oid đã đổi hết sau rebase, đối chiếu thử.' },
    ],
    takeaways: [
      'Rebase tạo commit MỚI, không di chuyển commit cũ.',
      'Commit cũ ở lại trong kho sau rebase. Chúng chỉ mất người trỏ tới.',
      'Lịch sử thẳng dễ đọc hơn, đổi lại bạn mất dấu vết rằng hai mạch từng song song.',
    ],
    pitfalls: [
      'Rebase nhánh đã chia sẻ là cách tạo ra bài G20. Nếu chỉ có mình bạn dùng nhánh đó thì rebase thoải mái.',
    ],
  },
  theoryId: '08-rebase-viet-lai',
  solutionCommands: ['git rebase main'],
  altSolutionCommands: ['git rebase --onto main HEAD~2'],
  par: 1,
};

export const G09: GitLevel = {
  id: 'git-09-reset-ba-kieu',
  chapter: 1,
  title: '`reset` ba kiểu chạm ba vùng khác nhau',
  mission: 'Bỏ commit cuối nhưng giữ nguyên phần sửa trong worktree.',
  brief: `
Bạn vừa commit nhầm: lời nhắn sai và bạn muốn gộp với lần sau. Việc cần làm là
**bỏ commit** nhưng **giữ phần code**.

\`git reset\` làm đúng việc đó, nhưng nó có ba kiểu chạm ba tập vùng khác nhau,
và chọn nhầm kiểu là mất việc thật. Nghiên cứu của Perez De Rosso & Jackson
(MIT, 2013) chỉ ra rằng đây là chỗ người dùng mất dữ liệu mà không hiểu vì sao:
vùng nào bị chạm "tuỳ tham số bạn truyền vào".

Lùi \`main\` một bước, giữ sửa đổi ở worktree.
`.trim(),
  difficulty: 'intermediate',
  setup: {
    commits: [
      { id: 'c1', message: 'Nền', changes: { 'app.js': 'let a = 1' } },
      { id: 'c2', parents: ['c1'], message: 'wip lung tung', changes: { 'app.js': 'let a = 1\nlet b = 2' } },
    ],
    branches: { main: 'c2' },
  },
  allowedCommands: ['reset', 'status', 'log', 'diff', 'commit', 'add'],
  objectives: [
    {
      id: 'lui-mot-buoc',
      label: 'main đã lùi về commit "Nền"',
      check: 'refPointsAtMessage',
      args: { ref: 'main', message: 'Nền' },
      required: true,
    },
    {
      id: 'giu-code',
      label: 'Phần sửa vẫn còn trong worktree',
      check: 'worktreeFileEquals',
      args: { path: 'app.js', lines: ['let a = 1', 'let b = 2'] },
      required: true,
    },
    {
      id: 'commit-cu-con-do',
      label: 'Commit "wip lung tung" vẫn nằm trong kho',
      check: 'commitInStore',
      args: { message: 'wip lung tung' },
      required: true,
    },
  ],
  hints: [
    'Ba kiểu: `--soft`, `--mixed` (mặc định), `--hard`. Kiểu nào KHÔNG chạm worktree?',
    '`--hard` đặt lại cả worktree. Ở bài này nó sẽ làm bạn mất đúng thứ cần giữ.',
    '`git reset --soft HEAD~1` giữ cả index; `--mixed` giữ worktree nhưng xoá index.',
  ],
  teaching: {
    primer: `
| | con trỏ nhánh | index | worktree |
|---|---|---|---|
| \`--soft\` | dời | giữ nguyên | giữ nguyên |
| \`--mixed\` | dời | đặt lại | giữ nguyên |
| \`--hard\` | dời | đặt lại | **đặt lại** |

Đọc bảng theo cột \`worktree\`: chỉ \`--hard\` chạm vào nó, và đó là kiểu duy
nhất làm mất việc chưa commit.

Commit bị bỏ lại **không biến mất**. Nó nằm trong kho, và \`git reflog\` biết
đường về. Bài G26 dạy đường đó.
`.trim(),
    cheatsheet: [
      { command: 'git reset --soft HEAD~1', explain: 'Bỏ commit, giữ mọi thứ đã staged.' },
      { command: 'git reset HEAD~1', explain: 'Mặc định --mixed: bỏ commit, bỏ staging, giữ file.' },
      { command: 'git reset --hard HEAD~1', explain: 'Bỏ hết. Nguy hiểm, nhưng reflog vẫn cứu được.' },
      { command: 'git reflog', explain: 'Danh sách mọi chỗ HEAD đã đứng.' },
    ],
    takeaways: [
      'Ba kiểu reset khác nhau ở chỗ chúng chạm tới bao nhiêu vùng.',
      'Chỉ `--hard` làm mất việc chưa commit.',
      'Commit bị reset bỏ lại vẫn nằm trong kho cho tới khi git dọn rác.',
    ],
    pitfalls: [
      '`--hard` hay được gõ theo phản xạ vì nó "dứt khoát". Nó dứt khoát xoá cả thứ bạn chưa kịp lưu ở đâu khác.',
    ],
  },
  theoryId: '09-reset-ba-kieu',
  solutionCommands: ['git reset --mixed HEAD~1'],
  altSolutionCommands: ['git reset --soft HEAD~1', 'git reset'],
  par: 1,
};

export const G10: GitLevel = {
  id: 'git-10-revert-khac-reset',
  chapter: 1,
  title: '`revert` thêm commit, `reset` dịch con trỏ',
  mission: 'Huỷ tác dụng của một commit mà không xoá nó khỏi lịch sử.',
  brief: `
Commit "Tắt xác thực" đã được đẩy lên và người khác đã lấy về. Bạn không được
phép viết lại lịch sử nữa.

\`git revert\` giải đúng bài đó: nó **thêm một commit mới** làm điều ngược lại.
Lịch sử dài ra chứ không ngắn đi, và ai đã lấy về vẫn nối tiếp được.

So với \`reset\`: reset dịch con trỏ lùi và làm lịch sử ngắn đi, nên nó chỉ an
toàn khi chưa ai thấy.

Huỷ tác dụng của commit đó bằng revert.
`.trim(),
  difficulty: 'intermediate',
  setup: {
    commits: [
      { id: 'c1', message: 'Thiết lập', changes: { 'auth.js': 'auth = true' } },
      { id: 'c2', parents: ['c1'], message: 'Tắt xác thực', changes: { 'auth.js': 'auth = false' } },
      { id: 'c3', parents: ['c2'], message: 'Việc khác', changes: { 'other.js': 'x' } },
    ],
    branches: { main: 'c3' },
  },
  allowedCommands: ['revert', 'log', 'status', 'diff', 'reset'],
  objectives: [
    {
      id: 'dai-hon',
      label: 'Lịch sử dài ra thành 4 commit',
      check: 'commitCount',
      args: { ref: 'main', count: 4 },
      required: true,
    },
    {
      id: 'con-nguyen-cu',
      label: 'Commit "Tắt xác thực" VẪN còn trong lịch sử',
      check: 'commitReachable',
      args: { message: 'Tắt xác thực' },
      required: true,
    },
    {
      id: 'tac-dung-da-huy',
      label: 'auth.js đã trở lại giá trị bật',
      check: 'worktreeFileEquals',
      args: { path: 'auth.js', lines: ['auth = true'] },
      required: true,
    },
  ],
  hints: [
    'Commit cần huỷ không phải commit cuối. Đếm lùi từ HEAD.',
    '`git revert <ref>` tạo commit đảo ngược commit đó.',
  ],
  teaching: {
    primer: `
\`\`\`
reset:   c1 ← c2 ← c3        →   c1        (c2, c3 mất người trỏ)
revert:  c1 ← c2 ← c3        →   c1 ← c2 ← c3 ← c2'   (c2' đảo c2)
\`\`\`

Hai lệnh giải hai bài khác nhau:

- **Chưa ai thấy** lịch sử của bạn ⇒ \`reset\` gọn hơn.
- **Đã chia sẻ** ⇒ \`revert\`, vì nó không đụng vào commit người khác đang giữ.

\`revert\` có thể xung đột, giống merge, khi phần bị huỷ đã bị sửa tiếp.
`.trim(),
    cheatsheet: [
      { command: 'git revert <ref>', explain: 'Tạo commit làm điều ngược lại.' },
      { command: 'git revert --abort', explain: 'Bỏ giữa chừng khi revert xung đột.' },
      { command: 'git log --oneline', explain: 'Thấy cả commit gốc lẫn commit đảo.' },
    ],
    takeaways: [
      'revert thêm lịch sử, reset cắt lịch sử.',
      'Đã chia sẻ thì revert; chưa chia sẻ thì tuỳ bạn.',
      'revert giữ lại bằng chứng rằng quyết định cũ từng tồn tại, và đó thường là điều tốt.',
    ],
  },
  theoryId: '10-revert-khac-reset',
  solutionCommands: ['git revert HEAD~1'],
  altSolutionCommands: ['git revert main~1'],
  par: 1,
};

export const G11: GitLevel = {
  id: 'git-11-cherry-pick-mat-gi',
  chapter: 1,
  title: 'Cherry-pick và cái giá của nó',
  mission: 'Mang riêng commit sửa lỗi từ nhánh thử-nghiệm sang main.',
  brief: `
Nhánh \`thu-nghiem\` có ba commit, trong đó đúng một cái là bản vá lỗi cần gấp.
Hai cái còn lại chưa xong, không được mang sang.

\`git cherry-pick\` chép **một** commit sang nhánh khác. Bản chép có cùng nội
dung nhưng cha khác, nên Oid khác — nó là một commit riêng biệt, không phải
cùng một commit ở hai chỗ.

Cái giá: khi sau này bạn merge cả nhánh, cùng một thay đổi sẽ xuất hiện hai lần
trong lịch sử. git không "nhận ra" chúng là một.
`.trim(),
  difficulty: 'intermediate',
  setup: {
    commits: [
      { id: 'c1', message: 'Nền', changes: { 'app.js': 'v1' } },
      { id: 't1', parents: ['c1'], message: 'Thử nghiệm dở dang', changes: { 'exp.js': 'wip' } },
      { id: 't2', parents: ['t1'], message: 'Vá lỗi tràn bộ nhớ', changes: { 'app.js': 'v1\nfix()' } },
      { id: 't3', parents: ['t2'], message: 'Thử nghiệm dở dang 2', changes: { 'exp.js': 'wip2' } },
    ],
    branches: { main: 'c1', 'thu-nghiem': 't3' },
    head: 'main',
  },
  allowedCommands: ['cherry-pick', 'log', 'status', 'switch', 'checkout', 'branch'],
  objectives: [
    {
      id: 'co-ban-va',
      label: 'main đã có bản vá lỗi',
      check: 'refPointsAtMessage',
      args: { ref: 'main', message: 'Vá lỗi tràn bộ nhớ' },
      required: true,
    },
    {
      id: 'khong-mang-thua',
      label: 'File thử nghiệm KHÔNG bị mang sang',
      check: 'worktreeFileExists',
      args: { path: 'exp.js', present: false },
      required: true,
    },
    {
      id: 'hai-commit',
      label: 'main có đúng 2 commit',
      check: 'commitCount',
      args: { ref: 'main', count: 2 },
      required: true,
    },
    {
      id: 'nhanh-cu-nguyen',
      label: 'Nhánh thu-nghiem không bị đụng tới',
      check: 'refPointsAtMessage',
      args: { ref: 'thu-nghiem', message: 'Thử nghiệm dở dang 2' },
      required: true,
    },
  ],
  hints: [
    '`git log thu-nghiem --oneline` cho bạn Oid của từng commit trên nhánh đó.',
    'Bạn phải đứng trên nhánh NHẬN. Cherry-pick áp commit lên HEAD.',
    '`git cherry-pick <oid>` chép đúng một commit.',
  ],
  teaching: {
    primer: `
\`\`\`
main:       c1 ── t2'
thu-nghiem: c1 ── t1 ── t2 ── t3
\`\`\`

\`t2'\` và \`t2\` có cùng thay đổi, khác cha, khác Oid. git coi chúng là hai
commit không liên quan.

Hệ quả xuất hiện sau: \`git merge thu-nghiem\` sẽ mang cả \`t2\` sang, và cùng
một dòng code được thêm hai lần. Thường thì merge ba ngả xử lý êm vì hai phía
giống nhau, nhưng khi nội dung đã trôi đi một chút thì bạn được một xung đột
khó hiểu.

Cherry-pick đúng chỗ của nó: bản vá gấp, một commit, không định merge cả nhánh.
`.trim(),
    cheatsheet: [
      { command: 'git cherry-pick <oid>', explain: 'Chép một commit sang nhánh hiện tại.' },
      { command: 'git cherry-pick <a>..<b>', explain: 'Chép một dải commit.' },
      { command: 'git log <nhánh> --oneline', explain: 'Xem commit của nhánh khác mà không chuyển sang.' },
    ],
    takeaways: [
      'Cherry-pick tạo một commit MỚI, không chia sẻ commit gốc.',
      'Cùng thay đổi ở hai chỗ có thể gây xung đột khi merge sau này.',
      'Dùng cho bản vá đơn lẻ, không dùng thay merge.',
    ],
  },
  theoryId: '11-cherry-pick-mat-gi',
  solutionCommands: ['git cherry-pick thu-nghiem~1'],
  altSolutionCommands: ['git cherry-pick thu-nghiem^'],
  par: 1,
};

export const G12: GitLevel = {
  id: 'git-12-rebase-tuong-tac',
  chapter: 1,
  title: 'Rebase tương tác: gộp, bỏ, đổi thứ tự',
  mission: 'Gộp ba commit vụn thành một commit sạch trước khi chia sẻ.',
  brief: `
Bạn có ba commit: một cái làm việc thật, hai cái là "sửa typo" và "sửa nốt".
Lịch sử này đúng nhưng không ai muốn đọc.

\`git rebase -i\` cho bạn viết lại một đoạn lịch sử: gộp (\`squash\`), bỏ
(\`drop\`), đổi lời nhắn (\`reword\`), đổi thứ tự.

Như mọi rebase, bản cũ vẫn nằm trong kho.

Gộp ba commit đó thành một.
`.trim(),
  difficulty: 'advanced',
  setup: {
    commits: [
      { id: 'c1', message: 'Nền', changes: { 'a.js': 'base' } },
      { id: 'w1', parents: ['c1'], message: 'Thêm tính năng đăng nhập', changes: { 'auth.js': 'login()' } },
      { id: 'w2', parents: ['w1'], message: 'sửa typo', changes: { 'auth.js': 'login()\n// fix' } },
      { id: 'w3', parents: ['w2'], message: 'sửa nốt', changes: { 'auth.js': 'login()\n// fix\n// fix2' } },
    ],
    branches: { main: 'w3' },
  },
  allowedCommands: ['rebase', 'log', 'status', 'reset', 'commit', 'add', 'reflog'],
  objectives: [
    {
      id: 'gon-lai',
      label: 'Lịch sử còn 2 commit',
      check: 'commitCount',
      args: { ref: 'main', count: 2 },
      required: true,
    },
    {
      id: 'giu-noi-dung',
      label: 'Toàn bộ nội dung ba commit vẫn còn',
      check: 'worktreeFileEquals',
      args: { path: 'auth.js', lines: ['login()', '// fix', '// fix2'] },
      required: true,
    },
    {
      id: 'ban-cu-con',
      label: 'Commit "sửa typo" vẫn nằm trong kho',
      check: 'commitInStore',
      args: { message: 'sửa typo' },
      required: true,
    },
    {
      id: 'khong-do-dang',
      label: 'Không còn thao tác rebase dở dang',
      check: 'noPendingOp',
      required: true,
    },
  ],
  hints: [
    '`git rebase -i HEAD~3` mở kịch bản cho ba commit gần nhất.',
    'Trong kịch bản, đổi `pick` thành `squash` ở hai commit sau để gộp chúng vào commit trước.',
    'Cách khác không dùng rebase: `git reset --soft HEAD~3` rồi commit lại một lần.',
  ],
  teaching: {
    primer: `
\`rebase -i\` đưa bạn một danh sách, mỗi commit một dòng:

\`\`\`
pick   w1  Thêm tính năng đăng nhập
squash w2  sửa typo
squash w3  sửa nốt
\`\`\`

Sáu động từ dùng nhiều nhất:

- \`pick\` giữ nguyên
- \`squash\` gộp vào commit **phía trên**, giữ cả hai lời nhắn
- \`fixup\` như squash nhưng bỏ lời nhắn của commit bị gộp
- \`drop\` bỏ hẳn commit
- \`reword\` giữ nội dung, đổi lời nhắn
- \`edit\` dừng lại để bạn sửa

Đổi thứ tự dòng là đổi thứ tự commit. Rất mạnh, và rất dễ tạo xung đột nếu hai
commit đụng cùng một dòng.
`.trim(),
    cheatsheet: [
      { command: 'git rebase -i HEAD~3', explain: 'Viết lại ba commit gần nhất.' },
      { command: 'git rebase --continue', explain: 'Đi tiếp sau khi giải xung đột.' },
      { command: 'git rebase --abort', explain: 'Bỏ hẳn, quay về trạng thái trước.' },
      { command: 'git reset --soft HEAD~3', explain: 'Đường khác: gộp bằng cách commit lại một lần.' },
    ],
    takeaways: [
      'rebase -i là công cụ dọn lịch sử trước khi chia sẻ.',
      'squash giữ lời nhắn, fixup bỏ lời nhắn.',
      'Vẫn là rebase: Oid đổi hết, và bản cũ ở lại trong kho.',
    ],
    proTips: [
      'Dọn lịch sử TRƯỚC khi push. Sau khi push thì việc dọn trở thành bài G20.',
    ],
  },
  theoryId: '12-rebase-tuong-tac',
  /*
   * `--script` là một cờ CỦA GAME, không có ở git thật, và đó là chủ ý.
   *
   * `git rebase -i` thật mở một trình soạn thảo — một bước tương tác mà một
   * `RunLog` không ghi lại được và một test tự động không gõ được. Ô nghiệm thu
   * AC-8 chạy `solutionCommands` của cả 32 level, nên nếu G12 chỉ giải được
   * bằng tay thì nó là level DUY NHẤT không có phép đo, và nó sẽ im lặng trượt
   * khỏi mọi lần kiểm về sau.
   *
   * Giao diện vẫn cho người chơi kéo thả kịch bản như bình thường; `--script`
   * là hình dạng mà thao tác đó được GHI LẠI. Cùng lý do `setSpeed` của game
   * K8s không đi vào nhật ký: thứ người chơi làm với giao diện phải quy được về
   * một chỉ thị phát lại được.
   */
  solutionCommands: ['git rebase -i HEAD~3 --script pick,squash,squash'],
  altSolutionCommands: [
    'git reset --soft HEAD~3',
    'git add -A',
    'git commit -m "Thêm tính năng đăng nhập"',
  ],
  par: 2,
};
