# Phase 17b — Tầng 3D game Git (món nợ có chủ ý của P17)

**Mức chi tiết:** DETAILED · **Effort:** L · **Blocked by:** P17 (đã đóng, `main` = `6f19cbe`) · **Blocks:** không
**Nguồn phạm vi:** [`phase-17.md`](phase-17.md) §17.K + AC-7 · [`reports/2026-09-14-p17-closure.md`](reports/2026-09-14-p17-closure.md) §"Còn nợ"
**Nhánh:** `feat/p17b-git-3d`, tách từ `main` (`11172c5`) · **PR:** có, để 9 cổng CI chạy
**Plane:** bỏ qua theo `rules/no-outbound-from-this-project.md`.

> Chặng này **không thiết kế lại**. K.1–K.10 đã nằm ở §17.K của `phase-17.md` và là hợp đồng.
> File này chỉ ghi ba thứ mà bản gốc không có: **phạm vi thật sau khi P17 đóng**, **ba chỗ
> plan lệch khỏi mã đã chứng minh**, và **cách chia việc song song**.

---

## 0. Vì sao chặng này tồn tại

P17 đóng ngày 2026-09-14 với engine + đường 2D hoàn chỉnh. Tầng 3D **hoãn có chủ ý** —
quyết định của chủ dự án, không phải thiếu sót. Hệ quả để lại đúng ba món:

| Món | Trạng thái khi P17 đóng |
|---|---|
| 17.K tầng 3D | Hoãn. `resolveRendererMode({ has3d: false })` trong `git-game.tsx` là **MỘT** chỗ để đổi |
| AC-7 draw call < 100 | Ghi **"KHÔNG ÁP DỤNG"**, *không phải* "ĐẠT". SVG không có draw call — một dấu xanh ở ô đó sẽ là dấu xanh cho một phép đo chưa từng chạy |
| Mô phỏng mù màu trên ảnh chụp cảnh thật | Chưa đo. Cái đang có là một **thiết kế** (mọi cặp trong 6 trạng thái khác nhau ở ≥2 kênh ngoài màu) — thiết kế không phải phép đo |

---

## 1. Ba chỗ plan §17.K lệch khỏi mã đã chứng minh

Đo bằng khảo sát `k8s-arena/` ngày 2026-09-14 (game 3D duy nhất đã chạy trong repo, 114 file,
`scene/` 4.479 dòng). Cả ba đã chốt với chủ dự án **trước** khi viết dòng mã nào.

| # | Plan viết | Mã chứng minh | Đã chốt |
|---|---|---|---|
| 1 | K.6: `drei <Html>` cho node hover/select + `troika-three-text` cho nhãn tĩnh | Arena **không dùng `<Html>` ở đâu cả** — nó dùng pool `<span>` DOM chiếu tay, trần 64 nhãn, ưu tiên 5 mức. Chính K.6 cảnh báo `<Html occlude="blending">` bị ẩn khi có postprocessing; arena né được vì không dùng nó. `troika` chưa có trong repo và cổng `bundle:check` đang gác | **Theo arena.** Pool span DOM |
| 2 | K.10: "selective bloom **chỉ cho `running`**" | `running` là trạng thái của game K8s. Git có sáu accent: `normal`/`head`/`fresh`/`orphaned`/`duplicate`/`conflicted` — không có `running` | **Bloom cho `head`** (cùng vai trò "thứ đang sống", và đã mang `motion: 'pulse'` trong `git-palette.ts`) |
| 3 | 17.C.1: đăng ký ngoại lệ cổng màu cho `components/games/git/**` | `git-palette.ts` đã chứng minh vùng này **không cần ngoại lệ** — không một `#hex` nào trong mã chạy được, mọi giá trị là tên biến CSS. Và một dòng `KNOWN_HARDCODED` cho file sạch bị chính cổng báo **hết hạn**, tức đăng ký thừa làm cổng **ĐỎ** | **Không đăng ký.** Tầng 3D giữ cùng kỷ luật: màu qua token CSS |

