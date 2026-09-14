# Phase 17 — Nền chung trụ cột ③ + game "Phòng thí nghiệm Git"

**Mức chi tiết:** DETAILED · **Effort:** XL · **Blocked by:** không · **Blocks:** P18, P19
**SSOT thiết kế:** [`plans/reports/2026-09-11-brainstorm-git-cicd-games.md`](../reports/2026-09-11-brainstorm-git-cicd-games.md)
**Chạy:** tuần tự một luồng (`/t1k:cook`), **không** fan-out teammate. Chốt với chủ dự án 2026-09-11.
**Plane:** bỏ qua theo `rules/no-outbound-from-this-project.md`.

> Chặng này **không brainstorm lại**. 20 quyết định đã chốt nằm ở §1 của design doc và là hợp
> đồng. Chỗ nào design đã nói, plan này trỏ tới chứ không chép lại. Thấy design sai thì **báo
> chủ dự án**, không tự đổi.

---

## 0. Hiện trạng đo được (scout 2026-09-11)

| Giả định | Thực tế đo được |
|---|---|
| "Game K8s là 2D DOM" | **Sai.** `three@0.185.1` + `@react-three/fiber@9.7` + `drei@10.7` + `postprocessing@6.39`. Scene thật ở `apps/web/src/components/k8s-arena/scene/` — 114 file trong toàn thư mục arena, riêng scene ~4.5K dòng. |
| `docs/games/README.md` mô tả đúng hiện trạng | **Sai một phần.** Nó viết ba game còn lại là "DOM thật". Ba tài liệu `pipeline.md`/`netpol.md`/`dockerfile.md` đều thiết kế cho 2D. Tài liệu chỉ mục cần cập nhật ở 17.S. |
| Có thể tái dùng `RunLog` cho game mới | **Không.** `RunLog` + `GameAction` nằm trong `packages/games/src/k8s/contract.ts`, `GameAction.kind` là union đóng của K8s. Cơ chế chống gian lận hiện chỉ dùng được cho một game. |
| `GameId` có `'git'` | **Không.** `packages/games/src/core/types.ts:15` — `'k8s' \| 'pipeline' \| 'netpol' \| 'dockerfile'`. |
| Camera game K8s | `OrbitControls` phối cảnh, xoay tự do (`scene/camera-rig.tsx`). Hai game mới dùng ortho snap góc — **cố ý khác**, xem design §1.1(c). |
| Cổng màu là script hay lệnh tay | Là **script CI** từ P14 (`check-design-tokens`, P16 đo 552 file / 4 vùng, có đối chứng hai chiều). Không phải lệnh tay nữa. |
| `packages/games/src` nằm trong `ROOTS` của `check-no-commerce.mjs` | ~~**Không.**~~ **DÒNG NÀY SAI — sửa 2026-09-14 khi hiện thực.** Nó CÓ nằm trong `ROOTS`, và đã nằm từ **2026-09-08**, commit `5c3815c` ("cổng chống-thương-mại chưa từng quét packages/games/src") — tức là trước cả lượt scout viết ra dòng này ba ngày. Bản scout đọc một bản script đã cũ. Hệ quả: quyết định ở 17.C.3 dựng trên một tiền đề sai; xem chỗ đó để biết đã xử thế nào. |
| `packages/games` có thể `import node:*` | **Không, và đó là cố ý.** `tsconfig` của package bỏ `types: ["node"]` để một lần lạc tay là đỏ ngay ở typecheck. Ràng buộc này **giúp** §17.J chứ không cản: mã thuần chạy được ở cả trình duyệt và Node. |

---

## 1. Ba ràng buộc chi phối toàn chặng

Trích từ design doc, đặt ở đây vì mọi chuỗi bên dưới đều đụng phải.

1. **0 lời gọi backend trong lúc chơi.** Đo bằng Playwright network trace, không đo bằng đọc code.
2. **Tất định tuyệt đối.** Cùng seed + cùng chuỗi hành động ⇒ cùng trạng thái, ở cả trình duyệt
   lẫn Node. Đây là điều kiện sống còn của P18 (chấm lại phía server).
