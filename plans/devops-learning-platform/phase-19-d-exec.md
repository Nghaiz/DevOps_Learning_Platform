# 19.D exec — Tầng hình ảnh game CI/CD (2D đẹp + 3D kiểu arena K8s)

**Mức chi tiết:** DETAILED · **Effort:** L (~1.5 tuần) · **Blocked by:** 19.A/B/C/E/F/G/H (đã xong) · **Blocks:** không
**Nguồn phạm vi:** [`phase-19.md`](phase-19.md) §19.D + AC-5/AC-6/AC-7 · SSOT thiết kế §4.4, §4.6, §4.7 của
[`2026-09-11-brainstorm-git-cicd-games.md`](../reports/2026-09-11-brainstorm-git-cicd-games.md)
**Nhánh:** tách từ `main` sau khi nhánh P19 hiện tại gộp · **Plane:** bỏ qua theo `rules/no-outbound-from-this-project.md`.

> Chặng này KHÔNG thiết kế lại luật chơi. Engine, level, bộ chấm và ô soạn YAML đã xong và không
> đổi một dòng. Đây là tầng **trình bày**.

---

## 0. Quyết định của chủ dự án (2026-09-17, trước khi viết dòng nào)

| # | Câu hỏi | Chốt |
|---|---|---|
| 1 | AC-5 "đường 2D dùng được" nghĩa là gì | **2D là một cảnh THẬT: đẹp nhất có thể, nhiều hiệu ứng, màu sắc, mượt**, dùng thư viện đồ hoạ. Không phải bảng YAML hiện tại |
| 2 | Mượn tới đâu từ HUD arena K8s | **Ngôn ngữ thị giác + vài mảnh**: token màu, khối, thanh trên, inspector, mission card, minimap. Giữ ô soạn YAML và bảng ba trục hiện có |
| 3 | Sân chơi chiếm bao nhiêu màn hình | **Toàn màn hình, tự do, đúng như game K8s.** ⛔ KHÔNG nhét cảnh vào một thẻ hẹp như game Git đang làm |
| 4 | Hình dạng nhật ký OJ · vị từ CD | Thuộc [`phase-19-j-exec.md`](phase-19-j-exec.md), không thuộc chặng này |

**Hai ràng buộc cấm, ghi rõ vì chúng đổi nguồn tham chiếu:**

- ⛔ **CẤM dùng `components/games/git/scene3d/` làm nguồn tham chiếu hay nguồn chép.** Chủ dự án
  đánh giá tầng 3D game Git là xấu và lỗi, và sẽ đập đi xây lại toàn bộ giao diện sau.
- ⛔ **CẤM bắt chước bố cục màn chơi của game Git** (cảnh nằm trong thẻ, chia đôi với ô soạn).
  Nguồn tham chiếu DUY NHẤT cho cả cảnh lẫn bố cục là **`components/k8s-arena/`**.

---

## 1. Hiện trạng đo được (2026-09-17, đọc mã)

| Câu hỏi | Đo được |
|---|---|
| Game CI/CD đang vẽ đồ thị bằng gì | **Không gì cả.** `grep -rl "svg|Canvas" components/games/cicd/` trả 0 dòng. Màn chơi là ô soạn YAML + bảng ba trục + danh sách mục tiêu + bảng núm CD |
| `criticalPath()` ai đọc | **Không ai ở `apps/web`.** Engine tính đường găng từ 19.A.7, giao diện chưa từng hiện nó. Đây là thứ người chơi thiếu nhất, và nó thiếu ở CẢ HAI chế độ |
| Arena K8s có đường 2D không | **Không.** `grep "renderer-mode|'2d'"` trong `k8s-arena/` trả 0 dòng mã chạy. Arena là 3D-only, nạp bằng `next/dynamic` + `ssr: false` (`arena-root.tsx:38`) |
| Arena bố cục thế nào | Canvas chiếm trọn vùng dưới thanh trên cùng, **không lưới chia cột**; mọi panel là lớp phủ nổi trên canvas (`arena-root.tsx:8`) |
| Bố cục DAG có sẵn không | **Có, đã export ở barrel.** `layoutDag`, `assignLanes`, `routeEdge`, `countDiagonalSegments` — `packages/games/src/core/layout/`, barrel `packages/games/src/index.ts:197-198`. Engine-agnostic, KHÔNG phải mã của game Git |
| Thư viện đồ hoạ đã cài | `three@0.185.1`, `@react-three/fiber@9`, `@react-three/drei@10`, `@react-three/postprocessing@3`, `postprocessing@6`, `framer-motion@13.2.0` (qua `@devops-platform/motion`). **Không** có d3-dag / dagre / elk / React Flow / pixi / konva |
| Cơ chế đổi chế độ 2D/3D | `components/games/shared/renderer-mode.ts` + `webgl-detect.ts` — hàm thuần, không dính `three`, không dính game nào. Dùng lại được: đây là hạ tầng chung, KHÔNG phải mã 3D của game Git |
| Màu vào WebGL bằng đường nào | `k8s-arena/shared/scene-tokens.ts`: đặt `color: var(--token)` lên phần tử dò, đọc `getComputedStyle`, rồi **vẽ lên canvas 1x1 và đọc byte** — vì Chrome serialize lại `oklch()` và `THREE.Color.setStyle` không hiểu `oklch` |

---

