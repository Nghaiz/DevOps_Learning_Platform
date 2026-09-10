# Lane 16.E — trang chủ 3D

**Ngày:** 2026-09-10 · **Nhánh:** `feat/p16-e-home3d` · **Nền:** `feat/p16-frontend-rebuild` @ `92804b7`
**Worktree:** `D:/NCKH/wt-p16-e` · **6 commit, 17 file, +1799 / -104**

---

## 1. Cổng, đo thật

```
pnpm -w turbo run build lint typecheck test
Tasks:    32 successful, 32 total
```

Dòng `Tasks:` đọc TRƯỚC mọi con số test, vì turbo dừng sau task đỏ và một báo cáo
trích số từ lượt đỏ là báo cáo về một suite chưa chạy. Lượt này 32/32 nên mọi số dưới
đây là số của một suite đã chạy hết, và nó bao gồm cả `next build` của `apps/web`.

| Gói | Test | Trạng thái |
|---|---|---|
| `@devops-platform/web` | 1721 passed (1721) | xanh, gồm cả `next build` |
| `@devops-platform/ui` | 858 passed (858) | xanh |
| `@devops-platform/games` | 402 passed (402) | xanh |
| `@devops-platform/scenario` | 285 passed (285) | xanh |
| `@devops-platform/terminal` | 133 passed (133) | xanh |
| `@devops-platform/motion` | 110 passed (110) | xanh |
| `@devops-platform/copy` | 52 passed (52) | xanh |
| `@devops-platform/shared-types` | 48 passed (48) | xanh |

```
node scripts/check-design-tokens.mjs
✓ đối chứng: bắt đủ 13 mẫu màu cứng, không kêu trên 20 mẫu sạch
✓ không có màu cứng — đã quét 552 file trong 4 vùng, 4 file miễn trừ có ghi lý do
```

Lane này thêm **27 ô** (`copy-gate.test.ts` 5, `loop-story.test.ts` 22).

⚠ **Con số 1695 mà lead đưa làm nền KHÔNG phải nền của worktree này.** Nó đến từ cây
của lane 16.G1, và cây đó đã chở test mới của chính 16.G1. Nền thật của lane này là
`92804b7`; tôi không đo lại nền đó (một lượt turbo nữa trên cây sạch) vì đã chạm điều
kiện thoát ngân sách. Ai cần đối chiếu chính xác thì `git stash` rồi chạy một lượt.

### Bẫy môi trường, đã ăn một lượt

Lượt turbo đầu tiên ra `Tasks: 29/31` với **121 ô đỏ** và **71 ô SKIP**. Cả 23 file đỏ
nằm trong `src/security/**` và `src/server/**` (integration, cần Postgres/Redis/env);
**không file nào** nằm trong glob của lane này. Nguyên nhân: `git worktree add` không
mang `.env` và `apps/web/.env` sang, vì `.gitignore:50` khớp `*.env`. Lead vá bằng cách
đặt hai file vào worktree, và lượt chạy lại ra 32/32.

Cái đáng ghi không phải 121 ô đỏ mà là **71 ô lặng lẽ SKIP**: đọc cột passed/failed mà
không đọc TỔNG thì lượt đó trông như "gần xanh". Trước khi vá, tôi đã chứng minh 23 file
đó không dính tới mã của mình bằng cách grep xem có file nào trong `src/security` và
`src/server` import vùng tôi sửa (`marketing`, `home-cta`, `opengraph`, `surfaces/home`,
`'home.`) — kết quả rỗng.

---

## 2. Bảng commit

