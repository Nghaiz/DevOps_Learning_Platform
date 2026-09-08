# Phase 14 đợt 1 — Kế hoạch thực thi: thương hiệu đỏ + trụ cột ③ Games

**Ngày:** 2026-09-08 · **Nhánh:** `feat/p14-games` (chồng lên `main` tại `1bd146b`) · **Plan gốc:** [`phase-14.md`](phase-14.md)

Tài liệu này là **hợp đồng** giữa các lane chạy song song. Mỗi lane đọc đúng mục
lane của mình + §1 (quyết định) + §2–§5 (hợp đồng) + §7 (kỷ luật git). Không lane
nào được sửa hợp đồng; thấy hợp đồng sai thì **báo lead**, không tự đổi.

Đợt này KHÔNG bao gồm 14.C (rà tiếng Việt), 14.D (backup/runbook), 14.E (tài liệu),
14.F (cổng phát hành). Đó là các đợt sau của P14.

---

## 0. Hiện trạng đo được (scout 2026-09-08)

| Giả định | Thực tế đo được |
|---|---|
| "hệ màu đỏ" | **Sai.** `apps/web/src/app/globals.css` đặt `--primary: oklch(0.546 0.215 262.881)` — xanh dương. Toàn bộ token dẫn xuất từ hue 262.881. |
| Blast radius đổi hue | **3 file**, đo bằng `grep -rln "262.881"`: `apps/web/src/app/globals.css`, `packages/ui/src/theme/tokens.contract.test.ts`, `docs/design-system.md`. |
| Có route `/games` | Không. `content/games/` cũng không. Nav hiện 6 mục, chốt bằng `toEqual` ở `nav.test.ts`. |
| Có cổng bundle-size | **Không có.** Không `@next/bundle-analyzer`, không size-limit. Cổng hiệu năng duy nhất là LCP ở `apps/web/e2e/perf.spec.ts`. AC "không kéo xterm.js vào trang không có terminal" của phase gốc hiện **chưa có phép đo** — lane F phải dựng nó. |
| Cổng màu grep | Là **lệnh tay trong plan** (`phase-13-exec.md:535`), không phải script CI. Lane A biến nó thành script có đối chứng dương. |
| Token mở rộng được | **Không.** `tokens.contract.test.ts` khẳng định *không có token nào ngoài danh sách C1*. Thêm token = phải sửa C1 + `docs/design-system.md` cùng lúc. |

## 1. Năm quyết định đã chốt với chủ dự án (2026-09-08)

| # | Câu hỏi | Chốt | Ghi chú |
|---|---|---|---|
| 1 | Primary đỏ đụng `--destructive` (cũng đỏ) | **Tách bằng HÌNH DẠNG** | Primary nền đặc; destructive đổi sang viền + nền nhạt + chữ đỏ đậm + icon. Không tốn thêm hue, không hỏng khi in đen trắng hay với người mù màu đỏ-lục. |
| 2 | Kubernetes Game vẽ bằng gì | **Three.js 3D** | Chủ dự án chọn, *ngược* với khuyến nghị 2D của lead. Hai hệ quả bắt buộc xử lý: §4.3 (nạp có điều kiện) và §4.4 (lớp DOM song song để qua axe). |
| 3 | Ba game còn lại | Đường ống (CI/CD graph) · Mê cung mạng (NetworkPolicy) · Lò rèn Image (Dockerfile) | |
| 4 | Độ sâu | **Chỉ hiện thực Kubernetes Game đợt này.** Ba game kia: thiết kế + khung, chưa code. | Mục `/games` sẽ có 3 ô "sắp có" — đó là lựa chọn có ý thức, không phải thiếu sót. |
| 5 | Lưu tiến độ | **`localStorage`, không DB** — lead chốt, lý do dưới. | |

**Vì sao `localStorage` chứ không DB** (phase gốc §14.A.3 bắt chốt một và ghi lý do):
AC của phase gốc đòi game chạy **0 lời gọi backend, network trace rỗng sau khi tải
trang**. Một bảng tiến độ trong Postgres mâu thuẫn trực tiếp với ô AC đó. Thêm nữa
stats + achievements + replay seed là dữ liệu dày và hoàn toàn riêng tư của một
người chơi; đẩy nó lên DB là mua chi phí đồng bộ, migration, và một bảng nữa để đổi
lấy một tính năng chưa ai yêu cầu (xem tiến độ game trên máy khác). Nếu sau này cần
đồng bộ theo tài khoản thì thêm **một** bảng tối thiểu như phase gốc mô tả — nhưng
đó là quyết định của một đợt sau, không phải đợt này.

---

## 2. Hợp đồng C1 — token màu đỏ

> Lane A sở hữu. Mọi lane khác **chỉ tiêu thụ** tên class ngữ nghĩa, không bao giờ
> đọc/ghi giá trị token.

### 2.1 Nguyên tắc

1. **Hue thương hiệu mới = 25** (đỏ ấm). Chọn 25 chứ không phải 15 (ngả hồng) hay 40
   (ngả cam): 25 là đỏ mà mắt đọc ra "đỏ", không phải "hồng" cũng không phải "cam".
2. **"Không quá đậm" là ràng buộc phải ĐO, không đoán.** Nó kéo L lên; contrast chữ
   trắng trên nền primary kéo L xuống. Lane A phải **quét L** bằng chính hàm
   `measure()` có sẵn trong `tokens.contract.test.ts` và chọn **L lớn nhất** vẫn giữ
   `--primary-foreground` trắng ở **≥ 4.6:1** (dư 0.1 so với ngưỡng 4.5 để sai số
   oklch→sRGB giữa trình duyệt không kéo tụt xuống dưới). Ghi con số đo được vào
   comment ngay tại chỗ, theo đúng lối viết đang có trong file.
   ⛔ Không được đặt một giá trị "trông hợp lý" rồi sửa test cho khớp.
3. **Chroma bám sát mép gamut sRGB tại L đã chọn**, nhưng phải nằm TRONG gamut —
   `KNOWN_OUT_OF_GAMUT` là sổ cái hai chiều, thêm/bớt dòng đều phải có lý do.

### 2.2 Token ĐỔI

| Token | Từ | Sang |
|---|---|---|
| `--primary` (sáng/tối) | hue 262.881 | hue **25**, L do đo (§2.1.2) |
| `--ring` | = primary | = primary (giữ ràng buộc "bằng primary") |
| `--accent` (sáng) | `0.951 0.023 262.881` | hue 25, giữ L/chroma |

### 2.3 Token GIỮ NGUYÊN — và đây là quyết định, không phải bỏ sót

