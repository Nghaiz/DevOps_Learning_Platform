# Phase 2 — Lessons pillar (MVP sản phẩm)

**Mức chi tiết:** DETAILED · **Effort:** M · **Blocks:** P4 (tái dùng UI/parser) · **Blocked by:** P1 (engine + terminal)

## Objective

Trụ cột ① — trải nghiệm học kiểu KillerCoda: bài markdown từng bước hiển thị cạnh terminal thật (split-pane), điều hướng step, và **validation script** chấm mỗi step trong sandbox. Tận dụng kho nội dung OSS định dạng Katacoda/Killercoda (`md` + `index.json`). Đây là MVP sản phẩm đầu tiên người dùng thấy giá trị.

**Định nghĩa "done" P2:** import 1 scenario Katacoda thật, người học đi qua các step, gõ trong terminal engine P1, bấm "Check" và validation script chạy trong pod trả pass/fail, tiến độ được lưu (chỉ chủ sở hữu xem được).

## Task list

### 2.A packages/scenario — parser Katacoda/Killercoda ✅ XONG (2026-08-13)

> Báo cáo: [`reports/2026-08-13-verify-2a-scenario-parser.md`](reports/2026-08-13-verify-2a-scenario-parser.md) ·
> Contract: [`docs/scenario-format.md`](../../docs/scenario-format.md)

1. ✅ Parse `index.json` (Katacoda/Killercoda): metadata, `details.steps[]`, `intro`, `finish`, `assets`, `backend.imageid` (map sang tier/image của ta), env/setup.
2. ✅ Parse từng `step{N}.md` (nội dung markdown) + `background`/`foreground` scripts (setup + validation) theo format Killercoda. **`foreground` và `background` GIỮ TÁCH NHAU** — docs Killercoda phân biệt rõ (foreground hiện lệnh trong terminal người học, background chạy ẩn), gộp thành một `setupScript` là mất đúng thông tin quyết định UX.
3. ✅ Chuẩn hóa sang DTO chung (`packages/shared-types/src/scenario.ts`). **Hai sửa so với bản phác ban đầu, cả hai bắt buộc:**
   - `Step.markdown` (nguyên văn) **thay cho** `markdownHtml`. HTML vừa là derived field vừa **không chở nổi** hậu tố `{{exec}}`/`{{copy}}` — chúng phải thành nút nối vào terminal, một chuỗi HTML không có chỗ gắn handler. Thay bằng hàm thuần `parseContentBlocks(markdown)` dùng chung cho 2.C và 2.D.
   - `difficulty` **không parse được** — Killercoda `index.json` không có field đó (code search 0 hit; docs không liệt kê). Nó đến từ sidecar `dlp.json` của ta, bắt buộc, không default.
   Zod schema strict (luật 3) ở cả `index.json` upstream lẫn `dlp.json`.
4. ✅ Loader: đọc scenario từ `content/scenarios/**`; validate cấu trúc, báo lỗi rõ nếu format sai (errors-over-fallback). Field lạ trong `index.json` → từ chối, trừ khi sidecar khai tường minh kèm lý do; field đã bỏ qua nổi lên ở `Scenario.ignoredUpstreamFields`.
5. ✅ Test parser trên kho thật — **4 scenario** từ 3 repo. ⚠ **`killercoda/scenario-examples` KHÔNG có LICENSE** (all rights reserved) nên chỉ đọc để hiểu format, không vendor được; nguồn thay thế xem 2.E.

### 2.B DB & tRPC — nội dung + tiến độ ✅ XONG (2026-08-13)

> Báo cáo: [`reports/2026-08-13-verify-2b2c-lessons-trpc-exec.md`](reports/2026-08-13-verify-2b2c-lessons-trpc-exec.md)

6. ✅ **KHÔNG dựng bảng `scenarios`, và KHÔNG thêm cột `progress.status`** — hai
   sửa so với plan, cùng một lý do: cả hai đều là derived field.
   - `scenarios`: metadata đã có nguồn sự thật là `index.json` + `dlp.json` trên
     đĩa, ghim byte bằng `vendor-scenarios.mjs --check`. Bảng DB là bản sao.
   - `status`: tính trọn từ `(stepIndex, completedAt, stepCount)`.
   Thay vào đó là **seam `ScenarioSource`** (`packages/scenario/src/source.ts`) —
   hôm nay một hiện thực filesystem; bản DB-backed (soạn bài trên UI, xem §Yêu cầu
   nền tảng) cắm vào sau mà router/FE không sửa. Bảng `scenarios` thuộc về ngày
   đó, và ngày đó nó là NGUỒN chứ không phải bản sao.