---

## 2. Nền hợp đồng — chốt trước, không lane nào sửa

`apps/web/src/components/games/git/scene3d/scene3d-contract.ts` (commit `e5286dc`). Toán thuần,
**không một dòng `three`** — test được ở env `node`, và không kéo ~631KB vào bundle của mã
không-3D (P17 đã một lần rò engine sang 6 route không liên quan vì một barrel, `44f8e39`).

**Ba trục, mỗi trục đúng một nghĩa** (K.2 — ràng buộc ngữ nghĩa, không phải thẩm mỹ: một trục
mang hai biến là một trục người chơi đọc sai mà không biết mình đọc sai):

| Trục | Biến | Nguồn |
|---|---|---|
| X | thời gian logic | `ScenePlacedNode.depth` |
| Z | làn nhánh + khoảng trống giữa hai kho | `ScenePlacedNode.lane`, `REPO_LANE_GAP` |
| Y | độ lệch khỏi nhánh chính | `\|lane - MAIN_LANE\|` |

Bốn bất biến mà `scene3d-contract.test.ts` phải gác:

1. **X dùng chung cho cả hai kho** — commit đã push đứng ở cùng X ở `local` và `origin`. Đây là
   điều kiện để `push`/`fetch` bay **ngang** theo phương Z chứ không bay chéo.
2. **Ba mặt phẳng HEAD/Index/Worktree không tranh trục Y với độ lệch nhánh.** Chúng ở dải Y
   riêng (`PLATE_Y`), và `assertPlanesClearOfDag()` là cổng **lúc chạy** cho bất biến đó — một
   level 40 làn sẽ đâm DAG lên đụng mặt phẳng Index, và cổng đỏ thay vì hai tầng chồng nhau
   trong im lặng.
3. **Cột ô file khoá theo ĐƯỜNG DẪN**, không theo thứ tự duyệt. Cả điểm của ba mặt phẳng chồng
   lớp là thấy MỘT file rơi **thẳng** xuống khi `git add`; đánh số theo thứ tự duyệt hỏng ngay
   khi một file có ở Worktree mà chưa có ở Index, và "rơi thẳng" thành "rơi chéo".
4. **Node/cạnh đến từ `sceneNodes()`/`sceneEdges()`**, không lọc lại. `shared/scene-props.ts`
   nói thẳng: thứ được vẽ = thứ hai hàm đó trả về. Lọc lại ⇒ AC-B xanh mà vô nghĩa.

**Chiều Y có nghĩa, đừng đảo.** Nhánh phụ **dâng lên** (`y >= 0`). Chiều **xuống** dành riêng
cho "mất" — `reset --hard` chìm, `reflog` nổi lại (K.7). Hai ý nghĩa trái ngược dùng chung một
hướng thì cả hai mất nghĩa.

---

## 3. Chia việc — 5 lane song song, phân chia theo TÊN FILE

Nhiều agent ghi chung **một** cây làm việc. Lane này ghi vào file lane kia là **đè mất việc,
không xung đột, không lỗi, không dấu vết** (`rules/parallel-teammate-git-index-race.md`). Nên
ranh giới là tên file, không phải "khu vực".

