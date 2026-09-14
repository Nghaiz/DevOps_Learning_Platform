# Phòng thí nghiệm Git (`gameId: 'git'`)

> **Đã hiện thực**: engine + đường 2D ở P17 (2026-09-14), tầng 3D ở **P17b**
> (17.K). Tài liệu này mô tả thứ ĐANG CHẠY, không phải thứ dự định làm.
> Thiết kế gốc: [`../../plans/reports/2026-09-11-brainstorm-git-cicd-games.md`](../../plans/reports/2026-09-11-brainstorm-git-cicd-games.md) §3.
> Kế hoạch thi công: [`../../plans/devops-learning-platform/phase-17.md`](../../plans/devops-learning-platform/phase-17.md)
> và [`phase-17b.md`](../../plans/devops-learning-platform/phase-17b.md) (tầng 3D:
> phạm vi, bảy lỗi hợp đồng, số đo AC-7).

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

**Một layout, hai renderer** — và từ P17b thì cả hai đều có thật.

`core/layout/layoutDag()` tính toạ độ **ô lưới** `[depth, lane]` thuần, không
biết gì về SVG hay three.js. Renderer SVG đọc nó thành `(x, y)`; renderer 3D đọc
thành `(x, z)` và chừa trục `y` cho một biến duy nhất — xem "Tầng 3D" bên dưới.

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

## 6b. Tầng 3D (P17b · 17.K)

Mã ở `apps/web/src/components/games/git/scene3d/`. Nền hợp đồng là
`scene3d-contract.ts` — **toán thuần, không một dòng `three`**, để nó test được ở
env `node` và để mã không-3D import nó mà không kéo theo ~631KB `three` +
`@react-three/fiber` + `drei` + `postprocessing`. P17 đã một lần rò engine sang 6
route không liên quan vì một barrel (`44f8e39`); cổng `bundle:check` gác chỗ đó.

### Ba trục, mỗi trục đúng MỘT nghĩa

| Trục | Biến | Nguồn |
|---|---|---|
| **X** | thời gian logic | `ScenePlacedNode.depth` |
| **Z** | làn nhánh + khoảng trống giữa hai kho | `ScenePlacedNode.lane`, `REPO_LANE_GAP` |
| **Y** | **độ lệch khỏi nhánh chính** | `\|lane - MAIN_LANE\|` |

Đây là ràng buộc **ngữ nghĩa**, không phải thẩm mỹ. Một trục mang hai biến là một
trục người chơi **đọc sai mà không biết mình đang đọc sai** — họ vẫn thấy một
hình rõ ràng, chỉ là hình đó nói một câu khác câu ta định nói. Không có triệu
chứng nào để lần ra, nên chỗ duy nhất chặn được là ở đây.

Hệ quả kéo theo: đừng thêm biến thứ hai vào một trục đã có chủ. Muốn mã hoá thêm
một thông tin thì dùng kênh khác (hình khối, ký hiệu, nhịp đứt của cạnh) — bảng
`ACCENT_STYLE`/`EDGE_STYLE` ở `git-palette.ts` tồn tại chính vì lý do đó.

### X dùng chung cho cả hai kho — và đó là một phép ĐO, không phải một lời khai

Một commit đã push phải đứng ở **cùng một X** ở khối `local` và khối `origin`. Đó
là điều kiện để `push`/`fetch` bay **ngang theo phương Z** chứ không bay chéo.

⚠ Điều đó **không được bảo đảm bằng xây dựng.** `place3d()` lấy `depth` từ **hai
lượt `layoutDag` độc lập** trên hai tập node khác nhau, và `computeDepths` tính
"đường dài nhất từ một gốc" **trong đúng tập được đưa vào**. Hai lượt khớp nhau
**với điều kiện** mỗi tập đóng-với-tổ-tiên — đúng với kho git thật, nhưng không
một dòng mã nào khẳng định điều kiện đó.

Khi nó vỡ thì không có lỗi nào được ném: cạnh `remote-mirror` chỉ đi **chéo** thay
vì thẳng, và nó đi chéo đúng ở những level dạy `push`/`fetch` — tức đúng chỗ hình
ảnh đó phải nói lên điều gì. Nên `Scene3DPlacement.depthDisagreement` **đếm** số
commit vỡ bất biến, và gốc hợp thành phát nó ra cảnh báo. Đừng nuốt con số đó.

