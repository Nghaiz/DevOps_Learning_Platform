# Phòng thí nghiệm Git (`gameId: 'git'`)

> **Đã hiện thực**, P17, 2026-09-14. Tài liệu này mô tả thứ ĐANG CHẠY, không phải
> thứ dự định làm. Thiết kế gốc: [`../../plans/reports/2026-09-11-brainstorm-git-cicd-games.md`](../../plans/reports/2026-09-11-brainstorm-git-cicd-games.md) §3.
> Kế hoạch thi công: [`../../plans/devops-learning-platform/phase-17.md`](../../plans/devops-learning-platform/phase-17.md).

Người chơi gõ **lệnh git thật** trên một kho được mô phỏng hoàn toàn trong trình
duyệt. Ba chương, 32 level: nắn lịch sử, làm việc nhóm, cứu hộ.

---

## 1. Vì sao tự viết engine thay vì dùng thư viện

`isomorphic-git@1.42.0` được cân nhắc và bị loại vì ba điều **đo được**, không vì
sở thích:

| Đo được | Hệ quả |
|---|---|
| 70 hàm API công khai, **không có `rebase`, không có `reflog`** | Hai chương trong ba không làm được |
| `commit()` băm `Math.floor(Date.now()/1000)` vào SHA | Cùng một chuỗi lệnh ra SHA khác nhau mỗi lần chạy, hỏng thẳng khả năng phát lại |
| `wasm-git` là 805KB–1.5MB wasm, pthreads đòi header COOP/COEP | Siết cả trang, phá nhúng bên thứ ba |

Vế thứ hai là vế quyết định. Cơ chế chống gian lận của trụ cột ③ dựa vào **phát
lại tất định**: máy chủ chạy lại `RunLog` và chỉ công nhận điểm khi kết quả khớp
lời khai của client. Một engine không tất định làm toàn bộ cơ chế đó vô nghĩa.

---

## 2. Mô hình

```
ObjectStore:  Record<Oid, Blob | Tree | Commit>   // KHÔNG BAO GIỜ xoá
Blob:         string[]                            // theo DÒNG, không phải byte
Tree:         TreeEntry[]                         // sắp theo path
Commit:       { tree, parents[], message, author, logicalTime }
Refs:         Record<RefName, Oid>                // gồm refs/remotes/origin/*
HEAD:         { type: 'ref', ref } | { type: 'detached', oid }
Index:        Record<FilePath, Oid>               // TÁCH khỏi worktree
Worktree:     Record<FilePath, string[]>
Reflog:       Record<RefName, ReflogEntry[]>
Repos:        { local: Repo, origin: Repo | null }
```

**Ba quyết định đáng giải thích** (design §3.2):

1. **`Blob` là mảng dòng.** Conflict trong git là chuyện *hunk theo dòng*, nên
   mảng dòng là đúng đơn vị cho merge 3 ngả diff3.
2. **`ObjectStore` không bao giờ xoá.** Đây là điều kiện để chương 3 tồn tại:
   "mất commit rồi cứu" chỉ có nghĩa nếu commit VẪN nằm trong kho sau khi không
   ref nào trỏ tới. Cần tách *lưu trữ* khỏi *reachability* — thứ mà mô hình cây
   thuần không có, và là lý do chính xác vì sao Learn Git Branching không thể có
   `reflog` (đo được: 0/71 file `src/js` nhắc nó).
3. **`Index` tách khỏi `Worktree`.** Ba vùng phải nhìn thấy được cùng lúc thì mới
   dạy được `reset --soft/--mixed/--hard` — misfit mà Perez De Rosso & Jackson
   (MIT, Onward! 2013) đo được.

**Cố tình bỏ:** định dạng object nhị phân của git, zlib, packfile/delta, SHA-1
thật, submodule, sparse-checkout, hook, filter, chmod/mode bit, symlink, file
nhị phân. Không cái nào phục vụ ba chương.

### Băm

FNV-1a **64 bit** trên byte UTF-8, chuẩn hoá NFC trước khi băm, hiển thị 7 hex.

- **Không SHA-1 thật** vì `crypto.subtle.digest` trả Promise, và biến engine
  thành bất đồng bộ để băm sẽ nhiễm `async` lên toàn bộ `merge`, `rebase`, bộ
  chấm, và cả bên phát lại phía máy chủ.