3. **Chế độ 2D là ngang hàng, không phải fallback.** three.js đã xoá WebGL1 từ r163 nên "fallback
   WebGL1" không tồn tại.

---

## 2. Chuỗi công việc

Thứ tự dưới đây **là** thứ tự thực thi. Mỗi lá ≤ 4 giờ.

### 17.A — Trả nợ hợp đồng `core/` (S, ~1 ngày) · **KHÔNG ĐƯỢC CẮT**

Chặn mọi thứ còn lại của P17, P18, P19. Cắt nó là để lại nợ mà mọi chặng sau phải trả lãi.

| # | Việc | Ước |
|---|---|---|
| A.1 | Mở `GameId` thành `'k8s' \| 'pipeline' \| 'netpol' \| 'dockerfile' \| 'git' \| 'cicd'`. Giữ `'pipeline'` dù đợt này không làm — xoá là đổi hợp đồng lưu trữ của bản lưu đã có. | 1h |
| A.2 | Chuyển `RunLog` từ `k8s/contract.ts` lên `core/run-log.ts`. `GameAction` thành union phân biệt bằng `gameId`, mỗi game khai `payload` riêng. | 3h |
| A.3 | Cập nhật mọi chỗ dùng trong `k8s/` + `apps/web` sau khi chuyển. Chạy `grep -rn "RunLog\|GameAction"` trước khi sửa, theo quy ước Pre-Delete Reference Check. | 2h |
| A.4 | **Không** chuyển `EdgeView` — nó ở lại `k8s/`. Ghi comment tại chỗ nói rõ vì sao: cạnh cha-con của commit DAG và cạnh `needs` của pipeline không phải cùng một thứ dù cùng tên "cạnh". | 30m |
| A.5 | Cập nhật `docs/games/README.md` §"Kiến trúc dùng chung" cho khớp. | 1h |

**AC-A:** `turbo run build lint typecheck test` xanh toàn cây · `grep -n "RunLog" packages/games/src/k8s/contract.ts` trả **rỗng** · test hiện có của game K8s không đỏ dòng nào (đối chứng: 402 test games ở P16).

### 17.B — Khung renderer đôi (M, ~2 ngày)

Một layout, hai renderer. Làm **trước** khi có nội dung để không phải bóc ra sau.

| # | Việc | Ước |
|---|---|---|
| B.1 | `packages/games/src/core/layout/` — thuật toán phân tầng (Sugiyama) trả toạ độ 2D thuần. Toán thuần, không `three`, không DOM. | 4h |
| B.2 | Đánh giá `d3-dag` vs tự viết: đo bundle, đo tất định (thứ tự node đầu ra phải ổn định với cùng đầu vào). **Ghi kết quả đo vào comment**, không ghi "chọn X vì phổ biến". | 3h |
| B.3 | `apps/web/src/components/games/shared/` — hợp đồng `SceneProps` dùng chung cho cả hai renderer. | 2h |
| B.4 | Renderer SVG: nhận cùng `SceneProps`, vẽ node + cạnh + nhãn ra DOM thật. | 4h |
| B.5 | Bộ dò khả dụng WebGL2 (`canvas.getContext('webgl2') === null`) + chuyển chế độ + ghi nhớ lựa chọn của người dùng. | 2h |
| B.6 | Nút `[2D]/[3D]` ở thanh trên, **không** giấu trong cài đặt. | 1h |

**AC-B:** cùng một `SceneProps` cho hai renderer ra **cùng tập node và cạnh** (test so tập, không so pixel) · renderer SVG có vai trò ARIA đầy đủ, axe 0 vi phạm.

⚠ **Ô nghiệm thu này dễ nói dối.** Tắt hardware acceleration **KHÔNG** xoá WebGL2 — SwiftShader vẫn cấp context. Test cảnh không-WebGL phải chạy Playwright với `--disable-3d-apis`, và phải có **đối chứng dương**: một lượt chạy chứng minh test đỏ khi bộ dò bị hỏng.