| Token | Vì sao KHÔNG theo hue mới |
|---|---|
| `--status-progress` | Hiện đang cố ý bằng hue thương hiệu. **Đảo lý do**: nay thương hiệu là đỏ, một chấm "đang học" màu đỏ sẽ đọc ra "lỗi". Giữ hue 262.881 (lam) và **viết lại comment** để nói rõ: lam nay RẢNH để mang nghĩa "đang diễn ra" mà không tranh chấp với đỏ. |
| `--background` / `--card` / `--muted` / `--secondary` (nhánh `.dark`, chroma 0.012) | Mặt nền không phải thương hiệu. Tô sắc ấm (hue 25) lên nền tối cho ra xám ngả nâu, đục. Nền lạnh dưới điểm nhấn đỏ là tương phản có chủ ý. Comment hiện nói "hue thương hiệu" — **phải viết lại**, nếu không nó thành một lời nói dối trong file. |
| `--elevation-1..3` | Cùng lý do: bóng đổ không mang thương hiệu. |
| `--difficulty-*`, `--status-done`, `--status-locked`, `--success`, `--warning` | Không đụng. ⚠ Nhưng lane A phải **đo lại** `--warning` (hue 55.98) và `--difficulty-intermediate` (hue 65) cạnh primary đỏ mới: 25 vs 56 chỉ cách 31°. Nếu badge độ-khó "trung bình" cạnh nút primary trông cùng một họ màu thì báo lead, đừng tự đổi. |
| `--destructive` | **Giá trị giữ nguyên.** Việc tách khỏi primary làm ở tầng *component*, không ở tầng token (quyết định #1). |

### 2.4 Hợp đồng C2 — biến thể `destructive` đổi hình

`packages/ui/src/button.tsx`, `badge.tsx`, `alert.tsx`.

```
Button variant="primary"      →  bg-primary text-primary-foreground        (nền ĐẶC)
Button variant="destructive"  →  border border-destructive
                                 bg-destructive/10
                                 text-destructive
                                 hover:bg-destructive/20                    (VIỀN, không đặc)
```

Ràng buộc bắt buộc:
- `text-destructive` trên `bg-destructive/10` phải đo được **≥ 4.5:1** ở **cả hai**
  theme. `--destructive` sáng là `oklch(0.577 …)` — chữ đỏ đó trên nền hồng rất nhạt
  có thể **không đạt**. Đo trước; nếu trượt thì dùng một biến thể tối hơn của
  destructive cho chữ và **báo lead**, vì việc đó cần một token mới → phải sửa C1.
- Viền `border-destructive` là ranh giới NHẬN DẠNG (không phải trang trí) nên chịu
  SC 1.4.11 ≥ 3:1 — thêm cặp đó vào `NON_TEXT_PAIRS`.
- Nút destructive **bắt buộc có icon** (`lucide-react`, ví dụ `TriangleAlert`), đặt
  `aria-hidden`. Icon là nửa còn lại của tín hiệu hình dạng; không có icon thì quyết
  định #1 chỉ còn một nửa.
- `badge.tsx` và `alert.tsx` giữ nguyên nếu chúng đã là dạng nhạt/viền; **kiểm rồi
  mới kết luận**, đừng giả định.

### 2.5 Cái bẫy của test đã ghim số

`tokens.contract.test.ts` có khối "miễn trừ CÓ CHỨNG MINH" ghim
`measure(dark, '--primary', '--card') ≈ 6.20` và `< 9`. Đổi hue **sẽ** làm số này
đổi.

⛔ **Không được ghim lại bằng con số mà lần chạy vừa in ra.** Đọc lại lý lẽ của khối
đó (nó tồn tại vì `--ring` = `--primary` nên cặp `ring`↔`primary` bằng 1.00:1 và
không màu nào sửa được). Rồi:
- Nếu số mới vẫn **< 9** → miễn trừ còn hiệu lực, cập nhật con số **kèm phép đo mới
  ghi trong comment**.
- Nếu số mới **≥ 9** → miễn trừ hết lý do tồn tại: **xoá nó** và trả cặp
  `--ring`↔`--primary` về `NON_TEXT_PAIRS`, đúng như comment đối chứng trong file
  đã dặn sẵn.

---

## 3. Hợp đồng C3 — kiến trúc `packages/games`

> Lane B sở hữu `core/` + `k8s/` (logic). Lane C sở hữu `k8s/levels/` (nội dung).
> Lane E chỉ ĐỌC, không sửa.

### 3.1 Vì sao là một package riêng, không phải một thư mục trong `apps/web`

Logic game là một máy trạng thái thuần: không DOM, không React, không `node:*`.
Tách ra để nó **test được bằng vitest môi trường node**, chạy nhanh, và để cái ranh
giới đó có thật chứ không chỉ là quy ước. Đây cũng là điều kiện để lane E (renderer
3D) và lane C (nội dung) chạy song song mà không giẫm chân.

### 3.2 Cây thư mục

```
packages/games/
  package.json          # @devops-platform/games — theo đúng khuôn §7.1
  tsconfig.json
  eslint.config.mjs
  src/
    index.ts            # barrel — CHỈ re-export, KHÔNG chạm node:*
    core/
      types.ts          # hợp đồng chung cho MỌI game (§3.3)
      rng.ts            # PRNG có hạt giống — chaos phải phát lại được
      progress.ts       # đọc/ghi localStorage + migration theo version
      achievements.ts   # engine đánh giá điều kiện
      stats.ts
    k8s/
      model.ts          # kiểu trạng thái cụm (§3.4)
      reducer.ts        # (state, action) => state — THUẦN, không side effect
      tick.ts           # bước mô phỏng theo thời gian
      resources.ts      # bảng loại tài nguyên
      incidents.ts      # bảng sự cố
      kubectl.ts        # parser lệnh
      predicates.ts     # vị từ thắng/thua
      scoring.ts
      levels/
        index.ts        # LEVELS: readonly Level[] — thứ tự = thứ tự chơi
        l01.ts … l30+.ts
      challenges.ts
      chaos.ts
```

### 3.3 Hợp đồng liên-lane: `core/types.ts`

**Đây là SSOT. Lane nào cần một field mới thì báo lead, không tự thêm.**

```ts
export type GameId = 'k8s' | 'pipeline' | 'netpol' | 'dockerfile';
export type Difficulty = 'basic' | 'intermediate' | 'advanced';

/** Kết quả một lượt chơi. KHÔNG có field suy ra được — `passed`, `percent`,
 *  `durationSeconds` đều tính ở chỗ dùng (quy ước "No Derived Fields" của repo). */
export interface RunResult {
  readonly gameId: GameId;
  readonly levelId: string;
  readonly seed: number;
  readonly startedAt: number;      // epoch ms
  readonly finishedAt: number;     // epoch ms
  readonly objectivesMet: readonly string[];
  readonly objectivesTotal: number;
  readonly commandsUsed: number;
  readonly hintsUsed: number;
  readonly score: number;          // 0..1000, do scoring.ts tính
}

export interface Achievement {
  readonly id: string;
  readonly gameId: GameId | 'all';
  readonly title: string;          // tiếng Việt
  readonly description: string;    // tiếng Việt
  readonly hidden: boolean;
}
```

**Đơn vị:** mọi mốc thời gian là **epoch ms** (`number`). Mọi khoảng thời gian trong
mô phỏng là **tick**, không phải giây. `TICK_MS` là hằng công khai ở `k8s/tick.ts`.

**Khoá `localStorage`:** `dlp.games.v1.<gameId>` — một khoá cho mỗi game, giá trị là
JSON của `{ version: 1, runs: RunResult[], achievements: string[], settings: {...} }`.
`progress.ts` phải chịu được: khoá không tồn tại · JSON hỏng · `localStorage` ném
(chế độ riêng tư). Cả ba trả về trạng thái rỗng **và ghi một cảnh báo**, không ném.
Theo đúng khuôn tiêm phụ thuộc đã có ở `apps/web/src/components/session/workspace-tabs.ts:257`.

### 3.4 Hợp đồng mô hình cụm: `k8s/model.ts`

Bắt buộc:
- Trạng thái cụm là **một object bất biến**; `reducer` trả object mới.
- Pod có `phase: 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Terminating'` và
  **riêng biệt** `reason?: 'CrashLoopBackOff' | 'ImagePullBackOff' | 'OOMKilled' | …`.
  ⚠ Không gộp hai thứ này thành một enum. Bản ghi nhớ của repo đã trả giá đúng ở đây:
  *phase `Running` che mất pod đang `Terminating`* — hai trục khác nhau, mô hình phải
  giữ chúng khác nhau.
- Mô phỏng **tất định**: cùng `seed` + cùng chuỗi action ⇒ cùng trạng thái. Không gọi
  `Math.random()` ở bất kỳ đâu ngoài `core/rng.ts`. Có test khẳng định điều này.

### 3.5 Hợp đồng level: `k8s/levels/`

```ts
export interface Level {
  readonly id: string;              // 'k8s-01-pod-dau-tien'
  readonly chapter: number;         // 1..6
  readonly title: string;           // tiếng Việt
  readonly brief: string;           // markdown tiếng Việt, ≤ 400 từ
  readonly difficulty: Difficulty;
  readonly initialState: ClusterSpec;
  readonly allowedResources: readonly ResourceKind[];
  readonly objectives: readonly Objective[];
  readonly hints: readonly string[];       // tiếng Việt, thứ tự = thứ tự mở
  readonly parMoves: number;               // mốc để chấm điểm
  readonly teaches: readonly string[];     // khái niệm K8s, để tra cứu chéo
}
```

`objectives[].check` là **tên vị từ** (chuỗi) tra trong `predicates.ts`, KHÔNG phải
một closure. Lý do: level phải serialize được để lưu replay và để test so sánh.

---

## 4. Hợp đồng C4 — route và UI

> Lane D sở hữu route + catalog + nav. Lane E sở hữu renderer + panel.

### 4.1 Route

```
apps/web/src/app/games/
  layout.tsx          # KHÔNG cần TrpcQueryProvider — game không gọi tRPC
  page.tsx            # server component; catalog
  games-client.tsx    # 'use client'
  k8s/
    page.tsx
    k8s-client.tsx    # 'use client' — vỏ, state, panel DOM
```

### 4.2 Nav — ba file phải sửa cùng lúc

1. `apps/web/src/components/shell/nav.ts` → thêm `{ href: '/games', label: 'Games' }` vào `PRIMARY_NAV`
2. `apps/web/src/components/shell/nav-icons.ts` → thêm icon cho `/games`
3. `nav.test.ts` (`toEqual` trên đúng 6 cặp) + `nav-icons.test.ts` — **cả hai sẽ đỏ nếu chỉ sửa một**

Thêm `/games` vào matcher bảo vệ ở `apps/web/src/proxy.ts` **chỉ khi** game yêu cầu
đăng nhập. Đợt này: **không yêu cầu** — game chạy hoàn toàn ở trình duyệt, tiến độ ở
`localStorage`, nên bắt đăng nhập là một rào không có lý do. Ghi rõ trên thẻ catalog
rằng game **không cần đăng nhập** và **không tốn sandbox**, còn CTF thì **tốn một
sandbox** (yêu cầu 14.B.6 của phase gốc).

### 4.3 Three.js chỉ được nạp trên đúng route game

⚠ Đây là hệ quả bắt buộc của quyết định #2, không phải tối ưu tuỳ chọn.

```
k8s-client.tsx  ──next/dynamic({ ssr: false })──▶  k8s-scene-lazy.tsx
                                                    └── import 'three'   ← DUY NHẤT ở đây
```

- Chỉ **một** file trong repo được `import 'three'`. Đúng khuôn `terminal-surface-lazy.tsx`
  đang dùng cho xterm.js — đọc file đó trước khi viết.
- `ssr: false` là **bắt buộc**: Three.js chạm `document`/`WebGLRenderingContext` lúc
  khởi tạo.
- Dùng **`three` trần**, KHÔNG `@react-three/fiber`. Lý do: (a) trạng thái game đã
  nằm ở reducer thuần bên `packages/games`, renderer chỉ là thứ đăng ký nghe rồi
  mutate scene graph — thêm một tầng React nữa là thêm tầng vô ích; (b) repo đang ghim
  vite 7.3.6 và đã trả giá một lần với peer-dep của `@vitejs/plugin-react`.
- Ghim version `three` chính xác trong `package.json` (không `^`), vì bản vá của nó
  hay đổi API renderer.

### 4.4 Lớp DOM song song — điều kiện để qua cổng axe

`<canvas>` là một hộp đen với trình đọc màn hình. Khung 3D **không được là giao diện
duy nhất**. Bố cục bắt buộc:

```
┌──────────────────────────────┬─────────────────────┐
│                              │  Tài nguyên          │  ← <ul role="list">, DOM thật
│      <canvas> Three.js       │  ├ pod/web-1  ● Chạy │     mỗi item focus bằng Tab,
│      aria-hidden="true"      │  ├ pod/web-2  ✕ Lỗi  │     Enter mở inspector
│      (trang trí thuần)       │  └ svc/web    ● OK   │
│                              ├─────────────────────┤
│                              │  Inspector (YAML)    │  ← <pre>, đọc được
├──────────────────────────────┴─────────────────────┤
│  $ kubectl ▏                                        │  ← <input>, label thật
└─────────────────────────────────────────────────────┘
```

- Canvas mang `aria-hidden="true"` + không nhận focus. Nó là **hình minh hoạ** cho
  trạng thái mà panel bên phải đã nói bằng chữ.
- **Mọi hành động chơi được phải làm xong bằng bàn phím qua panel DOM**, không cần
  chuột trên canvas. Chuột trên canvas là lối tắt, không phải lối duy nhất.
- Mỗi thay đổi trạng thái quan trọng phát ra một thông báo `aria-live="polite"`
  (ví dụ "pod web-2 chuyển sang CrashLoopBackOff").
- Có công tắc **"Tắt hiệu ứng 3D"** lưu ở `localStorage`; bật thì không nạp module
  scene chút nào. Đây cũng là đường thoát cho máy yếu và cho
  `prefers-reduced-motion`.

### 4.5 Màu trong Three.js đọc từ token, không hardcode

Renderer **không được** viết `0xff0000`. Nó đọc token qua `getComputedStyle` trên một
phần tử dò, rồi chuyển sang `THREE.Color`. Đổi theme (sáng/tối) phải vẽ lại đúng màu.
Điều này giữ SSOT màu ở `globals.css` và tự động cho game màu đỏ mà lane A vừa đặt.

### 4.6 CSP

Bản ghi của repo cho biết CSP hiện chặn WASM. `three` bản dựng thường là JS thuần —
**không** dùng module nào cần WASM hay `blob:` worker. Lane E phải **chạy thử trên
`next start` với CSP thật** rồi mới kết luận, không suy từ tài liệu.

---

## 5. Ba game còn lại — chỉ thiết kế, chưa code

Lane F viết `docs/games/` một file cho mỗi game: cơ chế chơi, mô hình trạng thái,
15 level đầu (tiêu đề + mục tiêu, chưa cần nội dung đầy đủ), cách chấm điểm, và
**cái nó dạy được mà Kubernetes Game không dạy được**. Ba ô này hiện trên `/games` ở trạng
thái "sắp có", không bấm vào được.

---

## 6. Acceptance criteria đợt này

- [ ] `--primary` là đỏ hue 25; L là **số đo được**, kèm phép đo ghi trong comment.
- [ ] `pnpm --filter @devops-platform/ui test` xanh; miễn trừ đã ghim được xử lý theo §2.5 (cập nhật **kèm lý lẽ** hoặc xoá), không phải ghim lại số mới.
- [ ] Nút primary và nút destructive **phân biệt được khi ảnh chụp bị khử màu** — có ảnh chứng minh trong report.
- [ ] `/games` lên được, lọc được theo chủ đề + độ khó, ghi rõ game **không tốn sandbox** còn CTF thì **tốn một sandbox**.
- [ ] Kubernetes Game: **≥ 30 level**, chaos mode, sandbox, challenges theo scenario, draw, stats, achievements.
- [ ] Mô phỏng tất định: test khẳng định cùng seed + cùng action ⇒ cùng trạng thái.
- [ ] **0 lời gọi backend** trong lúc chơi — đo bằng Playwright network trace, không phải bằng đọc code.
- [ ] `three` **không** có mặt trong bundle của `/`, `/lessons`, `/dashboard` — đo bằng grep trên `.next/static/chunks`, có **đối chứng dương** (khẳng định nó CÓ trong chunk của `/games/k8s`).
- [ ] Cổng axe xanh trên `/games` và `/games/k8s`; chơi hết được level 1 **chỉ bằng bàn phím**.
- [ ] Attribution đúng license cho mọi thứ mượn từ k8sgames.
- [ ] Cổng màu grep thành **script có đối chứng dương**, không còn là lệnh tay trong plan.

## 7. Kỷ luật git và ranh giới sở hữu

Nhánh `feat/p14-games`, tạo **trước** khi fan-out. Teammate **không** `checkout -b`,
**không** `git add .`, chỉ commit dạng pathspec:

```bash
git commit -m "<message>" -- <đường dẫn cụ thể>
```

| Lane | Sở hữu độc quyền |
|---|---|
| A — thương hiệu đỏ | `apps/web/src/app/globals.css` · `packages/ui/src/theme/**` · `packages/ui/src/{button,badge,alert}.{tsx,test.tsx}` · `docs/design-system.md` · `scripts/check-design-tokens.mjs` (mới) |
| B — logic game | `packages/games/src/core/**` · `packages/games/src/k8s/**` **trừ** `levels/` |
| C — nội dung level | `packages/games/src/k8s/levels/**` · `packages/games/src/k8s/{challenges,chaos}.ts` |
| D — route + catalog | `apps/web/src/app/games/**` · `apps/web/src/components/shell/{nav.ts,nav-icons.ts}` + 2 test của chúng |
| E — renderer 3D + panel | `apps/web/src/components/games/**` |
| F — e2e + thiết kế 3 game | `apps/web/e2e/games.spec.ts` · `docs/games/**` · `content/games/ATTRIBUTION.md` |

**File giao nhau, phải đặt chỗ theo tên (bài học đã trả giá của repo):**
`packages/games/package.json` + `tsconfig.json` + `eslint.config.mjs` → **lead tạo
trước fan-out**, không lane nào sửa. `apps/web/package.json` (thêm dependency
`@devops-platform/games` và `three`) → **lead sửa trước fan-out**.
`packages/games/src/index.ts` → **lead viết trước**, chỉ chứa re-export; lane B/C
báo lead khi cần thêm dòng.

---

## 8. Hợp đồng C5 — chống gian lận

> Lane G sở hữu. Yêu cầu bổ sung của chủ dự án, 2026-09-08.

### 8.1 Nói thẳng cái KHÔNG làm được, trước khi nói cái làm được

**Không chặn được F12.** Đây là sự thật kỹ thuật, không phải lựa chọn:

- DevTools là chức năng của trình duyệt, trang web không có API nào tắt nó.
- Mọi thủ thuật dân gian (bắt `keydown` F12/Ctrl+Shift+I, chặn `contextmenu`, vòng
  lặp `debugger`, dò kích thước cửa sổ để đoán devtools đang mở) đều bị vượt trong
  vài giây: tắt JavaScript, mở devtools trước khi tải trang, dùng `view-source:`,
  hoặc sửa thẳng bộ nhớ. Chúng lọc được đúng nhóm người không định gian lận.
- Chúng **phá cổng axe của chính dự án này**: chặn phím và chặn chuột phải làm hỏng
  điều hướng bàn phím và trình đọc màn hình. Ta sẽ tự làm đỏ AC a11y của mình để
  đổi lấy một rào cản không cản được ai.

⛔ **CẤM** trong repo này: dò devtools, chặn `contextmenu`, chặn phím tắt, vòng lặp
`debugger`, làm rối mã nguồn (obfuscation). Lane G thấy có thì xoá và báo lead.

### 8.2 Mô hình đe doạ thật

| Ai | Làm được gì | Có hại không |
|---|---|---|
| Người chơi sửa `localStorage` của chính mình | Đặt `score` bất kỳ, mở khoá achievement | **Chỉ hại chính họ.** Không bảng xếp hạng, không phần thưởng, không ảnh hưởng ai khác. |
| Người chơi đọc bundle để xem đáp án | Biết trước lời giải level | Tự bỏ tiền học của mình. Giống việc lật trang đáp án cuối sách. |
| Người chơi khoe ảnh chụp điểm giả | Nói dối xã hội | Nằm ngoài tầm phần mềm. |
| **Nếu sau này có bảng xếp hạng** | Bơm điểm giả lên bảng chung | **Đây mới là mối nguy thật** — và nó chỉ xuất hiện khi có backend chấm điểm. |

Kết luận định hướng: đợt này không có bảng xếp hạng, nên mục tiêu **không phải là
ngăn chặn** (bất khả thi) mà là **xác minh được** — dựng sẵn cơ chế để khi có bảng
xếp hạng thì nó đã đáng tin từ đầu, thay vì phải vá sau.

### 8.3 Cơ chế thật: xác minh bằng phát lại tất định

Đây là phần có giá trị. Nó hoạt động vì reducer đã bắt buộc tất định (§3.4).

1. Mỗi lượt chơi ghi `RunLog = { levelId, seed, actions[] }` (đã có trong
   `k8s/contract.ts`).
2. `verify.ts` chạy lại `actions` qua reducer thuần từ `seed`, rồi so kết quả với
   `RunResult` mà người chơi khai. Khớp ⇒ `verified: true`.
3. Kết quả không phát lại được **không bị xoá** — nó hiển thị với nhãn
   *"không xác minh được"*. Xoá dữ liệu người dùng vì nghi ngờ là hành vi tệ hơn
   chính vấn đề; và một bản lưu hỏng do đổi version cũng rơi vào nhánh này.
4. Trang stats phân tách hai cột: **đã xác minh** và **tất cả**. Achievement chỉ
   tính trên lượt đã xác minh.

Vì sao mạnh: sửa `score` trong `localStorage` thành 1000 không kèm được một chuỗi
`actions` thật sự dẫn tới 1000. Muốn giả thì phải **chơi thật** — lúc đó không còn
là gian lận.

### 8.4 Bốn lớp phụ trợ (đều là "nâng chi phí", không phải "chặn")

1. **Checksum trên bản lưu** — hash (FNV-1a hoặc SHA-256 qua `crypto.subtle`) của
   phần dữ liệu, ghi kèm. Sửa tay bằng devtools sẽ lệch checksum ⇒ đánh dấu
   *"đã bị sửa ngoài game"*. **Ghi rõ trong comment rằng đây KHÔNG phải bảo mật**:
   khoá nằm trong bundle nên ai đọc được là tính lại được. Nó chặn sửa tay tuỳ hứng,
   không chặn người quyết tâm.
2. **Kiểm tính hợp lý** — cờ (không xoá) các lượt bất khả thi: `finishedAt` trước
   `startedAt`; hoàn thành nhanh hơn số tick tối thiểu mà chuỗi action đòi;
   `commandsUsed === 0` mà vẫn đạt mục tiêu cần lệnh; `score` vượt trần của level.
3. **Không xuất source map ra production.** Kiểm được: khẳng định không có
   `.js.map` trong `.next/static` của bản build production. Đây là món duy nhất
   trong mục này *thật sự* là bảo mật, và nó cũng bảo vệ mã của cả app chứ không
   riêng game.
4. **Băm đáp án dạng chuỗi.** Vị từ cấu trúc (đếm replica, so selector) buộc phải
   chạy ở client nên **luôn đọc được** — chấp nhận, đừng giả vờ ngược lại. Nhưng
   đáp án là *chuỗi cố định* (tên lệnh đúng, giá trị field đúng ở game Dockerfile
   sau này) thì bundle chỉ chứa **hash**, so bằng hash. Đọc bundle khi đó không cho
   ra đáp án.

### 8.5 Đường tới bảng xếp hạng đáng tin (thiết kế, chưa hiện thực đợt này)

Ghi vào `docs/games/anti-cheat.md` để đợt sau không phải nghĩ lại: client gửi
`RunLog` (không gửi `score`); server chạy **cùng một reducer** — chính là lý do
logic nằm ở `packages/games` không phụ thuộc DOM, nên chạy được cả trên Node — rồi
tự tính điểm. Điểm do server tính là điểm duy nhất được lên bảng. Kèm giới hạn tần
suất và trần độ dài `actions`.

⚠ Việc đó là **một lời gọi backend**, nên nó phá ô AC "0 lời gọi backend" nếu làm
trong lúc chơi. Thiết kế đúng: chơi = 0 lời gọi; **nộp điểm** = một lời gọi tường
minh do người dùng bấm, sau khi lượt chơi kết thúc. Không phải đợt này.

### 8.6 AC của lane G

- [ ] `verify.ts` + test: một `RunLog` thật ⇒ `verified: true`; một `RunResult` bị
      sửa `score` ⇒ `verified: false`. **Cả hai chiều**, không chỉ chiều dương.
- [ ] Test tất định: cùng seed + cùng `actions` ⇒ cùng `ClusterView`, chạy 2 lần.
- [ ] Trang stats phân tách "đã xác minh" / "tất cả"; achievement chỉ tính cột đã xác minh.
- [ ] Bản lưu bị sửa tay hiện nhãn cảnh báo, **không bị xoá**.
- [ ] `docs/games/anti-cheat.md` nói rõ cái gì bảo vệ được và cái gì không — kể cả
      câu "không chặn được F12, và đây là lý do".
- [ ] Grep khẳng định repo **không** có mã dò devtools / chặn `contextmenu` / vòng
      lặp `debugger` — có đối chứng dương.

---

## 9. Hợp đồng C6 — hướng mỹ thuật 3D

> Lane E sở hữu. Yêu cầu bổ sung của chủ dự án 2026-09-08: *"đồ hoạ threejs của họ
> trông khá xấu và đơn sơ, đừng bắt chước, tự thiết kế đẹp hơn"*.

"Làm đẹp hơn" không phải một chỉ dẫn thi hành được. Dưới đây là các quyết định kỹ
thuật CỤ THỂ tạo ra khác biệt đó — phần lớn cảnh Three.js trông rẻ tiền vì thiếu
đúng bốn thứ đầu tiên trong danh sách này, không phải vì thiếu mô hình đẹp.

### 9.1 Bốn thứ quyết định 80% cảm giác "được thiết kế"

1. **Tone mapping + color space.** `ACESFilmicToneMapping`, `outputColorSpace = SRGBColorSpace`, `toneMappingExposure` chỉnh tay. Thiếu cái này là lý do số một khiến cảnh Three.js trông bợt và nhựa.
2. **Ánh sáng ba điểm, có bóng đổ mềm.** Key directional có shadow map, fill bằng `HemisphereLight`, và một rim light hắt viền. Một `AmbientLight` + một `DirectionalLight` là dấu hiệu nhận dạng của cảnh demo.

   ⚠ **ĐÍNH CHÍNH 2026-09-08 — bản đầu của dòng này ghi `PCFSoftShadowMap`, và ĐÓ LÀ MỘT HẰNG SỐ ĐÃ BỊ GỠ.** three 0.185 xoá nó: nó cảnh báo rồi **ghi đè** `shadowMap.type` thành `PCFShadowMap`. Nghĩa là bậc chất lượng cao chạy suốt mà KHÔNG có bóng mềm nào — không lỗi, không vỡ hình, và không test nào thấy được vì chẳng có gì đo bóng đổ. Làm ĐÚNG theo hợp đồng là tạo ra đúng con bug này. Lane E chỉ phát hiện khi chạy thật dưới CSP rồi đọc console. Dùng **`VSMShadowMap`** kèm `shadow.radius` và `blurSamples` đặt tường minh: VSM ở mặc định gần như cạnh cứng, nên đổi API mà không chỉnh hai tham số đó thì không đổi được gì.
3. **Vật liệu PBR thật.** `MeshStandardMaterial` (hoặc `MeshPhysicalMaterial` cho bề mặt cần bóng) với `roughness`/`metalness` chỉnh có chủ ý, cộng một environment map **sinh tại chỗ** (`RoomEnvironment` trong `three/examples/jsm`, hoặc gradient thủ tục). ⛔ Không tải HDRI từ mạng: CSP chặn, và game phải giữ tính chất 0 lời gọi backend. `MeshBasicMaterial` bị cấm cho vật thể chính.
4. **Hình khối bo góc.** `BoxGeometry` cạnh sắc chính là hình dạng của cái "đơn sơ" mà chủ dự án chê. Dùng khối bo (bevel qua `ExtrudeGeometry`, hoặc tự dựng rounded box). Góc bo bắt được rim light — đó là chỗ khối trông có chất liệu.

### 9.2 Ngôn ngữ hình ảnh

Phòng điều khiển tối, tương phản cao, điểm nhấn đỏ. Cụ thể:

- **Node** = bệ nâng, mặt trên hơi phản chiếu, viền phát sáng yếu. Node `NotReady` mất phần phát sáng và tụt độ bão hoà, không đổi sang màu khác — mất sức sống đọc ra đúng nghĩa hơn là đổi màu.
- **Pod** = khối bo tròn đặt trên bệ, lơ lửng rất nhẹ. Trạng thái nói bằng **vật liệu**, không chỉ bằng màu: khoẻ thì bề mặt sạch và phát sáng đều; lỗi thì phát sáng nhấp nháy theo nhịp thở chậm; `Terminating` thì mờ dần và tụt xuống.
- **Edge** = đường có hạt chạy dọc theo, chỉ hướng đi của traffic. Quan hệ đứt (selector lệch label) vẽ nét đứt, đứng yên, nhuộm `destructive`. **Người chơi phải thấy ngay cái nào đang chảy và cái nào không.**
- **Nhãn chữ nằm ở DOM chồng lên canvas**, KHÔNG phải text 3D. Sắc nét hơn ở mọi mức zoom, đổi theo font hệ thiết kế, và nó chính là lớp a11y §4.4 đằng nào cũng phải dựng. Text 3D là mờ, không đọc được bằng trình đọc màn hình, và tốn thêm asset font.
- **Nền** = gradient đứng lấy từ token, cộng fog cùng màu nền để vật ở xa chìm dần. Fog là mẹo rẻ nhất tạo chiều sâu.
- **Mặt sàn** có bóng tiếp xúc mềm dưới mỗi bệ. Vật không có bóng trông như dán lên ảnh nền.

### 9.3 Chuyển động

Không gì được nhảy cóc. Mọi thay đổi trạng thái là một chuyển tiếp có easing.

- Pod sinh ra: scale từ 0 với ease vượt nhẹ (overshoot) rồi lắng.
- Pod bị xoá: scale nhỏ lại + mờ đi, KHÔNG biến mất tức thì.
- Bồng bềnh khi rảnh: biên độ rất nhỏ, **pha khác nhau cho từng pod** — cùng pha thì cả cảnh đập như một khối, trông như lỗi.
- Camera: có quán tính, giảm chấn, không cắt cảnh đột ngột.
- ⚠ `prefers-reduced-motion: reduce` ⇒ tắt bồng bềnh và nhấp nháy, giữ chuyển tiếp trạng thái nhưng rút còn ~1 frame. Hệ thiết kế đã có khối media query cho việc này; đừng dựng cơ chế thứ hai.

### 9.4 Bloom — có, nhưng tiết chế

`UnrealBloomPass` qua `EffectComposer` (nằm sẵn trong `three/examples/jsm`, không thêm dependency), **chỉ tác động lên phần emissive**, ngưỡng đặt cao. Bloom tràn lan là cách nhanh nhất biến "có không khí" thành "mờ nhoè". Nằm ở bậc chất lượng cao, tắt ở bậc thấp.

### 9.5 Ba bậc chất lượng, tự dò

| Bậc | Bật | Khi nào |
|---|---|---|
| Cao | bóng mềm, bloom, env map, pixelRatio ≤ 2 | GPU rời, khung hình ổn định |
| Vừa | bóng cứng, không bloom, pixelRatio 1 | mặc định an toàn |
| Thấp | không bóng, không post, vật liệu đơn giản | SwiftShader (không có GPU thật), hoặc khung hình đo được thấp |

⚠ Chromium headless của Playwright cấp WebGL2 **qua SwiftShader** — chạy được nhưng rất chậm. Tự dò và hạ về bậc thấp, nếu không E2E sẽ hết giờ. Có công tắc tay để người dùng ép bậc.

### 9.6 Ràng buộc không được đánh đổi

- Mọi màu **đọc từ design token** (§4.5). Cảnh phải đổi đúng khi chuyển sáng/tối. Không hex.
- Không asset ngoài: không HDRI, không texture tải về, không font 3D. Cần texture thì sinh bằng canvas lúc chạy.
- `import 'three'` vẫn chỉ được nằm trong đúng một file lazy (§4.3). Import từ `three/examples/jsm` cũng tính là ở trong ranh giới đó.
- Đẹp không được đổi bằng a11y. Lớp DOM ở §4.4 là giao diện chính thức; canvas vẫn `aria-hidden`.

---

## 10. Sửa hợp đồng sau khi đo (2026-09-08, sau báo cáo lane A)

Lane A đo và tìm ra §2.4 lẫn §2.5 viết trên một cách đọc thiếu. Ghi lại ở đây thay
vì sửa tại chỗ, để người đọc sau thấy được *vì sao* hợp đồng đổi.

### 10.1 §2.5 sai chỗ nào

§2.5 nói cái cổng là con số 6.20 và cho hai nhánh theo ngưỡng 9. **Cả hai nhánh đều
không dùng được.** Cổng thật là một phép **quét vét cạn** khẳng định KHÔNG tồn tại
độ chói nào cho `--ring` đạt 3:1 với đồng thời `--card` và `--primary` ở theme tối.

| | lam (cũ) | đỏ (mới) |
|---|---|---|
| số nghiệm ring hợp lệ | **0** | **317** |
| trắng ↔ primary (tối) | 2.8922 | 4.2972 |
| primary ↔ card (tối) | 6.20 | 4.1690 |

Con số vẫn `< 9`, nên nhánh thứ nhất của §2.5 sẽ bảo cập nhật 6.20 → 4.17 — trong
khi **lời chứng minh bên cạnh nó nay đã SAI**. Đó đúng là "ghi lại hiện tại rồi gọi
nó là kỳ vọng" mà `pinned-baseline-test-companion.md` cấm. Nhánh thứ hai (≥ 9 thì
xoá miễn trừ, trả cặp về `NON_TEXT_PAIRS`) cũng không tới được: §2.2 giữ
`--ring` = `--primary` nên cặp đó đo ra 1.00:1, đỏ vĩnh viễn.