### Vì sao nhánh phụ dâng LÊN, và chiều xuống thuộc về "mất"

`deviationY()` luôn trả `>= 0`: nhánh phụ **dâng lên** khỏi đường chính. Chiều
**xuống** vì thế còn trống, và K.7 dành trọn nó cho nghĩa "mất":

| Lệnh | Câu phải đọc ra bằng mắt |
|---|---|
| `reset --hard` | commit **chìm** xuống — khuất, chưa mất |
| `reflog` | commit chìm **nổi lại đúng chỗ cũ** — nó chưa bao giờ mất |
| `force-push` | bản ở kho xa **vỡ và tan** — đây mới là mất thật |
| `rebase` | commit MỚI được tạo; bản cũ **vẫn còn**, chỉ mờ đi |
| `cherry-pick` | một **bản sao** tách ra, giữ một chỉ mờ về nguồn |

Nếu nhánh phụ cũng đi xuống thì hai ý nghĩa trái ngược dùng chung một hướng và
**cả hai mất nghĩa**. Đó là lý do `rebase` và `cherry-pick` bay theo vòng cung
**lên**, dù đường thẳng ngắn hơn. Vòng cung lên là chuyển động **thoáng qua** (về
0 ở `t=1`) nên nó không tranh chấp với phép mã hoá Y **thường trú** của độ lệch
nhánh — hai thứ ở hai thang thời gian khác nhau, không phải hai thứ chồng lên
nhau.

⚠ `lerp()` của `motion-script.ts` dùng dạng `(1 - t) * a + t * b`, **không** dùng
`a + (b - a) * t`. Dạng quen thuộc kia không khôi phục đúng `b` ở `t=1` trong dấu
phẩy động (`lerp(1, 0.32, 1)` ra `0.32000000000000006`). Sai số 1e-17 vô hình
trên màn hình nhưng phá đúng một thứ: `reflog` phải trả commit về **ĐÚNG** chỗ
`reset --hard` lấy đi, và "đúng" ở đây là bằng nhau từng bit — cả bài học trung
tâm của chương 3 nằm ở chỗ đó.

### Ba mặt phẳng HEAD / Index / Worktree

`PLATE_Y` đặt chúng ở **dải Y riêng** (9.0 / 11.5 / 14.0), nằm hẳn trên vùng DAG.
Nhờ vậy trục Y ở tầng DAG vẫn mang đúng một biến: ba mặt phẳng là một **tầng
khác**, không phải một biến thứ hai trên cùng trục.

Thứ tự từ dưới lên là HEAD → Index → Worktree, tức **thời gian ngược của dòng
chảy git**: thay đổi đi Worktree → Index → HEAD, nên `git add` là một động tác đi
**xuống** và `checkout` đi **lên**.

⚠ **Cột của mỗi ô file khoá theo ĐƯỜNG DẪN**, không theo thứ tự duyệt. Cả điểm
của ba mặt phẳng chồng lớp là thấy MỘT file rơi **thẳng** xuống khi `git add` —
muốn thấy được thì `README.md` phải đứng ở cùng một X trên cả ba mặt phẳng. Đánh
số theo thứ tự duyệt hỏng ngay khi một file có ở Worktree mà chưa có ở Index: mọi
file phía sau lệch một cột, và "rơi thẳng" thành "rơi chéo sang bên" — vẫn là một
hoạt cảnh trơn tru, chỉ dạy sai.

⚠ **MỘT phép so chuỗi cho cả hai chỗ.** Bản đầu đánh số cột bằng `.sort()` trần
(thứ tự UTF-16) rồi sắp mảng plate bằng `localeCompare` — hai phép so khác nhau
trên cùng một tập đường dẫn. Với đường dẫn ASCII chúng trùng nhau nên không ai
thấy gì; với tiếng Việt thì không (`localeCompare` xếp `đ` sau `d`, UTF-16 xếp nó
sau `z`). Nay cả hai chỗ đi qua `byPath` duy nhất.

#### `assertPlanesClearOfDag()` — cổng LÚC CHẠY, không phải một chú thích

Một level 40 làn sẽ đẩy DAG lên đụng mặt phẳng Index. Hai tầng chồng nhau trông
giống một bug render ngẫu nhiên và tốn một buổi để lần ra, nên bất biến đó có một
cổng thật chạy lúc dựng cảnh.