| Lane | Mục §17.K | File sở hữu |
|---|---|---|
| **A** | K.1 camera ortho snap góc · K.9 teleport tới ref | `camera-angles.ts(+test)` · `ortho-camera-rig.tsx` · `git-canvas.tsx` |
| **B** | K.4 InstancedMesh · K.10 rim fresnel + bloom | `accent-3d.ts(+test)` · `node-material.ts` · `commit-instances.tsx` · `hit-proxy.tsx` |
| **C** | K.5 cạnh rẽ góc vuông · K.8 hai khối kho | `edge-route-3d.ts(+test)` · `lane-edges.tsx` · `repo-blocks.tsx` |
| **D** | K.6 nhãn · K.3 ba mặt phẳng | `label-priority.ts(+test)` · `scene-labels-3d.tsx` · `file-plates.tsx` |
| **E** | K.7 chuyển động mang thông tin | `motion-script.ts(+test)` · `motion-runner.tsx` · `scene3d-contract.test.ts` |
| **lead** | hợp thành + bật công tắc + AC-7 | `scene3d-contract.ts` · `scene3d-tokens.ts` · `use-git-scene-colors.ts` · `scene3d/index.ts` · `git-scene-3d.tsx` · `git-game.tsx` · `e2e/games-git.spec.ts` |

Commit dạng pathspec, một lane một commit trở lên. `K.2` không có lane riêng vì nó **là** nền
hợp đồng — nó đã xong trước khi fan-out.

### Bảy lỗi hợp đồng mà các lane tìm ra khi hiện thực

Ghi lại vì đây là **kết quả đáng giá nhất của cách chia việc này**, không phải một phụ lục. Ba
trong bảy cái lead sẽ không tự tìm ra: chúng chỉ lộ khi có người thật sự dựng mã lên trên hợp đồng.

| # | Lỗi | Lane | Hậu quả nếu để nguyên |
|---|---|---|---|
| 1 | Không ai sở hữu cầu nối token CSS → `THREE.Color` | D | Ba bản cài đặt của một phép phân giải màu, lệch nhau mà không cổng nào bắt |
| 2 | `bounds` bỏ sót ba mặt phẳng ô file | A | Bấm khung-toàn-bộ **cắt sạch K.3 khỏi màn hình** |
| 3 | `assertPlanesClearOfDag()` lạc quan 18% | B | Tính bằng `NODE_RADIUS` trong khi `head` phóng 1.18 — cổng xanh đúng lúc DAG chạm mặt phẳng |
| 4 | "X dùng chung cho hai kho" là **lời khai, không phải cổng** | B | Cạnh `remote-mirror` đi chéo ở đúng những level dạy `push`/`fetch` |
| 5 | `Routed3D` không mang id hai đầu | C | Tầng cạnh phải **cắt chuỗi** khoá; chặn hẳn việc làm mờ cạnh không liên quan |
| 6 | `REPO_LABEL` có hai bản | C | Hai renderer nói hai câu khác nhau về cùng một kho |
| 7 | `place3d` dùng **hai** phép so chuỗi trên cùng tập đường dẫn | E | Trùng nhau với ASCII nên vô hình; lệch với tiếng Việt |

**Và một mẫu hình đáng chú ý hơn bất kỳ lỗi đơn lẻ nào:** ba lane độc lập đâm vào cùng khe hở
của `assertPlanesClearOfDag()` (nó mù với cung cạnh, nhãn, và vòm `reflog`) rồi mỗi lane **tự vá
cục bộ**. Ba bản vá riêng cho một khe hở là dấu hiệu cổng đặt sai tầng, không phải dấu hiệu ba
lane bất cẩn. Nay nó nhận `extraLift`.

**Bài học cho lần fan-out sau:** hợp đồng phải pin cả **ai sở hữu hạ tầng dùng chung**, không chỉ
hình dạng dữ liệu. Lỗi #1 là lỗi duy nhất chặn một lane lại giữa chừng, và nó là lỗi duy nhất
không nằm trong bất kỳ kiểu dữ liệu nào.

---

## 4. Ô nghiệm thu