### 17.C — Ngoại lệ cổng màu + kiểm a11y riêng từng game (S, ~1 ngày) · **hạng mục có tên**

Design §9 mục 2 nói thẳng: "tự do hoàn toàn" về màu chưa được trả giá. Đây là chỗ trả.

| # | Việc | Ước |
|---|---|---|
| C.1 | Đăng ký ngoại lệ tường minh cho `apps/web/src/components/games/git/**` và `.../cicd/**` trong `check-design-tokens`. Tiền lệ: `packages/terminal/src/**/themes.ts`. Ghi lý do ngay tại chỗ. | 2h |
| C.2 | **Đối chứng dương cho ngoại lệ:** một test chứng minh cổng vẫn đỏ khi hex trần xuất hiện **ngoài** vùng ngoại lệ. Không có nó thì ngoại lệ có thể vô tình nuốt cả `apps/web/src`. | 2h |
| C.3 | ~~**Đã chốt: KHÔNG thêm `packages/games/src` vào `ROOTS`**~~ — **ô này dựng trên một tiền đề SAI, xem §0.** `packages/games/src` đã Ở TRONG `ROOTS` từ `5c3815c`; "không thêm vào" là một việc không tồn tại, còn cách duy nhất để đạt ý định của nó là **gỡ root ra**, mà gỡ ra là mở toang lại đúng vùng mã `5c3815c` vừa đóng. **Đã làm thay (2026-09-14):** giữ nguyên root, và khai một **ngoại lệ ba chiều** — đường dẫn + luật + đúng MỘT từ khoá — kèm đối chứng dương ba hướng. Game vẫn dùng được từ vựng git tự nhiên, cổng vẫn gác phần còn lại, và một từ khoá thương mại thật vẫn đỏ. | 1h |
| C.4 | Bảng màu game Git: khai bảng riêng, mã hoá **ba kênh** cho mỗi trạng thái (màu + hình học + chuyển động), theo design §4.6. | 3h |
| C.5 | Kiểm tương phản **cả hai theme** cho bảng màu đó, kèm mô phỏng mù màu trên ảnh chụp cảnh thật. Ghi số đo. | 3h |

**AC-C:** `check-design-tokens` xanh · đối chứng dương của C.2 đã chạy và đã thấy đỏ · mọi cặp chữ/nền trong HUD game Git đạt ≥ 4.5:1 ở cả theme sáng và tối, có bảng số đo trong báo cáo.

### 17.D–17.H — Engine Git (L, ~1.5 tuần)

Mô hình ở design §3.2. Ước tính tổng ~1.500–2.500 dòng TS.

| Chuỗi | Nội dung | Ước |
|---|---|---|
| **17.D** | `ObjectStore` (Map<Oid, Blob\|Tree\|Commit>, không bao giờ xoá) · `Blob` là **mảng dòng** · băm chuẩn tắc (FNV-1a/xxhash, hiển thị 7 hex) · `Tree` · `Commit` với `logicalTime` | 4h + 4h + 3h |
| **17.E** | `Refs` · `HEAD` (ref hoặc detached) · `Index` **tách khỏi** `Worktree` · thao tác add/commit/checkout/branch/switch | 4h + 4h + 4h |
| **17.F** | `Reflog` per-ref · truy vấn reachability · `git reset` ba kiểu · `revert` · `stash` · `fsck --lost-found` | 4h + 4h + 3h |
| **17.G** | `merge` · **diff3 ba ngả theo dòng** · sinh marker conflict · `merge --abort` · `rebase` (kể cả `-i`) · `cherry-pick` | 4h + 4h + 4h + 4h |
| **17.H** | Kho thứ hai (`origin`) · `clone`/`fetch`/`push`/`pull` · ref theo dõi `refs/remotes/origin/*` · từ chối non-fast-forward · `--force` và `--force-with-lease` · mô phỏng PR | 4h + 4h + 4h + 3h |

**Cố tình bỏ** (ghi vào comment đầu module để người sau không tưởng là thiếu sót): định dạng
object nhị phân của git, zlib, packfile/delta, SHA-1 thật, submodule, sparse-checkout, hook,
filter.