Hai lần cổng này đã sai, và cả hai đáng nhớ:

1. **Lạc quan 18%.** Nó tính bằng `NODE_RADIUS` trần trụi trong khi `ACCENT_3D`
   phóng `head` lên **1.18** — cổng trả "sạch" trong khi DAG đã chạm mặt phẳng
   HEAD. Một cổng nới tay hơn thứ nó gác thì vẫn xanh đúng vào lúc bắt đầu hỏng,
   và đó là kiểu hỏng tệ nhất. Hợp đồng nay khai **trần** `MAX_NODE_SCALE = 1.25`
   (không phải đúng 1.18, để một accent mới có chỗ mà không phải sửa hợp đồng —
   nhưng vượt trần thì phải sửa ở đây, có chủ ý).
2. **Đặt sai tầng.** Nó chỉ đo độ lệch nhánh của **node**, nên mù với mọi thứ
   khác nhô lên: cung của cạnh `remote-mirror`, nhãn nổi trên node, vòm của
   chuyển động `reflog`. **Ba lane độc lập đâm vào đúng khe hở đó rồi mỗi lane tự
   vá cục bộ.** Ba bản vá riêng cho một khe hở là dấu hiệu cổng đặt sai tầng, chứ
   không phải dấu hiệu ba lane bất cẩn — nay nó nhận `extraLift`, là chỗ đúng cho
   phần nhô thêm của *bất cứ thứ gì khác*.

### Hai chế độ là NGANG HÀNG, mặc định 2D

`resolveRendererMode()` (`games/shared/renderer-mode.ts`) quyết, và thứ tự xét là
hợp đồng: 3D không có trong bản dựng ⇒ 2D · có lựa chọn tay ⇒ tôn trọng · chưa
chọn ⇒ `fallback`.

**Mặc định là `2d` kể cả trên máy chạy được 3D.** Không phải vì 3D kém: 2D nạp
ngay và không tốn 631KB, còn ai muốn 3D thì bấm một lần và lựa chọn đó được nhớ ở
`localStorage` khoá `dlp:games:renderer-mode`.

**Lựa chọn tay thắng kết quả dò.** Chọn 2D trên máy có WebGL2 là một lựa chọn
**hợp lệ**, không phải một sự cố cần sửa: trong bốn lý do 2D là chế độ ngang hàng
(không có WebGL2 · trình đọc màn hình · ảnh in cho báo cáo NCKH · test tự động),
**ba lý do sau không liên quan gì tới phần cứng**. Một bộ dò đè lên lựa chọn tay
sẽ đá người dùng ra khỏi chế độ họ cần, mỗi lần tải trang, và không nói vì sao.

Chiều ngược lại vẫn giữ: chọn tay `3d` trên máy **đã đo được** là `'unavailable'`
thì hạ về 2D — ở đó 3D không hiện được gì, và một canvas trắng còn tệ hơn một lựa
chọn bị bỏ qua. Trạng thái `'unknown'` (chưa đo) **không** kích hoạt nhánh này:
chưa đo thì chưa có quyền phủ quyết.

`ResolvedMode.reason` (`user` / `no-webgl` / `no-3d-build` / `default`) tồn tại
để phân biệt "người dùng chọn 2D" với "máy không chạy nổi 3D" — hai thứ trông y
hệt nhau trên màn hình mà đòi hai câu giải thích khác hẳn nhau.

⚠ Tầng 3D nạp qua `dynamic(() => import('./scene3d/index.ts'), { ssr: false })`.
**Cả hai vế đều bắt buộc**: `ssr: false` vì `three` đụng `window`/`canvas` lúc
dựng; **nạp động** vì một `import` tĩnh kéo 631KB vào bundle của mọi người chơi,
kể cả người ở chế độ 2D và kể cả người chưa từng mở game.

`has3d: true` trong `git-game.tsx` là **chỗ duy nhất** phải đổi khi bật/tắt tầng
3D, đúng như bản ghi đóng chặng P17 dự trù.

### Bàn phím là TOÀN BỘ đường điều khiển camera

Không phải một lối tắt thêm vào: lane này **cấm xoay bằng chuột**, nên thiếu một
thao tác ở đây là thao tác đó không tồn tại cho ai cả (AC-L).

