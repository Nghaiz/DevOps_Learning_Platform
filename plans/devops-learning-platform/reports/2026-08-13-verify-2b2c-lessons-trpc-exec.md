# P2 / 2.B + 2.C — tRPC `lessons` + exec one-shot chấm step

**Ngày:** 2026-08-13 · **Phạm vi:** 2.B (DB + tRPC) và 2.C (validation engine).
2.D (FE split-pane) **không** thuộc lượt này.

---

## 1. Bốn giả định của plan không sống sót

Ba trong bốn là sai lệch giữa plan và mã đang chạy; cái thứ tư là một bug đã nằm
sẵn trong repo và chỉ lộ ra khi có người đầu tiên đi qua nó.

### 1.1 Bảng `scenarios` — không dựng

Plan task 6 đòi một bảng Postgres giữ metadata scenario. Không dựng, vì metadata
đã có nguồn sự thật: `index.json` + `dlp.json` trên đĩa, ghim byte-với-byte bằng
`scripts/vendor-scenarios.mjs --check`. Một bảng chép lại `title`/`difficulty`/
`tier` là derived field, và nó sẽ lệch ở lần re-vendor đầu tiên.

Cùng một lập luận đã bác `markdownHtml` (2.A) và `progress.status` (lượt này).
Ba lần trong hai chặng — đủ để nói rằng plan P2 được viết với giả định "DB là nơi
chứa mọi thứ", còn nội dung thì đã có một nguồn khác tốt hơn.

### 1.2 `checkStep(scenarioId, stepIndex)` — chữ ký không đủ

Nội dung thật bác nó: `loxilb-tcp-load-balancing` có `verify` ở **intro** và
**không có ở step nào**. Một API chỉ nhận `stepIndex` sẽ im lặng bỏ qua script
chấm duy nhất của bài đó, và bài hiện ra như "không có gì để chấm".

Chữ ký thật: `checkStep({ scenarioId, sessionId, phase })` với
`phase: intro | finish | step{index}`.

Phân bố đặc tính trong 4 bài đã vendor (đọc từ `index.json`, không phải từ docs):

| bài | step | verify ở step | verify ở intro | capabilities |
|---|---|---|---|---|
| `ckad-configmap-as-files` | **1** | có (kubectl thật) | không | `kubernetes`, `multi-node` |
| `loki-quickstart` | 2 | không | không | — |
| `loxilb-tcp-load-balancing` | 3 | **không** | **có** | — |
| `prolug-linux-system-checking` | 3 | có (`/bin/true`) | không | — |

Bảng này cũng là lý do ba ca test đầu tiên đỏ: chúng giả định `ckad` nhiều step.
Nó có **một**. Phép kiểm `stepIndex >= steps.length` bắt được — đúng việc nó sinh
ra để làm.

### 1.3 "auth bằng chính cookie `dlp_sandbox`" — chỉ có một nghĩa hiện thực được

`docs/scenario-format.md` §4 (chốt ở 2.A) viết vậy. Đọc theo nghĩa hiển nhiên
("forward cookie của người dùng") thì **bất khả**: cookie mang `Path=/ws`
([session.ts → sandbox-cookie.ts](../../../apps/web/src/server/auth/sandbox-cookie.ts)),
nên trình duyệt không gửi nó tới `/api/trpc/*`. BFF không có gì để forward.

Nghĩa còn lại — BFF **tự mint** một token server-side — là thứ đã hiện thực. Và
nó tốt hơn chứ không phải nhượng bộ: hệ quả là endpoint `/exec/session/{id}`
**không phơi ra trình duyệt** chút nào, vì trình duyệt cũng không gửi được cookie
tới đó.

Giá phải trả: BFF phải hỏi `GetSession` trước mỗi lượt chấm để lấy `expiresAt`
(`mintSandboxTokenFor` từ chối phát token đã chết). Một lượt gọi thêm, và nó cũng
là vế authz thứ nhất.

### 1.4 Dockerfile của web đã hỏng sẵn — đo được, kèm đối chứng âm

`apps/web/Dockerfile` dòng 47 viết: *"`packages/scenario` CHƯA có package.json
nên pnpm bỏ qua — không cần copy cho tới khi nó có manifest."* Nó **đã có** từ
2.A. Câu cảnh báo hết đúng trước khi có ai đọc lại nó.

