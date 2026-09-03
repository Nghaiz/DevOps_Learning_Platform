# Format lab + playground — nội dung trên đĩa ⇄ DTO của nền tảng

SSOT cho `packages/scenario/src/{lab,lab-loader,lab-score,playground,
playground-loader}.ts`, `packages/shared-types/src/{lab,playground}.ts` và
`content/{labs,playgrounds}/`. Chặng **P8 / 8.A + 8.E**
([phase-8.md](../plans/devops-learning-platform/phase-8.md)), theo hợp đồng
tích hợp
[`contract.md`](../plans/devops-learning-platform/reports/harness/2026-09-04-p8-contract/contract.md).

Đọc cùng [`docs/scenario-format.md`](scenario-format.md) — lab và playground
KHÔNG phải hai cây DTO song song với scenario, chúng `extend`/`pick` từ
`contentBaseSchema` (xem `packages/shared-types/src/scenario.ts`) và mượn lại
gần như mọi kỷ luật loader của scenario. Tài liệu này chỉ ghi ra những gì
**khác** scenario, và vì sao.

---

## 1. Lab khác Scenario ở đúng MỘT điểm bản chất

> Lesson **dẫn** người học qua từng bước đã có sẵn đáp án; lab **giao việc**
> rồi chấm kết quả cuối.

Mọi thứ khác — sandbox, terminal, kênh `/exec`, phân loại lỗi của
`validate.ts` — dùng lại nguyên vẹn (xem §4). Vì vậy `Lab` không có cây DTO
riêng: nó `extend` `contentBaseSchema` và chỉ thay `steps[]` bằng `tasks[]`.

### 1.1 Một file, không hai

Scenario tách `index.json` (upstream, giữ NGUYÊN VĂN để so byte-với-byte) khỏi
`dlp.json` (sidecar do ta viết). Lab KHÔNG có upstream — không có gì cần giữ
nguyên văn — nên chỉ có **một** file: `content/labs/<id>/lab.json`. Nó gộp
đúng những gì hai file kia gộp lại:

```jsonc
{
  "id": "dlp-linux-triage",              // = tên thư mục, = lab_attempts.lab_id
  "title": "…",
  "description": "…",                    // tuỳ chọn, vắng ⇒ null
  "difficulty": "intermediate",          // bắt buộc, không default
  "estimatedMinutes": 30,                // bắt buộc (nullable), không default
  "source": null,                        // bắt buộc (nullable), không default
  "backend": { "imageid": "ubuntu" },    // bắt buộc — cùng hình dạng index.json
  "interface": { "layout": "ide" },      // tuỳ chọn — cùng hình dạng index.json
  "tasks": [
    { "id": "find-kill-runaway", "title": "…", "weight": 2, "hint": "…" }
  ],
  "setup": {                             // tuỳ chọn
    "foreground": "setup/foreground.sh",
    "background": "setup/background.sh"
  },
  "passThresholdPercent": 80,            // tuỳ chọn, default 100
  "leaderboard": true                    // tuỳ chọn, default false
}
```

`tier`/`capabilities` suy trọn vẹn từ `backend.imageid` qua CHÍNH bảng
`BACKEND_IMAGE_MAPPING` mà scenario dùng (`packages/scenario/src/backend.ts`)
— một imageid lạ NÉM và liệt kê imageid đã biết, giống hệt loader scenario.

### 1.2 Nội dung task nằm TRÊN ĐĨA, không trong JSON

`tasks[]` trong `lab.json` CHỈ mang bốn field editorial: `id`, `title`,
`weight?`, `hint?`. KHÔNG có `markdown`/`verify` — hai thứ đó nằm ở file quy
ước theo TÊN, suy từ `id` của task:

| Task `id` | Markdown | Verify script |
|---|---|---|
| `find-kill-runaway` | `task-find-kill-runaway.md` | `task-find-kill-runaway/verify.sh` |