- **64 chứ không 32 bit** vì ở 32 bit, xác suất đụng độ sinh nhật với 3000
  object là ~0.1%, và triệu chứng của nó là một commit bỗng "biến thành" commit
  khác — loại lỗi không ai chẩn đoán nổi.
- **UTF-8 chứ không `charCodeAt`** vì nội dung là tiếng Việt có dấu, và băm theo
  UTF-16 làm Oid phụ thuộc cách JS biểu diễn chuỗi thay vì phụ thuộc nội dung.
  Ngày nào phía chấm viết lại bằng Go thì hai bên ra hai số khác nhau.
- **NFC** vì tiếng Việt có hai cách gõ cùng một chữ, và hai cách đó khác byte.

`BigInt` dựng bằng `BigInt('0x…')` chứ không bằng literal `0x…n`: `apps/web`
nhắm `target: ES2017` và ở mức đó `tsc` từ chối literal BigInt.

---

## 3. Tất định — năm điều kiện, năm phép đo

Toàn bộ ở `packages/games/src/git/determinism.test.ts` và
`determinism.jsdom.test.ts`, cộng cổng CI `scripts/check-git-determinism.mjs`.

| # | Điều kiện | Đo bằng |
|---|---|---|
| J.1 | Hash thuần tuý | 1000 lần dựng lại · 20 hoán vị thứ tự chèn của tree · NFC hai cách gõ · tiền tố độ dài chặn giả mạo bằng lời nhắn |
| J.2 | Không `Date.now()`, không `Math.random()` | Cổng CI grep có **đối chứng dương chạy trước mỗi lần quét** |
| J.3 | Lặp qua khoá đã sắp | 5 thứ tự chèn ⇒ một hash, kèm đối chứng nội-dung-khác-thì-hash-khác |
| J.4 | Replay = `(levelId, seed, lệnh[])` | 20 lượt mẫu khớp cả trạng thái lẫn verdict |
| J.5 | Chạy được ở Node | Cùng bộ kỳ vọng chạy ở `jsdom`, kèm ô khẳng định môi trường ĐÚNG là jsdom |

⚠ **J.5 là điều kiện sống còn của P18.** Nếu nó đỏ thì chế độ thi chỉ là danh dự:
máy chủ chấm bằng Node, người chơi chơi trong trình duyệt, và hai bên ra hai con
số khác nhau nghĩa là mọi lượt nộp HỢP LỆ đều bị từ chối.

**Vì sao J.2 phải là một cổng CI, không phải một ghi chú:** hỏng tất định không
làm gì đỏ. Engine vẫn chạy, người chơi vẫn qua bài, mọi test đơn vị vẫn xanh —
vì mỗi test chỉ chạy engine MỘT lần.

---

## 4. Chấm bài: so TRẠNG THÁI, không so lệnh

25 vị từ ở `packages/games/src/git/predicates.ts`. Mỗi `Objective` **là một
testcase**; verdict `AC` khi và chỉ khi mọi testcase bắt buộc qua.

⛔ **Không bao giờ khớp mẫu lệnh đã gõ.** gitmastery.me khai
`LevelRequirement { command, requiresArgs[] }` và chấm theo cách đó; hệ quả đo
được là gõ đúng lệnh mà repo sai bét vẫn qua bài, và không thể có nhiều lời giải.

**Ô nghiệm thu AC-9 tồn tại chính xác để chứng minh ta không trượt vào mô hình
đó**: mỗi level trong 32 có `altSolutionCommands` khác đường đi, và một test
chạy cả 32 lời giải thứ hai rồi khẳng định chúng cũng AC. Nếu ai đó lén thêm một
vị từ "người chơi đã gõ lệnh X" thì ô này đỏ.

Ba vị từ có bẫy đã vá tại chỗ:

- `noConflictMarkers` trả `false` khi file **vắng mặt** — nếu không thì xoá file
  là một lời giải hợp lệ, và đó là lời giải một người chơi mệt mỏi sẽ tìm ra.
- `commitUnreachable` đòi commit **CÓ trong kho** mà không với tới được — một
  commit chưa bao giờ tồn tại cũng "không với tới được".
- `verdictOf` đếm theo objective **bắt buộc**, không đếm mục thưởng — hiện `4/6`
  cho một người đã AC là nói dối.

---

## 5. Hai cú pháp ref thêm vào, và một lệnh của game

