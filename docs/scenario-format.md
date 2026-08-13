# Format scenario — Killercoda upstream ⇄ DTO của nền tảng

SSOT cho `packages/scenario`, `packages/shared-types/src/scenario.ts` và
`content/scenarios/`. Chặng **P2 / 2.A + 2.E**
([phase-2.md](../plans/devops-learning-platform/phase-2.md)).

Mọi khẳng định về Killercoda ở đây được đọc từ nguồn thật ngày **2026-08-13**:
trang docs của creator (`https://killercoda.com/creators`, nội dung nằm sau
JavaScript nên phải mở bằng trình duyệt) và kho
`killercoda/scenario-examples`. Con số/kết luận nào không có nguồn thì được ghi
rõ là suy đoán.

---

## 1. `index.json` upstream

```jsonc
{
  "title": "…",                       // bắt buộc
  "description": "…",                 // tuỳ chọn
  "details": {                        // tuỳ chọn (!) — xem §1.1
    "intro":  { "title"?, "text", "foreground"?, "background"?, "verify"? },
    "steps":  [ { … như intro … } ],
    "finish": { … như intro … },
    "assets": { "host01": [ { "file", "target", "chmod"? } ] }
  },
  "backend": { "imageid": "ubuntu" }, // bắt buộc
  "interface": { "layout": "ide" }    // tuỳ chọn
}
```

- `text` / `foreground` / `background` / `verify` đều là **đường dẫn tương đối**
  tới file trong thư mục scenario, không phải nội dung.
- `foreground` hiện mọi lệnh trong terminal người học nhìn thấy; `background`
  chạy ẩn. Docs phân biệt rõ hai thứ này, nên DTO **không gộp** chúng.
- `verify` **pass khi exit code = 0** (docs § Verification Scripts). Đây là
  contract mà 2.C phải hiện thực.
- `assets` đẩy file vào sandbox lúc start; `file` chấp nhận glob.

### 1.1 Ba chỗ upstream lỏng hơn ta

| Upstream cho phép | Ta làm gì | Vì sao |
|---|---|---|
| Không có `details` (vd. `ubuntu-simple`) | Loader **từ chối** | Với Killercoda đó là playground; với nền tảng học thì một bài không có bước nào là trang trắng. |
| Step không có `title` (vd. `use-images`) | **Chấp nhận**, `title: null` | Có thật trong nội dung ta vendor (`loki-quickstart`). FE phải chịu được. |
| Phase không có `verify` | **Chấp nhận**, `verifyScript: null` | `loki-quickstart` không có verify nào ⇒ nút Check của 2.D phải ẩn được, không phải luôn hiện. |

### 1.2 Field lạ — `courseData` và cơ chế khai báo

Killercoda **không** định nghĩa `courseData`; nó là di sản Katacoda. Vậy mà
scenario thật đầu tiên vendor về (`ckad-configmap-as-files`) vẫn mang
`details.intro.courseData: "setup.sh"` — nhiều khả năng chính Killercoda cũng
đang bỏ qua nó và `setup.sh` của bài đó chưa từng chạy ở upstream.

Vì thế schema `.strict()` toàn phần, và đường thoát DUY NHẤT là khai tường minh
trong sidecar:

```jsonc
{ "acknowledgedUnknownFields": ["details.intro.courseData"], "notes": "lý do…" }
```

Ba phép kiểm đi kèm, cả ba đều là lỗi cứng:

1. Field lạ **chưa khai** → từ chối, nêu đúng đường dẫn chấm.
2. Khai mà **không có `notes`** → từ chối (một lời khai không lý do thì lần
   review sau không ai biết nó đã được xem xét hay chỉ dán vào cho hết lỗi).
3. Khai **thừa** (upstream đã dọn field) → từ chối, bắt xoá lời khai cũ.

Field đã khai được ghi lại ở `Scenario.ignoredUpstreamFields` — bỏ qua thì có,
bỏ qua trong im lặng thì không.

### 1.3 Hành động code trong markdown

