# Phase 13 — Kế hoạch thực thi (exec plan)

**Ngày:** 2026-09-04 · **Nhánh:** `feat/p13-frontend` (chồng lên `feat/p12-scale-proof`, vì P12 chưa merge và các fix hạ tầng của nó đang chạy trên cụm) · **Plan gốc:** [`phase-13.md`](phase-13.md)

Tài liệu này là **hợp đồng** giữa các lane chạy song song. Mọi sub-agent đọc đúng
mục lane của mình + §2 (hợp đồng) + §4 (kỷ luật git). Không lane nào được sửa
hợp đồng; thấy hợp đồng sai thì **báo lead**, không tự đổi.

## 0. Hiện trạng đo được (scout 2026-09-04, khác với giả định của plan gốc)

| Plan gốc nói | Thực tế |
|---|---|
| "6 route, 7 component" | **13 route** đã có: `/`, `/login`, `/dashboard`, `/session`, `/lessons`, `/lessons/[id]`, `/labs`, `/labs/[id]`, `/playgrounds`, `/playgrounds/[id]`, `/paths`, `/paths/[id]`, `/quiz/[id]`, `/me`. **Chưa có:** `/author/**`, `/admin/**`, `/settings`. |
| `apps/web/tailwind.config.*` | **Không tồn tại.** Tailwind v4 CSS-first: `globals.css` = `@import 'tailwindcss'` + 2 `@source`. Token sẽ là `@theme` trong `globals.css`. |
| Hệ thiết kế | 0 token, 0 dark mode, 0 `next/font`, 0 shadcn/radix/cva/lucide. Bảng màu là `slate-*` trần. |
| e2e "khuôn 2.D" | Là **script Node thuần** (`reports/harness/2026-08-13-2d-lessons-e2e/e2e-lessons.mjs`), không phải Playwright. `apps/web/e2e/`, `playwright.config`, `@playwright/test`, axe: **đều chưa có**. |
| `interfaceLayout === 'ide'` | FE **chưa đọc** field này. Route IDE của gateway là `/ide/session/{id}/` nhưng (a) ingress chưa có path `/ide`, (b) cookie `dlp_sandbox` có `Path=/ws` nên trình duyệt sẽ không gửi tới `/ide`. |
| "còn N chỗ" | Không có endpoint. Chỉ có gauge Prometheus `dlp_pool_claimed_size`. Mẫu số **20** (không phải 23) — `values-selfhost.yaml` L317-318. |
| Quản trị | Không có `admin` router, `adminProcedure`, bảng audit hành động user, cách liệt kê phiên đang chạy (state chỉ ở Redis). |
| Hồ sơ | Không có bảng tuỳ chọn; theme terminal chỉ ở localStorage và chỉ trên `/session`; hiện tên leaderboard là per-attempt (`lab_attempts.display_name_public`). |
| Chọn shell | `GATEWAY_EXEC_COMMAND` là **hằng phía server theo hợp đồng bảo mật §3c** (client không được chọn lệnh). Không mở đường client→gateway. |

## 0bis. Nhánh đã đổi dưới chân đợt 1 (cập nhật 2026-09-06)

**P12 đã ĐÓNG (2026-09-05/06) và năm commit kết thúc nó nằm CHỒNG LÊN chính nhánh
`feat/p13-frontend`**, phía trên đợt 1 P13 — không phải trên `feat/p12-scale-proof`
(nhánh đó nay đi sau). Nghĩa là nhánh này mang cả P12 hoàn chỉnh lẫn P13 đợt 1.

Giao nhau giữa hai khối chỉ đúng **một** file, `infra/helm/platform/values-selfhost.yaml`
(P12 đổi image tag orchestrator/gateway sang `p12fix`); các key P13 (`capacitySoftLimit`,
`orchestratorMetricsUrl`, `gatewayMetricsUrl`) và ingress `/ide` đều còn nguyên — đã kiểm.

P12 cũng thêm thứ đợt 2/3 phải biết: `services/orchestrator/internal/k8s/podspec.go`
(hostAliases vá treo OCI-referrers) và `services/terminal-gateway/internal/podexec/`
(podprobe + sửa mã đóng WS khi mất pod giữa phiên). Image đang chạy trên cụm là
`p12fix`, **xây tay ở máy dev rồi side-load**, không phải CI publish.

**Đợt 1 làm lại bằng Opus 5 xhigh (2026-09-06).** Bản đợt 1 đầu tiên chạy bằng Sonnet,
cả ba lane chạm trần lượt và commit không đều; chủ dự án yêu cầu rà soát lại toàn bộ
bằng model mạnh hơn trước khi mở đợt 2. Ba lane audit-rồi-sửa, cùng ranh giới sở hữu
file như bảng §3.

⚠ **Một số của D5 đang treo, chờ lane Go phán.** Report P12 §2.4 tự mâu thuẫn: vế (a)
bác công thức `trần = quota − poolTarget` rồi chốt FE dùng **20**; vế (b) lại dùng đúng
công thức đó ra **18** và gọi tên `no-derived-fields`. `capacitySoftLimit: '20'` hiện là
hằng số viết tay cạnh `poolTarget: '3'` — đổi một vế thì vế kia mục trong im lặng, mà
AC P13 đòi "còn N chỗ phản ánh trần THẬT". Kết luận của lane Go sẽ ghi đè mục D5 bên dưới.

## 1. Quyết định kiến trúc (chốt trước khi fan-out)