Đây là cùng nguyên tắc "nội dung trên đĩa, không trong JSON" mà loader
scenario đã áp (`readRelative` đọc NỘI DUNG chứ không giữ đường dẫn) — điểm
khác duy nhất: scenario khai đường dẫn TƯỜNG MINH trong `index.json`
(`"text": "step1.md"`), lab suy đường dẫn từ `id` theo QUY ƯỚC. Ít một field
khai báo nghĩa là ít một chỗ hai nguồn (id trong `tasks[]` và tên file vật lý)
có thể lệch nhau.

### 1.3 `verifyScript` KHÔNG nullable — khác `ScenarioPhase`

Một lesson-step không chấm vẫn là một step hợp lệ (nó chỉ dẫn giải, nút
"Kiểm tra" ẩn đi). Một lab-task không chấm được thì KHÔNG PHẢI một task hợp
lệ — nó là một đoạn văn nằm trong bảng điểm, và sẽ mãi ở trạng thái "chưa đạt"
mà không có cách nào đạt. Loader từ chối nó ở BIÊN NHẬP, hai ca:

1. `task-<id>/verify.sh` **vắng mặt** — lỗi đọc file, nêu đúng task nào.
2. `task-<id>/verify.sh` **có mặt nhưng RỖNG** (chỉ khoảng trắng/dòng trống) —
   một script rỗng thoát mã 0 (shell không có gì để chạy), tức nó **luôn**
   "đạt" mà không kiểm gì. Đây là bản còn tệ hơn khiếm khuyết
   `docs/scenario-format.md` đã ghi cho `prolug` (ba `verify.sh` đều
   `/bin/true` — ít nhất `/bin/true` là một lệnh trung thực về việc nó không
   làm gì; một file rỗng thậm chí không phải một lệnh).

`content-labs.test.ts` khẳng định KHÔNG task nào trong kho thật dùng verify
no-op (`/bin/true`, `true`, `exit 0` trần trụi) — cùng bài học `prolug` đã dạy
ở P2, lần này chặn bằng test thay vì chỉ bằng comment cảnh báo.

### 1.4 Default sống ở FILE schema, KHÔNG ở DTO

| Field | File (`lab.json`) | DTO (`Lab`/`LabTask`) |
|---|---|---|
| `tasks[].weight` | tuỳ chọn, default **1** | bắt buộc |
| `tasks[].hint` | tuỳ chọn, default **null** | bắt buộc (nullable) |
| `passThresholdPercent` | tuỳ chọn, default **100** | bắt buộc |
| `leaderboard` | tuỳ chọn, default **false** | bắt buộc |

Cùng lý do `difficulty` của scenario không có default ngầm ở tầng DTO
(`docs/scenario-format.md` §2.2): một default áp SAU LOADER làm mọi thứ trông
giống nhau mà không ai biết vì sao khi đọc thẳng DTO. `difficulty`/
`estimatedMinutes`/`source` vì thế KHÔNG có default ở CẢ HAI tầng — chúng
buộc người viết `lab.json` phải khai tường minh, giống hệt `dlp.json`.

### 1.5 KHÔNG có field `assets`

Chưa lab first-party nào trong repo này cần đẩy file ngoài `content/labs/<id>`
vào sandbox (khác `dlp-docker-basics`, cần `app.py`). Loader luôn gán
`Lab.assets = []`. Thêm field `assets` vào `lab.json` mà chưa ai dùng là lời
hứa suông (`rules/coding-guidelines.md` §2 — không "flexibility" chưa ai xin).
Ngày một lab thật sự cần asset, thêm field này vào `labFileSchema`
(mirror `killercodaDetailsSchema.assets` của `killercoda.ts`) — không sớm
hơn.

---

## 2. Playground — loại nội dung ĐƠN GIẢN nhất

Killercoda gọi một scenario không có `details` là "playground". Loader
scenario của ta **cố ý từ chối** hình dạng đó (`docs/scenario-format.md`
§1.1): một bài học không có bước nào là trang trắng. Playground THẬT vì thế
là một loại nội dung RIÊNG, không phải một scenario rỗng hay một lab không
task — nới `steps.min(1)`/`tasks.min(1)` thành `min(0)` sẽ mở lại đúng cánh
cửa đó.