7. ✅ Router `lessons`: `list` (cursor + cap 100), `get`, `startSession` (tier suy
   từ `backend.imageid`, KHÔNG nhận từ input), `saveProgress`, `checkStep`,
   `runSetup`. **`checkStep` nhận `phase: intro|finish|step{index}`**, không phải
   `stepIndex` — `loxilb` có `verify` ở **intro** và không có ở step nào, nên một
   API chỉ chấm được step sẽ im lặng bỏ qua script chấm của nó.
8. ✅ Luật 1 ở dạng mạnh nhất: input **không có field `userId`** nào để giả mạo;
   mọi truy vấn lọc theo `ctx.user.id` từ session cookie. Test IDOR: 6 ca.
9. ✅ Zod `.strict()` mọi procedure, kể cả từng nhánh của discriminated union.

### 2.C Validation engine — chấm step trong sandbox

> **Transport đã CHỐT (2026-08-13, chưa hiện thực):** `POST /exec/session/{id}` trên
> **terminal-gateway**, auth bằng chính cookie `dlp_sandbox` do BFF mint server-side.
> **Không** thêm RPC vào `proto/orchestrator/v1` — orchestrator không có mã exec lẫn RBAC
> `pods/exec`, còn gateway đã có cả hai và đã hardening ở P1. Bốn khác biệt so với đường WS
> mà 2.C phải xử lý riêng (`TTY:false` để lấy exit code, không chiếm khe WS D17=1, cắt cỡ
> output, script đến từ đĩa chứ không từ body client): [`docs/scenario-format.md`](../../docs/scenario-format.md) §4.
>
> ⚠ **Đừng chọn `prolug-linux-system-checking` làm bằng chứng pass/fail** — cả ba `verify.sh`
> của nó là `/bin/true`, vế "fail" bất khả. Dùng `ckad-configmap-as-files` (kubectl thật)
> hoặc `loxilb-tcp-load-balancing` (`stat /var/run/netns/loxilb`).

10. ✅ `POST /exec/session/{id}` trên gateway (`internal/execroute` +
    `podexec/oneshot.go`): authz a→h, **bỏ bước i** (chấm không được chiếm khe WS
    D17=1, nếu không bấm Check sẽ đá văng terminal đang mở). `TTY:false,
    Stderr:true` để lấy exit code; **script qua STDIN chứ không qua argv** —
    `Command` nằm trong query string của URL apiserver và script vài KB sẽ phình
    nó. Pass khi exit code = 0. Timeout 30s → **502, không phải "fail"**.
11. ✅ `lessons.runSetup` chạy `background` của một phase. **`foreground` được TRẢ
    VỀ cho FE chứ không chạy ở đây** — đó là chính định nghĩa của nó (hiện ra
    trong terminal người học); chạy qua exec one-shot là chạy ở shell khác và
    người học nhìn một terminal im lặng. FE (2.D) gõ nó vào WS.
12. ✅ Pass ở step → `progress.stepIndex = min(index+1, last)`; step cuối ghi
    `completedAt`. `status` suy ra, không lưu (xem task 6).
13. ✅ `Target` (pod/namespace) đọc từ **Redis**, không từ URL/body — đó là thứ
    làm ô AC "chạy trong pod cô lập" đúng theo cấu trúc. Output cắt cỡ 8 KiB.
    ✅ Vế NetworkPolicy: đã đo trên cụm kèm đối chứng âm (xem AC §Bảo mật). Bổ
    sung 2026-08-13: cùng phép chặn đó nay còn được đo **trong terminal của
    người học** chứ không chỉ ở đường verify — bấm nút `{{exec}}` chạy
    `curl 169.254.169.254` trong PTY trả `exit=28` sau 3.407s.

### 2.D Frontend — split-pane lesson UI ✅ XONG (2026-08-13)

> Báo cáo: [`reports/2026-08-13-verify-2d-lessons-ui.md`](reports/2026-08-13-verify-2d-lessons-ui.md) ·
> Bằng chứng: [`reports/harness/2026-08-13-2d-lessons-e2e/`](reports/harness/2026-08-13-2d-lessons-e2e/)

14. ✅ Split-pane resize được (`role="separator"`, kéo bằng pointer-capture **và**
    bàn phím). Đo trên trình duyệt thật: ArrowRight 50→52 (left 854→888px), End
    kẹp đúng `aria-valuemax`, tỉ lệ nhớ trong `localStorage`.