Đối chứng âm — dựng đúng bản chưa sửa (xoá 2 dòng `COPY packages/scenario`):

```
• Packages in scope: @devops-platform/shared-types, @devops-platform/terminal,
                     @devops-platform/ui, @devops-platform/web
@devops-platform/web:build: Error: Module not found: Can't resolve '@devops-platform/scenario'
ERROR: process "/bin/sh -c pnpm turbo run build" did not complete successfully: exit code: 1
```

Đúng bẫy mà chính Dockerfile cảnh báo là *"đã xảy ra như vậy khi thêm
`packages/terminal` ở 1.F"* — lượt thứ hai của cùng một cái bẫy.

**Và một bug thứ hai cùng chỗ, plan không nhắc:** `content/scenarios/` không nằm
trong stage nào. Loader đọc đĩa lúc chạy, mà `outputFileTracingRoot` chỉ gom
được thứ đi theo `import` — `readdir` với đường dẫn từ env thì không. Không có
`COPY content` thì image build xanh, test xanh, `/lessons` trả ENOENT ở request
đầu tiên trên cụm.

Sau khi sửa, đo trên image thật:

```
$ docker run --rm --entrypoint sh dlp/web:p2-test -c 'echo $SCENARIOS_DIR; ls $SCENARIOS_DIR'
/repo/content/scenarios
ckad-configmap-as-files  loki-quickstart  loxilb-tcp-load-balancing  prolug-linux-system-checking
```

---

## 2. Ba quyết định thiết kế đáng ghi

### 2.1 `ScenarioSource` — seam cho "soạn bài trên UI"

Yêu cầu của chủ dự án (chốt cùng ngày): sau này tạo bài trực tiếp trên UI, không
hardcode vào repo. Đường đúng **không phải** dựng bảng `scenarios` rỗng chờ sẵn —
đó là schema chết. Đường đúng là đặt tên cho ranh giới đã tồn tại:

```ts
interface ScenarioSource {
  readonly kind: string;
  list(): Promise<ScenarioSummary[]>;   // rút gọn — DB source không đọc markdown
  get(id: string): Promise<Scenario | null>;
}
```

Router gọi `scenarioSource()`, không gọi `loadScenarios()`. Bản DB-backed hiện
thực đúng hai method này và cắm vào mà router / `checkStep` / FE không sửa dòng
nào. Bảng `scenarios` sinh ra ở chặng đó — lúc nó là NGUỒN, không phải bản sao.

### 2.2 Năng lực chưa hỗ trợ: **cảnh báo, không chặn** — một đánh đổi có giá

`ckad-configmap-as-files` chạy `kubernetes-kubeadm-2nodes`. P1 chứng minh DinD
trong pod Sysbox; kubeadm-trong-pod thì **chưa**. Chặn cứng nghe an toàn hơn, và
nó là thứ tôi định làm — cho tới khi thấy hệ quả: `ckad` là scenario **duy nhất**
có verify thật ở step (ba bài còn lại: không verify, hoặc `/bin/true`). Chặn nó
nghĩa là ô AC "Check trả pass/fail đúng" không còn cách nào đóng.

Nên: `lessons.get` / `startSession` trả `unsupportedCapabilities`, và **2.D bắt
buộc phải hiện nó**. Giá của lựa chọn này là người học mở bài CKAD và thấy
`kubectl: command not found`; giá đó chỉ chấp nhận được nếu cảnh báo tới TRƯỚC.
Nếu 2.D bỏ qua field này, đánh đổi trên trở thành một lỗi im lặng.

### 2.3 `foreground` KHÔNG chạy ở `runSetup`

Plan task 11 nói "setup script chạy khi start scenario". Nhưng Killercoda tách
`foreground`/`background` vì `foreground` phải **hiện ra trong terminal người học
đang nhìn**. Chạy nó qua exec one-shot là chạy ở một shell khác: người học nhìn
một terminal im lặng trong lúc có gì đó đang xảy ra ở nơi khác.

`runSetup` vì thế chạy `background` và **trả `foreground` về cho FE** gõ vào WS.
Đó không phải phần dang dở — đó là ranh giới đúng giữa 2.C và 2.D.

---

## 3. Bằng chứng

### 3.1 Go — gateway (32 ca mới, `go test ./internal/execroute/... ./internal/podexec/...`)