**AC-D..H:** mỗi lệnh có test đơn vị riêng · `merge` diff3 có test cho cả ba nhánh (không xung
đột / xung đột một hunk / xung đột nhiều hunk chồng nhau) · `git reset --soft/--mixed/--hard`
có test khẳng định **đúng vùng nào bị chạm** (đây là misfit MIT, không được đoán).

### 17.I — Bộ phân tích lệnh (M, ~2 ngày)

| # | Việc | Ước |
|---|---|---|
| I.1 | Tách token + phân tích cú pháp lệnh git (cờ dài, cờ ngắn, cờ gộp, `--` phân cách) | 4h |
| I.2 | Bảng lệnh khai báo: mỗi lệnh khai cờ hợp lệ + số tham số + thông báo lỗi tiếng Việt | 4h |
| I.3 | Lịch sử lệnh (↑↓), gợi ý Tab, `Ctrl+Z` hoàn tác một bước | 3h |
| I.4 | Thông báo lỗi **giải thích trạng thái**, không chỉ báo sai. Đây là chỗ chống "blind-testing effect" mà khảo sát ICTERI §5.7 nêu: sinh viên thử đại lệnh vì không đọc nổi lỗi của git thật. | 4h |

**AC-I:** gõ một lệnh không tồn tại ra thông báo nêu **lệnh gần đúng**, không phải "command not found" · mọi thông báo lỗi bằng tiếng Việt, thuật ngữ hạ tầng giữ tiếng Anh theo quy ước repo.

### 17.J — Test tất định (M, ~1.5 ngày) · **năm điều kiện, năm test riêng**

Design §2.2 liệt kê năm điều kiện. Mỗi điều kiện **một test riêng có thể đỏ**, không phải một
ghi chú trong tài liệu.

| # | Điều kiện | Test chứng minh điều gì |
|---|---|---|
| J.1 | Hash thuần tuý | Cùng object ⇒ cùng Oid, qua 1000 lần dựng lại theo thứ tự chèn khác nhau |
| J.2 | Không `Date.now()`, không `Math.random()` | **Cổng grep** trên `packages/games/src/git/**` + đối chứng dương (thêm một dòng `Date.now()` phải làm cổng đỏ) |
| J.3 | Lặp trên tập hợp qua khoá đã sắp xếp | Dựng cùng một repo bằng hai thứ tự chèn khác nhau ⇒ hash trạng thái bằng nhau |
| J.4 | Replay = `(levelId, seed, lệnh[])` | Phát lại 20 lượt chơi mẫu ⇒ khớp `RunResult` |
| J.5 | **Engine chạy được ở Node** | Cùng bộ test chạy hai lần: env `jsdom` và env `node`, kết quả byte-với-byte giống nhau |

⚠ J.5 là điều kiện sống còn của **P18** (chấm lại phía server). Nếu nó đỏ thì chế độ thi chỉ là
danh dự. Đừng đẩy nó sang sau.

**AC-J:** năm test trên xanh · J.2 đã chạy đối chứng dương và đã thấy đỏ · J.3 chạy với ít nhất
5 thứ tự chèn khác nhau.

### 17.K — Tầng 3D game Git (L, ~1 tuần)

Ẩn dụ ở design §3.5.