15. ✅ Step nav + progress bar + nút **"Kiểm tra"**. Nút **ẨN** khi phase không có
    `verifyScript` — `checkStep` NÉM `PRECONDITION_FAILED` ở ca đó, nên một nút
    hiện vô điều kiện là nút chỉ biết báo lỗi (`loki-quickstart`: không phase nào
    có verify). Kết quả chấm có **BA** nhánh, không hai: đạt / chưa đạt / lỗi hệ
    thống.
16. ✅ `/lessons`: lưới, lọc độ khó, huy hiệu tiến độ (chỉ của user).
17. ✅ Trạng thái phiên dùng lại `session-machine` của P1 (không viết máy thứ hai).
    `unsupportedCapabilities` hiện **nổi bật** — bắt buộc theo 2.B §2.2.
18. ✅ Component trình bày ở `packages/ui/src/lesson/` cho P4 tái dùng; phần có
    dây nối (tRPC, PTY) ở lại `apps/web`.

**Sáu tiền đề không nằm trong task list, đều phải làm trước:** `packages/terminal`
không có đường gõ vào PTY (thêm `onReady(handle|null)`) · Tailwind **không quét**
`packages/ui` (lỗi đã chạy sẵn trên main — mọi `<Button>` mất hover/focus/disabled,
đo bằng đối chứng 0→1 trên bundle CSS) · `PROTECTED_PATHS` khớp chính xác nên
`/lessons/<id>` **không được gác** · `Scenario.assets[]` không có người tiêu thụ ·
`content/` không phục vụ qua HTTP · `source` của sidecar không nullable.

### 2.F Bài first-party `dlp-sandbox-basics` ✅ XONG (2026-08-13)

Sinh ra vì **cả 4 bài đã vendor đều không sinh được cặp pass/fail thật**: `ckad`
thiếu `kubectl` nên luôn fail (gương của bẫy `/bin/true` mà plan cảnh báo ở
`prolug` — và plan lại chỉ định dùng `ckad`), `loki` không có verify nào, `loxilb`
cần egress mà NetworkPolicy `default-deny` chặn. Bài này chỉ dùng thứ có thật
trong image (bash, coreutils, `jq`, Docker/DinD), 4 step + 1 asset.

### 2.G Ingress + đóng ô AC terminal ✅ XONG (2026-08-13)

> Báo cáo: [`reports/2026-08-13-verify-2g-ws-ingress.md`](reports/2026-08-13-verify-2g-ws-ingress.md) ·
> Bằng chứng: [`reports/harness/2026-08-13-2d-ws-ingress/`](reports/harness/2026-08-13-2d-ws-ingress/)

Sinh ra vì ô AC cuối của P2 tự đặt điều kiện "tick khi có ingress", và điều kiện
đó là thật chứ không phải thủ tục: `buildSessionWsUrl` dựng URL từ
`location.origin`, nên trình duyệt phải thấy `/` (web) và `/ws` (gateway) trên
MỘT origin — thứ mà `kubectl port-forward svc/platform-web` không bao giờ cho.

20. ✅ `infra/host/07-ingress-controller.sh` — Traefik 3.7.10 (chart 41.2.0, ghim
    + đối chiếu sha256 như `05-cluster-addons.sh`). **ClusterIP, không
    LoadBalancer** (kubeadm 1-node không có cloud provider ⇒ `<pending>` vĩnh
    viễn, không lỗi) và **không đặt trần CPU** (1.G-4: trần CPU làm gateway mất
    123ms/lượt attach qua throttle CFS, triệu chứng chỉ là "terminal lâu mở").
21. ✅ Bật Ingress gộp origin đã có sẵn từ 1.B0.4. `helm upgrade` **không dùng
    `--reuse-values`** (nó đánh rơi key mới) — dump `helm get values` ra file rồi
    truyền cùng values-selfhost. Diff dry-run báo chứng chỉ mTLS bị sinh lại;
    đó là **ảo giác của `--dry-run`** (`lookup` luôn trả rỗng khi dry-run —
    `templates/mtls-secret.yaml` đã ghi sẵn bẫy này). Chạy thật: 0 pod restart.