| Phím | Việc |
|---|---|
| `Q` / `E` | xoay lùi / tới qua **tám góc cố định** |
| `+` (`=`) / `-` (`_`) | phóng to / thu nhỏ, thang nhân `1.25` mỗi bước |
| `0` | đặt lại **cả ba**: góc mở màn, phóng `1`, bỏ điểm ngắm → khung toàn cảnh |
| `T` / `Shift+T` | nhảy tới ref kế tiếp / ref trước đó |
| `1`–`9` | nhảy thẳng tới ref thứ n; **ref của nhánh đang đứng luôn là phím `1`** |

**Tám góc chứ không phải bốn.** Bốn góc chính đều là góc nhìn thẳng vào một mặt:
ở 0° và 180° thì trục Z (làn nhánh) chạy thẳng vào mắt và các làn chồng khít lên
nhau; ở 90° và 270° thì đến lượt trục X (thời gian logic) biến mất. Bốn góc chéo
là những góc **duy nhất** đọc được cả ba trục cùng lúc. Cũng không nhiều hơn tám:
đổi góc là bấm liên tiếp, và một vòng 16 bước biến "quay ra mặt sau" thành tám
lần bấm.

Góc mở màn là chỉ số **1** (45°), không phải 0 — ở 0 mọi làn nhánh xếp chồng lên
nhau, đúng cảnh tệ nhất để mở màn một đồ thị nhiều nhánh. Góc nghiêng **cố định
30°** và không đổi được lúc chạy: thấp hơn thì mất khả năng tách làn theo Z, cao
hơn (nhìn từ trên xuống) thì trục Y dẹp lại thành không — mà Y là thứ mang nghĩa
"nhánh phụ dâng lên".

**Phím số bắt đầu từ ref của nhánh đang đứng** vì đó là thứ người chơi cần nhất
và cũng là thứ họ hay lạc mất nhất sau một cú `checkout`. Ref không trỏ tới một
commit có chỗ đứng thì bị **loại khỏi danh sách** — nhảy camera tới một toạ độ
bịa ra là cách chắc chắn nhất để người chơi tin rằng commit đó tồn tại ở đó.

⚠ **Không nuốt phím có phím bổ trợ.** `Ctrl+0` là "về cỡ chữ gốc" của trình
duyệt; cướp nó là cướp một thứ người ta đã có từ trước.

⚠ **Bàn phím gắn ở `<div>` bọc ngoài, không gắn lên `<Canvas>`.** R3F chuyển mọi
prop lạ xuống một `<div>` bọc của nó, nên `role="img"` và `tabIndex` sẽ rơi vào
CÙNG một phần tử — một "hình ảnh" focus được là thứ trình đọc màn hình không biết
phải nói gì. Tách ra: khối ngoài là `role="group"` (nhóm điều khiển), khối trong
là `role="img"` (hình ảnh).

#### Camera orthographic — hai bẫy trực giác

1. **Khoảng cách KHÔNG đổi độ lớn.** Với phép chiếu song song, dời camera ra xa
   chỉ đổi xem cái gì còn nằm giữa `near` và `far`. Phản xạ từ camera phối cảnh
   ("cảnh bị cắt, lùi ra xa thêm") ở đây vô tác dụng — muốn thu nhỏ thì giảm
   `zoom`, và **chỉ** `zoom`. Đừng "sửa" `frameDistance()`.
2. **`zoom` ở đây là số pixel trên một đơn vị world**, không phải một hệ số.
   `ortho-camera-rig.tsx` khai khung nhìn đúng bằng kích thước canvas tính bằng
   pixel, nên `zoom = 1` nghĩa là 1 đơn vị world vẽ ra 1 pixel. Đổi khung nhìn
   của rig sang hệ khác thì mọi con số trong `camera-angles.ts` sai theo — và sai
   **im lặng**, vì cảnh vẫn vẽ ra, chỉ ở sai tỉ lệ. Hai file đó là một cặp.

⚠ `bounds` phải bao **cả ba mặt phẳng ô file**, không chỉ node. Bản đầu chỉ duyệt
`nodes`, mà `assertPlanesClearOfDag()` bảo đảm DAG luôn nằm *dưới* `PLATE_FLOOR`
— nên ba mặt phẳng nằm hoàn toàn ngoài hộp bao và bấm `0` **cắt sạch K.3 khỏi màn
hình**. Camera lúc đó làm đúng thứ `bounds` nói; chính `bounds` mới sai.