| # | Việc | Ước |
|---|---|---|
| K.1 | Camera orthographic, snap 4–8 góc cố định. **Không** `OrbitControls` xoay tự do. | 4h |
| K.2 | Bố cục 2.5D: X = thời gian logic, Z = làn nhánh, Y = **một biến duy nhất** (độ lệch khỏi nhánh chính) | 4h |
| K.3 | Ba mặt phẳng chồng lớp: HEAD / Index / Worktree, nhìn thấy đồng thời | 4h |
| K.4 | Node commit bằng `InstancedMesh`, badge trạng thái qua texture atlas — mục tiêu **< 100 draw call/frame** | 4h |
| K.5 | Định tuyến cạnh theo làn, rẽ góc vuông. **Không** edge bundling (nó phá việc lần theo một đường phụ thuộc). | 4h |
| K.6 | Nhãn: `drei <Html>` **chỉ cho node hover/select** (< 20 phần tử cùng lúc); nhãn tĩnh cấp cao bằng `troika-three-text`; **lặp lại nhãn nhánh** dọc theo làn | 4h |
| K.7 | Chuyển động mang thông tin: rebase (commit bay, bản cũ mờ nhưng còn) · reset --hard (commit chìm) · reflog (chìm nổi lại) · force-push (commit bot vỡ và tan) · cherry-pick (bản sao tách, giữ chỉ mờ về nguồn) | 4h + 4h |
| K.8 | Hai kho là hai khối không gian tách rời, push/fetch là vật thể qua khoảng trống | 4h |
| K.9 | Điều hướng: **teleport tới ref**, không bay tay | 3h |
| K.10 | Rim light fresnel trong material cho node đang chọn. **Không** outline pass. Selective bloom **chỉ cho `running`**. | 3h |

⚠ **Hai bẫy phải kiểm tận tay:** `drei <Html occlude="blending">` bị ẩn khi có postprocessing
pass. Và `InstancedMesh` có issue mở (`mrdoob/three.js#30352`) cho thấy nó **chậm hơn** Mesh
dùng shared attributes trong vài cấu hình — phải đo, đừng giả định.

**AC-K:** draw call < 100 ở level đông nhất (đo bằng `renderer.info.render.calls`, ghi số) ·
không có `#hex` trần ngoài vùng ngoại lệ 17.C · camera không tự xoay khi nhàn rỗi (tiền lệ:
`idleSpinAfterMs` đã bị gỡ khỏi game K8s ngày 2026-09-08 vì vẽ 14fps vĩnh viễn).

### 17.L — HUD và bố cục (M, ~2 ngày)

Bố cục ở design §3.6.

| # | Việc | Ước |
|---|---|---|
| L.1 | Ô lệnh dưới cùng, rộng hết chiều ngang | 3h |
| L.2 | Bảng mục tiêu (= danh sách testcase), tick theo thời gian thực | 3h |
| L.3 | Hộp thoại bài giảng nhiều trang, đọc markdown từ `content/` | 4h |
| L.4 | Danh sách ref 2D thường trực (mini-map) | 3h |
| L.5 | Thanh trên: tên chương/level, nút 2D/3D, cài đặt, trợ giúp | 2h |

**AC-L:** điều hướng bàn phím đủ cho **toàn bộ** thao tác (không có thao tác nào chỉ làm được
bằng chuột) · axe 0 vi phạm trên màn chơi.

### 17.M — Nội dung lý thuyết (M, ~2 ngày)

| # | Việc | Ước |
|---|---|---|
| M.1 | Định dạng file lý thuyết + frontmatter (`id`, `title`, `gameId`, `readMinutes`, `usedByLevels`) | 2h |
| M.2 | Bộ nạp + kiểm tra chéo: mọi `usedByLevels` phải trỏ tới level có thật, và ngược lại | 3h |
| M.3 | Viết ~14 bài lý thuyết cho chương 1 | 4h × 2 |
| M.4 | Viết ~10 bài cho chương 2 | 4h × 2 |
| M.5 | Viết ~8 bài cho chương 3 | 4h |
| M.6 | Trang tra cứu riêng cho bài lý thuyết (ngoài game) | 3h |

⚠ **Ô nghiệm thu này dễ nói dối.** `.dockerignore` từng bóc sạch markdown bài học khỏi image mà
`ls` vẫn xanh vì thư mục vẫn tồn tại. Và `content/` đọc lúc chạy **không** được Next trace, nên
phải `COPY` tường minh trong Dockerfile.

**AC-M:** kiểm **FILE cụ thể** có mặt trong image, **không** kiểm thư mục · M.2 xanh cả hai chiều.

⚠ Đường dẫn `/app/...` mà bản plan đầu viết là **SAI** (sửa 2026-09-14 sau khi đo trong image thật): `apps/web/Dockerfile` đặt `WORKDIR /repo`, nên `/app` KHÔNG tồn tại. Lệnh đúng:

```
docker run --rm <img> cat /repo/content/games/git/theory/01-commit-la-object.md | head -1
```

Bẫy đi kèm: `/app/...` không tồn tại làm `cat` lỗi, và một ô nghiệm thu đọc mã thoát mà không đọc NỘI DUNG sẽ đọc "file rỗng" và "thư mục sai" ra cùng một kết quả.

### 17.N–17.P — Level (L, ~2 tuần)

Bản đồ chủ đề ở design §3.4. Level **dạy** (đưa kiến thức trước rồi mới cho dùng).

| Chuỗi | Nội dung | Ước |
|---|---|---|
| **17.N** | Chương 1, G01–G12 (nắn lịch sử) | 12 level × ~2h |
| **17.O** | Chương 2, G13–G24 (làm việc nhóm) — gồm giao diện giải conflict và bot đồng đội | 12 level × ~3h + 8h giao diện conflict |
| **17.P** | Chương 3, G25–G32 (cứu hộ) | 8 level × ~2h |

**Cơ chế chấm** (design §3.3): so **trạng thái** với cây đích, **không** khớp mẫu lệnh. Sáu chế
độ so, gồm hai chế độ game K8s không cần: `compareWorktreeContent` (nội dung file, cho chương 2)
và `compareReachability` (tập commit còn sống, cho chương 3).

**AC-N..P:** mỗi level có **ít nhất hai lời giải khác nhau** cùng qua (chứng minh chấm theo trạng
thái chứ không theo đường đi) · mỗi level có `solutionCommand` chạy được, và một test chạy
`solutionCommand` của cả 32 level rồi khẳng định AC.

⚠ **17.O là hạng mục đắt nhất của cả P17 và là chỗ dễ trượt tiến độ nhất** (design §9 mục 1).
Nếu phải cắt, cắt **số lượng level** chứ đừng cắt cơ chế conflict — cơ chế mới là thứ tạo khác
biệt so với Learn Git Branching, vốn có **0 dòng** về conflict.

### 17.Q — Sandbox (S, ~1 ngày)

Reset · undo từng bước · nhập/xuất cây JSON · bật/tắt `origin` · chọn kịch bản khởi tạo (kho
trống / kho rối / kho vừa hỏng).

Dùng **cùng màn hình** với Level Builder (P18) — đây là lý do Sandbox phải xong trước P18.

**AC-Q:** xuất rồi nhập lại một cây bất kỳ ⇒ hash trạng thái không đổi.

### 17.R — Route và tích hợp (S, ~1 ngày)

`/games/git` · thêm ô vào `games-catalog.ts` · liên kết từ `/games` · cập nhật `nav.test.ts`
nếu cần.

**AC-R:** Playwright network trace trong lúc chơi = **0 lời gọi backend** (đây là ô nghiệm thu
chính thức của trụ cột ③, đo chứ không đọc code).

### 17.S — Tài liệu (S, ~0.5 ngày)

`docs/games/git.md` (thiết kế đã hiện thực) · cập nhật `docs/games/README.md` bảng bốn game →
sáu game, và sửa mô tả sai "DOM thật" ở §0 · ghi ngoại lệ cổng màu vào `docs/design-system.md`.

---

## 3. Ô nghiệm thu của cả chặng

| # | Ô | Đo bằng |
|---|---|---|
| AC-1 | Toàn cây xanh | `turbo run build lint typecheck test --force`, `Cached: 0 cached` — đọc dòng `Tasks: X/Y` **trước** khi trích bất kỳ con số test nào (turbo dừng sau task đỏ nên suite sau có thể chưa chạy) |
| AC-2 | 0 lời gọi backend lúc chơi | Playwright network trace, spec riêng |
| AC-3 | Engine tất định | Năm test 17.J xanh, J.2 có đối chứng dương |
| AC-4 | Engine chạy ở Node | Cùng bộ test qua hai env, kết quả giống nhau |
| AC-5 | Đường 2D dùng được | Playwright `--disable-3d-apis` chơi hết một level, có đối chứng dương |
| AC-6 | a11y | axe 0 vi phạm trên mọi màn game Git, cả hai theme |
| AC-7 | Hiệu năng | draw call < 100 ở level đông nhất, có số đo ghi lại |
| AC-8 | 32 level qua được | Test chạy `solutionCommand` của cả 32, tất cả AC |
| AC-9 | Mỗi level ≥ 2 lời giải | Test riêng, chứng minh chấm theo trạng thái |
| AC-10 | Bài lý thuyết có trong image | Kiểm **file cụ thể**, không kiểm thư mục |
| AC-11 | Cổng màu | `check-design-tokens` xanh + đối chứng dương của ngoại lệ |