| # | Ô | Đo bằng |
|---|---|---|
| **AC-7** | draw call < 100 ở level đông nhất | ✅ **ĐẠT — đã đo 2026-09-14**, xem bảng số ngay dưới |
| AC-B | hai renderer ra cùng tập node/cạnh | So `sceneNodeIds()`/`sceneEdgeKeys()` — **chính hai hàm đó**, không viết lại phép lọc |
| AC-5 | đường 2D vẫn dùng được sau khi bật 3D | Playwright `--disable-3d-apis` chơi hết một level, có đối chứng dương |
| AC-6 | a11y | axe 0 vi phạm ở **chế độ 3D**, cả hai theme. Nhãn DOM phải đọc được bằng trình đọc màn hình |
| AC-2 | 0 lời gọi backend lúc chơi | Network trace ở chế độ 3D — bật 3D không được kéo theo một lượt tải nào |
| **mù màu** | món nợ P17 | Mô phỏng protan/deutan/tritan trên **ảnh chụp cảnh thật**, ghi số. Không nhận "thiết kế" thay cho "phép đo" |
| bundle | 3D không rò sang route khác | `bundle:check`. `three` chỉ được nạp qua `dynamic(…, { ssr: false })` |

### AC-7 — số đo, 2026-09-14

Chromium, `?fx=off`, build production dựng tại chỗ. Kênh `__dlpGitScene`, `gl.info.reset()` ở
đầu mỗi `useFrame`.

| Mốc | draw call | triangles | objects |
|---|---|---|---|
| 2 commit | 18 | 1.356 | 16 |
| + 2 nhánh, 14 lệnh | 20 | 6.108 | 17 |
| + 8 commit nữa | **20** | **10.860** | 17 |

**Triangles +78% ở mốc cuối trong khi draw call đứng nguyên ở 20.** Đó là bằng chứng instancing
gộp lô, không phải một ngưỡng đoán trúng. `20 < 100` ⇒ AC-7 đạt.

**Ba lần ô này đỏ, cả ba đều là phép đo sai chứ không phải mã sai** — ghi lại vì mỗi lần nó
chỉ lộ ra khi chạy thật, và một dòng `expect(calls).toBeLessThan(100)` sẽ xanh ngay lượt đầu mà
không dạy được điều nào trong ba điều này:

| # | Thứ sai | Đọc nhầm thành |
|---|---|---|
| 1 | `toBe` đặt giữa mốc 1 và 2 | "instancing không gộp lô" |
| 2 | Tiền đề mốc 3 đo `objects` (17 → 17) | "8 lệnh commit không vào được cảnh" |
| 3 | `--grep AC-7` khớp cả một ô của `motif.spec.ts` | "AC-7 đỏ ở hai project" |

Cái #2 đáng nhớ nhất: `objects` đếm object trong scene, mà thêm commit vào một `InstancedMesh`
có sẵn **không** tạo object mới — tiền đề đó vô tình đòi instancing *không* hoạt động. `three`
nhân tam giác với `instanceCount`, nên **triangles** là đại lượng duy nhất trong kênh đo theo dõi
được số commit đang vẽ.

### Ba bẫy ở TẦNG NGOÀI ô, không cái nào bị bốn tiền đề bắt

Ô AC-7 mang bốn tiền đề chống-xanh-giả, nhưng cả bốn nằm **bên trong** ô — chúng vô hiệu khi thứ
hỏng nằm ngoài. Cả ba lần dưới đây đều kết thúc bằng `[exited with code 0]`:

1. **`E2E_ORIGIN=127.0.0.1`** → Better Auth so origin **theo chuỗi** với `betterAuthUrl`
   (`localhost`), `global-setup` chết ở 403 `INVALID_ORIGIN`, **không một ô nào chạy**. Chỉ dẫn
   sai này có ở ba spec, đã sửa cả ba.
2. **Ô nằm nhầm `describe`** → chạy ở project `chromium-no-webgl`, tức một ô đo draw call 3D chạy
   với WebGL **bị tắt**.
3. **`next start` không build lại** → đo bản dựng cũ hơn 4 tiếng, nút 3D vẫn `aria-disabled`.
   `playwright.config.ts` có `reuseExistingServer: false` chặn việc bám vào server đang chạy,
   nhưng **không** chặn `.next` cũ.