**Chốt:** xoá nửa `--primary` của phép quét và xoá luôn cái ghim 6.20 — **không**
ghim lại thành 4.17. Giữ nguyên nửa `--destructive` (vẫn 0 nghiệm, vẫn đúng, vẫn
đo được). Thay lý lẽ của primary bằng thứ nay mới đúng: định danh
`--ring` = `--primary` của §2.2, khẳng định bằng một test **có thể đỏ**, để ngày
nào ai đó cho `--ring` giá trị riêng thì cặp ấy quay về `NON_TEXT_PAIRS`.

⚠ Comment thay thế **bắt buộc ghi con số 317** và nói rõ: ring-bằng-primary nay là
một **lựa chọn**, không còn là điều bất khả kháng. Bản cũ nói được câu "không màu
nào sửa được"; bản mới thì không, và nếu chỉ khẳng định định danh mà bỏ bối cảnh
thì người đọc sau sẽ tưởng ràng buộc vẫn là vật lý và không bao giờ xem lại.

**Đã cân nhắc và từ chối:** cho `--ring` một giá trị riêng (nay khả thi, 317 ứng
viên). Nó xoá hẳn được miễn trừ, tốt hơn thật. Nhưng `--ring` là vòng focus của
**mọi** phần tử focus được, nên đổi hue của nó là sửa cả hệ thống focus chứ không
phải đổi màu thương hiệu. Ngoài phạm vi đợt này; nếu sau khi đỏ vào rồi vẫn thấy
đáng thì mở thành một thay đổi riêng.