## 2. Hợp đồng nền — chốt trước, không lane nào sửa

### 2.1 `packages/games/src/cicd/scene-contract.ts` — toán thuần, KHÔNG một dòng `three`

Ba lý do, cả ba có tiền lệ đắt trong repo:

1. **Test được ở env `node`.** Phép đặt chỗ là thứ dễ sai nhất và cũng dễ test nhất.
2. **Cổng `bundle:check`.** `three` + `@react-three/*` + `postprocessing` là ~631KB. P17 đã một
   lần rò engine sang 6 route không liên quan vì một barrel (`44f8e39`).
3. **Hợp đồng đọc được.** Lane 2D và lane 3D đọc CÙNG một phép đặt chỗ; nếu không thì ô "hai
   renderer vẽ cùng một thứ" là lời khai chứ không phải phép đo.

**⚠ SỬA 2026-09-17 sau khi đọc mã — chữ ký dưới đây thay cho bản đầu.** Bản đầu
(`placeWorkflow(workflow, record | null, chapter)`, node khoá theo `stageId`) sai
ba chỗ, cả ba đo được:

1. **`CicdView` đã có sẵn và chưa ai dựng.** `contract.ts:1191` khai nó, và khối
   chú thích §7 ngay trên viết rõ *"Engine KHÔNG biết gì về toạ độ. `core/layout/`
   tính vị trí TỪ VIEW NÀY. Hai renderer nhận cùng `CicdView`."* `grep` ra **0
   producer**. Đọc thẳng `WorkflowSpec + RunRecord` buộc tầng đặt chỗ tự suy lại
   `state`/`kind`/`statusToken` — nguồn sự thật thứ hai cho đúng những thứ
   `StageNodeView` đã định nghĩa.
2. **Khoá theo `stageId` làm mất node ở ma trận.** C12 và C13 có `fanOut` (7 chỗ
   khai), nên `test#node20/ubuntu`, `test#node22/ubuntu`, `test#node24/ubuntu`
   gộp thành MỘT. Engine khoá bằng `InstanceKey`.
3. **`chapter` là tham số thừa.** `CicdView.yAxis` đã mang đúng thông tin đó, và
   chú thích của nó CẤM suy lại từ `level.chapter` ở tầng renderer (sandbox 19.H
   không có level nào).

Hình dạng đã chốt:

```
buildGraphView({ workflow, run | null, yAxis, atTick? }) -> CicdGraphView
  = Pick<CicdView, 'nodes' | 'edges' | 'yAxis'>       // lấy bằng Pick, không khai lại

placeWorkflow(view) -> CicdPlacement
  nodes: { instance, stageId, x, y, z, layer, lane, band }[]   // HÌNH HỌC thôi
  edges: { from, to, critical, resourceEdge, points }[]        // góc vuông theo làn
  bounds, layerCount, laneCount, bandCount
```

⛔ `CicdPlacementNode` KHÔNG mang `status`/`kind`/`stepCount`: chúng đã ở
`view.nodes`, chép sang là đúng thứ "No Derived Fields" cấm. Renderer ghép hai
bên bằng `instance`.

⚠ **`runners` và `events` của `CicdView` vẫn CHƯA dựng được.** `evaluate()` /
`simulatePass()` trả bản ghi, không trả ảnh chụp số máy bận theo từng tick, và
không có nhật ký sự kiện nào trong engine. Trả `[]` cho đủ hình dạng là nói dối
im lặng (HUD sẽ vẽ "0 máy bận", không gì đỏ). Hai trường đó cần engine mở thêm —
**việc này chưa nằm trong ước lượng nào của 19.D.4**, lane-hud phải báo lại trước
khi đụng vào.