| SHA | Nội dung |
|---|---|
| `aecafce` | `feat(copy)`: surface `home.` — bảy chặng, hero, CTA, bốn ô số liệu, ba bước, ảnh OG |
| `9351005` | `feat(web)`: dải bảy chặng, cảnh 3D nạp sau ba cổng |
| `70ad583` | `feat(web)`: trang chủ đi qua `packages/copy` trọn vẹn, luận điểm lên bốn |
| `21f7766` | `test(web)`: cổng T4 cho glob lane, cộng ô gác ba quả mìn của cảnh 3D |
| `7c7d9e3` | `refactor(web)`: log trang chủ nói tiếng Anh như mười một tag còn lại |
| `2e476cb` | `fix(copy)`: nhãn vị trí chặng về tiền tố `home.stage`, giữ `home.loop` ở hai khoá |

---

## 3. Từng khoản của §16.E

| Khoản | Trạng thái | Bằng chứng |
|---|---|---|
| Bảy chặng theo design §7 | XONG | `loop-stages.ts` (`STAGES`), chữ ở `surfaces/home.ts` |
| Không `ScrollControls` | XONG, có cổng | `loop-story.test.ts` quét tĩnh: không import gì từ `@react-three/drei` |
| Cuộn tài liệu gốc, ghi vào `ref`, `useFrame` đọc `ref` | XONG | `loop-story-client.tsx` `read()` ghi `progressRef`; không `useState` trên đường giá trị mỗi khung |
| `frameloop="demand"` + `invalidate()` mỗi lượt cuộn | XONG, có cổng | `loop-scene.tsx`; ô test khớp `frameloop="demand"` |
| Không `<Text>` của drei | XONG, có cổng | cùng ô cấm cả gói drei; chữ chặng là chữ DOM |
| Không Draco / KTX2 / meshopt | XONG, có cổng | ô test cấm `DRACOLoader\|KTX2Loader\|MeshoptDecoder\|.ktx2\|.drc` |
| Canvas không phải phần tử LCP | XONG | ba cổng: WebGL2 → `IntersectionObserver` → `requestIdleCallback`; `LoopStory` đặt sau dải số liệu |
| `next/dynamic` `ssr:false` gọi trong component `'use client'` | XONG, có cổng | ô test khớp cả `'use client'` lẫn `ssr: false` |
| `failIfMajorPerformanceCaveat: true` | XONG, có cổng | ô test bắt đúng ĐỐI SỐ gửi đi, không chỉ đọc chú thích |
| Cảnh không-WebGL dựng từ server, cùng thứ tự | XONG | bảy thẻ là HTML server luôn có mặt; canvas là lớp `aria-hidden` phủ lên |
| Cổng reduced-motion mức JS | XONG, có cổng | `startGatedFrameLoop` (ngừng cấp khung) + `snapProgress` (bám chặng) |
| Mọi chuỗi qua `packages/copy` | XONG, có cổng | `copy-gate.test.ts` (T4 trên glob lane, có T0 và đối chứng hai chiều) |
| Không màu trần, không `—` | XONG | cổng token 552 file; T1a của gói copy |

### Chưa làm, nói rõ

- **Ngân sách LCP cho `/` (§7 ô 10 của toàn chặng).** Không thuộc lane này: nó nằm trong
  `apps/web/e2e/**`, sở hữu của 16.I. Cấu trúc đã dọn sẵn cho ô đó (canvas không bao giờ
  là LCP), nhưng **chưa có số đo nào**, và "không có cổng" không phải "đã đạt".
- **Chưa mở cảnh trên một trình duyệt thật.** Toàn bộ nghiệm thu của lane là typecheck,
  lint, unit và `next build`. Cảnh 3D chưa từng được VẼ ra một lần nào. Hình học, tỉ lệ
  camera, và nhịp chặng sáu là những thứ chỉ mắt mới phán được, và chúng có thể sai mà
  không ô nào đỏ. Đây là khoản dở lớn nhất của lane.
- **Chưa tái hiện `securitypolicyviolation`.** Design §7.2 nói cơ chế của `<Text>` thì
  chắc chắn, còn việc probe của troika có thật sự bắn sự kiện thì chưa đo. Tôi TRÁNH
  `<Text>` hoàn toàn nên không cần biết câu trả lời, nhưng cũng không đóng được câu hỏi
  đó hộ ai. Bộ thu của `csp.spec.ts` (16.I) là chỗ đo.