### 10.2 §2.4 — chữ destructive trượt contrast ở theme sáng

Đo được: `text-destructive` trên `bg-destructive/10` cho **3.9875** ở sáng (hover
`/20` còn tệ hơn: 3.3133), trong khi tối đạt 5.4743. Nguyên nhân là **trần**, không
phải chỉnh chưa khéo: `--destructive` sáng chỉ đạt 4.7647:1 trên trắng tinh, nên
đặt lên một nền hồng nhạt thì không còn đường nào chạm 4.5. Hạ alpha không cứu được
— phải xuống `/03` (4.520) tức là gần như không còn nền.

**Chốt: KHÔNG thêm token.** Thứ tự ưu tiên:

1. **Bỏ nền lúc nghỉ.** `bg-transparent` + `text-destructive` + `border-destructive`
   + icon. Chữ đỏ trên nền trang đo 4.7647 — đạt. Hover thì đảo sang nền đặc
   (`hover:bg-destructive hover:text-destructive-foreground`), một cặp vốn đã hợp lệ.
   Ưu tiên phương án này vì nhãn **đỏ thật** là tín hiệu mạnh hơn nhãn màu chữ
   thường, và việc tách hình dạng vẫn nguyên vẹn: cái phân biệt nằm ở trạng thái
   NGHỈ, nơi primary đặc còn destructive viền. Nền đặc lúc hover không đụng primary,
   vì primary đặc ngay lúc nghỉ và đó mới là trạng thái người ta quét mắt qua.