### Vẽ theo yêu cầu (`frameloop="demand"`)

Không có gì được vẽ cho tới khi ai đó gọi `invalidate()`. Gác nó bằng sai tín
hiệu là bẫy đã trả giá ở arena: `pointerenter`/`pointerleave` trên canvas ⇒ rê
chuột sang HUD là **vòng lặp dừng hẳn**, ngay lúc người chơi vẫn đang nhìn thẳng
vào cảnh. Tín hiệu đúng cho câu hỏi "người dùng có nhìn thấy cảnh không" là
`document.visibilityState` + `IntersectionObserver`.

Và vì mọi thứ **đổi mà không sinh chuyển động** — chọn commit, rê chuột lên node,
đổi theme, đổi góc camera — cũng cần đúng một khung, `FramePump` xin một khung
sau **mỗi** lượt render của cây React. Một khung cho một lượt render, không hơn.

⛔ Vì vậy `GitCanvas` **cố tình không được bọc `memo`**. Bọc lại thì `FramePump`
không render lại khi cha đổi prop, không ai xin khung, và cảnh đứng hình sau mỗi
lệnh người chơi gõ — im lặng, không lỗi.

### AC-7 — số đo, và vì sao cặp `triangles`/`calls` mới là bằng chứng

Đo 2026-09-14. Chromium, `?fx=off`, build production dựng tại chỗ. Kênh
`globalThis.__dlpGitScene`, `gl.info.reset()` gọi ở **đầu** mỗi `useFrame`.

| Mốc | draw call | triangles | objects |
|---|---|---|---|
| 2 commit | 18 | 1.356 | 16 |
| + 2 nhánh, 14 lệnh | 20 | 6.108 | 17 |
| + 8 commit nữa | **20** | **10.860** | 17 |

**Bằng chứng nằm ở cặp số, không ở ngưỡng 100.** `20 < 100` chỉ nói *cảnh hiện
tại đủ nhỏ* — nó sẽ đúng với một kiến trúc vẽ mỗi commit một `Mesh`, ở đúng level
đang đo, rồi hỏng ở level sau mà không ô nào đỏ. Thứ thật sự chứng minh instancing
gộp lô là **triangles +78% ở mốc cuối trong khi draw call đứng nguyên ở 20**. Nên
khẳng định chính của ô e2e là `larger.calls` **bằng** `large.calls`, còn `< 100`
là một hệ quả ghi kèm cho khớp lời văn của plan.

⚠ **Phép so đó phải đặt giữa mốc HAI và mốc BA.** Giữa mốc 1 và 2 draw call
**được phép** tăng (18 → 20): đồ thị lớn lên làm xuất hiện thêm **loại** accent và
loại cạnh, mà mỗi loại kích hoạt một lô instance. Instancing hứa draw call tăng
theo **số loại** — có trần cứng: 5 khối + 1 ký hiệu + 4 bó cạnh + chấm nối + khối
kho — **không** theo số commit (không có trần). Đòi bất biến ở mốc mà loại còn
đang xuất hiện là đòi một thứ mạnh hơn cả kiến trúc lẫn K.4, và nó sẽ đỏ mãi vì
một lý do không phải lỗi.

⚠ **Tiền đề "8 commit đã vào cảnh" phải đo `triangles`, không đo `objects`.**
`objects` đếm object trong scene, mà thêm commit vào một `InstancedMesh` có sẵn
**không** tạo object mới — 17 → 17, đúng việc instancing làm. Một tiền đề đo
`objects` ở đây vô tình đòi instancing *không* hoạt động. `three` nhân số tam giác
với `instanceCount`, nên **triangles là đại lượng duy nhất trong kênh đo theo dõi
được số commit đang vẽ**.

Bốn tiền đề chống-xanh-giả của ô (gác **chiều ngược lại** — chúng đỏ khi phép đo
KHÔNG chạy): `calls > 1` (hậu kỳ đã tắt thật) · `triangles > objects` (cảnh có
hình, không phải canvas vừa mount) · `objects` tăng giữa hai mốc (engine đang
chạy) · `colorsDegraded === null` (bảng màu đọc được thật, không rơi về xám).