`playgroundSchema` (`packages/shared-types/src/playground.ts`) `pick` từ
`contentBaseSchema` đúng sáu field còn có nghĩa khi không có bài
(`id, title, description, tier, capabilities, backendImageId,
interfaceLayout`), cộng `ttlSeconds` riêng — KHÔNG có `difficulty`/
`estimatedMinutes`/`assets`/`source`: không có bài thì không có độ khó, không
có thời lượng, và không có gì để dẫn nguồn.

### 2.1 File PHẲNG, không thư mục

```
content/playgrounds/dlp-linux-playground.json
content/playgrounds/dlp-docker-playground.json
```

Mỗi playground là ĐÚNG một file JSON — không markdown, không verify script đi
kèm (không có bài để chấm). `id` BẮT BUỘC trong file và loader ép nó TRÙNG tên
file (không phần mở rộng), cùng ràng buộc `lab.json`/`dlp.json`: `id` là định
danh mà `playgrounds.start` dùng để mở phiên, đổi tên file mà quên đổi field
này sẽ làm route `/playgrounds/<id>` trỏ sai.

```jsonc
{
  "id": "dlp-linux-playground",
  "title": "…",
  "description": "…",                 // tuỳ chọn, vắng ⇒ null
  "backend": { "imageid": "ubuntu" },
  "interface": { "layout": "ide" },    // tuỳ chọn
  "ttlSeconds": 1800
}
```

### 2.2 `ttlSeconds` là DỮ LIỆU, không phải hằng số server

Trần trên 7200 giây (2 giờ) khớp `HARD_CAP` của orchestrator (D11) — một TTL
vượt trần đó là lời hứa mà hạ tầng sẽ phá trong im lặng: session bị reap giữa
chừng và người học chỉ thấy terminal chết. AC 8.E đòi con số này **hiện trên
UI trước khi người dùng bắt đầu**, nên nó phải là dữ liệu của nội dung
(`playgroundSchema.ttlSeconds`), không phải một hằng số chôn trong code server
mà FE không đọc được.

Hai playground first-party trong repo dùng `ttlSeconds: 1800` (30 phút) —
ngắn hơn hẳn trần `lab`/`lesson`: playground không có tiến độ để mất, nên
không có lý do giữ phiên lâu như một bài đang làm dở.

---

## 3. Nạp từ đĩa — `lab-loader.ts` / `playground-loader.ts`

Cả hai mirror kỷ luật `loader.ts` của scenario:

1. Đọc + kiểm `lab.json`/`<id>.json` **TRƯỚC**, chỉ chạm file nội dung
   (markdown/verify) SAU khi file chính đã hợp lệ — một `lab.json` sai cấu
   trúc phải báo lỗi về CHÍNH `lab.json`, không phải về file markdown cuối
   cùng đọc được.
2. **Zod `.strict()` toàn phần.** Một field lạ bị từ chối, thông báo lỗi NÊU
   ĐÚNG ĐƯỜNG DẪN CHẤM tới field đó (`tasks.0.markdown`, `somethingNew`) — cùng
   cơ chế `parseKillercodaIndex`/`formatIssues` của `killercoda.ts`. Hàm
   `formatContentIssues` (xuất từ `lab-loader.ts`) dùng CHUNG cho cả lab lẫn
   playground, tránh hai bản chép cách trình bày lỗi lệch nhau.
3. **Guard traversal** trên mọi đường dẫn tương đối (`readRelative` cục bộ
   trong `lab-loader.ts`) — cùng lý do `loader.ts`: không phải phòng thủ
   trước kẻ tấn công (nội dung được review), mà phòng thủ trước một `../` gõ
   nhầm.
4. **Kiểm lại DTO bằng chính schema** (`labSchema.safeParse`/
   `playgroundSchema.safeParse`) ở CUỐI hàm nạp — bắt lỗi của LOADER (một field
   quên gán), không phải lỗi của nội dung.