2. Nếu (1) không đạt ở cả hai theme thì dùng khuôn `alert.tsx` đang có: nhãn
   `text-foreground` (16.56 sáng / 15.16 tối), icon `text-destructive` (đồ hoạ
   không-phải-chữ nên ngưỡng 3.0), viền + nền nhạt giữ nguyên.

`--destructive-strong` `oklch(0.52 0.19 27.325)` (5.083 trên nền nhạt) là một lối
thoát có thật, nhưng nó kéo theo C1 + `docs/design-system.md` + test hợp đồng, mà
cả hai phương án trên đều không cần.

### 10.3 §2.3 — kiểm hue láng giềng: không xung đột

Sáng: `--warning` lệch 31°, `--difficulty-intermediate` lệch 40° — mắt đọc ra nâu và
hổ phách cạnh `#e31029`, không cùng họ. Tối: lệch 45° và 40°, rõ ràng là cam.
Màu thật sự sát là `--destructive` (lệch 2.3°) — và đó chính là lý do quyết định #1
tách bằng hình dạng chứ không bằng hue. Đúng như thiết kế, không phải việc cần sửa.

### 10.4 Giá trị thương hiệu đã duyệt

| | giá trị | hex | phép đo |
|---|---|---|---|
| `:root --primary` | `oklch(0.58 0.23 25)` | `#e31029` | trắng 0.985 trên nó = **4.6144** (L lớn nhất còn ≥ 4.6) |
| `.dark --primary` | `oklch(0.609 0.242 25)` | `#f2102c` | `#0a0a0a` trên nó = **4.6060** (L nhỏ nhất còn ≥ 4.6) |