**Ba trục, mỗi trục đúng một nghĩa** (quyết định #13 của `phase-19.md` §1 — trục Y đổi theo chương):

| Trục | Chương CI | Chương CD |
|---|---|---|
| **X** | tầng Sugiyama (thứ tự phụ thuộc) | như CI |
| **Z** | làn job chạy song song (`assignLanes`) | như CI |
| **Y** | **thời gian chờ hàng đợi** — job xếp hàng đẩy lên cao, nghẽn thành cột | **môi trường**: dev, staging, prod xếp chồng |

⛔ Một trục mang hai biến là một trục người chơi đọc sai mà không biết mình đọc sai. Y của chương
CI KHÔNG mang thêm trạng thái; Y của chương CD KHÔNG mang thêm thời gian chờ. Cổng:
`scene-contract.test.ts` khẳng định `y` chỉ là hàm của đúng một nguồn theo `chapter`.

### 2.2 Mã hoá trạng thái BA KÊNH — dùng chung cho 2D và 3D

Theo SSOT §4.6 (bảng Okabe & Ito). Khai một lần ở `cicd/scene-encoding.ts`, hai renderer đọc:

| Trạng thái | Màu (token) | Hình học | Chuyển động | Icon |
|---|---|---|---|---|
| passed | `--success` (bluish-green) | khối đặc, mặt trên phẳng | tĩnh | ✓ |
| failed | `--destructive` (vermilion) | khối khuyết một góc | rung một lần rồi đứng | ✕ |
| running | `--primary` (blue) | khối có vành quanh trục Y | xoay đều | ◐ |
| skipped | `--muted` | 2D gạch chéo, 3D wireframe | tĩnh, mờ 35% | ⊘ |
| queued | `--warning` (orange) | khối chìm dưới mặt tầng | mạch đập chậm | ⏸ |

⚠ **Theme sáng không phải theme tối đảo ngược.** Wireframe rỗng cho `skipped` gần như biến mất
trên nền trắng; theme sáng dùng "đặc xám nhạt có gạch chéo". Phải tự kiểm cả hai theme.

### 2.3 Màu KHÔNG hardcode

Cổng `pnpm tokens:check` cấm `#hex`, thang Tailwind, `0xRRGGBB` trong 4 vùng quét. Cả hai renderer
đọc token CSS. Đường vào WebGL: nâng phần chung của `k8s-arena/shared/scene-tokens.ts` lên
`components/games/shared/scene-tokens.ts` (bộ phân giải màu + đọc byte canvas), giữ bảng ánh xạ
token riêng cho từng game.

⛔ Không đăng ký ngoại lệ `KNOWN_HARDCODED`: cổng có chiều xuống, một dòng miễn trừ thừa làm nó ĐỎ
vì hết hạn.

---

## 3. Chuỗi công việc

### 19.D.1 — Nền hợp đồng (S, ~1 ngày; LEAD làm và commit TRƯỚC khi fan-out)

| # | Việc | Ước | Trạng thái |
|---|---|---|---|
| D.1.0 | `cicd/scene-view.ts`: `buildGraphView` — **producer còn thiếu của `CicdView`**, thêm ngoài kế hoạch gốc (xem §2.1) | 4h | ✅ `48d8d42` |
| D.1.1 | `cicd/scene-contract.ts`: `placeWorkflow`, ba trục theo chương, cạnh góc vuông qua `routeEdge` | 4h | ✅ `48d8d42` |
| D.1.2 | `scene-contract.test.ts` + `scene-view.test.ts`: tất định (200 lượt cùng toạ độ), Y chỉ mang một biến **ở cả hai chiều**, `countNonAxialSegments === 0` | 4h | ✅ `48d8d42` |
| D.1.3 | `cicd/scene-encoding.ts`: bảng ba kênh, `satisfies Record<StageRunState, ...>` để thiếu một trạng thái là đỏ lúc biên dịch | 2h | ✅ `48d8d42` |
| D.1.4 | Nâng `scene-tokens.ts` lên `games/shared/`, arena import từ chỗ mới, test cũ của arena giữ nguyên xanh | 3h | ✅ `ce2b1d9` + `68dfc1a` |

⚠ **Ô AC-D1 phải chạy trên C13, KHÔNG phải C12** (đo 2026-09-17). Trực giác chọn
C12 vì tên nó là "ma trận quạt ra", nhưng `initialWorkflow` của C12 **không có
`fanOut`** — người chơi phải tự gõ nó vào, đó chính là bài học của màn. Chỉ
`solutionWorkflow` mới quạt. C13 (`gom-ket-qua-nhieu-nhanh`) thì có `fanOut`
ngay trong `initialWorkflow`.

Chạy AC-D1 trên C13 với workflow ban đầu ⇒ đồ thị KHÔNG quạt ra ⇒ ô đó không phủ
được con bug gộp node mà nó tồn tại để bắt, và nó vẫn XANH. Số kỳ vọng lấy bằng
`buildGraphView({ workflow: level.initialWorkflow, run: null, yAxis }).nodes.length`
— đọc từ dữ liệu level, đừng chép tay một con số.

**19.D.1 XONG** — nền hợp đồng đã chốt, lane đọc được. Bảng token tham số hoá
bằng generic nên mỗi game khai bảng riêng mà vẫn giữ đúng khoá của mình; 5/6 chỗ
import của arena không phải sửa ký tự nào và 13 ô test cũ của arena xanh nguyên
vẹn, không sửa dòng nào.

Ba ghi chú từ lượt làm thật:

- **`satisfies Record<StageRunState, …>` chứ không phải `StageStatus`** — kiểu
  thật tên là `StageRunState` và nó có **bảy** giá trị, trong khi bảng §2.2 chỉ
  liệt kê năm. Thiếu `pending` (trạng thái của MỌI node trước lượt chạy đầu, tức
  thứ người chơi thấy khi vừa mở level) và `retrying` (thứ bài C10 dạy).
- **Cột màu của §2.2 không khớp union `statusToken`.** `--primary` và `--muted`
  không nằm trong `success | destructive | warning | status-progress |
  status-locked`. `scene-encoding.ts` giữ luôn cột `statusToken` làm nguồn DUY
  NHẤT thay vì đẻ ra bảng màu thứ hai; `pending` và `skipped` dùng chung
  `status-locked` và phân biệt nhau ở hình học + icon.
- **"Đường găng đúng trên 5 đồ thị tính tay" đã có ở `critical-path.test.ts`**
  (22KB). Lặp lại ở tầng cảnh là đo lại cùng một phép tính; ô ở đây đo cái MỚI —
  cờ `critical` đi từ `criticalPath()` qua view sang placement còn nguyên.

### 19.D.2 — Cảnh 2D (L, ~4 ngày) — **chế độ mặc định, không phải bản dự phòng**

Kỹ thuật: **SVG + `framer-motion`** (`@devops-platform/motion` đã có, không thêm dependency).
SVG cho token CSS chảy thẳng vào `fill`/`stroke` nên ăn theme và `prefers-reduced-motion` miễn
phí, và mỗi node là một phần tử thật nên trình đọc màn hình lẫn axe đọc được.

| # | Việc | Ước |
|---|---|---|
| D.2.1 | `scene2d/cicd-svg-scene.tsx`: khung cảnh **toàn màn hình**, `viewBox` tự khớp `bounds`, zoom/pan bằng cả bàn phím lẫn chuột | 4h |
| D.2.2 | Node job: khối bo góc có chiều sâu giả (mặt trên sáng hơn), badge trạng thái, nhãn đặt thẳng trên hình | 4h |
| D.2.3 | Cạnh: đường góc vuông theo làn, gradient theo hướng, **chấm chạy dọc cạnh** (`stroke-dasharray` + animate offset), mật độ chấm = lưu lượng (mượn Vizceral) | 4h |
| D.2.4 | **Đường găng tô sáng** sau mỗi lượt chạy, kèm nhãn tổng thời gian. Đây là thứ 19.A.7 tính mà chưa ai thấy | 3h |
| D.2.5 | Hiệu ứng: glow bằng `filter` SVG cho `running`, khuyết góc cho `failed`, gạch chéo cho `skipped`, mạch đập cho `queued`; tắt sạch khi `prefers-reduced-motion: reduce` | 4h |
| D.2.6 | Chuyển động giữa hai lượt chạy: node giữ định danh, `layout` của framer-motion nội suy vị trí khi đồ thị đổi | 3h |
| D.2.7 | Ba cấp drill-in: workflow, job, step (bấm một job mở các bước bên trong, vẫn trong SVG) | 4h |
| D.2.8 | Chương CD: Y thành ba dải môi trường; artifact là vật thể chạy từ dải dưới lên; promote đi LÊN, rebuild rơi xuống rồi leo lại | 4h |
| D.2.9 | a11y: mỗi node `role="img"` + `aria-label` nói trạng thái bằng CHỮ; bàn phím đi được giữa các job; axe 0 vi phạm cả hai theme | 3h |

### 19.D.3 — Cảnh 3D theo arena K8s (L, ~4 ngày)

Đọc arena trước khi viết dòng nào: `scene/arena-scene.tsx`, `camera-rig.tsx`,
`cluster-instances.tsx`, `node-geometry.ts`, `scene-labels.tsx`, `scene-lighting.tsx`,
`selection-halo.tsx`, `pointer-picking.tsx`, `hit-proxy.tsx`, `frame-pump.tsx`,
`shared/scene-quality.ts`.

| # | Việc | Ước |
|---|---|---|
| D.3.1 | `scene3d/index.ts` — barrel DUY NHẤT, nạp bằng `next/dynamic` + `ssr: false`, đúng khuôn `arena-root.tsx:38` | 2h |
| D.3.2 | Camera orthographic, **snap 4 đến 8 góc cố định**, không `OrbitControls` xoay tự do. ⛔ Cấm camera tự xoay khi nhàn rỗi (`idleSpinAfterMs` đã bị gỡ khỏi arena 2026-09-08 vì vẽ 14fps vĩnh viễn; `camera-rig.tsx:44-50` mang chú thích cấm tái lập) | 4h |
| D.3.3 | Node bằng `InstancedMesh` + badge qua texture atlas. ⚠ Đo trước: issue mở `mrdoob/three.js#30352` cho thấy `InstancedMesh` chậm hơn Mesh dùng shared attributes trong vài cấu hình | 4h |
| D.3.4 | Cạnh 3D theo làn, góc vuông, chấm chảy bằng shader offset. **Không edge bundling** (nó phá đúng việc lần theo một đường phụ thuộc) | 4h |
| D.3.5 | Nhãn: **pool `<span>` DOM chiếu tay theo arena** (`scene-labels.tsx`), trần 64 nhãn, ưu tiên theo mức. ⛔ KHÔNG dùng `drei <Html occlude="blending">` (bị ẩn khi có postprocessing pass); `troika-three-text` chưa có trong repo và `bundle:check` đang gác | 4h |
| D.3.6 | Chọn/hover: rim light fresnel trong material (0 pass), selective bloom **chỉ cho `running`**. Vùng bấm bằng `InstancedMesh` hộp **vô hình** (`visible=false`) cùng tâm cùng cỡ — `Raycaster` không kiểm `visible`, nên nó bắt tia mà không thêm lệnh vẽ nào | 4h |
| D.3.7 | `frameloop="demand"`: gác bằng `document.visibilityState` + `IntersectionObserver`, **không** bằng `pointerenter/leave` trên canvas (rê chuột sang HUD là vòng lặp dừng hẳn). Mọi thay đổi không sinh chuyển động (chọn, hover, theme, góc camera) phải tự xin một khung | 3h |
| D.3.8 | Ba bậc chất lượng tự dò theo `shared/scene-quality.ts`: Chromium headless cấp WebGL2 qua SwiftShader (rasterize bằng CPU), nên mọi phép kiểm "có WebGL không" đều xanh rồi bloom và bóng mềm làm e2e hết giờ | 3h |
| D.3.9 | Đo draw call: `gl.info.reset()` gọi ở **ĐẦU** `useFrame`, ghim theo từng bậc chất lượng | 3h |

### 19.D.4 — Bố cục toàn màn hình + HUD (M, ~3 ngày)

**Bố cục là hợp đồng, không phải thẩm mỹ** (quyết định #3): sân chơi chiếm trọn vùng dưới thanh
trên cùng, đúng như arena. Mọi panel là **lớp phủ nổi trên sân**, không phải cột chia đôi màn
hình. Người chơi phải đóng/thu được mọi panel và còn lại một sân trống hoàn toàn.

| # | Việc | Ước |
|---|---|---|
| D.4.1 | `cicd-level-screen.tsx` dựng lại: sân chiếm `100dvh` trừ thanh trên, `position: absolute` cho lớp phủ, không lưới chia cột. ⛔ Bỏ bố cục `grid lg:grid-cols-2` hiện tại | 4h |
| D.4.2 | Thanh trên kiểu `hud/top-bar.tsx`: tên chương/level, nút 2D/3D, bậc chất lượng, cài đặt, trợ giúp | 3h |
| D.4.3 | Ô soạn YAML thành **panel trượt** (mặc định mở ở level đầu chương, thu được, nhớ trạng thái), không còn chiếm nửa màn cố định | 4h |
| D.4.4 | Nút 2D/3D dùng `games/shared/renderer-mode.ts`: lựa chọn tay THẮNG kết quả dò; chọn 3D trên máy đã đo là không có WebGL2 thì rơi về 2D | 2h |
| D.4.5 | Inspector kiểu `hud/inspector-frame.tsx` cho job đang chọn: bước, thời lượng, cache, retries, số lần thử, nguyên nhân đỏ | 4h |
| D.4.6 | Mission card kiểu `hud/mission-card.tsx` cho đề bài và mục tiêu, thay khối `brief` hiện tại | 3h |
| D.4.7 | Bảng ba trục thành lớp phủ góc, **vẫn thường trực** (19.E.4 là hợp đồng: ba số hiện CÙNG LÚC, không giấu sau nút) + minimap kiểu `hud/minimap.tsx` | 4h |
| D.4.8 | Bàn phím đủ cho mọi thao tác; không thao tác nào chỉ làm được bằng chuột | 3h |

### Tiến độ (2026-09-17) — 19.D XONG

| Chuỗi | Trạng thái | Commit |
|---|---|---|
| 19.D.1 — nền hợp đồng | ✅ 5/5 | `48d8d42` `ce2b1d9` `68dfc1a` `f1b2c54` `b9ab108` |
| 19.D.2 — cảnh 2D | ✅ 9/9 | `f391cad` `2b160ba` `6ffb98c` |
| 19.D.3 — cảnh 3D | ✅ 9/9 | `6bd9486` `e3db5e7` `df2f562` `44e9270` |
| 19.D.4 + 19.D.5 — HUD | ✅ 9/9 | `f54138d` `07ba6e5` `cc3df50` `a158876` |
| Route immersive (phát sinh) | ✅ | `64657ad` `a41e081` |
| Sửa sau e2e + bộ ô AC-D | ✅ | `c4f39d3` `91ad520` `67cc087` `018353e` `e47c1e5` |

**Cảnh ĐÃ được render và đo trong trình duyệt thật.** `games-cicd-scene.spec.ts`
10/10 xanh, `games-cicd.spec.ts` 15/15 xanh.

Hai lỗi SẢN PHẨM mà e2e tìm ra, không cổng tĩnh nào thấy:

1. **Bảng núm CD đóng mặc định ở chương CD** — nó là thứ QUYẾT ĐỊNH kết quả
   (cùng YAML lời giải, đổi đường phục hồi thì mới đạt). Người chơi sẽ gõ lại
   YAML nhiều lượt mà không hiểu vì sao vẫn trượt. (`c4f39d3`)
2. **Thân lớp phủ `overflow-y-auto` không focus được** — người dùng bàn phím
   không cuộn được, nội dung dưới nếp gấp là nội dung họ không với tới. axe đỏ
   thật, luật `scrollable-region-focusable` mức `serious`, trên CẢ HAI theme.
   (`91ad520`)

### Quyết định phát sinh khi làm thật (2026-09-17)

| # | Việc | Chốt |
|---|---|---|
| 1 | `/games/cicd` không immersive nên sân chơi chỉ rộng ~82.5% ⇒ AC-D7 đỏ vì VỎ TRANG | Màn chơi dọn sang **`/games/cicd/<levelId>`** (đoạn con thật) và dùng `IMMERSIVE_CHILD_PREFIXES` có sẵn. `?level=` hợp lệ chuyển hướng sang đường mới |
| 2 | D.3.6 đòi selective bloom cho `running` | **Bỏ bloom**, thay bằng lớp vỏ cộng dồn instanced (1 lệnh vẽ). `@react-three/postprocessing` nhận `Object3D` mà node là *instance*, nên chọn một node sẽ tô sáng cả lô — đúng lý do arena đã loại `Outline` |
| 3 | D.3.2 cho 4–8 góc camera | **Bốn**. Tám góc bước 45° lọt 4 hướng nhìn DỌC trục (một trục chồng lên chính nó); đổi gốc sang 22.5° thì mất tính trục lượng. Hai tính chất chỉ cùng đúng ở `(±1,±1,±1)/√3` |
| 4 | D.4.8 "bàn phím đủ mọi thao tác" ở chế độ 3D | Cảnh 3D **tự giữ tiêu điểm nội bộ**, KHÔNG thêm `focusedId` vào hợp đồng. Ở 2D mỗi node là phần tử DOM nên trình duyệt lo tiêu điểm; 3D không có DOM để lo, nên đó là trạng thái của cảnh chứ không phải thứ HUD cần biết |

**Vì sao quyết định #1 không phải một quyết định mới:** quyết định #3 của chủ dự án
(§0) đã chốt *"toàn màn hình, đúng như game K8s"*, và game K8s đạt điều đó CHÍNH
BẰNG việc nằm trong danh sách immersive. Cái mới chỉ là phát hiện rằng `?level=`
không đi tới đó được: `isImmersiveRoute()` chỉ nhận `pathname`. Và `levelId`
trước đây là React state, nên bấm một màn KHÔNG đổi URL — cùng một `/games/cicd`
phục vụ cả hai trạng thái. Nhét cả `/games/cicd` vào danh sách khớp-chính-nó thì
kéo theo trang danh mục, nơi `CicdCampaign` không có nút thoát nào.

**Nợ đã ghi, KHÔNG làm trong 19.D:** nâng `k8s-arena/shared/scene-quality.ts` và
`k8s-arena/scene/label-layout.ts` lên `components/games/shared/` — nay đã có hai
game dùng, đúng khuôn `scene-tokens.ts`. Hoãn vì đổi chỗ chúng là đụng file arena
giữa lúc lane khác đang viết.

### 19.D.5 — Màn chuyển tiếp giữa hai chương (S, ~0.5 ngày)

`phase-19.md` §19.D.4 gọi đây là **rủi ro thật của quyết định #13**: trục Y đổi nghĩa giữa hai
chương nên người chơi phải học lại cách đọc không gian.

| # | Việc | Ước |
|---|---|---|
| D.5.1 | Màn chuyển tiếp khi vào C15 lần đầu: giải thích trục Y mới, có hình, có nút bỏ qua, mở lại được từ trợ giúp | 4h |

---

## 4. Ô nghiệm thu

| # | Ô | Đo bằng |
|---|---|---|
| AC-D1 | Đồ thị và đường găng hiện được ở CẢ HAI chế độ | e2e: chạy thử một level, số node vẽ ra bằng **số thực thể** (`view.nodes.length`), cạnh đường găng mang dấu riêng. ⛔ **KHÔNG đếm theo số stage** — C12/C13 quạt ra nên hai con số khác nhau, và bản đếm-theo-stage XANH ngay trên con bug gộp node mà nó đáng lẽ phải bắt. Ô này phải chạy trên **C13**, không phải C12 |
| AC-D2 | Hai renderer vẽ CÙNG tập node/cạnh | Test gọi `placeWorkflow(view)` một lần rồi so tập `instance` mà mỗi renderer dựng — không so hai phép lọc riêng |
| AC-D3 | AC-5: đường 2D dùng được | Playwright `--disable-3d-apis`, **có đối chứng dương** (cùng ô chạy không cờ đó phải đi nhánh 3D) |
| AC-D4 | AC-7: draw call < 100 ở level đông nhất | `renderer.info.render.calls` sau `gl.info.reset()` đầu `useFrame`, ghi số theo TỪNG bậc chất lượng. ⛔ Không ghim bậc là ô xanh chứng minh đúng zero điều gì |
| AC-D5 | AC-6: axe 0 vi phạm | Cả hai theme, cả hai chế độ, cả màn CI lẫn màn CD |
| AC-D6 | AC-2 giữ nguyên | Network trace 0 lời gọi `/api/` trong lúc chơi, kể cả khi bật 3D |
| AC-D7 | Sân chơi toàn màn hình | e2e đo `boundingBox()` của sân: chiều cao lớn hơn 80% viewport và chiều rộng lớn hơn 95%, sau khi thu hết panel. Đối chứng dương: bố cục cũ chia đôi phải làm ô này ĐỎ |
| AC-D8 | Không màu cứng | `pnpm tokens:check` xanh, không thêm dòng `KNOWN_HARDCODED` nào |
| AC-D9 | Bundle không rò | `pnpm bundle:check`: route không-3D KHÔNG chạm chunk `three`; đối chứng dương: `/games/cicd` sau khi vào 3D thì CÓ |
| AC-D10 | Reduced motion | `prefers-reduced-motion: reduce` thì không còn chuyển động lặp vô hạn ở cả hai chế độ |

---

### Kết quả nghiệm thu (2026-09-17)

| Ô | Kết quả | Đo bằng |
|---|---|---|
| AC-D1 | ✅ | `games-cicd-scene.spec.ts`, chạy trên C13; đối chứng nội tại `soThucThe > soStage` |
| AC-D2 | ✅ | So hai bộ đếm mà mỗi renderer tự phát; kèm khẳng định khác 0 và không node/cạnh nào rơi vì `NaN` |
| AC-D3 | ✅ **đủ** | Chọn tay 2D/3D đi đúng nhánh, có đối chứng dương; cộng `games-cicd-nowebgl.spec.ts` chạy với `--disable-3d-apis` và tự khẳng định cờ đã ăn trước khi đo. `--disable-gpu` KHÔNG đủ: SwiftShader vẫn cấp WebGL2 |
| AC-D4 | ✅ | `__dlpCicdScene()`, số lệnh vẽ ghi CÙNG bậc chất lượng, kèm `nodes > 0` |
| AC-D5 | ✅ | axe ở chế độ 3D, cả hai theme, kèm khẳng định class `dark` thật sự đổi |
| AC-D6 | ✅ | `traceRequests`, 0 lời gọi `/api/` kể cả khi bật 3D |
| AC-D7 | ✅ | `boundingBox()` của `cicd-field` sau khi thu hết lớp phủ: rộng > 95%, cao > 80% |
| AC-D8 | ✅ | `pnpm tokens:check`, 837 file / 4 vùng, 0 dòng `KNOWN_HARDCODED` mới |
| AC-D9 | ✅ | `traceScripts` + `THREE_MARKERS`; đối chứng dương: bật 3D thì `three` PHẢI xuất hiện |
| AC-D10 | ✅ | Quét `getComputedStyle` đã phân giải + `repeatCount` của SMIL, không tin một cờ React |

### ĐÃ NHÌN BẰNG MẮT — và nó tìm ra hai lỗi mà không cổng nào bắt

Chụp `apps/web/e2e/scripts/shoot-cicd-scene.mjs`: 2 theme × 2 chế độ × 2 pha
(trước/sau khi chạy). Playwright qua **CLI** chạy bình thường; chỉ
`mcp__playwright__browser_navigate` là treo tới hết idle timeout 1800s (cắn cả
lane-2d lẫn lead — xem memory `playwright-mcp-navigate-hangs`).

| Lỗi | Vì sao mọi cổng bỏ lọt |
|---|---|
| **Cảnh 3D không có nền** — `alpha:false` xoá khung bằng đen mặc định của three. Theme tối trông "tạm được"; theme SÁNG thì cả trang trắng mà canvas là ô đen đặc | Không cổng nào đo màu nền của canvas |
| **Node 3D vô hình** — fragment shader thiếu `uniform vec3 uRimColor;` và `varying float vRimAmount;` (khai ở vertex thôi là chưa đủ, fragment là đơn vị biên dịch KHÁC) ⇒ chương trình hỏng ⇒ mọi vật liệu bị vá vẽ rỗng | `frustumCulled = false` nên hình luôn được NỘP, và `info.render` đếm thứ được nộp chứ không đếm thứ HIỆN ra. `calls: 4, triangles: 864` hoàn toàn khoẻ mạnh trên một cảnh trống trơn |

129 unit test, axe 0 vi phạm cả hai theme, draw call < 100, `node-count` khớp,
`tokens:check` sạch — cộng lại nghe như bằng chứng đầy đủ. **Không cổng nào
trong số đó hỏi "người chơi có thấy gì không".**

Sau khi sửa, đã NHÌN và xác nhận: `pending` (khung rỗng), `solid` (xanh đặc),
`notched` (đỏ khuyết góc) đều đọc được ở CẢ HAI theme; nhãn đường găng hiện
"2m 40s" đúng định dạng giây.

**Ba thứ vẫn CHƯA nhìn được — đừng đọc thành đã kiểm:**

1. **Bốn hình học còn lại**: `hollow` (skipped), `ringed` (running),
   `ringed-double` (retrying), `sunken` (queued). Ba cái sau là trạng thái GIỮA
   CHỪNG nên không xuất hiện sau khi lượt chạy kết thúc; chúng cần một thanh tua
   theo tick mà giao diện chưa có. `hollow` cần một level mà stage `blocking` đỏ
   rồi còn stage phía sau — C13 có stage đỏ ở CUỐI nên không sinh ra `skipped`.
2. **`color-contrast` của axe KHÔNG chạy trong jsdom** (không layout, không
   canvas 2D). Ô axe ở tầng e2e có chạy luật đó, nhưng chỉ trên những gì đang
   hiện — lớp phủ đang thu thì không được quét.
3. **Ba bậc chất lượng cho CÙNG một số lệnh vẽ** (2/2/2). Ở cảnh này bậc chỉ đổi
   pixel ratio và số mặt khối bo góc, không đổi số lệnh vẽ, vì không vật nào đổ
   bóng và không có hậu kỳ. Ghim theo từng bậc vẫn đúng như AC đòi, nhưng ba số
   khác nhau sẽ là dấu hiệu có ai vừa bật bóng đổ.

**Ba lỗ hổng hợp đồng — ĐÃ ĐÓNG 2026-09-17**, mỗi cái một kiểu khác nhau:

| # | Lỗ hổng | Kết luận |
|---|---|---|
| 1 | `StageNodeView` không mang `steps` | **Vá thật.** Thêm `StepNodeView[]` vào view; cấp 3 của D.2.7 nay vẽ bước thật trong SVG. Mọi bước của spec đều liệt kê, kể cả bước KHÔNG chạy vì bước trước gãy — vẽ bằng `·` chứ không `✕`, vì "không tới lượt" và "đỏ" dẫn người chơi đi sửa hai chỗ khác nhau. Không mang `flakeNature` (đỏ giả phải giống đỏ thật — điều kiện của bài C11), có ô test ghim |
| 2 | `CicdGraphView` không mang `tickSeconds` | **KHÔNG phải lỗ hổng.** `SECONDS_PER_TICK` là hằng của hợp đồng và đã export ở barrel từ trước chặng này (`index.ts:623`). Nhìn vào view để kết luận một hằng không tồn tại là nhìn nhầm chỗ: view chở DỮ LIỆU của một lượt chạy, hằng quy đổi đơn vị thì giống nhau ở mọi lượt. Nhãn nay đọc ra giây, giữ tick trong ngoặc cho người cân bằng level |
| 3 | `DagEdgeView` không có lưu lượng | **Đóng bằng lý lẽ, sẽ không thêm.** `CicdView` mô tả MỘT `RunRecord` — trong phạm vi một commit, mỗi cạnh đi qua đúng một lần, không có gì để đếm. Lưu lượng chỉ có nghĩa ở tầng `PassRecord`, cũng là chỗ trục ② THÔNG LƯỢNG sống. Gắn một con số của cả lượt lên cạnh của một commit là trộn hai tầng. Tầng vẽ dùng "có việc đang chảy qua cạnh" thay — suy từ `state` hai đầu, không cần trường mới |

## 5. Chia lane

Lead làm 19.D.1 và commit TRƯỚC khi fan-out. Sau đó ba lane, sở hữu file tuyệt đối:

| Lane | Sở hữu | Việc |
|---|---|---|
| **lane-2d** | `components/games/cicd/scene2d/**` | 19.D.2 |
| **lane-3d** | `components/games/cicd/scene3d/**` | 19.D.3 |
| **lane-hud** | `components/games/cicd/hud/**` + `cicd-level-screen.tsx` | 19.D.4, 19.D.5 |

⛔ Không lane nào sửa `packages/games/**`, `cicd-run.ts`, `cicd-cd-panel.tsx`, hay file của lane
khác. Thấy hợp đồng thiếu thứ cần thì dừng việc đó, ghi đề xuất vào báo cáo cuối, làm việc kế tiếp.

**File incidental phải reserve theo tên trước khi fan-out** (bài học
`parallel-teammate-git-index-race.md`): `cicd-level-screen.tsx` (lane-hud),
`games/shared/scene-tokens.ts` (lead, xong ở D.1.4), `e2e/games-cicd.spec.ts` (lead gộp cuối).

Mỗi lane chạy trong `git worktree` riêng, commit dạng pathspec, nhịp ~15 lượt gọi tool một lần.
Agent trần lượt thấp phải được brief "ghi sớm, đọc tối đa một file nguồn mỗi lần viết".

---

## 6. Rủi ro

| Rủi ro | L | I | Điểm | Giảm thiểu |
|---|---|---|---|---|
| Hai renderer trôi khỏi nhau, mỗi bên vẽ một tập node | 4 | 4 | 16 | AC-D2 đo bằng CÙNG một hàm đặt chỗ; không renderer nào tự lọc |
| "2D đẹp" trượt thành "2D vẽ tạm" vì 3D hút hết thời gian | 4 | 4 | 16 | Lane 2D chạy TRƯỚC và độc lập; 2D là chế độ mặc định nên nó là thứ đa số người chơi thấy |
| 3D nạp vào bundle của route không-3D | 3 | 5 | 15 | Barrel duy nhất + `next/dynamic`; AC-D9 có đối chứng dương. Tiền lệ `44f8e39` |
| Bố cục quay về kiểu thẻ hẹp vì panel đẻ thêm | 3 | 4 | 12 | AC-D7 đo bằng số đo hình học, không đo bằng mắt |
| SwiftShader làm e2e hết giờ | 4 | 3 | 12 | Bậc chất lượng tự hạ theo `scene-quality.ts`; e2e chạy ở bậc thấp |
| Trục Y đổi nghĩa giữa hai chương làm người chơi mất phương hướng | 4 | 3 | 12 | Màn chuyển tiếp D.5.1. Không có phương án lùi (chủ dự án chốt 2026-09-11) |
| `NaN` trong một `BufferAttribute` làm three vứt TOÀN BỘ draw call đó, im lặng | 3 | 4 | 12 | Kiểm `Number.isFinite` ở biên `placeWorkflow` sang attribute, có test |
| Bloom nuốt viền và nhãn trên node `failed` | 3 | 3 | 9 | Bloom CHỈ cho `running`, giới hạn cường độ (SSOT §4.6 bẫy 1) |

---

## 7. Lệnh xác minh

```
cd packages/games && npx vitest run src/cicd && npx tsc --noEmit -p .
cd apps/web && npx tsc --noEmit && npx tsc --noEmit -p e2e/tsconfig.json && npx eslint src/components/games/cicd
cd <repo> && pnpm turbo run build lint typecheck test --force --concurrency=3
pnpm tokens:check && pnpm bundle:check
docker compose up -d postgres redis && pnpm --filter @devops-platform/web db:migrate
pnpm --filter @devops-platform/web build
cd apps/web && E2E_START_SERVER=1 E2E_BASE_URL=http://localhost:3000 E2E_ORIGIN=http://localhost:3000 npx playwright test games-cicd.spec.ts
```

⚠ `E2E_ORIGIN` phải là `localhost`, không phải `127.0.0.1` (Better Auth so CHUỖI với
`BETTER_AUTH_URL`). Thiếu `E2E_START_SERVER=1` là Playwright trỏ vào CỤM, tức đo một binary khác.
⚠ `--concurrency=3`: máy này còn khoảng 8GB trống khi VM lab chạy, và turbo song song đầy đã giết
`web:lint` và `ui:test` bằng OOM ngày 2026-09-17.
⚠ Mọi spec mới phải thêm vào `e2e:ci` trong `apps/web/package.json`, nếu không nó không gác gì.
