# P13 — lượt e2e trên cụm thật, DỪNG GIỮA CHỪNG theo lệnh điều phối

- Ngày: 2026-09-06, giờ lấy TỪ TRONG VM (`ssh nghaiz@192.168.94.130 date -Is`).
- Đích: `https://dlp.192.168.94.130.sslip.io:30443` (Traefik NodePort 30443).
- Ảnh đang chạy: `dlp-web:p13`, `dlp-orchestrator:p13`, `dlp-terminal-gateway:p13`.
- Cờ: `E2E_REQUIRE_ROLES=1` **và** `E2E_REQUIRE_SESSION=1` ở MỌI lượt (§3ter-7).
- Tài khoản: `e2e-p13-1788710012@dlp.local`, đăng ký qua `/api/auth/sign-up/email`
  kèm header `Origin`, rồi `promote-role.sh … author` → `… admin`.
  `global-setup` đọc lại từ `/api/auth/get-session`: **role=admin** (không phải điều ta mong,
  là điều server nói). `roleSatisfies` cho admin bao hàm author ⇒ một tài khoản phủ cả hai.

**DỪNG lúc 23:15:21 (VM).** Năm lane UI bắt đầu sửa `packages/ui` / `components/*` /
`app/page.tsx`, nên mọi ô đỏ sau mốc này không phân biệt được lỗi thật với lane khác vừa
commit. `keyboard`, `perf`, và SÁU luồng `@flow` **CHƯA CHẠY LẦN NÀO**.

## Bảng tổng kết

| suite | passed | failed | skipped | ghi chú |
|---|---:|---:|---:|---|
| `a11y.spec.ts` (đủ 22 màn + 2 đối chứng) | 20 | 5 | 0 | không dính rate limit |
| `csp.spec.ts` — lượt giãn nhịp (SSOT) | 14 | 12 | 1 | 6 mẻ, nghỉ 80s giữa mẻ |
| `csp.spec.ts` — lượt 1, chạy liền sau a11y | 10 | 17 | 0 | 14/17 đỏ vì **429**, bỏ |
| `csp.spec.ts` — lượt 2, chạy liền | 9 | 18 | 0 | 15/18 đỏ vì **429**, bỏ |
| `keyboard.spec.ts` | — | — | — | **CHƯA CHẠY** |
| `perf.spec.ts` | — | — | — | **CHƯA CHẠY** |
| 6 luồng `@flow` | — | — | — | **CHƯA CHẠY** |

Lượt csp "giãn nhịp" là con số dùng được; hai lượt chạy liền chỉ để chứng minh chuyện
rate limit tái hiện được, đừng trích chúng như phép đo chất lượng.

## §3ter-8 — HAI Ô ĐÃ CHẠY VÀ ĐỀU XANH

| ô | kết quả | lặp lại |
|---|---|---|
| `nonce › script khởi tạo theme mang ĐÚNG nonce của header CSP` | **PASS** | 3/3 lượt |
| `nonce › CSP khai frame-src tường minh (D8)` | **PASS** | 3/3 lượt |

Ba đối chứng dương của máy thu CSP cũng xanh 3/3, gồm
`iframe origin KHÁC bị chặn (D8: frame-src)` — tức `frame-src 'self'` vừa được KHAI vừa
được THỰC THI, không phải chỉ có mặt trong header.

## Ràng buộc thật: `csp.spec.ts` tự chạm trần rate limit

- Tier `ratelimit-web` = **average 120 / 1m, burst 60**, Traefik đếm **theo IP nguồn**
  (`infra/helm/platform/values.yaml:488-500`). Harness = một IP = một bucket.
- `csp` chạy ~2-3s/màn ⇒ **~9 màn thì hết ngân sách**. Cả hai lượt chạy liền đều
  bắt đầu 429 quanh test #10 và tự hồi ở test #27 (`/admin/audit` xanh trở lại) —
  tức là trần theo NHỊP, không phải một sự cố nhất thời.
- `a11y` **không** dính, vì axe quét ~7s/màn nên tự giãn nhịp: 22 màn trong 3.7 phút,
  0 lần 429. Đây là lý do hai suite cùng đi qua 22 màn mà chỉ một cái đỏ.
- Đã đo hai dạng 429: `→ HTTP 429` (điều hướng bị Traefik chặn) và
  `procName: "too_many_requests"` (lời gọi tRPC bị chặn). Dạng thứ hai đọc ra như
  lỗi ứng dụng nếu không biết trước.

**Giãn nhịp có tác dụng:** chia 6 mẻ, nghỉ 80s giữa mẻ ⇒ **0 lần 429** trên cả 27 test.
Kịch bản đã dùng: `scratchpad/csp-paced.sh` (KHÔNG sửa spec, chỉ `--grep` + `sleep`).

## Ô ĐỎ THẬT — dữ liệu, không phải sự cố môi trường

### 1. `script-src: eval` — 8 màn hình (mới, chưa có trong §3ter)
`/lessons`, `/labs`, `/playgrounds`, `/paths`, `/quiz`, `/author`, `/author/new`, và
`/admin/content` (bắt được ở lượt 2). KHÔNG xuất hiện trên `/`, `/login`, `/me`,
`/settings`, `/admin`, `/admin/users`, hay bất kỳ trang chi tiết `:id` nào.