| Nhóm | Ca đáng kể |
|---|---|
| authz a→h | sid lệch chết **trước** khi chạm Redis (`getCalls == 0`); token forge (`hash.userId != sub`) → 403 và script **không** chạy; session REAPED → 409; Redis chết → 500 **không rò** lý do ra body |
| bước i vắng mặt | `TestExecDoesNotTakeWSSlot` — spy khai cả `AcquireWS` và khẳng định nó **không** được gọi. Không phải tautology: một implement dùng type assertion vẫn gọi tới được dù interface không khai |
| exit code | khác 0 → **200** (kết quả, không phải lỗi); quá hạn → **502** (lỗi, không phải "fail") |
| cắt cỡ | `cappedWriter` luôn trả `len(p), nil` kể cả khi bỏ byte — trả số nhỏ hơn là `io.ErrShortWrite` và client-go **huỷ stream**, mất luôn exit code; biên "đúng bằng trần thì KHÔNG báo cắt" |
| URL exec | `TestOneShotURLDiffersFromTerminalURL` chặn việc gộp hai hàm URL |

**Bẫy đo được lúc viết test:** `tty` **vắng mặt** khỏi query string khi `false` —
`scheme.ParameterCodec` bỏ bool zero-value thay vì ghi `tty=false`. Một phép kiểm
`Get("tty") == "false"` là test luôn đỏ dù mã đúng.

### 3.2 TypeScript (`pnpm test` — 16 file, 134 ca, 0 đỏ)

- `security/lessons-authz.test.ts` (20 ca) — IDOR, Zod strict, trần pagination,
  ranh giới script chấm. `fetch` bị stub để **ném**: ca nào lọt qua authz và gọi
  gateway thật sẽ đỏ, không im lặng treo.
- `server/lessons/phase.test.ts` (11 ca) — nhánh `intro`/`finish` vắng mặt.
  Tách ra file riêng vì **cả bốn bài đã vendor đều có đủ intro lẫn finish**, nên
  nhánh đó không chạm được bằng nội dung thật; để nó trong router nghĩa là mã mà
  không test nào giết được.
- `server/lessons/validate.test.ts` (10 ca) — phép dịch gateway → người học.
  Trọng tâm: **không lỗi nào được biến thành `passed: false`**.
- `packages/scenario/src/source.test.ts` (6 ca) — gồm "thư mục sai thì NÉM chứ
  không trả danh sách rỗng" và "lượt nạp hỏng không bị đóng băng trong cache".

### 3.3 Cổng khác

```
pnpm lint                     9/9 ✓
pnpm typecheck                10/10 ✓ (gồm next build)
gofmt -l internal cmd         sạch
GOOS=linux go build/vet ./... sạch
helm template × 3 values      ✓
```

`helm template` bắt một lỗi thật: `.Values.gateway.service.port` **không tồn tại**
(key đúng là `publicPort`), nên `GATEWAY_INTERNAL_URL` render ra
`http://test-gateway:<nil>`. Một chuỗi hợp lệ về cú pháp, hỏng lúc chạy, và
không cổng nào ngoài việc render thật bắt được.

---

## 4. Còn hở — nói rõ chứ không giấu

| Ô AC | Trạng thái | Cần gì |
|---|---|---|
| "Check → pass/fail đúng" | ⬜ | Cụm thật. Đường đi đã dựng và gác bằng 32 ca, nhưng **chưa lượt nào chạm apiserver**. Dùng `ckad-configmap-as-files`; **không** dùng `prolug-*` (verify là `/bin/true`, vế fail bất khả). |
| Setup script chạy khi start | ⬜ | `runSetup` đã dựng; bằng chứng cần cụm. Vế `foreground` thuộc 2.D. |
| Validation isolation — NetworkPolicy | ⬜ | Cụm. Vế cấu trúc (`Target` từ Redis) đã đóng. |
| Toàn bộ 2.D | ⬜ | Ngoài phạm vi lượt này theo lựa chọn phạm vi đầu phiên. |

**Nợ kỹ thuật cố ý:** `lessons.list` nạp **toàn bộ** catalog vào bộ nhớ rồi cắt
trang. Đúng với 4 bài; sai khi có 400. Nó là nợ đúng chỗ — bản `ScenarioSource`
DB-backed sẽ phân trang trong SQL, và interface đã có hình dạng cho việc đó
(`list()` trả bản rút gọn). Ghi ra đây để nó không lặng lẽ thành mặc định.