- **D1 Token.** CSS variables (oklch) trong `apps/web/src/app/globals.css`: `:root` (sáng) + `.dark` (tối) + `@theme inline` ánh xạ sang `--color-*`, `--radius-*`, `--font-*`. `@custom-variant dark (&:where(.dark, .dark *))`. Một nguồn; JSX chỉ dùng class ngữ nghĩa (`bg-background`, `text-muted-foreground`, …). Grep AC: không `#hex` và không `slate-|gray-|zinc-` trong JSX sau 13.A.
- **D2 Dark mode.** Class `dark` trên `<html>`; giá trị `'light'|'dark'|'system'` lưu `localStorage['dlp.theme']`; script inline **có nonce** trong `layout.tsx` đặt class trước paint (CSP đã có nonce + `strict-dynamic`). `ThemeProvider`/`useTheme()` export từ `packages/ui`. Terminal đi theo: `resolved === 'dark' ? 'dlp-dark' : 'dlp-light'` trừ khi người dùng đã chọn theme terminal riêng (hồ sơ 13.E).
- **D3 Font.** `next/font/google` `Be_Vietnam_Pro` subsets `['latin','vietnamese']` weights 400/500/600/700, biến `--font-be-vietnam-pro`; mono giữ stack hệ thống + `DLPTerminalNF` trong terminal. `next/font` tự host ⇒ `font-src 'self'` không đổi. Build cần internet để tải font (CI và máy build image đều có).
- **D4 Component.** `packages/ui` theo shadcn/ui trên `radix-ui` (gói hợp nhất) + `class-variance-authority` + `lucide-react`. Toast dùng Radix Toast (không thêm sonner). Mỗi component có trạng thái loading/empty/error/disabled **khi áp dụng được** và bảng checklist trong `docs/design-system.md`.
- **D5 Sức chứa.** RPC mới `GetCapacity` ở orchestrator (đọc `pool:claimed` + env **`CAPACITY_HARD_LIMIT`**), tRPC `capacity.get`. FE tự tính `còn = max(0, soft − active)`; không lưu, không cache riêng. ⚠ **Đã sửa 2026-09-06:** dòng này từng ghi `CAPACITY_SOFT_LIMIT`, biến đã BỎ. Trần mềm nay được TÍNH (`hard − POOL_TARGET`), không khai tay — ai làm theo bản cũ sẽ đặt một biến mà chart không còn nhận, và orchestrator fail-fast.
- **D6 Phiên đang chạy (me + admin).** RPC mới `ListSessions` ở orchestrator (lọc theo `user_id` tuỳ chọn; admin không lọc). Cùng RPC phục vụ `/me` (phiên của tôi) và `/admin` (mọi phiên).
- **D7 Shell mặc định.** KHÔNG cho client chọn lệnh. BFF áp dụng tuỳ chọn **server-validated** (enum → đường dẫn cố định) bằng one-shot script qua đường `runScriptInSession` đã có, **trước khi** trả kết quả start về FE (tmux tạo session ở lần attach đầu, attach xảy ra sau khi FE nhận response). Pod chưa được cấp lúc start (cold path) ⇒ bỏ qua có log + `preferencesApplied:false` trong response; UI hồ sơ nói rõ điều này.
- **D8 IDE trong iframe.** Cùng origin: `src="/ide/session/{id}/"`. Cần (a) ingress path `/ide` → gateway (Helm), (b) cookie thứ hai cùng tên `dlp_sandbox` với `Path=/ide` (cookie phân biệt theo (name, path); token vẫn KHÔNG tới `/`, `/api`). CSP: `default-src 'self'` đã phủ `frame-src` cùng origin — **thêm `frame-src 'self'` tường minh** để ai đọc CSP cũng thấy quyết định, và đối chứng dương phải chứng minh iframe origin khác BỊ chặn.
- **D9 Phân trang ở tầng nguồn.** `ScenarioSource.listPage`/`ContentSource.listLabsPage`/`listPlaygroundsPage` với cursor = `id` cuối, thứ tự `id asc` ổn định ở mọi nguồn. DB: `WHERE id > $cursor … ORDER BY id LIMIT n+1`. Composite: k-way merge theo `id`, đĩa thắng DB khi trùng. Lọc `difficulty`/`tier` là **tham số server**, áp trước khi merge. `list()` cũ giữ cho `paths`/`authoring`.
- **D10 Thoát terminal bằng bàn phím.** `Esc` đơn là phím thật của terminal (vim). Quy ước: **`Esc` hai lần trong ≤500ms** rời focus ra phần tử kế tiếp; gợi ý "Esc Esc để rời khỏi terminal" hiện **luôn**, chỉ ĐẬM LÊN khi terminal có focus (`group-focus-within:`) — ĐÃ SỬA 2026-09-06 cho khớp mã. Bản cũ ghi "khi focus thì hiện", tức chữ nhảy ra lúc focus: việc đó đổi chiều cao khoang, `ResizeObserver` của xterm bắn, và terminal fit lại đúng giây người dùng vừa bấm vào. Mã cố ý làm khác plan và có lý do ghi tại chỗ (`terminal-pane.tsx`); đừng đọc nó thành hồi quy. Container: `role="application"`, `aria-label`, `tabIndex=0`, vùng `aria-live="polite"` cho đổi pha phiên.
- **D11 Playwright.** `@playwright/test` + `@axe-core/playwright` trong `apps/web`. Env: `E2E_BASE_URL` (mặc định `https://dlp.192.168.94.130.sslip.io:30443`), `E2E_ORIGIN` (= `betterAuthUrl`), `ignoreHTTPSErrors`. Tài khoản: đăng ký mới mỗi lượt qua `/api/auth/sign-up/email` **kèm header `Origin`** (khuôn 2.D); tài khoản author/admin: promote bằng SQL trên VM (`kubectl exec postgres`) qua script `apps/web/e2e/scripts/promote-role.sh` — chỉ chạy tay/CI cụm, không có API. CI: job `web-a11y` chạy axe + đối chứng CSP trên `next start` local (Postgres+Redis, không sandbox) cho mọi route không cần phiên; 6 luồng `@flow` chạy trên cụm bằng tay và ghi vào report.
- **D12 Phạm vi màn hình chốt** (thêm màn hình ngoài danh sách phải hỏi chủ dự án): `/`, `/login`, `/lessons`, `/lessons/[id]`, `/labs`, `/labs/[id]`, `/playgrounds`, `/playgrounds/[id]`, `/paths`, `/paths/[id]`, `/quiz`, `/quiz/[id]`, `/me`, `/settings`, `/author`, `/author/[id]`, `/author/new`, `/admin`, `/admin/users`, `/admin/sessions`, `/admin/content`, `/admin/audit`. `/dashboard` và `/session` **gộp vào `/me`** (redirect 308). ⛔ Không màn hình/chuỗi nào về giá/gói/thanh toán.

## 1bis. Ba quyết định chốt sau đợt 1 (2026-09-06, chủ dự án duyệt)

- **D13 Đợt 2 tách làm hai.** **2a** = B (vỏ) · C (danh mục) · D1 (khung phiên C5 +
  lesson/playground + `packages/terminal`) · **Go2** (đường admin kết thúc phiên).
  **2b**, mở sau khi D1 đã commit C5 = D2 · E · F · G · H. Lý do: tám lane cùng ghi
  một cây là rủi ro va chạm, và bốn trình học đều đứng trên C5 — để D2/E/F/G viết theo
  hợp đồng trên giấy là mời một lượt tích hợp sai.
- **D14 `packages/terminal` thuộc lane D1**, làm ngay ở 2a, gồm cả **subpath export
  an toàn cho server**. Hiện `TerminalSurface` KHÔNG có `ariaLabel`, KHÔNG có
  `onEscapeFocus`, container không `role`/`tabIndex` — tức D10 chưa có nền nào. Và
  `apps/web/src/server/trpc/routers/me.ts` đang **chép tay** `THEME_NAMES` vì import
  package này từ mã server chết bằng `ReferenceError: self is not defined` (export `"."`
  kéo theo `@xterm/*`). Thêm `"./themes"` trỏ thẳng `src/themes.ts` rồi cho `me.ts` dùng
  lại — bỏ bản chép tay, vì nó sẽ mục lặng lẽ khi `themes.ts` đổi.
- **D15 Admin PHẢI kết thúc được phiên của người khác.** Hôm nay không:
  `reap.lua` chốt cứng `actor.userId === session.userId`, đường vòng `system_component`
  đòi mTLS với CN trong allowlist, nên admin bấm nhận `NOT_FOUND`. Lane **Go2** mở đường
  ở orchestrator (lua + handler), ghi audit **cả hai đầu** (orchestrator và `admin_audit`
  của BFF). Ô AC 13.G "phiên đang chạy (kết thúc được)" giữ nguyên, không hạ.

## 2. Hợp đồng tích hợp (verbatim — không lane nào được đổi)

### C1 — Token & theme (13.A phát hành, mọi lane tiêu thụ)

Tên biến CSS (`:root` và `.dark` đều định nghĩa đủ): `--background --foreground --card --card-foreground --popover --popover-foreground --primary --primary-foreground --secondary --secondary-foreground --muted --muted-foreground --accent --accent-foreground --destructive --destructive-foreground --success --success-foreground --warning --warning-foreground --border --input --ring --radius`. Class Tailwind tương ứng: `bg-background text-foreground bg-card border-border ring-ring text-muted-foreground bg-primary text-primary-foreground bg-destructive … rounded-lg (=var(--radius))`.

```ts
// packages/ui — export
export type ThemeChoice = 'light' | 'dark' | 'system';
export function ThemeProvider(props: { children: React.ReactNode; storageKey?: string }): JSX.Element; // storageKey mặc định 'dlp.theme'
export function useTheme(): { choice: ThemeChoice; resolved: 'light' | 'dark'; setChoice(c: ThemeChoice): void };
export const THEME_STORAGE_KEY = 'dlp.theme';
export const THEME_INIT_SCRIPT: string; // nội dung script inline đặt class trước paint; layout.tsx nhúng với nonce
```

### C2 — Component `packages/ui` (13.A phát hành)

