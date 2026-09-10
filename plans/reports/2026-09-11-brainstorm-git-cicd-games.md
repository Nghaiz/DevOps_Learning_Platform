# Thiết kế hai game mới: Git và CI/CD

> Phiên brainstorm 2026-09-11. **Chưa hiện thực gì.** Tài liệu này là thứ cần được
> duyệt trước khi mở `/t1k:plan`.
>
> Bối cảnh: trụ cột ③ hiện có đúng một game hoàn chỉnh (`k8s`, 32 level, 3D, chạy
> 100% client). Ba ô "sắp có" trên `/games` là `pipeline`, `netpol`, `dockerfile` —
> mới có tài liệu thiết kế, chưa có dòng code nào.

---

## 0. Nguyên tắc bao trùm phiên này

Chỉ đạo của chủ dự án, ghi lại nguyên văn ý vì nó chi phối mọi mục bên dưới:

> *"Đừng hardcode cứng nhắc quá việc tái sử dụng lại, việc phát triển mới vẫn quan
> trọng hơn."*

Nên tài liệu này **không** cố nhét Git và CI/CD vào khuôn của game K8s. Mỗi chỗ cố
tình **không** dùng lại đồ có sẵn đều được nói rõ và nói lý do. Ba nơi đáng chú ý
nhất: mô hình trạng thái (§2.1), camera (§4.4), và hệ màu (§4.6).

---

## 1. Quyết định đã chốt

Bảng này là hợp đồng. Mọi thứ phía sau suy ra từ đây.

| # | Câu hỏi | Đã chốt |
|---|---|---|
| 1 | Phạm vi | **2 game 3D + mở rộng hệ OJ.** Không làm lesson/lab chạy pod thật cho Git/CI-CD. Lý thuyết nằm trong campaign của game. |
| 2 | Quan hệ với `pipeline.md` cũ | **Thiết kế lại từ đầu**, rộng hơn CI thuần: có CD, môi trường, rollback, GitOps. `pipeline.md` thành tài liệu tham khảo. |
| 3 | Ràng buộc backend | **Giữ 0 lời gọi backend trong lúc chơi.** Mô phỏng Git và CI hoàn toàn trong trình duyệt. |
| 4 | Hệ OJ | **Tổng quát hoá thành OJ đa-game dùng chung.** Đưa `Problem` lên `core/`, phần engine-riêng thành plugin theo `GameId`. |
| 5 | Game Git — cách chơi | **Ba chương trong một game:** nắn lịch sử → làm việc nhóm → cứu hộ. |
| 6 | Game CI/CD — cách chơi | Phủ cả bốn hướng đã nêu, với ràng buộc: **phải có dạng bài dùng được cho thực hành và thi cử**. |
| 7 | Nhập liệu | **Gõ lệnh thật là chính**, 3D là màn hình quan sát. |
| 8 | Quy mô | **Ngang game K8s:** mỗi game ~25–35 level + sandbox + OJ đầy đủ. |
| 9 | Thi cử | Chế độ thi có giờ · chấm theo testcase · đề sinh ngẫu nhiên theo seed · bảng điểm + xuất CSV cho giảng viên. |
| 10 | Cú pháp CI | **GitHub Actions làm chính**, lõi thiết kế trung lập để thêm GitLab sau không phải viết lại. |
| 11 | Độ sâu Git | **Có object store thật:** blob/tree/commit + băm nội dung + index. (Chỉnh theo §2.1 — không cần zlib/packfile/SHA-1 chuẩn.) |
| 12 | Bản sắc thị giác | **Tự do hoàn toàn**, kể cả HUD và panel. |
| 13 | Trục Y (CI/CD) | **Đổi theo chương:** chương CI dùng thời gian chờ, chương CD dùng môi trường. |
| 14 | Đường 2D | **Chế độ ngang hàng** với 3D, chất lượng tương đương. |
| 15 | Camera | **Orthographic, snap 4–8 góc cố định.** |
| 16 | Lý thuyết | **Tách ra `content/`**, level chỉ trỏ tới. |
| 17 | Soạn level | **Có Level Builder trực quan, làm ngay đợt đầu.** |
| 18 | Đóng góp NCKH | **Sản phẩm là chính.** Không làm nhánh nghiên cứu đối chứng 3D-vs-2D. |
| 19 | Chương 2 game Git | Đủ cả bốn: conflict thật · bot đồng đội · force-push có hậu quả · PR/review. |
| 20 | Chấm bài | **Objective = testcase.** Verdict hiển thị `AC (4/5)`. AC chỉ khi qua hết. |

### 1.1 Ba chỗ tôi phải nói ngược lại một phần

**(a) "Object store thật" — đúng hướng, cần chỉnh biên độ.**
Đo được: `isomorphic-git@1.42.0` có đúng 70 hàm API công khai và **không có `rebase`,
không có `reflog`** (cả hai trả 404 trên docs). `commit()` băm cả
`Math.floor(Date.now()/1000)` vào SHA, nên **cùng một chuỗi lệnh ra SHA khác nhau
mỗi lần chạy** — hỏng thẳng khả năng phát lại. `wasm-git` là 805KB–1.5MB wasm và
pthreads đòi header COOP/COEP (siết cả trang, phá nhúng bên thứ ba).

Nên: **tự viết engine TypeScript**, và "object store thật" hiểu là *blob/tree/commit
+ băm nội dung + reflog + giữ commit không-reachable*, **không** phải định dạng
object nhị phân của git, zlib, packfile, hay SHA-1 chuẩn. Chi tiết ở §2.1.

**(b) "Tự do hoàn toàn" về màu — chi phí là cụ thể, không phải lý thuyết.**
`docs/design-system.md` có cổng grep cấm hex trần trên toàn `apps/web/src`:

```bash
grep -rnE '#[0-9a-fA-F]{3,8}|\b(slate|gray|zinc|neutral)-[0-9]{2,3}' apps/web/src packages/ui/src --include=*.tsx
```

Cổng này phải **rỗng**. Game 3D nằm trong vùng quét. Chọn "tự do hoàn toàn kể cả
HUD" nghĩa là phải đăng ký ngoại lệ tường minh cho hai thư mục game mới (tiền lệ:
`packages/terminal/src/**/themes.ts` đã là ngoại lệ có ghi trong AC gốc), và **làm
lại kiểm a11y/tương phản riêng cho từng game** vì dark mode không còn tự động. Tôi
đưa việc đó vào kế hoạch như một hạng mục có tên, không giấu nó đi. Xem §4.6.

**(c) Camera ba game sẽ không đồng nhất.**
`camera-rig.tsx` của K8s dùng `OrbitControls` phối cảnh xoay tự do. Hai game mới
dùng orthographic snap góc. Đây là hệ quả trực tiếp của quyết định #12 và #15, và
nó đúng — đồ thị đọc tốt hơn dưới ortho — nhưng ba game sẽ cầm khác tay nhau.

---

## 2. Nền chung phải làm TRƯỚC cả hai game

Đây là phần dễ bị bỏ qua nhất và là phần chặn mọi thứ khác.

### 2.1 Món nợ hợp đồng: `RunLog` và `GameAction` đang bị nhốt trong K8s