22. ✅ Sửa hai lỗi mà mọi cổng offline đều xanh, cả hai chỉ lộ nhờ đối chứng âm:
    - **Trần cho lượt handshake WS** (`packages/terminal/src/connection.ts`).
      Handshake có thể không mở được MÀ CŨNG KHÔNG thất bại: khi request upgrade
      rơi xuống Next, server không trả gì — `curl` treo trọn 20s với
      `http_code=000`, trình duyệt ở nguyên CONNECTING, **không** `error`,
      **không** `close`. Không có `close` thì backoff lẫn lượt hỏi lý do thật đều
      không bao giờ chạy. Bất kỳ proxy/LB nào nuốt upgrade đều cho hình dạng này.
    - **Không ai tiêu thụ `needsReasonLookup` trên trang bài học** — cờ mà
      `session-machine` đặt cho ca "1006 khi chưa từng ready" chỉ có một người
      đọc là `/session` của P1. Nay là hook dùng chung + `lessons.sessionStatus`
      (KHÔNG dùng `session.get` của P1 vì input của nó có `userId` — hình dạng
      2.B đã cố bỏ), và `state.message` được hiện lên header.

    ⚠ Vòng chẩn đoán ĐẦU TIÊN sai: tôi sửa vế thứ hai trước, deploy, đo lại và
    triệu chứng còn nguyên — vì thiếu vế thứ nhất thì không có sự kiện nào để
    phanh bắt. "UI đứng im" có ít nhất hai nguyên nhân khác hẳn nhau (sự kiện đến
    mà không ai xử lý / sự kiện không bao giờ đến) và chúng cho CÙNG triệu chứng.

### 2.E Nội dung mẫu ✅ XONG phần import (2026-08-13)

19. ✅ Import **4** scenario thật vào `content/scenarios/` (license đã verify bằng cách tải chính file LICENSE ở commit đã ghim). ✅ Smoke test toàn luồng (2026-08-13, sau khi có ingress): trên trình duyệt thật, import → hiển thị step → terminal nối và gõ được → `{{exec}}` bơm lệnh → "Kiểm tra" chấm **Đạt** → tiến độ lưu. [Bằng chứng](reports/harness/2026-08-13-2d-ws-ingress/browser-ws-checks.txt).

| id | license | biến thể format nó mang |
|---|---|---|
| `ckad-configmap-as-files` | MIT (`omkar-shelke25/ckad-killercoda`) | verify kubectl thật; mang `courseData` (field Killercoda không định nghĩa); imageid 2-node |
| `prolug-linux-system-checking` | MIT (`het-tanis/prolug-labs`) | step trong thư mục con; intro dùng `background`; ⚠ verify là `/bin/true` |
| `loki-quickstart` | Apache-2.0 (`grafana/killercoda`) | step không có title; không phase nào có verify |
| `loxilb-tcp-load-balancing` | Apache-2.0 (`loxilb-io/killercoda-examples`) | `assets` + `chmod`; intro có đủ fg/bg/verify; chứa `{{TRAFFIC_*}}` |

Nội dung giữ **nguyên văn** tại commit đã ghim; `node scripts/vendor-scenarios.mjs --check`
so byte để chống drift. Thêm bài mới: `docs/scenario-format.md` §6.

## File / dir ownership

| Owner | Đường dẫn |
|---|---|
| Parser | `packages/scenario/**`, `packages/shared-types/scenario.ts` |
| DB/tRPC | `apps/web/src/server/db/schema/{scenarios,progress}.ts`, `apps/web/src/server/trpc/routers/lessons.ts` |
| Validation | `apps/web/src/server/lessons/validate.ts` (gọi gateway exec), có thể thêm RPC `ExecInSession` ở `proto/` nếu cần |
| FE UI | `apps/web/src/app/lessons/**`, `packages/ui/lesson/**` |
| Nội dung | `content/scenarios/**` |

**Tránh đụng file:** parser (2.A) và FE (2.D) song song sau khi DTO chung chốt. `checkStep` cần đường exec P1 — nếu thêm RPC mới vào `proto/`, pin contract trước.

## Dependencies

- **Blocks:** P4 (Labs tái dùng validation + UI; CTF tái dùng engine).
- **Blocked by:** P1 (terminal engine, exec-in-pod, session lifecycle).
- **Nội bộ:** 2.A DTO → 2.B/2.D; 2.C cần đường exec P1 (có thể cần mở rộng proto).

## Acceptance criteria