Tất cả export từ `packages/ui/src/index.ts`. Tên và prop tối thiểu:

| Component | Prop bắt buộc / đáng chú ý |
|---|---|
| `Button` | `variant: 'primary'\|'secondary'\|'outline'\|'ghost'\|'destructive'\|'link'` · `size: 'sm'\|'md'\|'lg'\|'icon'` · `loading?: boolean` (disabled + spinner, giữ chiều rộng) · `asChild?` |
| `Input`, `Textarea` | `invalid?: boolean` → `aria-invalid` + viền destructive |
| `Label` | `htmlFor` |
| `Badge` | `variant: 'default'\|'secondary'\|'success'\|'warning'\|'destructive'\|'outline'` |
| `Card` + `CardHeader/CardTitle/CardDescription/CardContent/CardFooter` | giữ tương thích 3 export cũ |
| `Dialog` + `DialogTrigger/DialogContent/DialogHeader/DialogTitle/DialogDescription/DialogFooter/DialogClose` | Radix |
| `Tabs` + `TabsList/TabsTrigger/TabsContent` | Radix |
| `Select` + `SelectTrigger/SelectValue/SelectContent/SelectItem` | Radix |
| `DropdownMenu` + `…Trigger/…Content/…Item/…Separator/…Label` | Radix |
| `Tooltip` + `TooltipProvider/TooltipTrigger/TooltipContent` | Radix |
| `Switch`, `Checkbox`, `RadioGroup`+`RadioGroupItem` | Radix |
| `Toaster` + `useToast(): { toast(o: { title: string; description?: string; variant?: 'default'\|'success'\|'destructive' }): void }` | Radix Toast; `Toaster` đặt một lần ở shell |
| `Alert` + `AlertTitle/AlertDescription` | `variant: 'default'\|'warning'\|'destructive'\|'success'` · `role="alert"` cho destructive |
| `Skeleton` | `className` (kích thước) |
| `Spinner` | `size` |
| `Table` + `TableHeader/TableBody/TableRow/TableHead/TableCell/TableCaption` | bọc `overflow-x-auto` |
| `CursorPager` | `{ hasNext: boolean; onNext(): void; onReset(): void; page: number; loading?: boolean }` (cursor chỉ đi tới; "Về đầu" thay cho "Trước") |
| `EmptyState` | `{ icon?: ReactNode; title: string; description?: string; action?: ReactNode }` |
| `ErrorState` | `{ title?: string; message: string; onRetry?(): void; retrying?: boolean }` |
| `Separator`, `Kbd` | — |
| `ContentView`, `SplitPane`, `StepNav`, `ProgressBar` | giữ nguyên API, chuyển màu sang token |

Mỗi component có file test (vitest + RTL, jsdom) kiểm hành vi + trạng thái. `docs/design-system.md` có bảng checklist 4 trạng thái cho từng component.

### C3 — Proto (13.Go phát hành; BE1 tiêu thụ sau khi codegen commit)

Thêm vào `proto/orchestrator/v1/session.proto` (additive, buf breaking phải xanh):