| Cú pháp | Có ở git thật? | Vì sao cần |
|---|---|---|
| `<ref>@{n}` | **Có** | Đọc nhật ký dịch chuyển. Khác `~n` đọc lịch sử: sau `reset --hard`, `HEAD~1` đi về tổ tiên của chỗ MỚI, `HEAD@{1}` đưa bạn về chỗ CŨ. Thiếu nó thì 6/8 level chương 3 không có lời giải nào |
| `:/<chữ>` | **Có**, nhưng ta nới rộng | git thật chỉ tìm commit với-tới-được; ở đây tìm cả commit mồ côi. Đó là điều kiện để chương 3 có `solutionCommands` viết được — người chơi thật đi bằng `git fsck --lost-found` rồi copy Oid, mà AC-8 phải viết lời giải TRƯỚC khi biết Oid |
| `git write <path> -c "…"` | **Không**, lệnh của game | Game mô phỏng một kho git nhưng không mô phỏng một trình soạn thảo. Thiếu nó thì mọi level cần "sửa file rồi commit" (G22, G23) không có lời giải chạy được, và chúng biến mất khỏi AC-8 trong im lặng |
| `git rebase -i --script pick,squash,…` | **Không**, cờ của game | `rebase -i` thật mở trình soạn thảo, tức một bước tương tác mà `RunLog` không ghi lại được |

Ba thứ "của game" đều ghi lý do ngay tại chỗ khai. Chúng tồn tại vì **thao tác
giao diện phải quy được về một chỉ thị phát lại được**, nếu không thì việc chấm
lại phía máy chủ không phủ hết những gì người chơi làm được.

---

## 6. Renderer

**Một layout, hai renderer** — nhưng đợt này chỉ có một renderer thật.

`core/layout/layoutDag()` tính toạ độ **ô lưới** `[depth, lane]` thuần, không
biết gì về SVG hay three.js. Renderer SVG đọc nó thành `(x, y)`; renderer 3D
(P17b) sẽ đọc thành `(x, z)` và chừa trục `y` cho một biến duy nhất.

`d3-dag@1.2.2` được **đo thật** rồi loại. Lý do quyết định không phải kích thước
mà là: thêm một nhánh làm **4/6 commit cũ đổi làn**, mà `git branch` là lệnh
thường ngày. Nó tối ưu toạ độ cho từng lượt layout, còn ta cần làn mang *danh
tính nhánh*.

⚠ **`Oid` không đủ làm định danh cảnh.** Sau `push`, cùng một Oid tồn tại ở CẢ
HAI kho (đó là ý nghĩa của địa chỉ hoá theo nội dung). Định danh là `repo:oid`,
và `layoutDag` chạy **một lần mỗi kho** — gộp hai kho vào một lượt thì phép khử
id trùng sẽ xoá im lặng toàn bộ commit đã push của `origin`.

### a11y không phải việc phụ

`<svg role="group">` **chứ không phải `role="img"`**: `role="img"` biến cả cây
con thành presentational, nên trình đọc màn hình gộp cả đồ thị thành MỘT nhãn và
không đọc từng commit nữa. axe **không** bắt lỗi này, nên nó sẽ đi qua cổng
trong im lặng.

Mỗi node commit focus được, có `role`, có nhãn tiếng Việt đọc ra message, oid
ngắn, nhánh nào trỏ tới, còn sống hay đã mất. Điều hướng bàn phím phủ **mọi**
thao tác: Tab qua từng commit, ←/→ theo cạnh cha/con, ↑/↓ đổi làn và bắc qua
khoảng trống giữa hai kho, Enter/Space chọn, Home/End.

⚠ **"Mờ" của commit mồ côi KHÔNG làm bằng `opacity`.** `opacity: 0.45` hạ tương
phản chữ theo đúng hệ số đó và mất AC-6. Mờ = nền `--muted` + viền **đứt**, chữ
giữ nguyên tương phản.

⚠ **`--border` trên `--background` chỉ đạt 1.30:1 — trượt ngưỡng 3:1.** Phản xạ
tự nhiên là vẽ cạnh bằng `--border`, nhưng cạnh cha-con MANG NGHĨA (nó LÀ quan
hệ cả game dạy) nên chịu SC 1.4.11. Nét vẽ dùng `--muted-foreground`.

⚠ **axe KHÔNG đo tương phản trong jsdom** (`color-contrast` luôn `incomplete` vì
không có layout, không có canvas 2D). Đừng đọc "axe 0 vi phạm" thành "đã kiểm
tương phản" — phần đó do `git-palette.test.ts` gác, và nó đọc thẳng bảng cặp màu
của `packages/ui/src/theme/tokens.contract.test.ts` thay vì chép lại số học màu.