`packages/games/src/k8s/contract.ts` giữ `RunLog` và `GameAction`, và
`GameAction.kind` là union đóng `'apply' | 'delete' | 'scale' | 'edit' | 'kubectl' |
'hint' | 'wait'`. `EdgeView.kind` cũng đóng: `'owns' | 'selects' | 'mounts' | 'routes'`.

Hệ quả đã được `pipeline.md` §2.2 ghi lại: **cơ chế chống gian lận bằng phát lại
tất định hiện chỉ dùng được cho game K8s.** Không game thứ hai nào chạm được vào nó.

Việc phải làm, và phải làm trước:

1. Chuyển `RunLog` lên `core/` với `GameAction` mở theo game (union phân biệt bằng
   `gameId`, mỗi game khai `payload` riêng).
2. `EdgeView` ở lại `k8s/`. Hai game mới có kiểu cạnh riêng — cạnh cha-con của
   commit DAG và cạnh `needs` của pipeline không phải cùng một thứ, dù cùng tên
   "cạnh".
3. `GameId` mở rộng: `'k8s' | 'pipeline' | 'netpol' | 'dockerfile' | 'git' | 'cicd'`.
   Giữ `'pipeline'` trong union dù đợt này không làm — xoá nó là đổi hợp đồng lưu
   trữ của người dùng đã có bản lưu.

> ⚠ `core/types.ts` là file lead sở hữu. Đây không phải việc lane tự làm.

### 2.2 Tất định là thuộc tính phải sở hữu, không phải thứ vá vào

Năm điều kiện, mỗi điều kiện phải có test riêng:

1. **Hash thuần tuý.** `Oid` = hash trên dạng serialize chuẩn tắc của object. Cho
   phép FNV-1a hoặc xxhash rồi hiển thị 7 ký tự hex. Không cần SHA-1 thật.
2. **Không `Date.now()`, không `Math.random()`** trong đường thực thi. Thời gian là
   **đồng hồ logic** tăng theo số lệnh. Ngẫu nhiên đến từ PRNG có seed nằm trong
   định nghĩa level (`core/rng.ts` đã có sẵn).
3. **Mọi lần lặp trên tập hợp phải qua khoá đã sắp xếp.** Đây là lỗi bất định phổ
   biến nhất và thầm lặng nhất: nó chỉ lộ khi thứ tự chèn đổi, tức là rất lâu sau
   khi ai đó thêm một tính năng không liên quan.
4. **Replay = `(levelId, seed, danh sách lệnh)`.** Không lưu trạng thái trung gian.
5. **Hash trạng thái sau mỗi lệnh**, so với hash tính lại phía chấm.

### 2.3 Chế độ 2D là chế độ ngang hàng, không phải fallback