```proto
rpc GetCapacity(GetCapacityRequest) returns (GetCapacityResponse);
rpc ListSessions(ListSessionsRequest) returns (ListSessionsResponse);

message GetCapacityRequest {}
message GetCapacityResponse {
  int32 active_sessions = 1;   // len(pool:claimed) — cùng nguồn với dlp_pool_claimed_size
  int32 soft_capacity   = 2;   // TÍNH LÚC ĐỌC = hard_capacity − POOL_TARGET. KHÔNG phải env.
  int32 pool_free       = 3;
  int32 pool_quarantine = 4;
  int32 hard_capacity   = 5;   // env CAPACITY_HARD_LIMIT — trần vật lý ĐÃ ĐO
}
// ⚠ Sửa 2026-09-06: bản cũ ghi BỐN field và ghi soft_capacity = env
// CAPACITY_SOFT_LIMIT. Cả hai đều sai so với proto thật (`proto/orchestrator/v1/
// session.proto` §GetCapacityResponse). SSOT là file proto, không phải bảng này.
message ListSessionsRequest {
  string user_id = 1;  // rỗng = mọi user (chỉ admin); khác rỗng = phải trùng caller trừ khi admin
  int32  limit   = 2;  // 1..100, 0 = 20
  string cursor  = 3;  // session id cuối trang trước; rỗng = từ đầu
}
message ListSessionsResponse {
  repeated Session sessions = 1;  // chỉ phiên KHÔNG ở trạng thái terminal (status < EXPIRED)
  string next_cursor = 2;         // rỗng = hết
}
```

Authz (**sửa 2026-09-04 sau khi lane Go đọc `authz.go`**): orchestrator KHÔNG có cơ chế header role/user — `authz.go` chỉ làm mTLS `PeerTrust` cho `ReapSession` system_component. `ListSessions` tin `user_id` trong request y như `GetSession`/`ClaimSession`/`ExtendSession`; `user_id` rỗng = mọi user. **BFF là ranh giới tin cậy:** `admin.sessions.list` (adminProcedure) mới được gọi với `user_id` rỗng; `me.activeSessions` luôn truyền `ctx.user.id`. Không thêm field role vào proto. `GetCapacity` cho mọi user đã đăng nhập (kiểm ở tRPC). Codegen: `pnpm proto` (buf) → `packages/shared-types/gen/**` + Go; `pnpm proto:check` phải xanh.

### C4 — tRPC mới (BE1 phát hành; FE lanes tiêu thụ)

Mọi input `.strict()`. Mọi list có cursor thật: `{ items, nextCursor: string | null }`, `limit` clamp 100 (luật 4).

```ts
capacity.get: query, protected, input {} → { activeSessions: number; softCapacity: number; poolFree: number; fetchedAt: string }

me.get: query, protected → { id, name, email, role, preferences: { defaultShell: 'bash'|'zsh'|'pwsh'; terminalTheme: 'dlp-dark'|'dlp-light'|'dlp-contrast'|null; leaderboardNamePublic: boolean }, hasPassword: boolean }
me.updateProfile: mutation, { name: string(1..80) } → { id, name }
me.updatePreferences: mutation, { defaultShell?, terminalTheme?, leaderboardNamePublic? } → preferences
me.activeSessions: query, { limit?, cursor? } → { items: JsonSession[]; nextCursor }        // ListSessions(user_id = tôi)
me.endSession: mutation, { sessionId } → { status: number | null }                          // reap reason 'user_ended'
me.listLabAttempts: query, { limit?, cursor? } → { items: { attempt: LabAttempt; labId; labTitle: string | null; score: LabScore; status; durationSeconds }[]; nextCursor }
me.listQuizAttempts: query, { limit?, cursor? } → { items: { attemptId; quizId; quizTitle: string | null; submittedAt; score: QuizScore }[]; nextCursor }
me.listProgress: giữ, thêm nextCursor thật (keyset (updatedAt desc, lessonId))

lessons.list / labs.list / playgrounds.list: input thêm { difficulty?: enum của schema; tier?: enum của schema }; output giữ { items, limit, nextCursor }; đi qua listPage (D9)
lessons.startSession / labs.startAttempt / playgrounds.start: output thêm { preferencesApplied: boolean }
paths.list, quiz.list, me.listProgress: nextCursor thật (keyset theo id)
quiz.list: giữ; thêm { state }? KHÔNG — chỉ published

admin.* (adminProcedure — role === 'admin'; 403 nếu không):
admin.users.list: { limit?, cursor?, q?: string(≤80) } → { items: { id; name; email; role; createdAt: string }[]; nextCursor }  // keyset id asc; q = ILIKE trên email/name
admin.users.setRole: { userId; role: 'user'|'author'|'admin' } → { id; role }   // cấm tự hạ vai admin của chính mình; ghi admin_audit
admin.sessions.list: { limit?, cursor? } → { items: JsonSession[]; nextCursor }   // ListSessions(user_id = '')
admin.sessions.terminate: { sessionId } → { status }   // ReapSession reason 'admin_terminated'; ghi admin_audit
admin.audit.list: { limit?, cursor? } → { items: { id; actorId; action; targetType; targetId; detail: unknown; occurredAt: string }[]; nextCursor }
admin.health: {} → { fetchedAt: string; capacity: GetCapacityResponse | null; sources: { name: 'orchestrator'|'gateway'; ok: boolean; error: string | null; series: { name: string; labels: Record<string,string>; value: number }[] }[] }
   // parse text /metrics, chỉ giữ tên bắt đầu 'dlp_'; URL từ env ORCHESTRATOR_METRICS_URL / GATEWAY_METRICS_URL
   // ⚠ Trên cụm hardened: `platform-networkpolicy.yaml` khối 9 chặn web→orchestrator:8081, gateway 8083 KHÔNG có trong gateway-service.yaml và khối 12 chỉ mở cho ns monitoring.
   //   ⇒ Đợt 3 (lead): mở netpol web→orchestrator:8081 + web→gateway:8083, thêm port 8083 vào gateway-service.yaml, đặt gatewayMetricsUrl trong values-selfhost. Tới lúc đó admin.health trả ok:false có lý do — đó là hành vi đúng, không giấu.
Nội dung admin: dùng authoring.list (admin thấy tất cả) + authoring.archive. Không proc mới.
```

Bảng mới (drizzle migration, áp qua hook `platform-migrate` — image `dlp-migrator:p13`):
- `user_preferences { user_id text pk fk users(id) on delete cascade; default_shell enum('bash','zsh','pwsh') not null default 'bash'; terminal_theme text null; leaderboard_name_public boolean not null default false; updated_at timestamptz default now() }`
- `admin_audit { id uuid pk; actor_id text not null (KHÔNG fk — audit sống lâu hơn user); action text; target_type text; target_id text; detail jsonb null; occurred_at timestamptz default now() }` + index `(occurred_at)`.

Cookie: `attachSandboxCookie` phát **hai** `Set-Cookie` cùng tên `dlp_sandbox`: `Path=/ws` (giữ) và `Path=/ide` (mới, cùng token, cùng thuộc tính). Test khẳng định KHÔNG có cookie `Path=/`.

### C5 — Khung phiên dùng chung (D1 phát hành; D2 tiêu thụ)

`apps/web/src/components/session/index.ts` export đúng các tên sau:

```ts
export type SessionActions = { start(): void; end(): void; extend(): void };
export function SessionControls(props: {
  session: SandboxSession;              // từ apps/web/src/lib/use-sandbox-session.ts (giữ nguyên hook)
  actions: SessionActions;
  ttlSeconds?: number | null;           // hiện "Phiên kéo dài N phút" TRƯỚC khi bắt đầu (playground bắt buộc)
  capacity?: { activeSessions: number; softCapacity: number } | null;  // hiện "còn N chỗ" cạnh nút Bắt đầu; 0 ⇒ nút vẫn bấm được nhưng cảnh báo trước
  startLabel?: string;                  // mặc định 'Bắt đầu'
  canStart?: boolean;                   // mặc định true
  compact?: boolean;
}): JSX.Element;   // gồm: badge pha, thông báo lý do (session.state.message), Bắt đầu / Kết thúc phiên / Thêm giờ, đồng hồ TTL (<10 phút), cảnh báo hardCap (nút Thêm giờ disabled + tooltip)
export function TerminalPane(props: {
  session: SandboxSession;
  theme?: ThemeName;                    // mặc định theo useTheme() + tuỳ chọn hồ sơ
  placeholder?: ReactNode;              // khi chưa có phiên
}): JSX.Element;  // bọc dynamic import terminal, ssr:false; KHÔNG viết máy trạng thái thứ hai
export function useResolvedTerminalTheme(pref: ThemeName | null | undefined): ThemeName;
```

`packages/terminal` `TerminalSurface` thêm prop `ariaLabel?: string` và `onEscapeFocus?(): void` (gọi khi Esc-Esc), container có `role="application"` + `tabIndex=0`.

### C6bis — `<main>` THUỘC VỀ VỎ, trang không được dựng cái thứ hai (chốt 2026-09-06)

Vỏ ứng dụng (`components/shell/app-shell.tsx`) dựng **một** `<main id="noi-dung">`
bọc `children`. **Không route nào, không component chung nào được dựng `<main>` của
riêng mình** — dùng `<div>` hoặc `<section>`.

Lý do chốt về phía vỏ: một trang không thể biết trang khác làm gì, còn vỏ thì bọc tất
cả, nên chỉ ở đó mới **bảo đảm được đúng một** landmark.

⚠ **SỬA 2026-09-06 — cơ chế tôi nêu ban đầu SAI, và tôi đã lặp lại nó trong bốn brief.**
Tôi viết rằng hai `<main>` lồng nhau "làm axe của 13.H đỏ". Lane H đo lại: axe xếp
`landmark-unique` và `landmark-no-duplicate-main` ở mức **moderate**, còn ô AC item 25
chỉ chặn **serious/critical** — nên cổng axe sẽ KHÔNG bao giờ đỏ vì chuyện này. Quyết
định C6bis vẫn đúng (HTML sai là HTML sai, và trình đọc màn hình nhảy landmark sẽ lạc),
nhưng nó KHÔNG tự có ai gác. Lane H đã thêm một danh sách `MUST_NOT_FIRE` trong e2e để
điều khoản này có thứ thực sự enforce nó.

Bài học chung: khi viện dẫn một cổng để biện minh cho một quyết định, phải kiểm cổng đó
có thật sự bắt trường hợp này không. Một lý lẽ đúng kết luận nhưng sai cơ chế sẽ đẻ ra
niềm tin rằng "đã có ai đó gác", và niềm tin đó tồn tại lâu hơn cái sai.

Đây là một va chạm THẬT đã xảy ra, không phải phòng xa: lane B và lane C chạy song song
trong hai ngữ cảnh cô lập, mỗi bên đọc hiện trạng ở một thời điểm khác nhau và đi tới
hai kết luận ngược nhau — bản đầu của vỏ cố ý KHÔNG dựng `<main>` (vì 17 route đang tự
dựng), lane C bỏ `<main>` khỏi ba client danh mục (vì đọc vỏ và tưởng vỏ cấp landmark)
nhưng vẫn giữ trong `CatalogPage`, rồi vỏ đổi sang tự dựng. Kết quả: mỗi trang danh mục
có hai landmark, và cả hai lane đều xanh ở test của chính mình. Đúng lớp lỗi mà
`contract-first-integration` mô tả.

**Bảy file phải đổi `<main>` → `<div>`/`<section>`** (kiểm bằng `grep -rn "<main" apps/web/src`,
chỉ được còn đúng một kết quả là `app-shell.tsx`): `components/catalog/catalog-page.tsx` ✅ (lead
sửa) · `lessons/[id]/lesson-client.tsx` + `playgrounds/[id]/playground-client.tsx` (lane D1) ·
`labs/[id]/lab-client.tsx` + `quiz/[id]/quiz-client.tsx` + `paths/[id]/path-client.tsx` (lane D2,
đợt 2b) · `me/me-client.tsx` (lane E, đợt 2b).

### C6 — Điều hướng (13.B phát hành)

Route chính: `Bài học /lessons · Lab /labs · Playground /playgrounds · Lộ trình /paths · Quiz /quiz · Của tôi /me`. Menu người dùng: `Hồ sơ & cài đặt /settings`, `Soạn bài /author` (author|admin), `Quản trị /admin` (admin), `Đăng xuất`. `proxy.ts` `PROTECTED_PATHS` thêm `/paths /quiz /me /settings /author /admin`. Vai trò cho `/author`, `/admin` kiểm ở `layout.tsx` server (`getSession` + role) → `redirect('/me')`. Breakpoint: `≥1280px` đầy đủ; `≤768px` nav thu vào một Radix `Dialog` bám mép trái (**không** phải `Sheet`/`Drawer` — `packages/ui` chưa có primitive đó; đã sửa 2026-09-06 cho khớp `app-shell.tsx`), terminal thay bằng `Alert` "Cần màn hình rộng hơn (≥1024px) để mở terminal".

## 3. Lane, sở hữu file, thứ tự

### Đợt 1 (song song, 3 lane)

| Lane | Agent | Sở hữu (CHỈ được sửa các path này) | Deliverable |
|---|---|---|---|
| **A** 13.A hệ thiết kế | `t1k-web-ui-developer` | `packages/ui/**` · `apps/web/src/app/globals.css` · `apps/web/src/app/layout.tsx` (font + ThemeProvider + THEME_INIT_SCRIPT + Toaster + TooltipProvider; KHÔNG dựng nav) · `apps/web/package.json` + `pnpm-lock.yaml` · `docs/design-system.md` | C1, C2, test component, doc checklist. Không đụng route nào khác. |
| **Go** proto + orchestrator | `t1k-web-core-developer` | `proto/**` · `packages/shared-types/gen/**` · `services/orchestrator/**` · `infra/helm/platform/{values.yaml,values-selfhost.yaml,templates/orchestrator-deployment.yaml,templates/web-deployment.yaml,templates/ingress.yaml}` | **Bước 1 (commit riêng, sớm nhất có thể):** proto + codegen (`pnpm proto`). Bước 2: handler `GetCapacity`, `ListSessions` (+ test), env `CAPACITY_SOFT_LIMIT`, Helm `orchestrator.env.capacitySoftLimit: 20`, ingress path `/ide` → gateway (cùng middleware với `/ws` trừ bodylimit — đọc chú thích ingress.yaml), `web.env.orchestratorMetricsUrl`/`gatewayMetricsUrl` → env `ORCHESTRATOR_METRICS_URL`/`GATEWAY_METRICS_URL` của web (để BE1 không đụng Helm). |
| **BE1** tRPC + DB + nguồn | `t1k-web-core-developer` | `apps/web/src/server/**` · `apps/web/drizzle/**` (migration) · `packages/scenario/src/**` · `apps/web/src/security/**` (test authz mới). KHÔNG đụng Helm — key Helm cần thêm thì ghi vào report. | D7, D9, C4, cookie `Path=/ide`, `adminProcedure`, 2 bảng + migration, test (unit + integration DB + authz IDOR cho admin.*). `capacity.*`/`me.activeSessions`/`admin.sessions.*` viết SAU khi lane Go commit codegen (poll `git log -- proto`). |

### Đợt 2 (song song, tối đa 8 lane, bắt đầu khi A đã commit và lead đã chạy `pnpm --filter web typecheck` xanh)

| Lane | Agent | Sở hữu | Deliverable |
|---|---|---|---|
| **B** 13.B vỏ | `t1k-web-ui-developer` | `apps/web/src/components/shell/**` · `apps/web/src/app/layout.tsx` · `apps/web/src/app/page.tsx` · `apps/web/src/app/login/**` · `apps/web/src/app/dashboard/**` (→ redirect `/me`) · `apps/web/src/app/(session)/**` (→ redirect `/me`) · `apps/web/src/proxy.ts` | C6, chỉ báo sức chứa (`capacity.get`, refetch 15s, hiện "còn N chỗ"/"đang đầy"), theme toggle, user menu, responsive, trang chủ + đăng nhập theo hệ mới. |
| **C** 13.C danh mục | `t1k-web-ui-developer` | `apps/web/src/app/{lessons,labs,playgrounds,paths,quiz}/page.tsx` + `*-client.tsx` + `layout.tsx` của các thư mục đó (KHÔNG `[id]`) · `apps/web/src/components/catalog/**` | Lọc server-side (difficulty/tier/capability), sắp xếp, `CursorPager`, EmptyState có ích (author thấy link Soạn bài), Skeleton/ErrorState, `/quiz` index mới. Tuân bẫy `useInfiniteQuery` (dùng `useQuery` + cursor tay). |
| **D1** trình học 1 | `t1k-web-core-developer` | `apps/web/src/components/session/**` · `apps/web/src/lib/use-sandbox-session.ts`, `use-lesson-session.ts` (nếu cần) · `apps/web/src/app/lessons/[id]/**` · `apps/web/src/app/playgrounds/[id]/**` · `packages/terminal/src/**` | C5, layout `ide` (3 pane, iframe `/ide/session/{id}/`, trạng thái "IDE đang khởi động" + timeout có thông báo), tỉ lệ pane nhớ localStorage, terminal a11y (D10), playground hiện TTL trước khi bắt đầu, câu lý do phiên chết. |
| **D2** trình học 2 | `t1k-web-core-developer` | `apps/web/src/app/labs/[id]/**` · `apps/web/src/app/quiz/[id]/**` · `apps/web/src/app/paths/[id]/**` | Lab: bảng task | terminal, chấm từng task, nhãn đúng dữ liệu (hàm thuần + test như `summarizeProgress`), điểm tổng tính lúc hiển thị, leaderboard. Quiz: một câu/màn hoặc danh sách, chấm sau nộp, giải thích; KHÔNG chạm type `*ForLearner`. Path detail: ổ khoá, nút mở item qua `paths.openItem`. Dùng `SessionControls`/`TerminalPane` theo C5 (nếu D1 chưa commit, viết theo hợp đồng và ghi rõ trong report). |
| **E** 13.E của tôi | `t1k-web-ui-developer` | `apps/web/src/app/me/**` · `apps/web/src/app/settings/**` | `/me`: đang học, phiên đang mở (kết thúc được), lịch sử lab/quiz, tiến độ lộ trình — mọi số tính lúc đọc. `/settings`: tên, đổi mật khẩu (`authClient.changePassword`, ẩn khi `hasPassword=false`), shell, theme terminal, hiện tên leaderboard. |
| **F** 13.F soạn bài | `t1k-web-core-developer` | `apps/web/src/app/author/**` · `apps/web/src/components/author/**` | Danh sách theo trạng thái, tạo/sửa (form theo `contentDraftInput` — đọc `authoring.ts` + `docs/scenario-format.md`, `lab-format.md`), xem trước bằng **cùng** `ContentView`, `check` trước publish, publish → poll `authoring.list` hiện `publishing` → kết quả/`publishError` (chạy thử thật), lưu trữ, asset upload (base64). |
| **G** 13.G quản trị | `t1k-web-core-developer` | `apps/web/src/app/admin/**` · `apps/web/src/components/admin/**` | `/admin` (health từ `admin.health` + capacity), `/admin/users` (bảng, đổi vai trò có Dialog xác nhận), `/admin/sessions` (kết thúc), `/admin/content` (`authoring.list` + archive), `/admin/audit`. |
| **H** 13.H chất lượng | `t1k-web-testing-tester` | `apps/web/e2e/**` · `apps/web/playwright.config.ts` · `apps/web/package.json` (thêm `@playwright/test`, `@axe-core/playwright`, script `e2e`, `e2e:a11y`) · `pnpm-lock.yaml` · `turbo.json` (task e2e, không cache) · `.github/workflows/ci.yml` (job `web-a11y` + thêm vào `ci-ok.needs`) | Fixture đăng ký (D11), promote-role script, `a11y.spec.ts` (axe mọi route, 0 serious/critical), `csp.spec.ts` (thu `securitypolicyviolation` + **đối chứng dương** inject inline script không nonce và iframe origin khác → phải ghi nhận vi phạm), `keyboard.spec.ts` (đi hết luồng chính bằng Tab/Enter, Esc-Esc rời terminal), 6 spec `@flow`, `perf.spec.ts` (LCP `/lessons` qua PerformanceObserver). Spec viết theo hợp đồng + màn hình chốt D12; chạy trên cụm ở đợt 3. |

### Đợt 3 (lead + agent kiểm)

1. Lead: `pnpm turbo run lint typecheck build test` một lượt, gom toàn bộ lỗi, chia fix song song, chạy lại.
2. Build image `dlp-web:p13`, `dlp-orchestrator:p13`, `dlp-migrator:p13` (gateway giữ tag cũ nếu không đổi) → side-load (`docker save | scp | ctr import`) → cập nhật `values-selfhost.yaml` tag → `infra/host/12-helm-deploy.sh` (cổng render-vs-ctr của P12 phải xanh; migration chạy qua hook `platform-migrate`).
3. Chạy e2e trên cụm: `@flow` ×6, axe, CSP (kèm đối chứng), keyboard, perf. Ảnh chụp vào `reports/harness/2026-09-04-p13-e2e/`.
4. `t1k-code-reviewer` (adversarial) + `t1k-tester` (suite) → sửa → 5 artifact cook → `reports/2026-09-0X-verify-p13.md` → tích AC `phase-13.md` → commit → PR (base `feat/p12-scale-proof`).

## 3bis. Bẫy deploy đợt 3 — ĐỌC TRƯỚC KHI CHẠY `12-helm-deploy.sh`

**Chart và image đã lệch nhau có chủ ý.** Lane Go đổi `CAPACITY_SOFT_LIMIT` →
`CAPACITY_HARD_LIMIT` (trần mềm nay được TÍNH = hard − poolTarget, không khai tay).
Binary đang chạy trên cụm là `dlp-orchestrator:p12fix`, và nó ĐÒI biến cũ.

⇒ **Deploy chart mới mà chưa build + side-load `dlp-orchestrator:p13` sẽ làm
orchestrator CrashLoopBackOff.** Thông báo lỗi có nêu tên biến thiếu nên chẩn
đoán mất vài giây, nhưng nền tảng nằm đó tới khi image lên. Đợt 3 phải build image
và bump tag TRONG CÙNG một thay đổi. Lane Go cố ý KHÔNG ghim sẵn `:p13` — cổng
render-vs-`ctr images ls` của P12 sẽ (đúng đắn) từ chối một tag chưa có trên node.

**Web và orchestrator phải bump CÙNG một lượt deploy, không cái nào đi trước.**
D15 thêm nhánh `admin_user_id` vào `ReapSession`. Binary `:p12fix` đang chạy không có
field đó, nên nếu `dlp-web:p13` lên trước thì mọi lượt admin kết thúc phiên decode ra
`oneof` chưa đặt ⇒ `InvalidArgument`. Ngược lại orchestrator lên trước thì nút chưa tồn tại.
Cùng lượt, hoặc không lượt nào.

**Bảng theo dõi:** `dlp_reap_total` nay có nhãn `actor="admin"` (khởi tạo 0 nên đọc ra 0
chứ không NO-DATA). Panel/alert nào liệt kê giá trị `actor` cần thêm nhãn thứ ba.

**⚠ Một phơi bày CÓ TỪ ĐỢT 1, không phải do D15 sinh ra.** `ListSessions(user_id = "")`
trả về MỌI phiên đang sống kèm `Session.user_id`, và orchestrator KHÔNG kiểm vai trò ở
tầng đó — nên một caller chạm được cổng gRPC vốn đã reap được bất kỳ ai trong **hai** lời
gọi qua nhánh `user_id`. D15 rút xuống một lời gọi và đổi lại được một dòng audit gọi đúng
tên hành động. Thứ thật sự chặn là **mTLS** (`platform.grpcMtlsMode: 'require'` là mặc
định — cần cert ký bởi CA của ta), KHÔNG phải NetworkPolicy: `networkPolicy.platform.enabled`
mặc định `false`, và kể cả bật thì nó phân biệt bằng NHÃN pod, nên một pod tự gắn nhãn
`app=<fullname>-web` là qua. Coi CA là ranh giới, và đừng thêm apps/web vào
`GRPC_MTLS_SYSTEM_CNS` (làm thế là cấp bypass chủ-sở-hữu cho MỌI lượt reap của BFF, gồm cả
`me.endSession`).

**Ba con số CHƯA ĐO, đừng đọc thành đã đo:**
- `/ide` chưa bao giờ đi qua Traefik (6.A/6.B/6.E đều dùng `port-forward`). Cả trần
  body 1 MiB lẫn tier `ratelimit-ide` 600/1m burst 300 là SUY LUẬN. Triệu chứng nếu
  sai: IDE trắng hoặc nạp nửa chừng, KHÔNG phải một thông báo rate-limit.
- `capacityHardLimit: '8'` trong `values.yaml` (mặc định dạng cloud) chưa đo.

**Ingress không render từ hai file values.** `values-selfhost.yaml` không khai khối
`ingress:`; `ingress.*`/`networkPolicy.*`/`platform.*` là phụ thuộc máy và chỉ sống
trong release trên VM (`12-helm-deploy.sh` L83-90). Muốn xem `/ide` render thì phải
truyền đúng bộ `--set` mà `08-tls-entrypoint.sh` in ra.

**Netpol metrics:** đã mở `web → orchestrator:8081` (khối 13b riêng, không nới khối 9).
`web → gateway:8083` bị TỪ CHỐI có lý do: phải đưa cổng admin vào Service, tạo tên DNS
ổn định tới `/metrics` không xác thực cho mọi pod cùng namespace, trong khi
`networkPolicy.platform.enabled` mặc định `false`. Metric gateway đọc qua Prometheus.
Hệ quả người vận hành thấy: `gateway: reached:false, ok:false, error:<lý do>` — đúng
thiết kế, không phải hỏng.

## 3ter. Runbook đợt 3 — gom từ báo cáo của mười lane

Thứ tự dưới đây có ràng buộc thật, không phải cho gọn.

**1. Cây phải sạch cú pháp TRƯỚC khi tin bất kỳ lượt typecheck nào.** Một lỗi
`TS1xxx` ở file bất kỳ làm `tsc` bỏ luôn pha ngữ nghĩa cho TOÀN chương trình. Đã
đo: trong lúc một file mang comment chưa đóng, hai lượt typecheck chỉ in đúng lỗi
ấy và **giấu** một lỗi kiểu thật ở lane khác. "Chỉ thấy lỗi của lane khác" đọc ra
thành "phần mình sạch" và sai.

**2. Chạy lệnh xác minh TÁCH RA.** `pnpm --filter web typecheck lint test` không
chạy ba script — pnpm đẩy `lint test` thành argv của `tsc` và chết ở `TS5112`,
nên `lint` với `test` KHÔNG hề chạy. Dùng `pnpm turbo run lint typecheck build test`
(turbo nhận nhiều task) hoặc ba lệnh riêng.

**3. Đọc `Tasks: X/Y` trước khi trích bất kỳ con số test nào.** turbo dừng sau
task đỏ, nên một lượt in ra `15/19` nghĩa là bốn task sau CHƯA CHẠY.

**4. Build BỐN image và bump tag TRONG CÙNG một thay đổi.** `dlp-web:p13`,
`dlp-orchestrator:p13`, `dlp-migrator:p13`, và **`dlp-terminal-gateway:p13`** (thêm
2026-09-06: gateway có `podprobe.go` mới + `bridge.go`; không phải phụ thuộc cứng,
nhưng bỏ qua thì người bị thu hồi pod vẫn đọc được "bạn đã tự gõ exit"). Hai ràng buộc, cả hai đều làm hỏng
cụm nếu lệch:
- orchestrator `:p12fix` đòi `CAPACITY_SOFT_LIMIT`, mà chart nay chỉ đặt
  `CAPACITY_HARD_LIMIT` ⇒ deploy chart mới với image cũ là CrashLoopBackOff.
- D15 thêm nhánh `admin_user_id` vào `ReapSession`. Web `:p13` gửi nhánh đó; nếu
  orchestrator còn `:p12fix` thì nó decode ra `oneof` chưa đặt ⇒ mọi lượt admin
  kết thúc phiên trả `InvalidArgument`. **Web và orchestrator lên cùng lượt.**

**5. Side-load, đừng pull.** `docker save | scp | ctr -n k8s.io images import`.
⚠ **Sửa 2026-09-06:** bản cũ ghi `11-sideload-images.sh` "chỉ đọc `image.tag` CHUNG".
SAI — nó CÓ đọc tag từng thành phần (`:96-120`; chạy lại đúng đoạn `awk` đó cho ra
`p10a/p12fix/p12fix/p9`, khớp chart render). Cổng render-vs-`ctr images ls` trong
`12-helm-deploy.sh` gác *tag có mặt trên node*, KHÔNG gác *tag đúng đời* — nên nó
xanh cả khi bạn quên bump. Thứ bắt lệch đời là bước 3 dưới đây, làm bằng tay.

**6. Không cần `--set` gì thêm cho metric.** `gateway.service.exposeAdminPort: auto`
bám theo `networkPolicy.platform.enabled`, mà release đang chạy đã bật, và
`12-helm-deploy.sh` giữ nguyên subtree `networkPolicy`. Xác nhận bằng ĐÚNG một
lệnh, chạy TỪ TRONG pod web (nó kiểm cả ba nửa cùng lúc và nói rõ nửa nào thiếu):

```bash
kubectl exec -n default deploy/platform-web -c web -- node -e 'const u=process.env.GATEWAY_METRICS_URL;if(!u){console.log("FAIL: chua render env");process.exit(1)}fetch(u).then(r=>r.text()).then(t=>{const n=t.split("
").filter(l=>l.startsWith("dlp_gateway_")).length;console.log(n>0?"PASS "+n+" series":"FAIL: voi toi nhung khong co series");process.exit(n>0?0:1)}).catch(e=>{console.log("FAIL: co URL nhung KHONG voi toi — "+e.message);process.exit(1)})'
```
Cả ba nhánh của lệnh này đã được chứng trên cụm, nên nó không phải phép kiểm chỉ
biết kêu một chiều.

**7. e2e phải khai `E2E_REQUIRE_ROLES=1` VÀ `E2E_REQUIRE_SESSION=1`.** Không có cờ đó, một lượt mà cả năm màn
quản trị đều SKIP trông y hệt một lượt chúng PASS. Tài khoản author/admin chỉ đến
từ SQL qua `apps/web/e2e/scripts/promote-role.sh`, và `global-setup` đọc vai trò
MỘT lần lúc bắt đầu nên phải promote TRƯỚC khi chạy.

`E2E_REQUIRE_SESSION=1` là cờ THỨ HAI, thêm 2026-09-06 và trước đó KHÔNG hề có
trong runbook: ba ô D10 (Esc-Esc rời terminal) cần một phiên sandbox THẬT, nên ở
mọi nơi không có orchestrator chúng lặng lẽ `skip` — và một lượt nghiệm thu mà ba
ô đều SKIP trông y hệt một lượt chúng PASS, đúng cái bẫy mà cờ đầu dựng ra để
chặn. Cờ này đọc thẳng `process.env` trong `keyboard.spec.ts`, không khai ở
`e2e/env.ts`, nên grep `env.ts` sẽ KHÔNG thấy nó.

**8. Hai ô e2e đang ĐỎ ĐÚNG và phải xanh sau deploy:** `frame-src 'self'` chưa
khai, và script theme chưa mang nonce. Cụm đang chạy image trước P13 nên đỏ là
đúng; nếu sau deploy vẫn đỏ thì đó là lỗi thật, không phải môi trường.

**9. Chạy lại pentest 3.E.** Phase này nới CSP (`frame-src`) và phát cookie
`dlp_sandbox` thêm `Path=/ide`. Nới bề mặt thì phải chạy lại đối chứng, theo
`zero-violation-needs-negative-control`.

**10. Ba con số CHƯA ĐO, đừng tích ô nghiệm thu dựa vào chúng:** trần body 1 MiB
và tier `ratelimit-ide` 600/1m burst 300 cho `/ide` (đường này CHƯA từng đi qua
Traefik lần nào), và `capacityHardLimit: '8'` mặc định dạng cloud.

**11. `netpol_render_gate.py` đọc manifest từ STDIN.** Gọi trần không pipe thì nó
báo "thiếu 14 policy" — **đỏ giả**, và rất dễ đọc thành "bản vá của ai đó làm hỏng
netpol". Pipe `helm template` vào nó. Và **đừng nối `| tail` rồi đọc `$?`**: khi ấy
`$?` là mã thoát của `tail`, không phải của lệnh bạn quan tâm. (Tôi đã tự dính đúng
bẫy này ở một chỗ khác trong phiên — xem ghi chú `.gitignore` ở §4.)

**12. Bản vá header `/ide` chỉ có hiệu lực SAU khi side-load `dlp-terminal-gateway:p13`,
và tới lúc đó KHÔNG có gì đỏ lên.** Lỗ S1 là một header VẮNG MẶT: với ảnh
`:p12fix` đang chạy, `rollout status` vẫn xanh và pod vẫn `Running 1/1`. Không có
phép kiểm nào trên cụm phát hiện, nên đây là thứ phải nhớ chứ không phải thứ sẽ
được nhắc. Khác cặp web↔orchestrator, ảnh gateway **không** có ràng buộc thứ tự —
nó chỉ thêm header response, không đụng wire-protocol.

**15. ⚠ `grep -iF` BỎ SÓT chuỗi tiếng Việt, trong im lặng.** Đo trên máy này
2026-09-06, file `narrow-screen-notice.tsx` có thật chuỗi `học phí` (byte thô, nằm
trong `bài học phía trên`):

| lệnh | kết quả |
|---|---|
| `grep -F 'học phí'` | 1 ✅ |
| `grep -i 'học phí'` | 1 ✅ |
| `grep -iF 'học phí'` | **0** ❌ |

`-i` một mình đúng, `-F` một mình đúng, **gộp lại thì hỏng** — nhánh so-sánh
không-phân-biệt-hoa-thường của đường `-F` hạ chữ theo BYTE và làm hỏng UTF-8 nhiều
byte. Không lỗi, chỉ 0 hit, nên nó đọc y hệt "không có". **Mọi kết luận "0 hit" cho
chuỗi tiếng Việt rút ra bằng `grep -iF` là chưa chứng minh được gì** — soát lại
bằng Node hoặc bỏ `-F`. (Đã tưởng nhầm nguyên nhân một lần là "shell nuốt tham số
UTF-8"; sai, hai cờ riêng lẻ đều đi qua shell nguyên vẹn.)

**16. ⚠ `ci.yml` ĐANG TẠM DỪNG** — `on:` chỉ còn `workflow_dispatch` (từ
2026-09-04, xem `docs/ci-paused.md`). Nên mọi job trong đó, kể cả `no-commerce` vừa
thêm và `web-a11y`, **chỉ chạy khi gọi tay**. Một job nằm đúng trong `ci-ok.needs`
vẫn không chạy nếu workflow không có trigger — kiểm `on:` trước khi kết luận một
cổng "đã nối dây". Quyết định mở rộng tập cổng always-on là của chủ dự án.

**14. ⚠ `postgres:16-alpine` ĐANG GIỮ phân trang keyset chạy đúng, và `datcollate` NÓI DỐI về lý do.**
Keyset cursor trộn sắp xếp của Postgres với sắp xếp của JS, nên hai bên phải đồng
ý về thứ tự. Chúng đang đồng ý — nhưng **không** vì cấu hình nói thế. Đo trên cụm
2026-09-06:

```
datcollate = en_US.utf8        ← khai báo
'A'<'B' = t, 'B'<'a' = t       ← hành vi THẬT: thứ tự C, không phải en_US
```

`'B' < 'a'` đúng là hành vi collation **C**; glibc `en_US.utf8` sẽ trả `f`. Ảnh
alpine dùng musl, mà musl không cài đặt locale, nên nó âm thầm rơi về thứ tự byte
BẤT KỂ `datcollate` khai gì. JS so sánh theo mã UTF-16 (`'B'`=66 < `'a'`=97), nên
hai bên khớp — **do trùng hợp của ảnh, không do thiết kế**.

Hệ quả: đổi `infra/helm/platform/values.yaml:609` sang `postgres:16` (glibc) là
cursor phát sai vị trí ⇒ mất/lặp dòng ở biên trang. **Không test nào đỏ, không
cổng nào chặn** — CI cũng ghim `postgres:16-alpine` (`ci.yml:124`, `:1322`) nên
cả CI lẫn cụm cùng sai một kiểu và cùng im lặng. Và ai đi kiểm `datcollate` để
xác nhận sẽ đọc ra `en_US.utf8` rồi kết luận ngược.

Đừng đổi ảnh Postgres trong P13. Nếu phase sau cần glibc thì phải khai
`LC_COLLATE=C` tường minh lúc `initdb` (đổi ảnh không thôi KHÔNG đủ vì database
đã tồn tại), và thêm một test khẳng định `'B' < 'a'` ở tầng DB.

**13. Nợ đã biết, ghi để khỏi tưởng là mới:** `/ws` và `/exec` cũng phát JSON trên
origin app mà không có `nosniff`. Rủi ro thấp hơn hẳn `/ide` (không proxy nội dung
do người dùng điều khiển) nên lượt này cố ý không mở rộng phạm vi. Muốn đóng thì đó
là một lời gọi `setSecurityHeaders` trong `wsroute`/`execroute` — cùng ảnh gateway,
không thêm bước deploy nào.

## 4. Kỷ luật git & xác minh cho MỌI sub-agent

- **`reports/` là QUY ƯỚC cục bộ, KHÔNG phải hàng rào — `git add` sẽ THÀNH CÔNG.** Đừng commit report; nhưng biết đúng lý do: `git ls-files reports` trả **0** (chưa từng có file report nào lên git), trong khi `git check-ignore` trên file report thật trả **exit 1**, tức không luật ignore nào khớp. Bản đầu của dòng này ghi "bị `.gitignore` dòng 72 chặn" — **SAI**: dòng 72 là `plans/devops-learning-platform/reports/harness/*/.barrier-*/`, một đường khác hẳn. (`git check-ignore -v reports/` có in ra dòng 72 với ô pattern RỖNG; đó là hành vi lạ của git khi đối số là thư mục, không phải một luật khớp thật. Kiểm trên FILE, đừng kiểm trên thư mục — và đừng nối `| head` rồi đọc `$?`, vì khi ấy `$?` là mã thoát của `head`.) Hệ quả: một `git add -A` của bất kỳ ai sẽ kéo cả `reports/` lên — thêm một lý do nữa để giữ lệnh cấm `git add -A`. Muốn thành hàng rào thật thì phải thêm `reports/` vào `.gitignore`; **chưa làm, chờ chủ dự án quyết**. Hệ quả cho lane: file trên đĩa LÀ deliverable, và vì nó không lên git nên phát hiện quan trọng phải được nhắc lại trong tin nhắn báo cáo chứ không chỉ nằm trong file.
- Một nhánh, một working tree dùng chung. **CẤM** `git add .`/`-A`, `git commit -a`, `git checkout`/`switch`/`stash`, `git pull`, `git push`. Commit bằng **pathspec**: `git add <đường dẫn tường minh>` cho file mới rồi `git commit -m "<type>(p13): …" -- <đường dẫn…>`. Commit nhỏ, thường xuyên; commit trước khi báo cáo.
- Chỉ sửa file trong cột "Sở hữu". Cần sửa file của lane khác ⇒ **báo lead** trong report, kèm patch đề xuất; không tự sửa.
- Xác minh cục bộ: `pnpm --filter <package> typecheck|lint|test`. **CẤM `next build` ở đợt 2** (`.next/` dùng chung; lead build một lượt). Lỗi typecheck nằm ngoài path sở hữu ⇒ ghi vào report, không sửa.
- Không hardcode màu; không `useReducer` mới quanh WS; không `useInfiniteQuery`; không chuỗi giá/thanh toán; tiếng Việt một giọng, thông báo lỗi nói "chuyện gì + làm gì tiếp".
- Kết thúc bằng **Status** `DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT`, danh sách commit (SHA đọc lại từ `git log`), file đã đụng, và những chỗ hợp đồng bị nghi sai.

## 5. Verify (đợt 3)

```bash
pnpm turbo run lint typecheck build test
pnpm --filter web exec playwright test --grep @flow          # E2E_BASE_URL=https://dlp.192.168.94.130.sslip.io:30443
pnpm --filter web exec playwright test a11y csp keyboard perf
grep -rnE '#[0-9a-fA-F]{3,8}|\b(slate|gray|zinc|neutral)-[0-9]{2,3}' apps/web/src packages/ui/src --include=*.tsx | grep -v node_modules   # rỗng (trừ themes.ts của terminal)
# Không màn hình/chuỗi nào về giá, gói cước, thanh toán (AC cuối 13.H).
#
# Phép kiểm này TỪNG là một chuỗi `grep` dài dán ngay tại đây. Bỏ đi vì hai lý
# do đo được ngày 2026-09-06:
#
#   1. Không job CI nào chạy nó (grep `.github/workflows/`: 0 kết quả). Một
#      lệnh dán trong plan chỉ chạy khi có người nhớ chạy — tức là không chạy.
#   2. Mẫu bắt lọt. Bơm 9 dòng paywall giả qua đúng chuỗi lệnh đó thì 4 LỌT:
#      "Nâng cấp để mở khoá — 199.000đ/tháng", "Học phí trọn gói 1.500.000đ",
#      "Mua khoá học", "Bản Pro — 99k/tháng". Ba bộ lọc trừ KHÔNG nuốt dương
#      tính thật nào, nên lỗ nằm ở mẫu bắt: nó thiếu chữ tiếng Việt có dấu và
#      thiếu hẳn ĐỊNH DẠNG TIỀN VIỆT (con số kèm đơn vị tiền là dấu hiệu mạnh
#      và độc lập với từ khoá).
#
# Script thay thế cũng mở rộng vùng quét sang `content/`, `e2e/`, `drizzle/`,
# `packages/terminal/src`, và tự chạy ĐỐI CHỨNG DƯƠNG trước mỗi lượt quét: nếu
# nó không còn bắt được tập mẫu vi phạm đã biết thì thoát 2 và không quét gì cả.
# Vì vậy nó không thể xanh trong tình trạng "cổng đã hỏng nhưng cây sạch".
#
# Đã nối vào CI: job `no-commerce` trong `ci.yml`, nằm trong `ci-ok.needs`.
# ⚠ `ci.yml` đang tạm dừng (`docs/ci-paused.md`) nên tới phase 14 job đó chỉ
#   chạy khi gọi tay — trong giai đoạn này PHẢI chạy lệnh dưới bằng tay.
node scripts/check-no-commerce.mjs   # exit 0; đối chứng + quét, không cần cài gì
```