#### Ba bẫy ở TẦNG NGOÀI ô — không cái nào bị bốn tiền đề bắt

Cả bốn tiền đề nằm **bên trong** ô, nên chúng vô hiệu khi thứ hỏng nằm ngoài. Cả
ba lần dưới đây đều kết thúc bằng `[exited with code 0]`:

1. **`E2E_ORIGIN=127.0.0.1`** → Better Auth so origin **theo chuỗi** với
   `betterAuthUrl` (`localhost`), `global-setup` chết ở 403 `INVALID_ORIGIN`,
   **không một ô nào chạy**.
2. **Ô nằm nhầm `describe`** → chạy ở project `chromium-no-webgl`, tức một ô đo
   draw call 3D chạy với WebGL **bị tắt**.
3. **`next start` không build lại** → đo bản dựng cũ hơn 4 tiếng, nút 3D vẫn
   `aria-disabled`. `reuseExistingServer: false` chặn việc bám vào server đang
   chạy, nhưng **không** chặn `.next` cũ.

**Bài học: đọc số của ô đã chạy, đừng đọc mã thoát.** Lớp bọc `pnpm` in
`[exited with code 0]` ngay dưới dòng `Exit status 1`.

### `?fx=off` là công tắc ĐỂ ĐO, không phải lựa chọn của người chơi

`EffectComposer` reset `renderer.info.render` ở **mỗi** lần `render()`, và pass
cuối là một tam giác phủ toàn màn hình — nên với bloom bật, `calls` đọc ra là
**1** và `triangles` là **1**, bất kể cảnh có 2 hay 2000 object. Một ô nghiệm thu
viết `expect(calls).toBeLessThan(100)` khi bloom đang bật sẽ **xanh mãi mãi và
chứng minh đúng zero điều gì**.

Arena giải bằng cách ghim bậc chất lượng qua bảng cài đặt; game Git không có bảng
cài đặt nên công tắc là tham số URL. Nó **cố ý không có nút bấm** — đây không
phải một lựa chọn hiển thị, nó là một đường để đo. Đọc một lần lúc mount, không
theo dõi thay đổi: đổi `?fx=` giữa chừng thì tải lại trang.

Hai chi tiết đi kèm, cả hai đều hỏng im lặng nếu làm sai:

- `gl.info.autoReset = false`, và `gl.info.reset()` gọi ở **đầu** `useFrame`. Để
  `autoReset` bật thì `calls` chỉ còn là số của lượt vẽ **cuối** — một con số
  nhỏ, trông đẹp, và không đo cái gì cả.
- `useFrame` của bộ đập nhịp mang ưu tiên **âm** (`-3`). Trong R3F, một ưu tiên
  **dương** tắt phép vẽ tự động và giao việc gọi `gl.render()` cho bạn — cảnh đen
  thui mà không một lỗi nào được ném.

⚠ Tên kênh `__dlpGitScene` là **một hợp đồng với bên e2e**. Arena đã một lần đổi
tên kênh đo mà không đổi bên đọc; hậu quả là mọi ô hiệu năng báo "không đo được"
trong im lặng — một cổng không đỏ, chỉ ngừng đo.

### Bloom chỉ cho `head` — và khe hở đã biết

K.10 của plan nói "selective bloom chỉ cho `running`", nhưng `running` là trạng
thái của game K8s. Git có sáu accent (`normal`/`head`/`fresh`/`orphaned`/
`duplicate`/`conflicted`), nên nó ánh xạ sang **`head`** — cùng vai trò "thứ đang
sống", và đã mang `motion: 'pulse'` sẵn trong `git-palette.ts`.

Chọn được chính xác vì `head` là accent **duy nhất** dùng khối `ringed`, nên lô
instance đó bằng đúng tập commit cần phát sáng.

⚠ Đó là một **sự trùng khớp có điều kiện, không phải một bảo đảm**: một accent
thứ hai nhận khối `ringed` thì lô này phát sáng cả nó. `accent-3d.test.ts` gác
chuyện chỉ MỘT accent bật `bloom`, nhưng **không** gác chuyện khối của nó là duy
nhất. Chỗ chữa là `accent-3d`, không phải ở gốc hợp thành.

### Bắt tia bằng hộp vô hình