5. **Một mục hỏng làm hỏng CẢ MẺ** (`loadLabs`/`loadPlaygrounds`) — bỏ qua
   trong im lặng làm trang `/labs`/`/playgrounds` chỉ đơn giản thiếu một mục,
   và CI vẫn xanh.

### 3.1 `LabError` / `PlaygroundError` — không dùng chung `ScenarioError`

`packages/scenario/src/errors.ts` (`ScenarioError`) hardcode chuỗi
`"scenario ${dir}: …"` trong thông điệp — dùng nó cho lỗi lab/playground sẽ
in nhầm "scenario /content/labs/…". `lab-loader.ts` và `playground-loader.ts`
mỗi file tự định nghĩa một class lỗi cục bộ (`LabError`/`PlaygroundError`),
cùng hình dạng `ScenarioError` (constructor `(dir, message, {cause?})`,
`super()` gắn tiền tố loại nội dung) — cùng khuôn `KillercodaFormatError` của
`killercoda.ts`, vốn cũng không sống trong `errors.ts` dùng chung.

---

## 4. Chấm điểm — hai tầng, KHÔNG lưu field suy ra được

### 4.1 Bảng lưu SỰ KIỆN, không lưu KẾT LUẬN

`lab_attempts`/`lab_task_results` (Postgres, `apps/web/src/server/db/schema.ts`)
chỉ lưu những gì KHÔNG suy được từ cột khác — xem
[`contract.md`](../plans/devops-learning-platform/reports/harness/2026-09-04-p8-contract/contract.md)
§1 để có danh sách cột đầy đủ. Ba field sau đây bị **CẤM** có cột riêng vì cả
ba đều `f(dữ liệu đã lưu)`:

| Field bị cấm lưu | Suy từ |
|---|---|
| `lab_attempts.score`/`percent`/`status` | `tasks[]` của lab + `lab_task_results` đã lưu |
| `lab_attempts.duration_seconds` | `started_at` − `submitted_at` |
| `lab_task_results.passed` | `exit_code === 0` |
| `lab_task_results.attempt_no` | vị trí dòng trước đó của cùng `(attempt_id, task_id)` |

Một cột lưu lại thứ tính được là dựng HAI nguồn sự thật cho cùng một câu hỏi
(`rules/code-conventions.md` § No Derived Fields) — chúng lệch nhau ở lần đầu
tiên ai đó sửa quy ước `exit code` mà quên đồng bộ cột đã lưu.

### 4.2 Bốn hàm THUẦN — `lab-score.ts`

```ts
latestResultPerTask(results)              // Map<taskId, kết quả MỚI NHẤT>
computeLabScore(lab, results)              // → LabScore { earnedWeight, totalWeight, percent, passedTaskIds }
computeLabStatus(lab, score, submittedAt)  // → 'in_progress' | 'passed' | 'failed'
computeAttemptDurationSeconds(startedAt, submittedAt) // → số giây | null
```

KHÔNG chạm DB, KHÔNG chạm mạng — router (P8/§3) nạp `lab_task_results` từ
Postgres rồi gọi các hàm này. Tách thành hàm thuần không chỉ để dễ test: nó là
ĐIỀU KIỆN để "không lưu field suy ra được" còn đúng lâu dài — nếu phép tính
nằm lẫn trong router, không có gì ngăn một ngày nào đó ai đó thêm lại cột
`percent` "cho nhanh".

Quy ước chốt cứng (khớp
[`contract.md`](../plans/devops-learning-platform/reports/harness/2026-09-04-p8-contract/contract.md)
§2, có test riêng cho từng dòng ở `lab-score.test.ts`):

- Một task ĐẠT ⇔ kết quả **MỚI NHẤT** của nó (theo `checkedAt`) có
  `exitCode === 0`. Task chưa chấm lần nào ⇒ coi như chưa đạt.
- `checkedAt` **bằng nhau** ⇒ giữ dòng **đứng sau** trong mảng (ổn định, có
  test riêng cho cả hai chiều mảng).