- **Hậu kỳ (`postprocessing`) chưa dùng.** Gói đã cài, cảnh không gọi. Bloom ở chặng bảy
  sẽ đẹp hơn, nhưng nó là pass thứ hai và design §7.3 nói pass hậu kỳ là một trong ba thứ
  cắn ngân sách trước tiên. Để lại cho lượt có số đo.

---

## 4. Quyết định đáng tranh luận

### 4.1 Import bộ phân giải màu từ `k8s-arena`, một module NGOÀI phạm vi P16

`scene-colors.ts` import `createCanvasColorResolver` từ
`components/k8s-arena/shared/scene-tokens.ts`. Đó là một phụ thuộc đi qua ranh giới mà
P16 cố ý vẽ (`phase-16.md` §1: "Trừ `apps/web/src/components/k8s-arena/**`").

Chọn vậy vì bản kia đã giải xong hai bẫy mà một bản viết lại gần như chắc chắn dẫm phải:
`getPropertyValue('--primary')` trả lại chuỗi `oklch(...)` chứ không phân giải, và
`THREE.Color.setStyle` không hiểu `oklch()` nên nó cảnh báo rồi GIỮ MÀU CŨ (cả cảnh ra
trắng, không lỗi nào); rồi cả `getComputedStyle(el).color` cũng không chắc trả `rgb()`,
vì CSS Color 4 serialize lại màu trong chính không gian đã khai. Đường duy nhất đúng là
vẽ lên canvas 1x1 rồi đọc BYTE.

Chép 60 dòng đó sang đây là dựng bản sao của phần dễ sai nhất. Hàm được import là hàm
THUẦN, chỉ nhận một `Document`, không mang ngữ nghĩa arena, và không kéo runtime nào của
`@devops-platform/games` (khoá bên đó là `import type`). Bảng token thì lane này khai
RIÊNG bảy dòng, không dùng bảng 26 dòng của arena.

**Rủi ro nếu ai đó không đồng ý:** arena vào phạm vi ở chặng sau và bị refactor, trang
chủ gãy theo. Đường lùi rẻ: chuyển `createCanvasColorResolver` lên một chỗ trung lập
(`lib/`), một lượt di chuyển file.

### 4.2 Luận điểm từ ba lên bốn

Chú thích của `value-props.tsx` bản cũ tự khai "ba luận điểm" — đúng hình dạng mà luật
giọng văn số 5 tồn tại để chặn. Luận điểm thứ tư ("không cài gì trên máy bạn") không
phải chữ độn: nó là câu trả lời cho phản đối đầu tiên của người mới, và trước đây bị
chôn trong thân bước một của dải "Bắt đầu thế nào". Kéo theo một sửa: bước một nay nói
việc của chính nó (phiên gắn với tài khoản) thay vì lặp lại luận điểm thứ tư.

Lưới đổi từ ba cột sang bốn cột ở `min-[1024px]`, hai cột ở `sm`. Không dùng lưới ba cột
cho bốn thẻ: một thẻ lẻ ở hàng dưới đọc ra là kém quan trọng hơn ba thẻ trên.

### 4.3 Ba bước GIỮ con số ba, và khai miễn trừ

`home.step-title.*` và `home.step-body.*` mỗi nhóm đúng ba, khai hai dòng trong
`homeIntentionalThree` với căn cứ ở `apps/web/src/proxy.ts:163`: có đúng một cổng đăng
nhập trước mọi đường nội dung, nên chuỗi việc từ lúc mở trang tới lúc gõ được lệnh là
đăng nhập, chọn nội dung, vào phiên chạy. Bỏ cổng đó đi thì nhóm còn hai bước.