---

## 7. Bài lý thuyết

32 bài ở `content/games/git/theory/`, ánh xạ **một-một** với level qua
`theoryIdForLevel` (bỏ tiền tố `git-`). Ánh xạ thuần cú pháp là chủ ý: một bảng
tra thứ hai giữa level và bài đọc là một chỗ nữa để lệch.

`validateTheoryDocs` kiểm **ba chiều**, không phải hai như plan đòi:

1. Mọi `usedByLevels` trỏ tới level có thật.
2. Mọi level được ít nhất một bài phủ.
3. **Không level nào bị hai bài cùng nhận** — `GitLevel.theoryId` đơn trị, nên
   một trong hai bài sẽ không bao giờ mở được, và không chiều nào trong hai
   chiều kia bắt được điều đó.

`readMinutes` bị gác bằng **số từ thật** (±1 phút, 200 từ/phút), không phải một
con số cho đẹp.

⚠ **`content/` đọc lúc chạy KHÔNG được Next trace.** `apps/web/Dockerfile` phải
`COPY content ./content` tường minh, và `.dockerignore` phải giữ dòng ngoại lệ
markdown để nó thắng luật loại-mọi-markdown ở trên. Ô nghiệm thu AC-10 kiểm một
**FILE cụ thể** chứ không kiểm thư mục, vì `.dockerignore` từng bóc sạch markdown
bài học mà `ls` vẫn xanh do thư mục vẫn tồn tại.

Đường dẫn trong image là `/repo/content/...` (runner stage đặt `WORKDIR /repo`),
**không phải** `/app/content/...`.

---

## 8. Ngoại lệ cổng, và một tiền đề sai đã sửa

`check-no-commerce.mjs` cấm từ `checkout` trên toàn bộ vùng quét, và
`packages/games/src` **có** trong vùng quét từ 2026-09-08 (commit `5c3815c`).

Plan P17 §0 ghi ngược lại, và §17.C.3 chốt "giữ nguyên, không thêm vào vùng
quét" dựa trên đó. Scout của P17 đã đọc một trạng thái đã cũ.

Cách xử: **miễn trừ hẹp theo ba chiều cùng lúc** — đường dẫn + luật + đúng một
từ. Gỡ `packages/games/src` khỏi `ROOTS` sẽ mở toang lại đúng vùng mã mà
`5c3815c` vừa đóng, và mở toang trong im lặng.

Đối chứng dương ba chiều, đã chạy thật:

| Phép thử | Kỳ vọng | Kết quả |
|---|---|---|
| `checkout` NGOÀI vùng miễn trừ | bị bắt | bị bắt |
| `checkout` TRONG vùng miễn trừ | không bị bắt | không bị bắt |
| `bảng giá 99k/tháng` TRONG vùng | VẪN bị bắt | VẪN bị bắt |

Thiếu chiều thứ ba thì một miễn trừ có thể vô tình mở cả vùng.

`check-design-tokens.mjs`: **không cần ngoại lệ nào.** Bảng màu game Git dùng
100% token ngữ nghĩa. Thêm một dòng vào `KNOWN_HARDCODED` sẽ làm cổng **ĐỎ**, vì
chiều-xuống của sổ cái báo dòng miễn trừ cho một file sạch là hết hạn.

---

## 9. Còn nợ

| Việc | Trạng thái |
|---|---|
| **17.K — tầng 3D** | Chưa làm. Chủ dự án chốt hoãn sang một chặng riêng; đường 2D là đường được đánh bóng duy nhất ở đợt này. `resolveRendererMode({ has3d: false })` là MỘT chỗ để đổi khi nó xong |
| **17.Q — sandbox** | Chưa làm. Chặn Level Builder ở P18 |
| Mô phỏng mù màu trên ảnh chụp cảnh thật (§17.C.5 vế hai) | Chưa làm. Bù bằng kênh hình học: mọi cặp trong 6 trạng thái khác nhau ở ≥2 kênh ngoài màu |
| `PendingOp` nhánh `'stash'` | Khai trong hợp đồng, `ops/stash.ts` đã nối phép trộn ba ngả thật. `pop --abort` hiện vứt thay đổi cục bộ chưa commit vì nhánh đó chưa mang ảnh chụp worktree |
| `GitOpResult` / `RepoOpResult` | Hai kiểu trùng nhau từng trường, do hai lane khai. Nên gom về `contract.ts` |