Bài học: **đọc số ô đã chạy, đừng đọc mã thoát.** Lớp bọc `pnpm` in `[exited with code 0]` ngay
dưới dòng `Exit status 1`.

---

## 5. Cạm bẫy — đã đo trong repo này, không phải lo xa

1. ⚠⚠ **Đo draw call khi bật bloom ⇒ cổng AC-7 xanh vĩnh viễn và vô nghĩa.** `EffectComposer`
   reset `renderer.info.render` ở **mỗi** `render()`, và pass cuối là `OutputPass` — một tam
   giác phủ màn hình — nên `calls === 1` dù cảnh có 2 hay 2000 object. Arena phải **ghim bậc
   `medium`** cộng ba tiền đề (`tier === 'medium'`, `triangles > objects`,
   `large.objects > small.objects`) mới khoá được. Viết `expect(calls).toBeLessThan(100)` mà
   không ghim bậc là viết một ô xanh chứng minh **đúng zero điều gì**
   (`rules/green-that-proves-nothing.md`). Kèm theo: `gl.info.reset()` phải gọi ở **ĐẦU**
   `useFrame`, không thì con số là tích luỹ nhiều khung.
2. ⚠ **`frameloop="demand"` chết cứng vì gác `invalidate()` sai điều kiện.** Gác bằng
   `pointerenter/leave` trên canvas ⇒ rê chuột sang HUD là vòng lặp **DỪNG HẲN**. Điều đúng để
   gác là `document.visibilityState` + `IntersectionObserver`. Và mọi thứ đổi mà không sinh
   chuyển động (selection, hover, theme, góc camera) phải **tự xin một khung**.
3. ⚠ **Bắn tia thẳng vào mô hình đang hiện ⇒ vùng bấm lỗ chỗ.** Node commit là hình rỗng/mảnh;
   người chơi bấm đúng vào vật mà không trúng. Cách sửa: `InstancedMesh` hộp **vô hình**
   (`visible = false`) cùng tâm cùng cỡ — `Raycaster` chỉ kiểm `object.layers`, **không** kiểm
   `object.visible` (three 0.185.1), nên nó bắt tia mà **không thêm một lệnh vẽ nào**.
4. ⚠ **`NaN` trong một `BufferAttribute` làm three vứt TOÀN BỘ draw call đó — im lặng.**
5. ⚠ **Camera tự xoay khi nhàn rỗi là điều cấm.** `idleSpinAfterMs` đã bị gỡ khỏi game K8s ngày
   2026-09-08 vì vẽ 14fps vĩnh viễn; `camera-rig.tsx:44-50` mang chú thích cấm tái lập.
6. ⚠ **`InstancedMesh` có issue mở `mrdoob/three.js#30352`** — chậm hơn Mesh dùng shared
   attributes trong vài cấu hình. **Đo ở K.4 trước khi xây tiếp lên nó.**
7. ⚠ **Một `useMemo` mất tác dụng trong im lặng** nếu `place3d()` bị gọi hai lần: hai mảng khác
   định danh tham chiếu. Gốc hợp thành gọi **đúng một lần** và truyền `placement` xuống.

---

## 6. Thứ tự cắt nếu hết thời gian

Cắt theo thứ tự: **K.7 số lượng chuyển động** (giữ `reset --hard` + `reflog` — cặp này dạy bài
học trung tâm của chương 3) → **K.8 hai khối kho** (chương 2 đọc được ở 2D) → **K.3 ba mặt
phẳng**.

**Không cắt trong bất kỳ hoàn cảnh nào:** K.1 (camera ortho — không có nó thì không có cảnh),
K.4 + AC-7 (nếu không đo draw call thì tầng 3D là một món nợ hiệu năng không ai biết lớn cỡ
nào), và **công tắc `has3d`** — bật 3D mà đường 2D hỏng là một hồi quy, không phải một tính năng.