**Chức năng:**
- [x] **Import scenario Katacoda thật → parse không lỗi** (≥3 scenario mẫu). — 4 scenario từ 3 repo, 62 test, [report 2.A](reports/2026-08-13-verify-2a-scenario-parser.md).
- [x] … → **hiển thị đủ step** ở FE. — đo trên cụm: `lessons.get` trả 4 step, markdown 450/559/971/905 ký tự. Ô này cũng là thứ bắt được `.dockerignore` loại `**/*.md` — image trước đó có ĐỦ thư mục nhưng 0 file `.md`.
- [x] Split-pane: nội dung trái render đúng; **resize được**; code copy button hoạt động. — resize đo trên trình duyệt thật (ArrowRight 50→52 ⇒ left 854→888px; End kẹp đúng `aria-valuemax`; tỉ lệ nhớ trong `localStorage`); 12 nút "Chép" + 4 nút "Chạy" trên nội dung vendored thật.
- [x] … → **terminal ở khoang phải nối được và gõ được**. — đóng 2026-08-13 bằng đúng điều kiện ô này tự đặt ra: dựng ingress controller ([`infra/host/07-ingress-controller.sh`](../../infra/host/07-ingress-controller.sh), Traefik — P3 §5/§6 đã chốt Traefik) rồi bật Ingress gộp origin có sẵn từ 1.B0.4. Đo trên trình duyệt thật: prompt shell sống trong khoang phải; gõ `echo …$(id -u)-$(hostname)` trả `0` + **đúng tên pod sandbox**; nút `{{exec}}` bơm nguyên văn lệnh vào PTY và chạy (`exit=28`). Kèm **đối chứng âm**: bỏ đúng luật `/ws` khỏi Ingress thì `/` vẫn 200 còn `/ws` rơi xuống Next (404 kèm CSP của web) — thiếu dòng này thì ô vẫn xanh cả khi WS tới gateway bằng đường khác. [Bằng chứng](reports/harness/2026-08-13-2d-ws-ingress/browser-ws-checks.txt).
  - ⚠ Đường vào là `kubectl port-forward -n traefik svc/traefik 8080:80` → `http://localhost:8080`, **không** phải NodePort theo IP node: cookie `dlp_sandbox` mang `Secure` vô điều kiện, và trình duyệt bỏ qua `Set-Cookie` `Secure` trên HTTP với host khác `localhost` — trong im lặng. Entry point thật + TLS là việc của P3.
- [x] Step nav Prev/Next + progress bar; step done được đánh dấu.
- [x] Bấm "Check" → verifyScript chạy trong pod, trả pass/fail đúng (test 1 step pass + 1 step fail). — 14/14 e2e trên cụm. FAIL `exit 1` với thông báo CỦA BÀI → PASS `exit 0`. **KHÔNG dùng `ckad`** như plan chỉ định: image sandbox không có `kubectl` nên vế pass bất khả — đúng gương của bẫy `/bin/true`. Dùng `dlp-sandbox-basics` (2.F).
- [x] Setup script chạy khi start; môi trường step đúng. — `background` chạy (`.setup-done = ready` trong pod), `foreground` TRẢ VỀ cho FE gõ vào WS, `assetsPushed=1`.
- [x] Progress lưu và khôi phục khi quay lại scenario. — `saveProgress` + `get`, 6 ca trong `lessons-authz.test.ts`; trên cụm `stepIndex 0 → 1` sau lượt chấm đạt.

**Bảo mật (luật §6):**
- [x] **Luật 1:** user A không đọc/sửa được `progress` của user B. — dạng mạnh hơn 403: input **không có field `userId`**, nên không có gì để giả mạo. 6 ca.
- [x] **Luật 3:** input `checkStep`/`saveProgress` field lạ hoặc sai type → reject (Zod strict). — 4 ca tRPC + 4 ca `phaseRefSchema`; phía Go `DisallowUnknownFields` cũng có ca riêng.
- [x] **Luật 4:** `lessons.list` `limit` lớn → ép ≤100. — kèm ca cursor chết → `BAD_REQUEST` (quay về trang 1 trong im lặng làm infinite-scroll lặp vô hạn).
- [x] **Validation isolation:** **[x] vế cấu trúc:** `Target` đọc từ Redis, không từ URL/body (`TestExecPassesExitCodeAndUsesRedisTarget`), bước g chặn token forge. **[x] vế NetworkPolicy:** verify chạy `curl 169.254.169.254` trong pod → bị chặn, `exit 0` (script khẳng định NGƯỢC). Kèm **đối chứng âm**: `curl https://example.com` trong cùng pod → `exit=28`. Thiếu đối chứng thì ô này vẫn xanh cả khi verify chạy nhầm chỗ.
- [x] **Gác đăng nhập theo tiền tố** (phát hiện ở 2.D): `/lessons/<id>` → 307, `/lessonsfoo` → 404 (không over-match). `PROTECTED_PATHS.includes()` cũ khớp CHÍNH XÁC nên trang chi tiết không được gác.
- [x] **Route asset không thành đường đọc file tuỳ ý:** ảnh → 200; `start.sh` → **404** (allowlist theo đuôi, không phát script sandbox); traversal thô và đã mã hoá → 404; chưa đăng nhập → 401.
- [x] Output verify bị cắt cỡ (không cho dump khổng lồ gây DoS). — `cappedWriter`, 4 ca, gồm ca biên "đúng bằng trần thì KHÔNG báo cắt" và ca "cắt cỡ không được làm mất exit code".