| Viết | Nghĩa | DTO |
|---|---|---|
| `` `cmd` `` | inline, copy-được mặc định | ở nguyên trong markdown, FE lo |
| `` `cmd`{{}} `` | tắt copy | `action: 'none'` |
| `` `cmd`{{exec}} `` | bấm để chạy | `action: 'exec'` |
| `` `cmd`{{exec interrupt}} `` | Ctrl+C rồi chạy | `action: 'exec-interrupt'` |
| ```` ```…```{{copy}} ```` | khối, bấm để copy | `action: 'copy'` |
| ```` ```…```{{exec}} ```` | khối, bấm để chạy | `action: 'exec'` |

**Bẫy:** `{{TRAFFIC_SELECTOR}}` / `{{TRAFFIC_HOST1_80}}` dùng cùng cặp ngoặc
nhưng là **biến thay thế trong văn xuôi**, không phải hành động. Thứ phân biệt
là vị trí: hành động phải dính liền ngay sau backtick đóng. Nội dung thật đã có
ca này — `loxilb` step 3 chứa `[ACCESS WIRESHARK]({{TRAFFIC_HOST1_3000}})`.

Verb lạ (`{{open}}`, `{{run}}`…) → **ném**. Bỏ qua thì hậu tố hiện nguyên văn
giữa bài; đoán bừa thì nút làm sai việc.

---

## 2. DTO của nền tảng

`packages/shared-types/src/scenario.ts`. Hai khác biệt so với bản phác trong
phase-2.md, cả hai đều là hệ quả bắt buộc chứ không phải sở thích:

### 2.1 `markdown`, KHÔNG phải `markdownHtml`

Plan viết `Step{index, markdownHtml, …}`. Không dùng được, vì:

1. **Derived field.** HTML tính được 100% từ markdown
   (`rules/code-conventions.md` § No Derived Fields).
2. **HTML không chở nổi phần tương tác.** `{{exec}}` phải thành NÚT nối vào
   terminal; một chuỗi HTML không có chỗ gắn handler. Ô AC "code copy button
   hoạt động" không đóng được bằng `markdownHtml`.

Đường thay thế: giữ markdown nguyên văn, và hàm **thuần**
`parseContentBlocks(markdown)` được cả server (2.C) lẫn FE (2.D) gọi. Một nguồn,
một hàm.

### 2.2 `difficulty` đến từ sidecar, không parse được

Killercoda `index.json` **không có** field độ khó (code search
`"difficulty" path:index.json` → 0 kết quả; docs không liệt kê). Plan viết nó
như thể đọc được từ Katacoda. Nó là field **bắt buộc** của `dlp.json`, không có
default — một default ngầm `'beginner'` làm mọi bài trông dễ như nhau mà không
ai biết vì sao.

---

## 3. Sidecar `dlp.json`

File do **ta** sở hữu, nằm cạnh `index.json`. File upstream giữ **nguyên văn**
để `vendor-scenarios.mjs --check` so được byte-với-byte và để lời khai license
còn đúng.

```jsonc
{
  "id": "ckad-configmap-as-files",   // = tên thư mục, = progress.lesson_id
  "difficulty": "intermediate",
  "estimatedMinutes": 15,
  "source": { "repo", "commit", "path", "license", "licenseUrl", "upstreamTitle" },
  "acknowledgedUnknownFields": [],
  "notes": null
}
```

Sidecar **không** khai `tier`/`capabilities`: chúng suy trọn vẹn từ
`backend.imageid` qua bảng `BACKEND_IMAGE_MAPPING` (`packages/scenario/src/backend.ts`).
Khai thêm là dựng derived field.

`id` bị ép **trùng tên thư mục**. Không phải bản sao thừa: nó là ràng buộc để
đổi tên thư mục không thể lặng lẽ làm mồ côi mọi dòng `progress` đã lưu.

### 3.1 Ánh xạ `imageid` → tier

| imageid | tier | capabilities |
|---|---|---|
| `ubuntu` | sysbox | — |
| `kubernetes-kubeadm-1node`(`-rapid`, `-4GB-rapid`) | sysbox | `kubernetes` |
| `kubernetes-kubeadm-2nodes`(`-rapid`) | sysbox | `kubernetes`, `multi-node` |