Đã loại một giả thuyết: grep toàn bộ `.next/static` trong pod web ra **0** lời gọi
`eval(` / `new Function(`. Chuỗi `eval` duy nhất tìm được nằm trong danh sách CHẶN của
một bộ deserialize (`case "eval": throw TypeError`) — nó ném, không gọi. Nguồn thật
chưa truy ra; cần đọc `sourceFile`/`lineNumber` của sự kiện
`securitypolicyviolation` (máy thu hiện chỉ giữ `blockedURI` + `sample`).

### 2. a11y — 3 vi phạm serious trên 2 màn
- `/lessons/:id`: `aria-progressbar-name` (progressbar `.h-1\.5` không có tên) và
  `scrollable-region-focusable` (`pre` cuộn được nhưng không vào được bằng bàn phím).
- `/labs/:id`: `scrollable-region-focusable` trên `pre`.

### 3. Danh mục RỖNG trên cụm ⇒ 3 lớp route chưa từng được audit
`kubectl exec deploy/platform-postgres` đếm trực tiếp:

    learning_paths | 0
    quizzes        | 0
    quiz_questions | 0
    content_items  | 0
    users          | 243

Nên `/paths/:id`, `/quiz/:id`, `/author/:id` **không mở được** — cả a11y lẫn csp đều
chưa có verdict cho ba route này. Đây là thiếu DỮ LIỆU trên cụm, không phải lỗi mã.
`lessons`/`labs`/`playgrounds` chạy được vì nội dung nạp từ image, không từ DB.

### 4. Lỗi harness đã chứng minh (chưa sửa, chờ chủ dự án)
`firstItemId()` (`e2e/fixtures/api.ts:96`) giả định mọi `*.list` trả `{items:[…]}`.
Đo bằng curl trên cụm:

    lessons.list     → {"items":[…]}            ✓
    labs.list        → {"items":[…]}            ✓
    playgrounds.list → {"items":[…]}            ✓
    paths.list       → {"items":[],"limit":1,"nextCursor":null}
    quiz.list        → {"items":[],"limit":1,"nextCursor":null}
    authoring.list   → []                       ← MẢNG TRẦN

⇒ `firstItemId(api,'authoring.list')` **luôn** ném `TypeError: Cannot read properties of
undefined (reading '0')`, bất kể có nội dung hay không. Nó che mất thông báo đúng
("authoring.list trả 0 mục") bằng một TypeError khó đọc. Sửa nó KHÔNG làm ô xanh —
`content_items` đang 0 — nên đây là hai lỗi chồng nhau, không phải một.
**Chưa sửa**: lượt này là nghiệm thu, không đổi harness giữa phép đo.

Ghi chú kèm: `phase-13-exec.md` §1 D9 nói "`list()` cũ giữ cho `paths` và `authoring`".
Đo được là `paths.list` ĐÃ chuyển sang dạng phân trang; chỉ `authoring` còn mảng trần.

### 5. Trình duyệt sập ở mẻ b6
`/admin/sessions` → `browserContext.newPage: Target crashed`;
`/admin/content` → `worker process exited unexpectedly (code=3221225794)`;
`/admin/audit` → **skipped** vì worker đã chết. Ba màn admin này **không có verdict csp**.
Node lúc đó: load average 12.95 (1m) / 16.11 (5m) trên 8 core, PSI cpu some avg10 43.9%.

## Ô CHƯA ĐÓNG (không phải ô xanh)

1. `keyboard.spec.ts` — 3 ô D10 (Esc Esc rời terminal) chưa chạy.
2. `perf.spec.ts` — **chưa có số LCP nào**, nên chưa đề xuất được `LCP_BUDGET_MS`.
3. Sáu luồng `@flow` chưa chạy ⇒ bốn `annotations` (leaderboard · lộ trình khoá ·
   giải thích quiz · nút "Kết thúc" của admin) chưa đọc được.
4. §3ter-17 (D15 admin kết thúc phiên người khác, đọc `admin_audit`) — phép đo TAY,
   chưa làm.
5. §3ter-9 (chạy lại pentest 3.E) — chưa làm.
6. csp cho `/paths/:id`, `/quiz/:id`, `/author/:id` — chặn bởi danh mục rỗng.
7. csp cho `/admin/sessions`, `/admin/content`, `/admin/audit` — chặn bởi crash trình duyệt.

## Tải node lúc đo (không nới timeout, chỉ ghi số)

| mốc (giờ VM) | load 1m/5m/15m | ghi chú |
|---|---|---|
| 22:53:09 | 11.48 / 8.15 / 9.36 | trước lượt đầu; PSI cpu some avg10 43.9% |
| 23:04:30 | 12.95 / 16.11 / 14.16 | trước lượt csp thứ 2 |

8 core, 11.9 GiB RAM, 1.0 GiB free + 6.4 GiB buff/cache. Tải đến từ control-plane
(kube-apiserver, etcd, promtail, containerd), không từ pod sandbox — warm pool 3 pod,
không pod nào chiếm CPU. Cao hơn hẳn con số 6.26 lúc bàn giao.

## Không có thay đổi mã

`git status --short` chỉ có `?? reports/`. Không file nào trong `apps/web/` bị sửa,
nên **không có commit nào** cho lượt này. Kịch bản giãn nhịp nằm ở scratchpad, cố ý
không đưa vào repo cho tới khi chủ dự án quyết cách giãn nhịp chính thức.