Node commit là hình rỗng/mảnh, nên bắn tia thẳng vào mô hình đang hiện cho ra
vùng bấm **lỗ chỗ**: người chơi bấm đúng vào vật mà không trúng. `HitProxy` dựng
một `InstancedMesh` hộp **vô hình** (`visible = false`) cùng tâm cùng cỡ —
`Raycaster` chỉ kiểm `object.layers`, **không** kiểm `object.visible` (three
0.185.1), nên nó bắt tia mà không thêm một lệnh vẽ nào.

`NODE_RADIUS` là "nửa cạnh hộp bao", **không phải bán kính cầu** — lane hình học
và lane bắt tia dùng chung đúng con số đó.

### a11y của tầng 3D

Nhãn là một **pool `<span>` DOM** chiếu tay, không phải `drei <Html>` và không
phải texture canvas. Chữ DOM đọc được bằng trình đọc màn hình là **lý do** chọn
cách đó, nên:

⛔ Lớp nhãn **không** được mang `aria-hidden`. Ẩn nó đi là vứt bỏ đúng thứ đã trả
giá để có, và ô AC-6 mất cùng lúc. `<Canvas>` bên dưới mang `role="img"` +
`aria-label` cho phần **hình**; lớp phủ mang phần **chữ**.

Câu đọc ra đến từ `accentLabel()` và `REPO_LABEL` trong `git-palette.ts` — dùng
**chung** với renderer 2D. Hai renderer nói hai câu khác nhau về cùng một commit
là một lỗi a11y **không cổng nào bắt được**; `REPO_LABEL` đã từng có hai bản
trước khi gom về một chỗ.

⚠ Phần tử dò màu (`<span>` đọc token CSS qua `getComputedStyle`) phải được
**render thật** — không `display: none`, không `visibility: hidden`. Phần tử
không được bố trí thì vài trình duyệt trả chuỗi rỗng cho thuộc tính màu, và cả
cảnh rơi về màu xám dự phòng: một lỗi **không ném, không đỏ**. Đó là lý do
`GitSceneStats.colorsDegraded` có mặt trong kênh đo — để một ô e2e khẳng định
được rằng phép đọc màu thật sự đã chạy.

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

## 9. Sandbox

Kho tự do, không mục tiêu, không chấm. Mở từ nút **Mở sandbox** trên màn chọn level.

Năm thao tác: đặt lại · hoàn tác từng bước · nhập/xuất cây JSON · bật/tắt `origin` · chọn một
trong bốn kịch bản khởi tạo (`kho-trong`, `kho-roi`, `kho-vua-hong`, `hai-kho`).

**Sandbox mượn nguyên engine**, qua `sandboxLevel(spec)` — một `GitLevel` giả với
`objectives: []` và `allowedCommands: null`. Nó cần đúng bốn thứ của engine (điều phối lệnh,
đồng hồ logic, bot, ngăn xếp hoàn tác) mà cả bốn đã đúng ở `engine.ts`; viết một engine riêng
là cách chắc chắn nhất để hai đường đi lệch nhau, rồi một lỗi chỉ tái hiện được ở một bên.

⛔ **Màn này không hiện ô kết quả.** `verdictOf` trên mảng mục tiêu rỗng trả "đạt", nên một ô
kết quả ở đây sẽ vĩnh viễn nói "AC (0/0)" — nói dối một cách trông rất hợp lệ.

### Xuất / nhập

Đi qua `WorldSpec`, **không** qua `GitWorld`. Lý do thật là lý do thứ hai: Oid sinh từ nội
dung, nên một `GitWorld` xuất ra rồi nhập lại ở một bản engine có phép băm khác sẽ mang Oid
không khớp gì cả — và nó không nổ, nó im lặng trỏ vào khoảng không. `WorldSpec` dùng id nội bộ
(`c1`, `c2`) nên sống sót qua mọi lần đổi cách băm.

Phép chiếu ngược `worldToSpec` **mất thông tin có chủ ý**: reflog, stash, thao tác dở dang và
commit mồ côi đều không sang. Xuất một sandbox đang giữa một `rebase` dở rồi nhập lại sẽ cho
một kho SẠCH — đúng hành vi, nhưng phải nói ra.

`importSandboxJson` trả `null` thay vì ném: chuỗi đến từ ngoài hệ thống (dán từ URL, từ file
người khác gửi). `buildWorld` ném khi spec sai và ném là đúng ở tầng đó; ở đây phải nuốt lại
để một lần dán nhầm không thành trang lỗi.