Là **bảng**, không phải heuristic tiền tố; imageid lạ → ném. Mọi dòng là
`sysbox` vì đó là tier duy nhất P1 dựng thật (1.E-2). `gvisor`/`kata` có trong
enum proto/DB nhưng chưa có runtime — điền vào đây là hứa thứ không tồn tại.

> ⚠ `kubernetes` hôm nay là **nhãn cảnh báo đọc được bằng máy**, không phải lời
> hứa chạy được: P1 đã chứng minh DinD trong pod Sysbox, kubeadm-trong-pod thì
> **chưa**. 2.C/2.D phải dùng nhãn này để chặn hoặc cảnh báo.

---

## 4. Chốt cho 2.C — `checkStep` đi đường nào

**Quyết định (chốt 2026-08-13, chưa hiện thực):** `checkStep` gọi một endpoint
HTTP **one-shot trên `terminal-gateway`**, không thêm RPC vào
`proto/orchestrator/v1`.

```
POST /exec/session/{id}     Cookie: dlp_sandbox=<sandbox token BFF tự mint>
body   { script: "<nội dung verifyScript>" }
200    { exitCode: number, stdout: string, truncated: boolean }
```

Lý do:

- Đường exec vào pod **đã tồn tại và đã hardening** ở gateway
  (`internal/podexec`), không ở orchestrator. Orchestrator hiện **không có** mã
  exec và cũng không có RBAC `pods/exec`; thêm RPC ở đó là nhân đôi
  `podexec` sang service thứ hai và mở thêm một quyền vào apiserver.
- Dùng lại **nguyên** chuỗi chín bước authz của
  `docs/ws-terminal-protocol.md` §3 — trong đó có bước g (`hash.userId ==
  token.sub`) và việc `podName`/`namespace` đọc từ **Redis** chứ không từ input.
  Đó chính là thứ làm ô AC "verifyScript chạy TRONG pod cô lập" đúng theo cấu
  trúc chứ không theo lời hứa.
- BFF đã mint được `aud=gateway` token (`apps/web/src/server/auth/jwt.ts`
  `mintSandboxTokenFor`), nên không cần cơ chế xác thực mới.

Khác biệt so với đường WS mà 2.C **phải** xử lý riêng:

| Vấn đề | Ghi chú cho 2.C |
|---|---|
| `GATEWAY_EXEC_COMMAND` là hằng số phía server (contract §3c cấm client chọn lệnh) | verify script là **nội dung do server đọc từ đĩa**, không phải chuỗi từ client — ranh giới đó phải giữ nguyên: BFF gửi script lấy từ `Scenario.steps[i].verifyScript`, tuyệt đối không nhận script từ body của người dùng. |
| `podexec` đặt `Stderr:false, TTY:true` | exec one-shot cần exit code, nên **không** dùng TTY: phải `Stderr:true, TTY:false` và đọc `exitCode` từ status của `remotecommand`. Đây là một executor **khác**, dùng chung `Target`. |
| Trần WS đồng thời D17=1 | exec one-shot **không** được chiếm khe WS, nếu không bấm Check sẽ đá văng terminal đang mở. |
| Output khổng lồ | cắt cỡ ở gateway (ô AC "output verify bị cắt cỡ"), báo `truncated: true`. |

---

## 5. Verify commands

```bash
pnpm --filter @devops-platform/scenario test        # parse ≥3 scenario thật, 0 lỗi
node packages/scenario/scripts/parse.mjs content/scenarios/ckad-configmap-as-files
node scripts/vendor-scenarios.mjs --check           # nội dung khớp commit đã ghim (chạm mạng)
```

## 6. Thêm một scenario mới

1. `mkdir content/scenarios/<id>` và viết `dlp.json` (§3). Kiểm license upstream
   **trước** — không có file LICENSE nghĩa là all-rights-reserved, không vendor
   được (`killercoda/scenario-examples` chính là ca đó).
2. `node scripts/vendor-scenarios.mjs --fetch --only <id>`.
3. `node packages/scenario/scripts/parse.mjs content/scenarios/<id>` — đọc lỗi
   nếu có; field lạ thì khai vào `acknowledgedUnknownFields` kèm `notes`.
4. `pnpm --filter @devops-platform/scenario test`.