- `percent = Math.floor(earnedWeight * 100 / totalWeight)`. `totalWeight` là
  tổng `weight` của **mọi** task trong lab, kể cả task chưa chấm — bỏ dở một
  task luôn kéo điểm xuống, không lặng lẽ biến mất khỏi mẫu số.
- `percent` làm tròn **XUỐNG**: một lab mốc 80% mà người học đạt 79.6% hiện
  "79%" và trượt, không phải "80%" rồi vẫn trượt.
- `computeLabStatus`: `submittedAt === null` ⇒ `'in_progress'`. Ngược lại so
  `percent` với `lab.passThresholdPercent` **của chính lab đó** — mỗi lab tự
  khai mốc đạt của mình, không phải một hằng số toàn cục.
- `computeAttemptDurationSeconds`: `submittedAt === null` ⇒ `null`. Ngược lại
  **kẹp ở 0** — `startedAt`/`submittedAt` được ghi bởi hai lời gọi
  `Date.now()` khác nhau ở hai mutation khác nhau, và lệch đồng hồ máy chủ có
  thể cho `submittedAt` đứng TRƯỚC `startedAt`; trả số âm là hiện "-3 giây"
  cho người học — đúng loại lỗi hiển thị không hàm nào nên tạo ra.

### 4.3 Ba ca lỗi — chấm sai KHÔNG bao giờ là `passed: false`

`labs.checkTask` (router, P8/§3) dùng LẠI nguyên `runScriptInSession` của
`apps/web/src/server/lessons/validate.ts` — cùng đường `/exec` một-lượt mà
2.C đã dựng cho scenario (`docs/scenario-format.md` §4), KHÔNG một đường
`/exec` thứ hai. Phân loại lỗi giữ NGUYÊN VĂN: chỉ `exitCode !== 0` mới là
"làm sai" — **mọi lỗi khác NÉM**, và một dòng `lab_task_results` chỉ được ghi
khi có một phán quyết chấm bài THẬT. Ba ca lỗi hạ tầng dưới đây **không bao
giờ** trở thành `passed: false`:

| Ca lỗi | Vì sao KHÔNG PHẢI "làm sai" | Điều phải xảy ra |
|---|---|---|
| **Script hỏng** (verify script tự crash trước khi kịp phán quyết — ví dụ lỗi cú pháp bash) | Người học không làm gì sai — script chấm hỏng, không phải bài họ hỏng | Ném lỗi, KHÔNG ghi dòng |
| **Timeout** (`GATEWAY_EXEC_TIMEOUT`, 30s — xem `docs/scenario-format.md` §4.1) | Vượt trần trả **502**, không phải "chưa đạt" — người học phải thấy lỗi hệ thống, không phải thấy bài chấm sai họ | Ném lỗi, KHÔNG ghi dòng |
| **Pod chết** (sandbox bị reap/khởi động lại giữa lượt chấm) | Không có phiên nào để chạy script chấm — không phải một phán quyết | Ném lỗi, KHÔNG ghi dòng |

Hệ quả trực tiếp cho người viết `verify.sh`: **KHÔNG** gọi lệnh chạm mạng
không có `timeout`/`--max-time` (default-deny của NetworkPolicy DROP im lặng,
không REJECT — thiếu trần thời gian là treo tới hết 30s rồi trả 502, đúng ca
"Timeout" ở trên); **KHÔNG** làm việc nặng (`docker build`, `docker pull`)
trong verify — việc đó thuộc terminal của người học, không thuộc lượt chấm.

### 4.4 `verify.sh` không dùng `set -e`