---

## 4. Rủi ro

| Rủi ro | L | I | Điểm | Giảm thiểu |
|---|---|---|---|---|
| Diff3 + giao diện conflict trượt tiến độ | 4 | 5 | **20** | Làm 17.G **trước** 17.O. Nếu trượt, cắt số level chương 2 xuống 8, giữ nguyên cơ chế |
| Một chỗ lọt `Date.now()` làm verdict client ≠ server | 3 | 5 | **15** | Cổng grep J.2 có đối chứng dương, chạy trong CI chứ không phải chạy tay |
| `InstancedMesh` chậm hơn Mesh thường ở cấu hình này | 2 | 3 | 6 | Đo ở K.4 trước khi xây tiếp lên nó |
| `drei <Html>` + postprocessing xung đột | 3 | 3 | 9 | Kiểm tận tay ở K.6, có ảnh chụp làm bằng |
| Ngoại lệ cổng màu nuốt cả `apps/web/src` | 2 | 4 | 8 | Đối chứng dương C.2 |
| Chương 1 không hơn được Learn Git Branching | 4 | 2 | 8 | Chấp nhận. Ngang bằng là mục tiêu; khác biệt nằm ở chương 2 và 3 |
| Bài lý thuyết bị `.dockerignore` bóc mất | 3 | 3 | 9 | AC-10 kiểm file cụ thể |

---

## 5. Thời lượng

| Chuỗi | Effort | Ghi chú |
|---|---|---|
| 17.A nền hợp đồng | S (1d) | **Chặn mọi thứ.** Không cắt |
| 17.B renderer đôi | M (2d) | Làm sớm để không bóc ra sau |
| 17.C cổng màu + a11y | S (1d) | Hạng mục có tên, không phải việc phụ |
| 17.D–H engine Git | L (1.5wk) | Đường găng |
| 17.I bộ phân tích lệnh | M (2d) | |
| 17.J test tất định | M (1.5d) | Chặn P18 |
| 17.K tầng 3D | L (1wk) | |
| 17.L HUD | M (2d) | |
| 17.M lý thuyết | M (2d) | Chạy xen được với 17.K |
| 17.N–P level | L (2wk) | 17.O là chỗ trượt |
| 17.Q sandbox | S (1d) | Chặn Level Builder ở P18 |
| 17.R route | S (1d) | |
| 17.S tài liệu | S (0.5d) | |
| **Tổng** | **~7–8 tuần** | Đường găng: A → D..H → J → N..P |

---

## 6. Kỷ luật git

Nhánh `feat/p17-git-game`, tách từ `main`.

Chặng chạy **tuần tự một luồng**, nên không có đua git index. Nhưng **nhiều phiên Claude có thể
dùng chung một cây** — chạy `git status` **trước mọi lệnh git**, và commit dạng pathspec
(`git commit -m "..." -- <đường dẫn>`), không `git add -A`.

Commit theo chuỗi: một chuỗi (17.A, 17.B, …) một commit trở lên, không gộp hai chuỗi vào một
commit.

---

## 7. Thứ tự cắt nếu hết thời gian

Trong phạm vi P17, cắt theo thứ tự: **17.S** (tài liệu) → **số level của 17.P** → **số level của
17.O**. Cơ chế conflict ở 17.G **không cắt**.

**17.A và 17.J không cắt trong bất kỳ hoàn cảnh nào** — cái đầu chặn P18 và P19, cái sau là điều
kiện để chế độ thi ở P18 có nghĩa.