Hai nhóm tách nhau (tiêu đề một nhóm, thân một nhóm) vì `groupBySiblingPrefix` gom theo
tiền tố bỏ phân đoạn CUỐI: đặt `home.step.signin.title` sẽ làm nhóm ba biến mất khỏi tầm
nhìn của T3. Cùng hình dạng `92804b7` đã dựng cho lane 16.C.

### 4.4 `jsx-text` chỉ áp cho `.tsx` trong cổng T4 của lane

`scanLatinLiteral` dò JSX text bằng `>([^<>]*)<`. Trong một file `.ts` thuần, mẫu đó khớp
mọi đoạn giữa một mũi tên hàm và một dấu mở generic: `catalog-stats.server.ts` bị báo MỘT
vi phạm dài 18 dòng chở cả thân hai hàm, không có ký tự JSX nào trong đó.

Lọc theo đuôi file là thu hẹp CHÍNH XÁC (một file `.ts` không biên dịch nổi JSX nên không
có `jsx-text` thật để bỏ sót), và `string-literal` KHÔNG bị lọc. Có đối chứng dương riêng
cho phép lọc: bộ dò vẫn phải báo `jsx-text` trên một mẩu `.tsx`.

**Cái giá nói ra:** một chuỗi người dùng đọc viết dưới dạng JSX trong file đặt sai đuôi sẽ
đi lọt. Đổi lại, không lọc thì cổng báo động giả 100% trên mọi file `.ts` của lane, và
một cổng như thế bị tắt trong hai tuần.

### 4.5 Ba chuỗi log đổi từ tiếng Việt sang tiếng Anh

`catalog-stats.server.ts` có `console.error('[trang-chủ] ...')` và một
`throw new Error('nguồn nội dung không dựng được')`. Cổng T4 bắt cả ba, và T4 không phân
biệt được chữ cho người vận hành với chữ cho người dùng.

Không nới cổng. Đổi chúng sang tiếng Anh, vì đó là chữ cho người vận hành đọc trong
console, và vì `[trang-chủ]` là tag log tiếng Việt DUY NHẤT trong cả app: mười một tag
còn lại là `[trpc]`, `[redis]`, `[auth]`, `[grpc:orchestrator]`... Đổi là khôi phục quy
ước, không phải phá nó. `throw new Error(...)` kia là sentinel nội bộ, bị `counted()` bắt
ngay tại chỗ và không tới được người dùng.

### 4.6 Canvas mang `aria-hidden`, và bản đồ chữ KHÔNG có khoá mô tả cảnh

Bản nháp có `home.loop.scene-label` cho trình đọc màn hình. Bỏ đi: cảnh không chở thông
tin nào mà bảy thẻ bên cạnh không có, nên một mô tả thứ hai là chữ đọc THỪA.

Việc bỏ nó làm nhóm `home.loop` tụt từ bốn khoá xuống ba, và **cổng T3 đỏ đúng lúc đó** —
lần duy nhất cổng bắt được lỗi thật của lane này. Cách sửa là xem lại chỗ đứng của khoá
(`home.loop.stage-position` → `home.stage.position`, vì nó là nhãn của một CHẶNG chứ
không phải chữ của dải), không phải thêm một dòng miễn trừ cho một con số ba vô nghĩa.

---

## 5. Thứ KHÔNG tìm thấy, kèm phạm vi đã tìm

- **Không có nơi trung lập nào đã sẵn có cho bộ phân giải màu token.** Tìm bằng
  `grep -rn "getPropertyValue\|getComputedStyle" apps/web/src packages/*/src`: 10 kết
  quả, tất cả nằm trong `k8s-arena/**`, `packages/games`, hoặc file test của
  `packages/ui`. Không có `lib/` dùng chung nào. Đó là lý do §4.1 phải chọn giữa import
  qua ranh giới và chép.