Mọi `verify.sh` trong `content/labs/**` dùng `set -uo pipefail`, KHÔNG
`set -e`. Một script THĂM DÒ (kiểm điều kiện A, in lý do nếu sai, kiểm điều
kiện B, …) là ca THÀNH CÔNG của chính nó khi một lệnh kiểm trả về khác 0 (đó
là tín hiệu "task chưa đạt", không phải một lỗi shell). `set -e` sẽ làm script
thoát NGAY tại lệnh kiểm đầu tiên trả về khác 0 — trước khi kịp in lý do cho
người học, và exit code khi đó là exit code của LỆNH KIỂM chứ không phải một
`exit 1` có chủ đích kèm thông điệp. `content-labs.test.ts` khẳng định mọi
`verify.sh` trong kho thật tuân theo quy ước này.

---

## 5. Seam `ContentSource` — MỘT chỗ cắm, không ba

`ScenarioSource` (`packages/scenario/src/source.ts`) mở rộng thành
`ContentSource` với bốn method mới: `listLabs()/getLab()/listPlaygrounds()/
getPlayground()`. `ScenarioSource` vẫn được xuất NGUYÊN VẸN — không đổi hình
dạng — để `apps/web/src/server/lessons/catalog.ts` (gõ biến của nó là
`ScenarioSource`) tiếp tục biên dịch không sửa gì: `ContentSource` là SUPERSET
có cấu trúc của `ScenarioSource`, nên một giá trị `ContentSource` gán được cho
biến kiểu `ScenarioSource`.

`filesystemScenarioSource(rootDir, options?)` là hiện thực DUY NHẤT — luật
"không dựng nguồn thứ hai" của contract §5. Bản DB-backed của P9 (soạn bài
trên UI) cắm vào bằng cách hiện thực LẠI đúng interface `ContentSource`, không
phải thêm một loại nguồn song song. `labsRootDir`/`playgroundsRootDir` mặc
định suy từ THƯ MỤC ANH EM của `rootDir` (đúng bố cục thật
`content/{scenarios,labs,playgrounds}`) để caller hiện có
(`filesystemScenarioSource(scenariosDir())`, một tham số) tiếp tục hoạt động
mà không cần sửa; caller cần trỏ khác truyền tường minh qua `options`.

Ba cache (`pending` cho scenario/lab/playground) **tách biệt**, không gộp
chung: ba loại nội dung có thể hỏng ĐỘC LẬP — một `lab.json` sai cấu trúc
không được phép làm `/lessons` (đã nạp tốt) ngừng phục vụ. Mỗi cache giữ
**promise**, không giữ kết quả, và promise hỏng thì XOÁ khỏi cache — cùng hai
kỷ luật đã áp cho scenario (`docs/scenario-format.md` không lặp lại, xem
docstring `source.ts`).

---

## 6. Verify commands

```bash
# Parser + nội dung thật (8.A + 8.E)
pnpm --filter @devops-platform/scenario test

# Chỉ lab/playground
pnpm --filter @devops-platform/scenario test -- content-labs lab-loader lab-score playground-loader source
```

## 7. Thêm một lab mới

1. `mkdir content/labs/<id>` và viết `lab.json` (§1.1) — `id` PHẢI trùng tên
   thư mục.
2. Với mỗi task, tạo `task-<taskId>.md` và `task-<taskId>/verify.sh`.
   `verify.sh` bắt đầu `#!/bin/bash` + `set -uo pipefail` (KHÔNG `set -e`, xem
   §4.4), chỉ dùng tool có thật trong
   [`images/sandbox-base/Dockerfile`](../images/sandbox-base/Dockerfile),
   KHÔNG chạm mạng trừ khi có `timeout`/`--max-time` (§4.3).
3. **Chứng minh cả hai trạng thái của mỗi `verify.sh`** trước khi coi task đã
   xong: trạng thái CHƯA LÀM (script thoát khác 0) và trạng thái ĐÃ LÀM (script
   thoát 0) — một grader không chứng minh được cả hai là một grader không
   chứng minh được gì (§1.3, bài học `prolug`).
4. `pnpm --filter @devops-platform/scenario test`.

### 7.1 Thêm một playground mới

`content/playgrounds/<id>.json` — một file JSON phẳng, `id` PHẢI trùng tên
file (không phần mở rộng). Không có bước 2/3 ở trên: không có bài để viết,
không có gì để chấm.