Cả hai trong gamut, chừa ~0.005 chroma. L gần như không đổi theo biên chroma
(0.581 sát mép so với 0.577 ở biên 0.03), nên biên an toàn gần như miễn phí.

---

## 11. Hợp đồng C7 — hiệu năng 3D

> Lane E sở hữu. Yêu cầu bổ sung của chủ dự án 2026-09-08: *"3D đẹp và quan trọng
> là phải cực mượt, không được giật lag"*.

Mượt không đến từ việc chọn thư viện. Nó đến từ sáu quyết định dưới đây, và giật
lag gần như luôn là một trong sáu thứ này chứ không phải "Three.js chậm".

### 11.1 Sáu nguyên nhân giật, theo thứ tự mức độ

**1. Số draw call.** Mỗi mesh riêng lẻ là một lệnh vẽ. 200 pod = 200 draw call, đủ
để tụt khung hình trên GPU tích hợp. **Bắt buộc dùng `InstancedMesh`**: mọi pod
dùng chung một geometry + một material, khác nhau ở ma trận và màu instance. 200
pod thành **một** draw call. Đây là khoản lời lớn nhất trong cả danh sách và nó
không thương lượng được.

**2. Cấp phát trong vòng lặp render.** `new THREE.Vector3()` mỗi frame mỗi vật thể
sinh rác, rác sinh GC pause, GC pause là cái khựng mắt nhìn thấy. Vòng lặp render
phải **không cấp phát**: dựng sẵn vector/matrix/color dùng lại. Đây là thứ dễ vi
phạm nhất vì mã trông vô hại.