## Nợ chuyển sang P3 — ✅ ĐÃ ĐÓNG CẢ BA (2026-08-14)

> Báo cáo: [`reports/2026-08-14-verify-p2-debt-closure.md`](reports/2026-08-14-verify-p2-debt-closure.md)

1. ✅ **Gateway không log lượt thành công.** Đường nóng chỉ log lượt bị TỪ CHỐI,
   nên một phiên WS mở thành công và một lượt `POST /exec/session/{id}` thành
   công — cả hai đều là "mã vừa chạy trong pod của một người thật" — không để
   lại dòng nào; `kubectl logs deploy/platform-gateway` chỉ kể được chuyện những
   lượt KHÔNG xảy ra. Nay cả hai đường phát `slog.Info` (session/user/pod/ns,
   thêm `exit_code` cho exec; WS phát HAI dòng mở+đóng kèm duration).
   **KHÔNG** rate-limit như `deny` (audit log tự bỏ bớt dòng thì khoảng trống
   trong nó không phân biệt được với "không có gì xảy ra"), **KHÔNG** log
   output/script. 6 test, gồm 2 đối chứng âm.
2. ✅ **Nhãn tiến độ nói nhiều hơn thứ ta lưu.** Nhánh `completed` đặt X = N từ
   ĐÚNG một lượt chấm, nên nhảy thẳng tới bước cuối rồi chấm đạt cho
   "4/4 bước đã đạt" — một khẳng định về ba bước chưa từng được chấm. Sửa bằng
   ĐỔI NHÃN (`summarizeProgress`, hàm thuần + 5 test): xong bài ⇒ "Đã hoàn
   thành"; chưa xong ⇒ "X/N bước đã đạt **trong phiên này**" (`passedSteps` là
   state client nên nó không phải "từ trước tới giờ"). Lưu hẳn tập bước đã đạt
   cần đổi schema và vẫn thuộc chặng có UI tiến độ thật.
3. ✅ **Entry point thật + TLS.** `infra/host/08-tls-entrypoint.sh` sinh CA nội
   bộ + chứng chỉ cho `dlp.<ip>.sslip.io` (SAN mang cả DNS lẫn IP), tạo Secret
   TLS; Traefik chuyển sang NodePort ghim 30080/30443. Vào bằng
   `https://dlp.192.168.94.130.sslip.io:30443` từ **mọi máy trong LAN**, không
   còn `port-forward`. Đo trên cụm: `/` → 200 `tls_verify=0`; `/ws` → lỗi CỦA
   GATEWAY; handshake đúng subprotocol → `401 UNAUTHENTICATED` (tới được authz,
   không rơi xuống Next); Better Auth set được cookie **`__Secure-`** trên host
   KHÁC `localhost` — đúng thứ bất khả trước đây. Đối chứng âm: bỏ `--cacert` ⇒
   `http=000`.
   - openssl chứ không cert-manager: ở đây có ĐÚNG MỘT chứng chỉ cho cụm lab 1
     node, thêm một operator + CRD phải ghim version/sha256 để quản nó là đổi
     nhiều lấy ít. Khi P3 cần nhiều host hoặc gia hạn tự động thì mới đáng.

### Lỗi tự lộ ra khi đóng nợ 3 — `--set` KHÔNG có hiệu lực suốt từ 2.G

`07-ingress-controller.sh` viết `--set service.type=ClusterIP` kèm một khối chú
thích dài giải thích vì sao ClusterIP đúng. **Khoá đó không tồn tại trong chart
traefik v41** — nó là `service.spec.type`. Helm nhận key lạ mà không kêu một
tiếng, chart giữ nguyên mặc định `LoadBalancer`, và trên kubeadm 1-node thì
LoadBalancer nằm `<pending>` VĨNH VIỄN.