### `origin` bật được hay không là một câu hỏi về spec

`OriginSpec.branches` ánh xạ tên → **id commit spec**. Trên `kho-trong` chưa có commit nào, nên
không có gì để trỏ vào, và một id không tồn tại làm `buildWorld` **ném** — tức trang sập, chứ
không phải "nút không ăn". `withOrigin` trả `null` ở trường hợp đó và giao diện **tắt hẳn nút**.

### Đổi spec dựng lại phiên, và dựng lại phiên xoá ngăn xếp hoàn tác

Đổi kịch bản, bật/tắt origin, hay nhập một cây đều thay cả thế giới — undo qua một lần như vậy
thì hoàn về đâu? Hành vi đúng, nhưng màn hình phải nói ra, nếu không người dùng tưởng Ctrl+Z hỏng.

### AC-Q đo ở HAI tầng, và tầng thứ hai không thừa

| Tầng | File | Bắt được gì |
|---|---|---|
| Đơn vị | `packages/games/src/git/sandbox.test.ts` | Phép chiếu ngược và vòng băm |
| Trình duyệt | `apps/web/e2e/games-git-sandbox.spec.ts` | Dây nối từ ô textarea tới engine |

Ô đơn vị gọi thẳng `exportSandboxJson`/`importSandboxJson`, nên nó xanh kể cả khi giao diện nối
nhầm hai nút đó — nhập xong quên dựng lại phiên, hay dựng lại phiên từ spec CŨ.

⚠ Chính đối chứng dương của ô e2e đã bắt một lỗi nằm trong ô đơn vị: nó gõ
`git write note.md "xin chao"` (sai cú pháp; đúng là `-c "<nội dung>"`), ba trong bốn lệnh lỗi,
mà ô vẫn xanh vì chỉ khẳng định hash đổi — hash đã đổi từ `checkout -b` ở dòng trên. Bài học
chung: một ô khẳng định "trạng thái đã tiến" mà không nói tiến **cái gì** thì gần như không gác gì.

---

## 10. Còn nợ

| Việc | Trạng thái |
|---|---|
| ~~**17.K — tầng 3D**~~ | **Xong ở P17b.** `has3d: true` trong `git-game.tsx`; AC-7 đã đo (xem §6b) |
| **Mô phỏng mù màu trên ảnh chụp cảnh thật** (§17.C.5 vế hai) | **Vẫn chưa đo.** Thứ đang có là một **thiết kế** — mọi cặp trong 6 trạng thái khác nhau ở ≥2 kênh ngoài màu, cộng một sigil chữ là kênh thứ tư (và là kênh duy nhất sống sót qua `prefers-reduced-motion`). Thiết kế **không phải** phép đo; đừng đọc bảng `ACCENT_STYLE` thành "đã kiểm mù màu" |
| Bảng đo tương phản chưa thành CỔNG | `git-palette.ts` giữ bảng số trong chú thích vì `tokens.contract.test.ts` để phép toán oklch→sRGB ở phạm vi module, không export. Tách ra một module export được là điều kiện để bảng đó thành một cổng chạy được thay vì một bảng số chép tay |
| Easing nhân đôi giữa `scene3d/` và `k8s-arena/` | `motion-script.ts` (bốn hàm easing) và `camera-angles.ts` (`dampFactor`) giữ bản sao **có ý thức**: chỗ đúng là `games/shared/`, thuộc lane khác trong đợt song song. Gộp khi có dịp — nhưng giữ dạng `lerp` **chính xác ở hai đầu** của `motion-script.ts`, không giữ dạng của arena |
| `accent-3d.test.ts` chưa gác khối `ringed` là duy nhất | Selective bloom chọn đúng tập `head` nhờ một trùng khớp có điều kiện. Xem §6b "Bloom chỉ cho `head`" |
| `PendingOp` nhánh `'stash'` | Khai trong hợp đồng, `ops/stash.ts` đã nối phép trộn ba ngả thật. `pop --abort` hiện vứt thay đổi cục bộ chưa commit vì nhánh đó chưa mang ảnh chụp worktree |
| `GitOpResult` / `RepoOpResult` | Hai kiểu trùng nhau từng trường, do hai lane khai. Nên gom về `contract.ts` |