**3. Cho React chạm vào vòng lặp.** Nếu mỗi tick mô phỏng kéo theo một lần render
React, ta trả giá reconciliation 60 lần/giây. Vòng lặp scene là **mệnh lệnh và nằm
ngoài React**; React chỉ dựng panel DOM, và panel cập nhật theo nhịp riêng (~10Hz là
đủ cho chữ). Đây chính là lý do §4.3 cấm `@react-three/fiber` — không phải vì nó
tệ, mà vì nó đặt scene vào cây React.

**4. Bóng đổ tính lại mỗi frame.** Shadow map 2048 render lại toàn cảnh mỗi frame.
Cảnh này gần như tĩnh: đặt `shadowMap.autoUpdate = false` và chỉ bật
`shadowMap.needsUpdate = true` đúng frame có vật thể sinh/mất/di chuyển.

**5. Không giới hạn pixel ratio.** Màn hình DPR 3 vẽ gấp 9 lần số điểm ảnh. Kẹp
`setPixelRatio(Math.min(devicePixelRatio, 2))`, bậc thấp thì kẹp về 1.

**6. Đọc layout từ nhãn DOM.** Nhãn chồng lên canvas (§9.2) mà gọi
`getBoundingClientRect` mỗi frame sẽ ép trình duyệt tính lại layout đồng bộ — đúng
định nghĩa của layout thrash. Chỉ **ghi** `transform: translate3d(...)`, không bao
giờ **đọc** layout trong vòng lặp.

### 11.2 Render theo yêu cầu, không quay vòng vô ích

Cảnh đứng yên **không được** render 60fps. Vòng lặp chỉ vẽ khi có thứ đang động
(chuyển tiếp trạng thái, bồng bềnh, camera đang giảm chấn, hạt trên edge). Ngoài ra
thì dừng. Lợi ba mặt: pin máy tính xách tay, quạt không quay, và khi thứ gì đó
*thật sự* động thì có sẵn toàn bộ ngân sách 16.6ms cho nó.

⚠ Bồng bềnh khi rảnh (§9.3) mâu thuẫn trực tiếp với điều này — nó làm cảnh không
bao giờ đứng yên. Giải: bồng bềnh chỉ chạy khi tab đang hiển thị VÀ con trỏ đang ở
trong khung, và tắt hẳn ở bậc chất lượng thấp. Đẹp không được mua bằng một vòng lặp
không bao giờ ngủ.

### 11.3 Cổng đo — đo NGUYÊN NHÂN, không đo khung hình

⛔ Không đặt AC kiểu "≥ 60fps". Con số đó phụ thuộc máy chạy test, và dưới
SwiftShader của Playwright thì nó vô nghĩa — cổng sẽ đỏ vì phần cứng CI chứ không
vì mã. Đo mấy thứ tất định sau, đọc thẳng từ `renderer.info`:

| Đại lượng | Ngưỡng | Vì sao đo được |
|---|---|---|
| `renderer.info.render.calls` với 200 pod | **≤ 25** | Tất định. Vượt nghĩa là chưa instancing. |
| `renderer.info.memory.geometries` sau 500 lần sinh/xoá pod | không tăng | Bắt rò rỉ geometry — nguyên nhân giật sau vài phút chơi. |
| `renderer.info.memory.textures` sau 500 chu kỳ | không tăng | Như trên. |
| Số byte cấp phát trong 100 frame liên tiếp (`performance.measureUserAgentSpecificMemory` hoặc đếm tay) | ~0 tăng trưởng | Bắt vi phạm mục 11.1.2. |
| Số frame vẽ khi cảnh tĩnh 3 giây | **0** | Chứng minh render-theo-yêu-cầu thật sự hoạt động. |

Bốn cái đầu bắt đúng NGUYÊN NHÂN của giật; chúng đỏ trên máy nào cũng đỏ. Một con
số fps chỉ nói được máy chạy test mạnh hay yếu.

### 11.4 Nói thẳng về giới hạn

**"Cực mượt trên mọi máy" không đạt được với 3D có hậu kỳ.** Máy không có GPU rời
(SwiftShader, hoặc GPU tích hợp cũ) sẽ không mượt dù tối ưu đến đâu — đó là vật lý
của phần cứng, không phải chỗ để cố thêm. Ba bậc chất lượng (§9.5) và công tắc
"Tắt hiệu ứng 3D" (§4.4) tồn tại chính xác vì lý do này: hạ dần cho tới khi mượt,
và nếu vẫn không mượt thì người dùng vẫn chơi được đầy đủ bằng lớp DOM.

Điều **đạt được**, và là thứ hợp đồng này cam kết: trên máy có GPU ở mức trung bình
trở lên, cảnh chạy ổn định ở nhịp màn hình, không tụt khung hình khi thêm pod, và
không xuống cấp dần sau nhiều phút chơi.

### 10.5 Hai đính chính từ lane D (2026-09-08)

**Repo này KHÔNG có alias `@/`.** Lead viết `@/components/games/k8s-game` vào brief
của lane D và lane E mà không kiểm — sai. Đã kiểm lại: không có `paths` trong
`tsconfig.base.json` lẫn `apps/web/tsconfig.json`, `grep -rn "from '@/" apps/web/src`
đếm được **0**, `next.config.ts` không đặt alias nào. Dùng đường dẫn tương đối, như
cả repo đang làm. Viết `@/…` sẽ đỏ ở typecheck và ở `next build`.

**`proxy.test.ts` xung đột với §4.2, và test phải nhường.** `proxy.test.ts:33` duyệt
`PRIMARY_NAV` rồi khẳng định MỌI mục đều `matchesProtected(...) === true`. Tiền đề đó
đúng chỉ vì tình cờ cả sáu mục cũ đều cần đăng nhập. `/games` là mục nav **công khai
có chủ ý** đầu tiên (§4.2), nên hai thứ mâu thuẫn trực tiếp — và cái nhường không phải
hợp đồng.