Thứ làm ca này khó thấy: `helm get values traefik` vẫn in ra `service.type:
ClusterIP`. Tức **chính lệnh người ta dùng để kiểm tra lại khẳng định điều
sai** — giá trị đã KHAI và đối tượng SỐNG nói hai điều khác nhau, và chỉ một
trong hai định tuyến được gói tin. Ô AC 2.G vẫn xanh vì nó đo qua
`port-forward`, mà port-forward đi thẳng tới Service nên nó không quan tâm
`type` là gì.

Sửa: đổi sang `service.spec.type`, **và** thêm bước "Khẳng định type + cổng trên
ĐỐI TƯỢNG SỐNG" đọc `.spec.type` bằng `kubectl` rồi `exit 1` nếu lệch. Giá trị
đã khai không phải bằng chứng.

## Yêu cầu nền tảng (chốt 2026-08-13) — ảnh hưởng P2 trở đi

Ba ràng buộc dài hạn của chủ dự án, ghi ở đây vì chúng quyết định hình dạng kiến
trúc chứ không phải một task lẻ:

1. **Ngang KillerCoda *và* KodeKloud — về TRẢI NGHIỆM HỌC, KHÔNG về mô hình kinh
   doanh.** Killercoda là mốc của 2.A/2.E (format scenario). Lấy từ KodeKloud:
   playground, IDE, quiz, và cách gom nhiều bài thành một lộ trình học.

   ⛔ **KHÔNG dựng phần bán khoá học** (chốt 2026-08-13): không pricing/gói cước,
   không thanh toán, không paywall, không giỏ hàng, không chứng chỉ-như-hàng-hoá,
   không phễu marketing. Ghi ra đây vì "ngang KodeKloud" đọc trần rất dễ kéo theo
   cả tầng thương mại của họ, và tầng đó là thứ ĐẮT nhất để lỡ dựng: nó đẻ ra
   nghĩa vụ pháp lý (hoá đơn, hoàn tiền, dữ liệu thẻ) mà một đề tài NCKH không có
   lý do gì gánh. Nếu một task tương lai nhắc tới `payment`/`subscription`/
   `pricing`, nó nằm ngoài phạm vi cho tới khi chủ dự án nói khác.

   Hệ quả cho thiết kế: "khoá học" nếu có chỉ là **cách nhóm nội dung** (một danh
   sách scenario có thứ tự), không phải một đơn vị bán hàng — nên nó không cần
   `price`, `sku`, `entitlement`, hay bất kỳ khái niệm quyền-truy-cập-theo-tiền
   nào. Quyền truy cập vẫn chỉ là đăng nhập (luật 1).
2. **Có IDE Theia như KodeKloud.** Móc đã có sẵn trong DTO: `interfaceLayout`
   (`interface.layout: "ide"` của Killercoda upstream — `packages/shared-types/src/scenario.ts`)
   và `capabilities`. Cả hai đã chảy tới FE qua `lessons.get`. Lane Theia là một
   chặng riêng (dựng image + layout ba khoang), **chưa** làm ở lượt này.
3. **Soạn bài trực tiếp trên UI, không hardcode vào repo.** Đây là lý do
   `ScenarioSource` là một interface (`packages/scenario/src/source.ts`) chứ
   không phải một lời gọi `loadScenarios()` rải trong router. Bản DB-backed hiện
   thực đúng `list()` + `get()`; router, `checkStep` và FE không biết khác biệt.
   Bảng `scenarios` sinh ra ở chặng đó — lúc nó là NGUỒN, không phải bản sao của
   đĩa (xem 2.B task 6).

## Verify commands