three.js **đã xoá hẳn WebGL1 từ r163** (PR #27836); repo đang ở `three@0.185.1`. Nên
"fallback xuống WebGL1" không tồn tại. Đường 2D giải quyết một lúc bốn việc:

| Việc | Vì sao 2D giải được mà 3D không |
|---|---|
| Máy không có WebGL2 | Không có đường nào khác |
| Trình đọc màn hình | Canvas WebGL là một ô đen với a11y. Nền tảng đang có ô nghiệm thu axe/WCAG |
| Ảnh cho báo cáo NCKH | SVG in ra sắc nét, chụp WebGL thì không |
| Test tự động | Playwright assert DOM dễ hơn assert pixel nhiều bậc |

Kiến trúc: **một layout, hai renderer.** `d3-dag` (hoặc layout tự viết cùng thuật
toán) tính toạ độ 2D một lần; renderer 3D nâng lên bằng cách gán trục Y, renderer
SVG dùng thẳng. State machine dùng chung, không nhân đôi.

> ⚠ Bẫy đã ghi trong memory dự án: **tắt hardware acceleration KHÔNG xoá WebGL2** —
> SwiftShader vẫn cấp context. Muốn test cảnh không-WebGL trong Playwright phải
> `--disable-3d-apis`. Đừng viết một ô nghiệm thu "đã kiểm đường 2D" mà thực ra
> chưa bao giờ chạy nó.

---

## 3. GAME GIT — "Phòng thí nghiệm Git"

**`GameId`:** `'git'` · **Tên hiển thị:** **Phòng thí nghiệm Git** (chốt 2026-09-11)

### 3.1 Định vị: đất trống ở đâu

Đo trực tiếp trên mã nguồn Learn Git Branching (nhánh `main`, 2026-09-11,
`grep -ril` toàn bộ `src/js`, 71 file):

| Khái niệm | LGB | gitmastery.me | Đất trống? |
|---|---|---|---|
| merge conflict | **0 file** | có (371 lượt nhắc trên `src`) | **Có** — LGB *không thể* có: mô hình của nó là `workingChanges: {path → status}`, không có nội dung file |
| `reflog` | **0 file** | 11 file | **Có** |
| `stash` | **0 file** | 22 file | **Có** |
| `bisect` | **0 file** | 12 file | Có |
| detached HEAD | có level | **0 file** | Một nửa |
| object store (blob/tree) | không có | không có | **Có** |
| force-push huỷ việc người khác | có cờ `--force`, không có hậu quả | — | **Có** |

Và bằng chứng sư phạm cho việc chọn ba chương này:

- **Isomöttönen & Cochez (ICTERI 2014)**, khảo sát 21/26 sinh viên: sinh viên tưởng
  **nhánh là thư mục**, gõ `cd` để vào nhánh. **32% báo conflict là khó**, và cách
  họ "giải quyết" là **clone lại repo sạch** — tác giả gọi thẳng là "giải pháp rất
  không may". Một câu trả lời tiêu cực duy nhất về VCS là trải nghiệm **mất việc**.
  Kết luận của họ: phải "giải thích nhánh là con trỏ trong lịch sử commit bằng sơ
  đồ trực quan". Đó chính là luận điểm của game này.
- **Perez De Rosso & Jackson (Onward! 2013, MIT)**: staged và working version
  **không trực giao** — "có xảy ra hay không thì tuỳ tham số truyền vào". `reset`
  xoá gì phụ thuộc tham số, và người dùng mất phần sửa sau bug fix mà không hiểu vì sao.

> **Chỗ ý tưởng này yếu:** phần "nắn lịch sử" (chương 1) đã bão hoà. LGB làm rất
> tốt với 34k★. Đừng kỳ vọng chương 1 tạo khác biệt; nó là **vé vào cửa**. Khác
> biệt nằm ở chương 2 và 3.

### 3.2 Mô hình engine

Đủ, và không thừa:

```
ObjectStore:  Map<Oid, Blob | Tree | Commit>   // KHÔNG BAO GIỜ xoá trong một phiên
Blob:         string[]                          // theo DÒNG, không phải byte
Tree:         Map<path, Oid>
Commit:       { tree: Oid, parents: Oid[], message, author, logicalTime }
Refs:         Map<refName, Oid>                 // gồm cả refs/remotes/origin/*
HEAD:         { type: 'ref', name } | { type: 'detached', oid }
Index:        Map<path, Oid>                    // vùng staging, TÁCH khỏi worktree
Worktree:     Map<path, string[]>
Reflog:       Map<refName, Array<{ from, to, op, message }>>
Repos:        { local: Repo, origin: Repo }     // hai instance, kiểu LGB
Stash:        Array<{ oid, message }>
```

**Ba quyết định trong mô hình này đáng giải thích:**

1. **`Blob` là mảng dòng, không phải byte.** Conflict trong git là chuyện *hunk theo
   dòng*. Mảng dòng đủ cho merge 3 ngả diff3, và làm animation 3D dễ hơn nhiều.
2. **`ObjectStore` không bao giờ xoá.** Đây là điều kiện để chương 3 tồn tại: "mất
   commit rồi cứu" chỉ có nghĩa nếu commit **vẫn nằm trong store** sau khi không ref
   nào trỏ tới. Cần tách *lưu trữ* khỏi *reachability* — thứ mà mô hình cây thuần
   không có, và là lý do chính xác vì sao LGB không thể có `reflog`.
3. **`Index` tách khỏi `Worktree`.** Đây là hình ảnh cho misfit của MIT. Ba vùng
   phải nhìn thấy được cùng lúc thì mới dạy được `reset --soft/--mixed/--hard`.

**Cố tình bỏ:** định dạng object nhị phân, zlib, packfile/delta, SHA-1 thật,
submodule, sparse-checkout, hook, filter. Không cái nào phục vụ ba chương.

Ước tính: ~1.500–2.500 dòng TS. (Đối chiếu: `GitRepository.ts` của gitmastery.me là
1.497 dòng nhưng thiếu detached HEAD; engine LGB là 3.772 dòng nhưng thiếu
conflict/reflog/stash.)

### 3.3 Cách chấm: so trạng thái, không so lệnh

**Chép mô hình LGB, tránh mô hình gitmastery.me.**

gitmastery.me khai `LevelRequirement { command, requiresArgs[] }` và chấm bằng
**khớp mẫu lệnh đã gõ**. Hệ quả: gõ đúng lệnh mà repo sai bét vẫn qua bài, và không
thể có nhiều lời giải hợp lệ. Đây là mô hình phải tránh.

LGB chấm bằng **so trạng thái đồ thị** với một cây đích serialize sẵn, dispatch theo
cờ khai báo trong level:

| Chế độ so | Dùng khi |
|---|---|
| `compareOnlyMain` | Bài chỉ quan tâm nhánh chính |
| `compareAllBranchesHashAgnostic` | **Bài rebase/cherry-pick** — SHA tất yếu đổi, so hình dạng thôi |
| `compareAndEnforceBranchCleanup` | Bài yêu cầu xoá nhánh thừa |
| mặc định | So tất cả nhánh + HEAD + tags + `workingChanges` |

Game này thêm hai chế độ mà LGB không cần:

- `compareWorktreeContent` — so **nội dung file** (chương 2, sau khi giải conflict)
- `compareReachability` — so *tập commit còn sống* (chương 3, bài cứu hộ)

**Ánh xạ sang mô hình testcase (quyết định #20):** mỗi `Objective` **là một
testcase**. Verdict `AC` khi và chỉ khi mọi testcase qua; nếu không thì hiển thị
`4/5` kèm testcase nào đỏ. Không có khái niệm "trọng số riêng cho từng objective" —
đó là thứ đã bị loại bỏ tường minh sau khi làm rõ ý người dùng.

### 3.4 Ba chương và bản đồ chủ đề

Level **dạy** (đưa kiến thức trước rồi mới cho dùng); bài OJ **thử** (không dạy).
Đây là quy ước đã có trong `k8s/contract.ts` và giữ nguyên cho game này.

#### Chương 1 — Nắn lịch sử (12 level)

Một kho. Trục Y chưa dùng đến.

| # | Chủ đề | Level dạy gì | Lệnh mới |
|---|---|---|---|
| G01 | Commit là object bất biến | Băm nội dung, một ký tự đổi ra một Oid khác | `git add`, `git commit`, `git log` |
| G02 | **Ba vùng** | worktree / index / HEAD là ba nơi khác nhau | `git status`, `git diff`, `git diff --staged` |
| G03 | `add` không phải "tạo file" | Ép `add` một file **đã tồn tại** (đánh thẳng vào nhầm lẫn §5.3 của khảo sát) | `git add` trên file cũ |
| G04 | **Nhánh là con trỏ, không phải thư mục** | Tạo nhánh không sao chép gì cả; hai nhánh trỏ cùng một commit | `git branch`, `git switch` |
| G05 | HEAD và detached HEAD | HEAD trỏ vào ref, hoặc trỏ thẳng vào commit | `git checkout <oid>` |
| G06 | Tham chiếu tương đối | `HEAD~3`, `HEAD^2` | — |
| G07 | Merge tạo commit hai cha | Nhìn thấy hai cạnh cha đi ra từ một node | `git merge` |
| G08 | **Rebase VIẾT LẠI** | Commit mới được tạo, commit cũ **vẫn còn** nhưng mờ đi. Cầu nối sang chương 3 | `git rebase` |
| G09 | `reset` ba kiểu | `--soft/--mixed/--hard` chạm vào vùng nào (misfit MIT) | `git reset` |
| G10 | `revert` ≠ `reset` | Một cái thêm commit, một cái dịch con trỏ | `git revert` |
| G11 | Cherry-pick **mất gì** | Commit trùng nội dung khác cha, và cái giá phải trả khi merge sau | `git cherry-pick` |
| G12 | Rebase tương tác | squash / drop / reorder | `git rebase -i` |

#### Chương 2 — Làm việc nhóm (12 level)

Hai kho. Có nội dung file thật. Có đồng hồ logic để bot hành động.

| # | Chủ đề | Level dạy gì | Lệnh mới |
|---|---|---|---|
| G13 | Clone dựng kho thứ hai | `origin/*` là ref theo dõi, không phải nhánh của bạn | `git clone` |
| G14 | `origin/main` vs `origin main` | Nhầm lẫn kinh niên §5.4 của khảo sát | `git fetch` |
| G15 | fetch ≠ pull | fetch cập nhật ref theo dõi, không đụng vào việc của bạn | — |
| G16 | Push và bị từ chối | Vì sao non-fast-forward bị chặn | `git push` |
| G17 | **Conflict đầu tiên** | Hai người sửa cùng một dòng | giao diện giải conflict |
| G18 | Conflict không phải lỗi | Đọc marker `<<<<<<<`, chọn hunk, hoặc trộn tay | `git merge --abort` |
| G19 | Rebase trước khi push | Lịch sử tuyến tính đổi lại bằng gì | `git pull --rebase` |
| G20 | **Force-push huỷ việc đồng đội** | Commit của bot **biến mất trước mắt bạn** | `git push --force` |
| G21 | `--force-with-lease` | Cùng một ý định, khác hậu quả | `git push --force-with-lease` |
| G22 | Stash khi phải chuyển nhánh | Stash sinh ra vì worktree dùng chung (misfit MIT) | `git stash` |
| G23 | Vòng PR | Đặt PR, nhận comment, sửa, approve, merge | lệnh giả lập `pr` |
| G24 | Merge vs squash-merge vs rebase-merge | Ba nút merge trên PR ra ba hình dạng lịch sử khác nhau | — |

> **Cảnh báo về chi phí:** G17–G18 đòi viết diễn giải **merge 3 ngả diff3** và một
> giao diện sửa hunk. Đây là hạng mục đắt nhất của cả game và là chỗ dễ trượt tiến
> độ nhất. Nó cũng là chỗ đáng giá nhất — không công cụ nào trong bảng §3.1 có nó.

#### Chương 3 — Cứu hộ (8 level)

| # | Chủ đề | Tình huống |
|---|---|---|
| G25 | `reflog` là nhật ký dịch chuyển | Nhìn thấy mọi lần HEAD đổi chỗ |
| G26 | Cứu sau `reset --hard` nhầm | Commit vẫn trong store, chỉ không ai trỏ tới |
| G27 | Cứu sau khi xoá nhánh | `git branch -D` rồi lấy lại |
| G28 | Thoát detached HEAD có commit | Tạo nhánh tại chỗ trước khi mất |
| G29 | Rebase dở dang | `--continue` / `--abort` / `--skip` |
| G30 | Stash thất lạc | `git fsck --lost-found` |
| G31 | Cứu việc bị force-push đè | Nối thẳng từ G20 |
| G32 | Bisect tìm commit hỏng | Chia đôi lịch sử |

**Tổng: 32 level.** Đúng cỡ game K8s.

### 3.5 Ẩn dụ 3D

**Ba tiền lệ đã có, và một cảnh báo.** VR-Git (Oberhauser, ICSEA 2022) dựng commit
plane thẳng đứng xếp theo thời gian, ô gạch màu cho file (xanh=thêm, đỏ=xoá,
xanh dương=sửa), và **lệch độ cao commit plane theo nhánh** — ý tưởng đáng mượn
nhất. Nhưng nó **không có nghiên cứu người dùng đối chứng**, kết luận chỉ là "có thể
hỗ trợ". Đừng trích nó như bằng chứng 3D dễ đọc hơn 2D.

**Bố cục 2.5D có ràng buộc:**

```
trục X  = thời gian logic (commit càng mới càng xa gốc)
trục Z  = nhánh (mỗi nhánh một làn riêng, làn cố định)
trục Y  = MỘT biến duy nhất: độ lệch khỏi nhánh chính
```

Trục Y chỉ mang một biến. Layout lực 3D tự do bị loại — đó là cách nhanh nhất để tự
tạo ra vấn đề cạnh cắt (PECC) mà nghiên cứu GD 2025 đo được: PECC thấp → chính xác
~74%, PECC cao → ~65%.

**Ba vùng làm ba mặt phẳng chồng lớp**, nhìn thấy đồng thời:

```
        ┌──────────────────────────┐
   cao  │  HEAD (lịch sử đã commit) │   ← đồ thị commit, phần chính
        ├──────────────────────────┤
   giữa │  Index (vùng staging)     │   ← ô file đang chờ
        ├──────────────────────────┤
  thấp  │  Worktree (đang sửa)      │   ← ô file có dấu sửa đổi
        └──────────────────────────┘
```

`git add` là ô file **bay từ tầng thấp lên tầng giữa**. `git commit` là cả tầng giữa
**đóng lại thành một khối** và gắn vào đồ thị ở tầng cao. `reset --mixed` là khối ở
tầng giữa **rơi xuống** tầng thấp. Đây là hình ảnh trực tiếp cho misfit của MIT, và
không công cụ nào hiện có thể hiện nó.

**Hai kho là hai khối không gian tách rời.** `origin` nằm ở một cụm riêng, có khoảng
trống rõ rệt ở giữa. `push`/`fetch` là vật thể **di chuyển qua khoảng trống đó** —
đây là thứ 2D không diễn đạt được và là lý do 3D đáng tiền ở game này.

**Chuyển động mang thông tin, không trang trí:**

| Hành động | Chuyển động |
|---|---|
| `rebase` | Commit **bay sang chỗ mới**, commit cũ **mờ đi nhưng vẫn còn tại chỗ** |
| `reset --hard` | Con trỏ nhánh **trượt lùi**, các commit phía trước **chìm xuống dưới mặt phẳng** (vẫn thấy mờ) |
| `reflog` | Mặt phẳng dưới **sáng lên**, các commit chìm nổi trở lại |
| `force-push` | Commit của bot ở `origin` **vỡ ra và tan** — có âm thanh, có độ trễ để người chơi kịp thấy |
| `cherry-pick` | Bản sao **tách khỏi** commit gốc, giữ một sợi chỉ mờ nối về nguồn |

**Điều hướng:** teleport tới ref, không bay tay. Chọn nhãn nhánh → nhảy thẳng tới
commit đầu nhánh. VR-Git nêu lý do y tế (say VR); ở đây lý do vẫn còn: bay tay qua
50 commit là cực hình.

**Chống rối nhãn:** **lặp lại nhãn nhánh nhiều chỗ dọc theo làn**, không chỉ đặt một
nhãn ở đầu. Nghịch lý mà VR-Git đo được: lặp nhãn đỡ rối hơn một nhãn duy nhất mà
người dùng phải nhớ.

### 3.6 Giao diện và bố cục màn hình

```
┌────────────────────────────────────────────────────────────────────┐
│ ← Chương 2 · G17 Conflict đầu tiên          [2D] [3D]   ⚙  ?      │  thanh trên
├───────────────────────────────┬────────────────────────────────────┤
│                               │  MỤC TIÊU                          │
│                               │  ☑ Nhánh feature đã merge vào main  │
│        KHUNG CẢNH 3D          │  ☐ File config.yml không còn marker │
│     (hoặc SVG khi 2D)         │  ☐ Không tạo commit thừa           │
│                               ├────────────────────────────────────┤
│   ┌─ origin ─┐   ┌─ local ─┐  │  BÀI GIẢNG                         │
│   │  ● ● ●   │   │ ● ● ●   │  │  (markdown từ content/, nhiều       │
│   └──────────┘   └─────────┘  │   trang, có nút "học sâu hơn")      │
│                               ├────────────────────────────────────┤
│   [worktree][index][HEAD]     │  DANH SÁCH REF (mini-map 2D)       │
│                               │  main → a3f1c9  · feature → 7b2e10 │
├───────────────────────────────┴────────────────────────────────────┤
│ $ git rebase main                                          ⏎       │  ô lệnh
│ ↑↓ lịch sử lệnh · Tab gợi ý · Ctrl+Z hoàn tác                      │
└────────────────────────────────────────────────────────────────────┘
```

**Bốn quyết định bố cục:**

1. **Ô lệnh nằm dưới cùng, rộng hết chiều ngang.** Nhập liệu là hoạt động chính
   (quyết định #7), nên nó không được là một ô nhỏ ở góc.
2. **Danh sách ref 2D thường trực.** VR-Git dù ở trong VR vẫn phải kèm bảng 2D. Đây
   là thứ người chơi liếc vào khi quên mình đang ở đâu.
3. **Mục tiêu = testcase, hiển thị ngay.** Người chơi luôn thấy còn thiếu gì. Khi
   nộp bài OJ thì đây chính là danh sách testcase.
4. **Nút [2D]/[3D] ở thanh trên, không giấu trong cài đặt.** Chế độ ngang hàng thì
   phải trông ngang hàng.

### 3.7 Chế độ sandbox

Sandbox là kho trống, không mục tiêu, không chấm. Cần có:

- `reset` về trạng thái sạch, `undo` từng bước
- Nhập/xuất cây dưới dạng JSON (chia sẻ được qua URL, như LGB)
- Bật/tắt `origin` (một kho hay hai kho)
- Chọn kịch bản khởi tạo: kho trống · kho có sẵn lịch sử rối · kho vừa bị hỏng

Sandbox và Level Builder dùng **cùng một màn hình** — dựng cây trong sandbox rồi bấm
"lấy làm trạng thái đầu" hoặc "lấy làm trạng thái đích". Đây là cách LGB làm và nó
tiết kiệm hẳn một giao diện.

---

## 4. GAME CI/CD — "Đường ống CI/CD"

**`GameId`:** `'cicd'` · **Tên hiển thị:** **Đường ống CI/CD** (chốt 2026-09-11)

> Vì sao `'cicd'` chứ không dùng lại `'pipeline'`: quyết định #2 là thiết kế lại từ
> đầu và rộng hơn CI thuần. Giữ `'pipeline'` trống trong union để bản lưu cũ (nếu
> có) không vỡ, và để sau này còn chỗ cho một game CI thuần dạng giải đố nếu muốn.

### 4.1 Vòng lặp chơi

Hai chương, nối nhau bằng **artifact**:

```
CHƯƠNG CI                          CHƯƠNG CD
soạn workflow YAML                 nhận artifact từ chương CI
     ↓                                  ↓
chạy N lượt có seed                đẩy lên môi trường
     ↓                                  ↓
đọc ba con số                      đọc mét-ric canary
     ↓                                  ↓
sửa workflow  ──────────────→      tiến hay lùi
```

**Artifact là sợi dây nối hai chương**, và nó dạy được anti-pattern đắt nhất:
build lại cho staging và prod "cho chắc" làm vô hiệu hoá toàn bộ giá trị của
staging — thứ bạn test không phải thứ bạn ship.

### 4.2 Chấm điểm ba trục (mượn Opus Magnum, không mượn Factorio)

Ba con số hiển thị thường trực, và **chúng chính là đại lượng CI/CD thật**, không
phải điểm phụ trợ:

| Trục | Đo gì | Vì sao tách riêng |
|---|---|---|
| **Lead time** | Một commit mất bao lâu từ push tới xanh | Đây là độ trễ của MỘT lô |
| **Thông lượng** | Bao nhiêu commit qua được mỗi giờ khi hàng dồn | Đây là năng lực của HỆ, khác hẳn cái trên |
| **Chi phí runner-phút** | Tài nguyên tiêu tốn | Ràng buộc thực tế |

Người học hay gộp lead time với thông lượng làm một. Tách chúng ra thành hai trục
hiển thị cạnh nhau là cách rẻ nhất để dạy khác biệt đó.

> **Cảnh báo ánh xạ, phải ghi rõ:** DAG của CI/CD **không có vòng lặp** và **không
> có trạng thái ổn định** — mỗi commit là một lô chạy một lần. Factorio ngược lại:
> mục tiêu là steady-state vô hạn. Bê nguyên mô hình steady-state vào đây là **dạy
> sai**. Đó là lý do mô hình chấm mượn Opus Magnum (có khái niệm "chạy một lô" rõ
> ràng) chứ không mượn Factorio.

### 4.3 Bản đồ chủ đề

#### Chương CI — Dây chuyền (14 level)

Trục Y = **thời gian chờ** (job xếp hàng bị đẩy lên cao; nghẽn cổ chai hiện thành cột).

| # | Chủ đề | Dạy gì |
|---|---|---|
| C01 | Một job, một step | Cấu trúc `jobs`/`steps` của GitHub Actions |
| C02 | `needs` tạo phụ thuộc | Cạnh của DAG |
| C03 | Song song trên giấy ≠ song song trên máy | Runner có hạn: 10 job, 2 runner |
| C04 | **Đường găng** | Sau mỗi lượt chạy, đường găng được tô sáng |
| C05 | Job không chặn | `continue-on-error` |
| C06 | Cache là buffer, không phải phép màu | `actions/cache`, khoá theo checksum lockfile |
| C07 | **Khoá cache quá rộng** | Khoá phụ thuộc mọi thứ thì không bao giờ trúng |
| C08 | Khoá cache quá hẹp | Lấy nhầm cache của lần build khác |
| C09 | **Flaky test** | Một lượt xanh không chứng minh gì. Chạy 20 lượt mới thấy |
| C10 | Retry chỉ cứu được đỏ giả | Retry một lỗi thật là đốt runner-phút vô ích |
| C11 | Rerun che mất bug thật | Bỏ qua flaky failure → build đã deploy gặp nhiều crash hơn |
| C12 | Matrix build (fan-out) | `strategy.matrix` |
| C13 | Fan-in | Một job gom kết quả nhiều job |
| C14 | Tối ưu tổng hợp | Level tự do, chấm ba trục, có bảng so lời giải |

#### Chương CD — Phát hành (14 level)

Trục Y = **môi trường** (dev → staging → prod xếp chồng; promotion là chuyển động **đi lên**).

| # | Chủ đề | Dạy gì |
|---|---|---|
| C15 | Artifact là vật thể | Build một lần, nó có danh tính |
| C16 | **Promote, đừng rebuild** | Rebuild = artifact rơi xuống rồi leo lại; SHA đổi; staging vô nghĩa |
| C17 | Môi trường và approval gate | `environment` + reviewer bắt buộc |
| C18 | Rolling update | Thay dần, ~3–5 phút để lùi |
| C19 | Blue-green | Đổi selector, lùi dưới 5 giây, đổi lại bằng 2 môi trường production |
| C20 | Canary | Weight 2–5%, lùi dưới 30 giây, rẻ hơn blue-green |
| C21 | **Đọc mét-ric canary** | Tỷ lệ lỗi tăng có phải do bản mới không, hay do nhiễu |
| C22 | Rollback vs roll-forward | Rollback DB migration thường bất khả |
| C23 | GitOps: git là nguồn sự thật | Reconcile loop |
| C24 | **Drift** | Ai đó chạy lệnh tay; reconcile chạy theo chu kỳ nên drift sống được một lúc |
| C25 | Self-heal bật hay tắt | Hầu hết đội bật detect, tắt self-heal cho tới khi tin được exclusion list |
| C26 | Secret không được vào log | Masking, và chỗ nó rò ra |
| C27 | Hotfix lúc 2 giờ sáng | Bỏ qua bước nào thì trả giá gì |
| C28 | Sự cố tổng hợp | Level tự do dưới áp lực |

**Tổng: 28 level.**

### 4.4 Camera và bố cục 3D

Orthographic, snap 4–8 góc (quyết định #15). Lý do có bằng chứng: đường thẳng vẫn
thẳng, kích thước không đổi theo khoảng cách nên so sánh node dễ, và quan trọng
nhất — **vì chỉ có hữu hạn góc nhìn, tính trước được cạnh nào đè cạnh nào và bố trí
để triệt tiêu**. Với orbit tự do thì PECC đổi theo từng khung hình và không bao giờ
đảm bảo được.

**Bố cục:** Sugiyama phân tầng trên mặt phẳng XZ (dùng `d3-dag` tính toạ độ), nâng
lên 3D bằng trục Y ngữ nghĩa. **Định tuyến cạnh orthogonal theo làn** — mỗi cạnh một
làn riêng giữa hai tầng, rẽ góc vuông, hợp thẩm mỹ "mạch điện/dây chuyền".

**Không dùng edge bundling.** Nó đổi rối rắm lấy overdraw, và phá đúng thứ game này
cần dạy: lần theo **một** đường phụ thuộc cụ thể để tìm đường găng.

**Chuyển động mang dữ liệu (mượn Netflix Vizceral):** cạnh không phải đường tĩnh mà
là **kênh có vật chất chảy qua** — các chấm chạy dọc cạnh, mật độ chấm = lưu lượng.
Artifact chảy qua pipeline là ẩn dụ gần như 1:1. Ba cấp drill-in: workflow → job →
step.

### 4.5 Nhập liệu: YAML thật

Người chơi sửa YAML GitHub Actions trong một ô soạn thảo, bấm chạy, xem hệ quả trong
3D. Cần:

- Tô cú pháp YAML + báo lỗi cú pháp trước khi chạy
- Báo lỗi ngữ nghĩa trỏ về **đúng dòng** (`needs` trỏ tới job không tồn tại, DAG có chu trình)
- Chèn mẫu nhanh cho người mới (`+ job`, `+ step`)

**Lõi trung lập, bộ đọc riêng.** Mô hình trong lõi (`StageSpec`, `RunnerPool`,
`CacheSpec`, `Environment`) không mang tên GitHub. Chỉ tầng đọc/ghi YAML biết
GitHub Actions. Thêm GitLab sau = thêm một bộ đọc, không đụng lõi.

> ⚠ **Bẫy đặt tên đã có tiền lệ:** `scripts/check-no-commerce.mjs` bắt token trần
> `checkout` trong luật chống-thương-mại và **không có lối thoát inline**. Bước đầu
> tiên của pipeline phải đặt tên `clone`, không phải `checkout`, hoặc phải sửa
> script đó trước. Cũng cần lưu ý `packages/games/src` hiện **không** nằm trong
> `ROOTS` của script này — có người phải quyết định thêm vào hay không.

### 4.6 Màu và khả năng tiếp cận

Bạn chọn tự do hoàn toàn (quyết định #12). Đề xuất nền tảng cho tự do đó, dựa trên
bảng Okabe & Ito (Color Universal Design — cả hai tác giả đều là protanope):

**Nguyên tắc bất di bất dịch: mã hoá dư thừa.** Không bao giờ chỉ dùng màu. Mỗi
trạng thái mang **ba kênh**:

| Trạng thái | Màu | Hình học 3D | Chuyển động | Icon |
|---|---|---|---|---|
| Passed | bluish-green `#009E73` | Khối đặc, mặt trên phẳng | tĩnh | ✓ |
| Failed | vermilion `#D55E00` | Khối nứt, khuyết một góc | rung một lần rồi đứng | ✕ |
| Running | blue `#0072B2` | Khối có vành xoay quanh trục Y | **xoay đều** | ◐ |
| Skipped | xám | Khối rỗng, wireframe | tĩnh, mờ ~35% | ⊘ |
| Queued | orange `#E69F00` | Khối chìm thấp hơn mặt tầng | mạch đập chậm | ⏸ |

Chuyển động là kênh mạnh nhất: **đọc được cả khi mù màu hoàn toàn**.

Tránh cặp đỏ-lục; dùng vermilion thay đỏ thuần và bluish-green thay lục chuẩn; tránh
chuyển tiếp vàng-lục; dùng nét dày và font đậm; đặt nhãn trực tiếp lên hình thay vì
để trong legend riêng.

**Hai bẫy riêng của 3D mà tài liệu 2D không nói:**

1. **Bloom làm hỏng tương phản.** Node "failed" phát sáng đỏ mạnh sẽ nuốt viền và
   làm nhãn đè lên nó không đọc được. Nếu dùng bloom thì **chỉ cho `running`**, một
   trạng thái, và giới hạn cường độ.
2. **Theme sáng không phải theme tối đảo ngược.** Wireframe rỗng cho `skipped` gần
   như biến mất trên nền trắng. Ở theme sáng phải đổi sang "đặc màu xám nhạt có hoạ
   tiết gạch chéo". Đây là chỗ "tự do hoàn toàn" tốn tiền: phải tự kiểm cả hai
   theme cho từng game, không được thừa hưởng miễn phí.

### 4.7 Kỹ thuật hiển thị

| Hạng mục | Quyết định | Lý do |
|---|---|---|
| Vẽ node | `InstancedMesh`, 1 draw call | Mục tiêu **<100 draw call/frame**; trên 500 thì cả GPU mạnh cũng vật lộn. Nút thắt là giao tiếp CPU↔GPU, không phải số triangle |
| Icon/badge trạng thái | InstancedMesh + texture atlas | 1 draw call cho hàng trăm node |
| Tên node | drei `<Html>` **chỉ cho node hover/select** | Dưới 20 phần tử cùng lúc, an toàn dưới ngưỡng ~200 nơi chi phí DOM leo dốc. Được a11y miễn phí |
| Nhãn tĩnh cấp cao | `troika-three-text` | 1 draw call mỗi Text; SDF chất lượng cao; parse font chạy trong worker |
| Panel chi tiết | DOM 2D ngoài canvas | Đừng đưa vào không gian 3D |
| Postprocessing | `pmndrs/postprocessing`, selective bloom cho `running` | Nó tự gộp effect vào ít pass hơn `EffectComposer` gốc |
| Viền chọn | **rim light fresnel trong material**, không dùng outline pass | Outline pass phải render lại cả cảnh vào buffer riêng. Fresnel tốn 0 pass |
| Texture | KTX2 + Basis Universal | Một PNG 200KB có thể chiếm >20MB VRAM; KTX2 giữ nén trên GPU |
| Shadow | 512–1024px, **tắt auto-update** | Cảnh gần như tĩnh; chỉ update khi có thay đổi |

> ⚠ Có issue mở (`mrdoob/three.js#30352`) cho thấy `InstancedMesh` **chậm hơn** Mesh
> dùng shared attributes trong vài cấu hình. Phải đo, đừng giả định.

> ⚠ `drei <Html occlude="blending">` **bị ẩn khi có postprocessing pass**. Hai thứ
> này dùng chung phải kiểm tận tay.

---

## 5. Hệ OJ đa-game và chế độ thi

### 5.1 Tổng quát hoá `Problem`

Hiện tại toàn bộ hệ OJ gắn cứng vào K8s: `ClusterSpec`, bảng `PREDICATES` của k8s,
`PROBLEM_TOPICS` là chủ đề k8s, form author có `cluster-fields`/`node-fields`.

Cấu trúc đích:

```
core/problem.ts          ProblemBase { code, gameId, title, statement,
                                       difficulty, topics[], tags[],
                                       testcases[], hints[] }
core/problem-plugin.ts   interface GameProblemPlugin {
                           initialSpec: unknown      // ClusterSpec | GitRepoSpec | WorkflowSpec
                           predicates: PredicateTable
                           authorFields: ...         // mô tả form, không phải JSX
                         }
k8s/problem-plugin.ts    (chuyển từ k8s/problem.ts hiện tại)
git/problem-plugin.ts
cicd/problem-plugin.ts
```

`PROBLEM_TOPICS` tách theo game: mỗi plugin khai tập chủ đề đóng của nó. Bộ lọc trên
UI đọc từ plugin của game đang chọn.

**Rủi ro phải nói thẳng:** đây là refactor động vào code đang chạy và đang có dữ liệu
thật trong DB. Cần một đợt riêng, có test hồi quy cho toàn bộ bài K8s hiện có, chạy
**trước** khi thêm bài của game mới. Đừng gộp vào đợt làm game.

### 5.2 Testcase và verdict

```
Testcase  { id, label, check: string, args?, visible: boolean }
Verdict   'AC' | 'WA' | 'CE'      // CE = lỗi cú pháp (YAML hỏng, lệnh không tồn tại)
Submission { problemCode, gameId, seed, actions[], passed: string[], total: number }
```

- `AC` khi và chỉ khi `passed.length === total`
- Hiển thị `AC` hoặc `WA (4/5)`
- `visible: false` = testcase ẩn, chỉ hiện tên sau khi nộp (chống việc dò đáp án bằng cách nộp nhiều lần)
- **Không lưu điểm** — điểm là `passed.length / total`, tính ở chỗ dùng. Quy ước "No
  Derived Fields" của repo áp cho bảng này y như mọi bảng khác.

### 5.3 Chế độ thi

Bảng mới (chưa có trong nền tảng):

```
exam         { id, title, ownerId, problemCodes[], durationMinutes,
               seedStrategy: 'fixed' | 'per-student', opensAt, closesAt }
exam_attempt { examId, userId, seed, startedAt, submittedAt, autoSubmitted }
```

Bốn thứ bạn đã chọn, và cái giá của từng thứ:

| Tính năng | Cái giá |
|---|---|
| Đếm ngược, tự nộp khi hết giờ | Đồng hồ phải tin được cả khi mất mạng và cả khi người dùng đổi giờ máy. Mốc thời gian phải do server cấp, dù game chạy client |
| Chấm theo testcase | Đã có từ §5.2, không thêm gì |
| Đề sinh ngẫu nhiên theo seed | **Bài phải được thiết kế để sinh được.** Không phải bài nào cũng làm được — một bài "sửa conflict trong file này" thì sinh ngẫu nhiên nội dung file là đổi luôn độ khó. Cần cờ `seedable: boolean` trên từng bài và cổng gác không cho đưa bài không-seedable vào kỳ thi dùng `per-student` |
| Bảng điểm + xuất CSV | Cần khái niệm **LỚP/nhóm học** — hiện nền tảng chưa có. Đây là một bảng nữa và một luồng quản lý nữa |

> ⚠ **Điểm yếu thật của chế độ thi trong game 0-backend.** Game chạy hoàn toàn phía
> client, nên bài thi cũng chấm phía client. Điều duy nhất khiến việc này tin được
> là **phát lại tất định**: client nộp `(seed, danh sách lệnh)`, server chạy lại
> engine và tự tính verdict. Nghĩa là **engine phải chạy được cả ở Node**, không chỉ
> trong trình duyệt. Ràng buộc "không `node:*`" của `packages/games` đang giúp việc
> này chứ không cản: mã thuần chạy được ở cả hai nơi. Nhưng phải có một ô nghiệm thu
> nói rõ "server chấm lại, không tin verdict của client" — nếu không thì toàn bộ kỳ
> thi chỉ là danh dự.

### 5.4 Trang admin/author

Mở rộng `/author/problems` hiện có:

- Chọn `gameId` trước, form đổi theo plugin
- Trạng thái bài: nháp / công khai / ẩn
- Nhập/xuất JSON (đã có `json-transfer.tsx`, dùng lại được)
- Xem trước bằng chính engine của game (đã có tiền lệ `arena-preview.tsx`)
- Quản lý testcase: thêm/xoá/đổi thứ tự, đánh dấu ẩn/hiện
- Trang kỳ thi: tạo đề, chọn bài, đặt giờ, xem bảng điểm, xuất CSV

---

## 6. Level Builder (đợt đầu, theo quyết định #17)

Dùng chung màn hình với sandbox. Luồng:

```
1. Vào sandbox của game
2. Dựng trạng thái ĐẦU  → bấm "Đặt làm trạng thái đầu"
3. Chơi tiếp tới trạng thái ĐÍCH → bấm "Đặt làm đích"
4. Chọn chế độ so (hash-agnostic? có xét nhánh thừa?)
5. Viết đề bài + chọn bài lý thuyết từ content/
6. Xuất JSON → tải về, hoặc lưu thẳng vào DB nếu có quyền
```

Bước 3 là chỗ hay: **trạng thái đích được tạo bằng cách chơi**, không phải bằng cách
gõ JSON tay. Đây là lý do LGB có thể có hàng trăm level cộng đồng.

**Ràng buộc:** Level Builder chỉ dựng được level dạng "từ A tới B". Level có bot đồng
đội (chương 2 game Git) và level có nhiều lượt chạy có seed (chương CI) cần thêm
tham số mà giao diện trực quan khó diễn đạt. Đợt đầu Builder nên hỗ trợ **chương 1
game Git và chương CI**, và nói rõ hai chương kia phải viết bằng file TS.

---

## 7. Nội dung lý thuyết trong `content/`

Theo quyết định #16, lý thuyết tách khỏi level.

```
content/games/git/
  theory/
    01-commit-la-object.md
    02-ba-vung.md
    03-nhanh-la-con-tro.md
    ...
  levels/            (nếu về sau đọc level từ file thay vì code)
content/games/cicd/
  theory/
    ...
```

Mỗi file lý thuyết có frontmatter:

```yaml
id: git-nhanh-la-con-tro
title: Nhánh là con trỏ, không phải thư mục
gameId: git
readMinutes: 4
usedByLevels: [G04, G05, G13]
```

Level trỏ tới bằng `id`. Một bài lý thuyết dùng được cho nhiều level, và đọc được ở
hai chỗ: hộp thoại trong game, và một trang tra cứu riêng.

> ⚠ **Bẫy đã có tiền lệ trong dự án này:** `.dockerignore` từng bóc sạch markdown bài
> học khỏi image, và lệnh kiểm `ls` vẫn xanh vì thư mục vẫn tồn tại. Ô nghiệm thu
> cho phần này phải **kiểm FILE cụ thể có mặt trong image**, không kiểm thư mục.
> Thêm nữa: `content/` đọc lúc chạy **không** được Next trace, nên phải `COPY` tường minh.

---

## 8. Kế hoạch theo đợt

Thứ tự bị ép bởi phụ thuộc, không phải bởi sở thích.

| Đợt | Nội dung | Chặn cái gì |
|---|---|---|
| **A. Nền chung** | Trả nợ hợp đồng §2.1 · `GameId` mở rộng · `RunLog`/`GameAction` lên `core/` · khung renderer đôi (3D + SVG) dùng chung layout · đăng ký ngoại lệ cổng màu | Chặn **mọi thứ** |
| **B. Engine Git** | Object store, refs, index, worktree, reflog, merge 3 ngả diff3 · engine chạy được ở cả browser và Node · test tất định | Chặn C, D, F |
| **C. Game Git chương 1** | 12 level · 3D ba mặt phẳng · ô lệnh · chấm so-trạng-thái · sandbox | Chặn Level Builder |
| **D. Game Git chương 2+3** | 20 level · hai kho · giao diện conflict · bot đồng đội · PR · cứu hộ | — |
| **E. OJ đa-game** | Tổng quát hoá `Problem` · plugin theo game · test hồi quy bài K8s cũ | Chặn G |
| **F. Level Builder** | Sandbox → đặt đầu/đích → xuất JSON | — |
| **G. Chế độ thi** | Bảng exam · lớp học · chấm lại phía server · xuất CSV | — |
| **H. Engine CI/CD** | DAG, runner pool, cache, flake, artifact, môi trường · bộ đọc YAML GitHub Actions | Chặn I, J |
| **I. Game CI/CD chương CI** | 14 level · 3D dây chuyền, trục Y = thời gian chờ · ba trục điểm | — |
| **J. Game CI/CD chương CD** | 14 level · trục Y = môi trường · canary/blue-green/GitOps | — |

**Đường găng: A → B → C.** Nếu hết thời gian, thứ nên cắt trước là **J**, rồi **F**.
Không cắt **A** và **E** — cắt chúng là để lại nợ mà mọi đợt sau phải trả lãi.

---

## 9. Chỗ thiết kế này yếu

Mục này không phải khiêm tốn theo phép lịch sự. Đây là thứ người hiện thực nên đọc
trước khi bắt đầu.

1. **Merge 3 ngả và giao diện conflict là hạng mục đắt nhất, và nó nằm ở chương 2.**
   Nếu tiến độ trượt, nó trượt ở đây. Nhưng cắt nó là cắt đúng thứ tạo khác biệt so
   với Learn Git Branching. Nếu buộc phải cắt, cắt **số lượng level** chứ đừng cắt
   cơ chế.

2. **"Tự do hoàn toàn" về màu chưa được trả giá.** Ba hệ màu nghĩa là ba lần kiểm
   tương phản, ba lần kiểm mù màu, ba lần kiểm dark mode, và một ngoại lệ trong cổng
   grep mà ai đó sẽ hỏi "vì sao" sau sáu tháng. Chi phí này có thật và tôi chưa đưa
   nó thành một dòng công việc có tên.

3. **Level Builder ở đợt đầu là quyết định tham vọng.** LGB mất nhiều năm mới có. Và
   nó chỉ dựng được level dạng "từ A tới B" — hai chương đắt nhất của game Git nằm
   ngoài tầm nó.

4. **Chế độ thi trong game 0-backend đứng hoàn toàn trên phát lại tất định.** Nếu
   một chỗ nào đó trong engine lọt `Date.now()` hoặc lặp trên `Map` không sắp xếp,
   verdict phía server sẽ khác verdict phía client, và nó sẽ lộ ra vào đúng ngày thi
   chứ không phải lúc chạy test. Điều kiện §2.2 phải có test riêng, không phải một
   ghi chú trong tài liệu.

5. **Chương 1 game Git đối đầu trực diện với một sản phẩm 34k★ đã chín.** Ngang bằng
   là mục tiêu hợp lý; vượt trội thì không.

6. **Chưa xác minh tính mới cho bài NCKH.** Phạm vi tra cứu là WebSearch tiếng Anh;
   **chưa quét itch.io, Steam, GDC vault, hay kỷ yếu SIGCSE/ITiCSE/CSEE&T**. Trước
   khi viết "chưa từng có" vào báo cáo, phải tìm ở đó.

7. **Mọi con số về flaky test trong tài liệu này là bằng chứng cấp hai** (đọc từ
   snippet công cụ tìm kiếm, PDF gốc không parse được). Trước khi đưa vào bài NCKH
   phải mở PDF đối chiếu từng số.

8. **Ba game sẽ cầm khác tay nhau.** Camera khác, màu khác, HUD khác. Đó là hệ quả
   trực tiếp của các quyết định đã chốt, không phải sơ suất — nhưng người dùng sẽ
   cảm nhận được, và nên có ai đó quyết định xem điều đó chấp nhận được hay không
   **trước** khi làm, không phải sau.

---

## 10. Nguồn

**Prior art Git:** [Learn Git Branching](https://learngitbranching.js.org/) ·
[mã nguồn](https://github.com/pcottle/learnGitBranching) ·
[treeCompare.js](https://github.com/pcottle/learnGitBranching/blob/main/src/js/graph/treeCompare.js) ·
[gitmastery.me](https://gitmastery.me/) ·
[mã nguồn](https://github.com/MikaStiebitz/Git-Mastery) (license **Restricted Use**, không phải OSS) ·
[Oh My Git!](https://ohmygit.org/) · [git-sim](https://github.com/initialcommit-com/git-sim) ·
[Visualizing Git](https://git-school.github.io/visualizing-git/) · [Githug](https://github.com/Gazler/githug)

**Học thuật:**
[Isomöttönen & Cochez, ICTERI 2014](https://www.cochez.nl/papers/dvcs-misconceptions-final.pdf) ·
[Perez De Rosso & Jackson, Onward! 2013](https://spderosso.github.io/onward13.pdf) ·
[VR-Git, ICSEA 2022](https://www.iaria.org/conferences2022/filesICSEA22/ICSEA_10032.pdf) ·
[Crossing Perception in 3D Graph Vis, arXiv 2508.00950](https://arxiv.org/abs/2508.00950) ·
[Luo et al. FSE'14 (flaky tests)](https://mir.cs.illinois.edu/lamyaa/publications/fse14.pdf)

**Prior art CI/CD:** [Eficode Pipeline game](https://www.eficode.com/pipeline-game) ·
[DevOps Daily Games](https://devops-daily.com/games) ·
[KodeKloud Engineer](https://engineer.kodekloud.com/) ·
[Opus Magnum](https://en.wikipedia.org/wiki/Opus_Magnum)

**Kỹ thuật:** [isomorphic-git](https://isomorphic-git.org/) ·
[three.js PR #27836 bỏ WebGL1](https://github.com/mrdoob/three.js/pull/27836) ·
[InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html) ·
[troika-three-text](https://protectwise.github.io/troika/troika-three-text/) ·
[pmndrs/postprocessing](https://github.com/pmndrs/postprocessing) ·
[d3-dag](https://github.com/erikbrinkman/d3-dag) ·
[Netflix Vizceral](https://github.com/Netflix/vizceral)

**Màu + a11y:** [Color Universal Design — Okabe & Ito](https://jfly.uni-koeln.de/color/) ·
[Access Guide](https://www.accessguide.io/guide/colorblind)

**Trong repo:** `docs/games/README.md` · `docs/games/pipeline.md` ·
`docs/design-system.md` · `packages/games/src/core/types.ts` ·
`packages/games/src/k8s/contract.ts` · `packages/games/src/k8s/problem.ts` ·
`apps/web/src/components/k8s-arena/`