Lane D thay bằng tập miễn trừ có tên `PUBLIC_NAV_HREFS = new Set(['/games'])` kèm
companion **hai chiều**: đỏ khi `/games` rời `PRIMARY_NAV` (mục chết), và đỏ khi
`/games` trở thành protected (miễn trừ hết đúng). `proxy.ts` không bị đụng,
`PROTECTED_PATHS` nguyên byte.

Bất biến mới **mạnh hơn** bất biến cũ, không phải yếu đi: từ nay thêm một mục nav
buộc phải phân loại có ý thức là protected hay công khai, thay vì thừa hưởng lặng lẽ
một giả định. Comment trên tập miễn trừ phải ghi **lý do** `/games` công khai (chơi
hoàn toàn trong trình duyệt, tiến độ ở `localStorage`, nên cổng đăng nhập không gác
gì cả) — thiếu lý do thì người đọc sau sẽ tưởng là sót và "sửa" nó.

---

## 12. Hợp đồng C8 — bố cục TOÀN MÀN HÌNH (thay thế phần bố cục của §4.4)

> Lane E sở hữu. Chủ dự án bác bản dựng đầu 2026-09-08 kèm ảnh chụp game gốc.

### 12.1 §4.4 sai chỗ nào, và đó là lỗi của lead

§4.4 vẽ một sơ đồ **chia đôi**: canvas một bên, panel một cột bên cạnh. Lane E làm
đúng thứ được giao. Kết quả là canvas bé tí giữa một mớ ô chữ nhật, và chủ dự án
gọi nó là "chia từng ô vùng, quá tệ" — đúng.

Ảnh chụp bản gốc cho thấy cách làm đúng: **canvas chiếm TOÀN BỘ viewport, mọi thứ
khác NỔI ĐÈ lên trên nó**. Không có ô nào chia phần diện tích với canvas. Đây là
khác biệt về kiến trúc bố cục, không phải về trang trí.

Sơ đồ ở §4.4 **hết hiệu lực**. Phần a11y của §4.4 thì **giữ nguyên toàn bộ** — xem
§12.4, nó không hề mâu thuẫn với toàn màn hình.

### 12.2 Bố cục

```
┌──────────────────────────────────────────────────────────────────────┐
│ ← Thoát  Kubernetes Game   Nodes 2  Pods 3/3  Deploy 1  Svc 1        │ ← thanh trên
│                     CPU ▓▓░░ 34%  MEM ▓░░░ 12%   L2  1x 2x 4x   ⚙    │   mỏng, nổi
├────┬─────────────────────────────────────────────────────────────────┤
│ ▣  │ ┌─ L2 — Deployment và ReplicaSet ──┐                            │
│Pod │ │ primer…                          │                            │
│ ▣  │ │ ○ Tạo Deployment                 │        CANVAS 3D           │
│Dep │ │ ○ Scale lên 3 replica    0/3     │      TRÀN TOÀN MÀN HÌNH    │
│ ▣  │ │ [ Gợi ý (3) ]                    │      (nằm DƯỚI mọi overlay)│
│ RS │ └──────────────────────────────────┘                            │
│ …  │                                              ┌───────────────┐  │
│rail│                                              │  bản đồ thu   │  │
│trái│      [Căn lại] [Về góc nhìn] [YAML] [kubectl] [Trợ giúp]      │  │
└────┴─────────────────────────────────────────────────────────────────┘
```

Mọi khối ngoài canvas là **overlay định vị tuyệt đối**, nền mờ có `backdrop-blur`,
bo góc, viền mảnh. Canvas nằm dưới cùng và **không bao giờ** bị thu nhỏ để nhường
chỗ cho panel.

### 12.3 Thoát khỏi vỏ ứng dụng

`AppShell` nằm ở **root layout** nên route con không gỡ được nó bằng route group.
Nhưng `app-shell.tsx` là client component và **đã đọc `usePathname()`** (nó tính
`isActiveNav`). Vậy: cho nó ẩn `ShellHeader` và bỏ padding trên các route
immersive, giữ **đúng một** `<main>`.

⛔ KHÔNG dùng `fixed inset-0 z-50` phủ lên vỏ. Cách đó để lại header trong DOM
phía dưới, đẻ ra một cuộc chiến z-index, và buộc phải bẫy focus thủ công. Ẩn
đúng thứ cần ẩn thì rẻ hơn và không phá hợp đồng landmark.

Trang game đặt `overflow: hidden`, không có thanh cuộn trang.

### 12.4 A11y — KHÔNG nhân nhượng, và toàn màn hình không hề cản

Overlay **là DOM thật**. Chúng nổi lên trên canvas chứ không phải vẽ vào canvas,
nên mọi ràng buộc của §4.4 giữ nguyên y hệt:

- Canvas `aria-hidden="true"`, không nhận focus. Nó minh hoạ trạng thái mà overlay
  đã nói bằng chữ.
- **Mọi thao tác chơi được vẫn phải làm xong bằng bàn phím** qua overlay. Rail
  trái, thẻ level, thanh công cụ, inspector: tất cả focus được bằng Tab.
- Thứ tự tab phải theo trình tự đọc, không theo thứ tự DOM tình cờ. Overlay chồng
  nhau nhiều lớp là chỗ dễ hỏng nhất của bố cục này — kiểm bằng bàn phím thật.
- `aria-live="polite"` cho thay đổi trạng thái, như cũ.

### 12.5 Các vùng chrome

| Vùng | Vị trí | Nội dung |
|---|---|---|
| Thanh trên | trên, tràn ngang, mỏng | Thoát · tên game · bộ đếm sống (Nodes/Pods/Deploy/Svc) · CPU/MEM · chế độ · level · tốc độ 1x/2x/4x · cài đặt |
| Rail tài nguyên | trái, dọc | Bảng tài nguyên nhóm theo WORKLOADS · NETWORK · CONFIG · STORAGE. Icon + nhãn ngắn. |
| Thẻ level | trên-trái, đè canvas | Tiêu đề · `primer` · checklist mục tiêu có tiến độ · nút gợi ý. **Thu gọn được.** |
| Thanh công cụ | dưới-giữa | Căn lại · Về góc nhìn · YAML · kubectl · Trợ giúp |
| Bản đồ thu nhỏ | dưới-phải | Toàn cảnh cụm, bấm để nhảy góc nhìn |
| Inspector | phải, dạng drawer | Mở khi chọn đối tượng. YAML + trạng thái + hành động. |
| Đúc kết | giữa, khi thắng | `takeaways` của `LevelTeaching`. Đây là nhịp "à ra thế", nó xứng đáng chiếm giữa màn hình một lúc. |

### 12.6 Màn hình hẹp

Overlay chồng chất trên màn hình nhỏ là không dùng được. Dưới ~1024px: rail thành
thanh ngang cuộn được hoặc menu bung ra; thẻ level và inspector thành drawer chỉ
mở một cái tại một thời điểm. Canvas vẫn tràn màn hình. **Không** quay lại bố cục
chia ô.

### 12.7 Nghiên cứu kèm theo

`plans/devops-learning-platform/reports/2026-09-08-p14-k8sgames-ui-study.md` (đang
viết) đo bố cục, tương tác, bảng màu và phím tắt của bản gốc. Đọc nó trước khi
chốt kích thước và hành vi cụ thể. Ta lấy **cấu trúc**, không lấy mã và không lấy
bảng màu — thương hiệu ta là ĐỎ, chữ tiếng Việt, và ta có cổng a11y mà họ không có.