- **`packages/copy/src/surfaces/shell.ts` chưa có khoá nào.** `grep -oE "^  '[a-z0-9.-]+':"`
  trên `common.ts` và `shell.ts` cho 35 khoá, toàn bộ từ `common.ts`. Nên tên sản phẩm
  ("DevOps Learning Platform") chưa có chỗ dùng chung; lane này giữ nó ở `home.og.title`.
  Khi 16.B dựng vỏ, hai bên sẽ có hai bản của cùng một tên. Nói ra để lead quyết chỗ
  gộp, không tự chuyển vì `common.ts` là file của L0.
- **Không có cổng kích thước bundle nào trong repo.** Đã tìm ở `.github/workflows/`,
  `turbo.json`, `apps/web/package.json`. Nên chunk `three` + `@react-three/fiber` mà lane
  này thêm vào **không có phép đo nào chặn**. Nó nạp lười (`next/dynamic` `ssr:false` sau
  ba cổng) nên không vào bundle của lượt tải đầu, nhưng "nạp lười" không phải "đã đo".
  Trùng với khoản đã ghi ở `phase-16.md` §8.

---

## 6. File

### Đã chạm (17)

```
packages/copy/src/surfaces/home.ts                        (+195/-9)
apps/web/src/app/page.tsx                                 (+13/-2)
apps/web/src/app/home-cta.tsx                             (+23/-8)
apps/web/src/app/opengraph-image.tsx                      (+14/-3)
apps/web/src/components/marketing/hero.tsx                (+16/-9)
apps/web/src/components/marketing/value-props.tsx         (+76/-40)
apps/web/src/components/marketing/getting-started.tsx     (+45/-25)
apps/web/src/components/marketing/catalog-stats.tsx       (+48/-30)
apps/web/src/components/marketing/catalog-stats.server.ts (+6/-3)
apps/web/src/components/marketing/loop-stages.ts          MỚI
apps/web/src/components/marketing/webgl-support.ts        MỚI
apps/web/src/components/marketing/scene-colors.ts         MỚI
apps/web/src/components/marketing/loop-scene.tsx          MỚI
apps/web/src/components/marketing/loop-story-client.tsx   MỚI
apps/web/src/components/marketing/loop-story.tsx          MỚI
apps/web/src/components/marketing/copy-gate.test.ts       MỚI
apps/web/src/components/marketing/loop-story.test.ts      MỚI
```

**Không có `index.ts` gom trong `components/marketing/`**, và đó là điều kiện chứ không
phải sở thích: `catalog-stats.tsx` kéo `catalog-stats.server.ts`, thứ import `pg`/drizzle.
Một barrel gom chung sẽ khiến bất kỳ Client Component nào lỡ import từ đó kéo `node:*` vào
bundle trình duyệt, và hỏng chỉ lộ ở `next build` sau khi typecheck, lint, test đều xanh.

### Cố ý KHÔNG chạm

`globals.css`, `layout.tsx`, `packages/ui/**`, `packages/motion/**`,
`packages/copy/src/registry.ts`, mọi `surfaces/*.ts` khác `home.ts`, `components/shell/**`,
`components/session/**`, `components/k8s-arena/**` (chỉ ĐỌC một hàm, không sửa dòng nào),
`e2e/**`.

Hai thứ nhìn thấy mà không tự sửa:

1. **`Card` mặc định vẫn `shadow-sm`.** Ba dải của trang chủ đều đè `shadow-elevation-1`
   tại chỗ gọi. Chỗ đúng là `packages/ui/src/card.tsx`, file của lane khác. Ghi chú này đã
   có từ lượt trước và vẫn chưa được đóng.
2. **`t()` gọi được từ Server Component lẫn Client Component mà không có gì gác chiều
   phụ thuộc.** `packages/copy` không khai `dependencies` (hợp đồng §1.8) nên nó an toàn
   hôm nay, nhưng không có ô test nào khẳng định điều đó sẽ còn đúng.