```bash
# Parser trên kho thật  (2.A + 2.E — đã chạy, xem report)
pnpm --filter @devops-platform/scenario test    # 62 PASS: parse 4 scenario thật, 0 lỗi
node packages/scenario/scripts/parse.mjs content/scenarios/ckad-configmap-as-files [--json]
node scripts/vendor-scenarios.mjs --check       # nội dung khớp commit đã ghim (chạm mạng)

# tRPC lessons + IDOR  (2.B — đã chạy: 21 ca)
#
# ⚠ KHÔNG viết `test -- lessons`: `--` tự nó thành một filter khớp MỌI file, nên
# lệnh đó chạy cả suite và chỉ TRÔNG như đang lọc (16 file thay vì 3).
pnpm --filter web test lessons             # 3 file / 40 ca — gồm authz progress (userA != userB)
pnpm --filter web test phase               # nhánh intro/finish vắng mặt (scenario dựng tay)

# Gateway exec one-shot  (2.C — đã chạy: 32 ca)
cd services/terminal-gateway && go test ./internal/execroute/... ./internal/podexec/...

# Image web PHẢI mang packages/scenario + content/  (đã đo, kèm đối chứng âm)
docker build -f apps/web/Dockerfile -t dlp/web:test .
docker run --rm --entrypoint sh dlp/web:test -c 'ls $SCENARIOS_DIR'   # 4 thư mục

# FE — split-pane lesson UI  (2.D — đã chạy: ui 29 ca jsdom + phases 8 ca)
pnpm --filter @devops-platform/ui test     # SplitPane/StepNav/ProgressBar/ContentView
pnpm --filter web test phases              # ánh xạ key ↔ stepIndex

# ⛔ Image PHẢI mang cả .md, không chỉ thư mục. `ls` KHÔNG đủ mạnh — nó liệt kê
#    thư mục, mà thư mục thì luôn có thật kể cả khi .dockerignore đã loại hết md.
docker run --rm --entrypoint sh dlp/web:test -c 'find $SCENARIOS_DIR -name "*.md" | wc -l'   # 26

# checkStep e2e trên CỤM  (2.D — đã chạy: 14/14 PASS)
#   kubectl port-forward svc/platform-web 3000:3000
#   node plans/devops-learning-platform/reports/harness/2026-08-13-2d-lessons-e2e/e2e-lessons.mjs
#
# ⚠ Dùng `dlp-sandbox-basics`, KHÔNG dùng `ckad-configmap-as-files` như bản plan
#   cũ ghi: image sandbox không có kubectl nên verify của ckad luôn
#   `command not found` ⇒ vế PASS bất khả (gương của bẫy /bin/true ở prolug).
# ⚠ Harness PHẢI gửi header `Origin` khớp `corsAllowedOrigins`, nếu không
#   Better Auth trả 403 MISSING_OR_NULL_ORIGIN — `curl` qua được, `fetch` của
#   Node thì không, nên hai công cụ cho hai kết quả khác nhau.

# Ingress + terminal WS trên trình duyệt  (2.G — đã chạy)
bash infra/host/07-ingress-controller.sh          # trên node; ghim chart + sha256
helm get values platform -o yaml > /tmp/live-values.yaml
helm upgrade platform infra/helm/platform \
  -f infra/helm/platform/values-selfhost.yaml -f /tmp/live-values.yaml \
  --set ingress.enabled=true --set ingress.className=traefik
kubectl port-forward -n traefik svc/traefik 8080:80     # rồi mở http://localhost:8080

# Định tuyến: `/ws` PHẢI trả lỗi CỦA GATEWAY, không phải 404 của Next.
curl -s http://localhost:8080/ws/session/x      # {"code":"SUBPROTOCOL_REQUIRED",...}

# ⛔ `curl` GET thường KHÔNG đủ mạnh cho ca handshake treo — nó trả 404 ngay.
#    Phải gửi ĐÚNG một request upgrade thì mới thấy server im lặng (http=000):
curl -s -o /dev/null -w "%{http_code} %{time_total}\n" --max-time 20 \
  -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  http://localhost:8080/ws/session/x
```

## Risk Assessment (P2)

| Rủi ro | Likelihood | Impact | Score | Mitigation |
|---|---|---|---|---|
| Format Katacoda/Killercoda biến thể → parser lệch | 3 | 3 | 9 | Test trên kho thật đa dạng; báo lỗi rõ format sai; hỗ trợ subset trước. |
| verifyScript chạy sai chỗ (leak ra host/gateway) | 2 | 5 | 10 | Bắt buộc exec TRONG pod session (đường P1); review; test isolation. |
| Progress IDOR | 2 | 4 | 8 | Authz theo ctx.user.id mọi query; test. |
| Setup script chậm → start scenario lâu | 3 | 2 | 6 | Chạy async, hiện trạng thái provisioning; cache image layer. |

Không rủi ro ≥15 ở P2 (đường găng đã ở P1). Rủi ro cao nhất là isolation của verifyScript → dựa trên hardening P1.

## Timeline (P2)

| Task nhóm | Effort | Notes |
|---|---|---|
| 2.A Parser | M | Blocks 2.B/2.D |
| 2.B DB + tRPC lessons | M | |
| 2.C Validation engine | M | Cần exec P1 |
| 2.D FE split-pane UI | M | Song song sau DTO |
| 2.E Nội dung mẫu | S | |
| **Total P2** | **M** | Critical sub-path: 2.A → 2.C (validation qua engine) |
