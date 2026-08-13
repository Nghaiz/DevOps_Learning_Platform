# 2.A + 2.E — Parser scenario + nội dung mẫu thật

**Ngày:** 2026-08-13 · **Chặng:** 2.A (parser) + 2.E (nội dung) · **Nhánh:** `feat/p2-2a-scenario-parser`
**Artifact:** [`harness/2026-08-13-2a-scenario-parser/`](harness/2026-08-13-2a-scenario-parser/)

---

## Kết quả một dòng

Parser chạy trên **4 scenario thật** từ **3 repo upstream có license permissive đã xác minh**, và ba giả định của plan không sống sót khi chạm nội dung thật: **kho mẫu chính chủ của Killercoda không có license**, **`difficulty` không phải field của Killercoda**, và **`markdownHtml` không chở nổi nút `{{exec}}`**.

```
packages/scenario                    →  62 PASS / 0 FAIL / 0 skip  (5 file)
content/scenarios                    →   4 scenario · 48 file upstream · 3 repo
vendor --check (so byte, chạm mạng)  →   4/4 khớp commit đã ghim
turbo run test                       →   8/8   (web 95 · terminal 91 · shared-types 23 · ui 3 · scenario 62)
turbo run typecheck                  →  10/10
turbo run lint                       →   8/8
```

Ba lỗi tự lộ ra trong lúc làm, cả ba đều **không nằm trong ô AC nào**: một cổng chống drift đồng loã với chính sự hỏng nó phải bắt, một lệnh format vô hại phá được cổng đó, và một bộ verify script luôn-pass sẽ làm ô AC của 2.C xanh mà chẳng chứng minh gì.

---

## 1. Ba giả định của plan không sống sót

### 1.1 Kho mẫu chính chủ của Killercoda **không vendor được**

Plan 2.A task 5 viết: *"Test parser trên kho thật (killercoda `scenario-examples` / grafana killercoda)"*.

`killercoda/scenario-examples` (136 sao, kho ví dụ chính chủ) **không có file LICENSE**:

```
GET /repos/killercoda/scenario-examples  → license: null
GET /repos/killercoda/scenario-examples/contents/  → không có LICENSE trong danh sách
```

Không license nghĩa là **all rights reserved**, kể cả với repo công khai. Nó được **đọc** để hiểu format (đọc là hợp pháp) nhưng **không một file nào của nó** nằm trong `content/`.

Ba nguồn thay thế đã xác minh bằng cách tải chính file LICENSE ở đúng commit ghim:

| repo | license | dùng cho |
|---|---|---|
| `omkar-shelke25/ckad-killercoda` | MIT | `ckad-configmap-as-files` |
| `het-tanis/prolug-labs` | MIT | `prolug-linux-system-checking` |
| `grafana/killercoda` | Apache-2.0 | `loki-quickstart` |
| `loxilb-io/killercoda-examples` | Apache-2.0 | `loxilb-tcp-load-balancing` |

License không phải một dòng trong commit message mà là **dữ liệu máy kiểm được**: `dlp.json` bắt buộc mang `license`/`licenseUrl`/`commit`, và một test khẳng định điều đó cho mọi scenario.

### 1.2 `difficulty` **không phải** field của Killercoda

Plan chốt DTO `Scenario{id, title, difficulty, steps[]}` như thể đọc được từ `index.json`. Không đọc được:

```
gh search code '"difficulty" path:index.json killercoda'  → total_count: 0
```

và trang docs creator (đọc bằng trình duyệt — nội dung nằm sau JavaScript) không liệt kê nó. Nên nó tới từ **sidecar `dlp.json`** do ta viết, và là field **bắt buộc không default**: một `'beginner'` ngầm làm mọi bài trông dễ như nhau mà không ai biết vì sao.

### 1.3 `markdownHtml` **không chở nổi** phần tương tác

Plan chốt `Step{index, markdownHtml, …}`. Không dùng được, vì hai lý do độc lập:

1. **Derived field.** HTML tính 100% từ markdown (`code-conventions.md` § No Derived Fields) — hai nguồn cho một nội dung, lệch nhau ở lần đầu ai đó sửa markdown mà quên render lại.
2. **Quan trọng hơn: HTML không có chỗ gắn handler.** Markdown Killercoda mang hậu tố `{{exec}}`/`{{copy}}`; chúng phải thành **nút nối vào terminal**, không phải thẻ `<code>`. Ô AC 2.D *"code copy button hoạt động"* **không đóng được** bằng một chuỗi HTML.

DTO vì thế mang `markdown` nguyên văn, cộng hàm **thuần** `parseContentBlocks(markdown)` mà cả 2.C lẫn 2.D gọi. Một nguồn, một hàm, không có bản sao để trôi.

> Ba mục trên là **sửa plan**, không phải đi chệch plan. `phase-2.md` đã được cập nhật trong cùng commit này.

---

## 2. Bốn scenario được chọn vì KHÁC NHAU, không vì nhiều

Rủi ro #1 của P2 là *"Format Katacoda/Killercoda biến thể → parser lệch"* (score 9). Một parser chỉ gặp fixture do chính nó sinh ra thì không nói gì về rủi ro đó. Mỗi bài dưới đây là **đối chứng cho một biến thể**, và `content-scenarios.test.ts` khẳng định đúng cái khác biệt ấy:

| id | biến thể | phép kiểm |
|---|---|---|
| `ckad-configmap-as-files` | verify thật (2247 ký tự kubectl) theo từng step; mang `courseData`; imageid 2-node | `ignoredUpstreamFields == ['details.intro.courseData']`, `capabilities == [kubernetes, multi-node]` |
| `prolug-linux-system-checking` | step trong **thư mục con** (`step1/text.md`); intro dùng `background` | 3 step, `intro.setup.foreground == null` |
| `loki-quickstart` | step **không** có title; **không** phase nào có verify | mọi `title == null`, mọi `verifyScript == null` |
| `loxilb-tcp-load-balancing` | `assets` 12 file + `chmod`; intro có đủ foreground/background/verify; chứa `{{TRAFFIC_*}}` | host toàn `host01`, `intro.verifyScript != null` |

Và một phép kiểm ở tầng bộ mẫu: **phải có cả hai cực** — ≥1 bài chấm được (để 2.C có vật liệu) và ≥1 bài không chấm (để 2.D không giả định nút Check luôn hiện).

---

## 3. Ba thứ tự lộ ra trong lúc làm

### 3.1 Cổng chống drift đồng loã với sự hỏng nó phải bắt

`vendor-scenarios.mjs` bản đầu tải bằng `response.text()`. Với `assets/topology.png` điều đó nghĩa là mọi byte không hợp lệ UTF-8 bị thay bằng U+FFFD rồi ghi ra đĩa:

```
bytes: 98303 | magic: efbfbd 504e470d0a      ← \x89 đã thành EF BF BD
```

Ảnh hỏng. Nhưng `--check` vẫn **XANH**: bản local (đã hỏng) đọc lại bằng `utf8` cho ra đúng chuỗi mà bản remote vừa bị mã hoá thành — hai vế cùng đi qua một phép mã hoá sai thì chúng luôn khớp nhau.

> Một cổng chống drift đồng loã với chính sự hỏng nó phải bắt thì **tệ hơn không có cổng nào**: nó phát ra tín hiệu "đã kiểm rồi".

Sửa: tải/so bằng `Buffer` (`arrayBuffer` + `Buffer.equals`). Bằng chứng hai chiều — `--check` **đỏ đúng một file** trước khi sửa, và sau `--fetch` lại:

```
57147 bytes | magic: 89504e470d0a1a0a | PNG hợp lệ: true
```

### 3.2 `pnpm format` phá được cổng so-byte

`prolug/index.json` upstream thụt **4 khoảng trắng**. Prettier muốn 2. Không ai chạy `format:check` trong CI (cố ý — nó đã đỏ trên main từ trước), nhưng một lệnh `pnpm format` trên máy dev sẽ viết lại file vendor và ngay lập tức làm `--check` báo LỆCH — kéo theo lời khai license thành sai.

Sửa: `.prettierignore` loại `content/scenarios/**` nhưng **giữ lại** `dlp.json` (file của ta).

### 3.3 Ba verify script của `prolug` là `/bin/true`

```bash
$ cat content/scenarios/prolug-linux-system-checking/step{1,2,3}/verify.sh
#!/bin/bash

/bin/true
```

Luôn exit 0 ⇒ **luôn pass**. Ô AC 2.C viết *"bấm Check → verifyScript chạy trong pod, trả pass/fail đúng (test 1 step pass + 1 step fail)"*. Nếu 2.C chọn prolug làm bằng chứng, ô đó xanh mà vế "fail" là **bất khả**.

Đóng băng thành phép kiểm chứ không thành một dòng ghi chú (nợ có ghi chú thì lượt review nào cũng đọc lướt qua): `content-scenarios.test.ts` khẳng định prolug là no-op **và** khẳng định bộ mẫu có ≥1 verify thật. `dlp.json` + `content/scenarios/README.md` ghi tên hai bài dùng được thay thế (`ckad`: kubectl; `loxilb`: `stat /var/run/netns/loxilb`).

---

## 4. Field lạ: bỏ qua thì được, bỏ qua trong im lặng thì không

Scenario thật **đầu tiên** vendor về đã mang một field Killercoda không định nghĩa: `details.intro.courseData` (di sản Katacoda — nhiều khả năng chính Killercoda cũng đang bỏ qua nó, tức `setup.sh` của bài đó chưa từng chạy ở upstream).

Schema `.strict()` toàn phần sẽ từ chối nó. Nhưng từ chối luôn một bài chạy được trên killercoda.com cũng sai. Đường ở giữa — sidecar khai tường minh:

```jsonc
{ "acknowledgedUnknownFields": ["details.intro.courseData"], "notes": "lý do…" }
```

Ba phép kiểm, cả ba là lỗi cứng:

1. Field lạ **chưa khai** → từ chối, nêu đúng đường dẫn chấm (gom hết trong một lần báo, không dừng ở cái đầu).
2. Khai mà **thiếu `notes`** → từ chối. Một lời khai không lý do thì lần review sau không ai biết nó đã được xem xét hay chỉ dán vào cho hết lỗi.
3. Khai **thừa** (upstream đã dọn) → từ chối. Lời khai không còn đúng là drift trong đúng file bảo "tôi đã xem xét cái này rồi".

Field đã khai nổi lên ở `Scenario.ignoredUpstreamFields` — 2.C đọc được, không phải đi tìm.

---

## 5. Bẫy `{{…}}`: cùng cặp ngoặc, hai nghĩa

`{{exec}}` là hành động; `{{TRAFFIC_HOST1_3000}}` là **biến thay thế trong văn xuôi**. Thứ phân biệt là **vị trí** — hành động phải dính liền ngay sau backtick đóng. Parser vì thế không bao giờ được đi tìm `{{…}}` trần trụi.

Đối chứng âm nằm trong **nội dung thật**, không phải fixture: `loxilb` step 3 có đúng một cặp `{{…}}`, trong `[ACCESS WIRESHARK]({{TRAFFIC_HOST1_3000}})`. Test khẳng định chuỗi đó **có mặt** (nếu không phép kiểm rỗng) và số khối hành động của cả bài là **0**.

Bẫy thứ hai, ở tầng hiện thực: một regex lười `/```[\s\S]*?```\{\{…\}\}/` sẽ **backtrack qua fence không-hậu-tố và nuốt trọn đoạn văn ở giữa** — nội dung biến mất, không lỗi nào nổi lên. Vì thế parser quét theo dòng với trạng thái fence tường minh; có test riêng cho đúng ca đó.

---

## 6. Chốt cho 2.C — `checkStep` đi qua gateway, không thêm RPC

Quyết định (**chưa hiện thực**, chốt để 2.C không phải mở lại): `POST /exec/session/{id}` trên `terminal-gateway`, auth bằng chính cookie `dlp_sandbox` mà BFF tự mint server-side.

Lý do: đường exec vào pod **đã có và đã hardening** ở gateway (`internal/podexec`), không ở orchestrator — orchestrator hiện không có mã exec lẫn RBAC `pods/exec`. Đi đường này tái dùng **nguyên** chuỗi chín bước authz của `ws-terminal-protocol.md` §3, trong đó có bước g và việc `podName`/`namespace` đọc từ **Redis** chứ không từ input. Đó là thứ làm ô AC *"verifyScript chạy TRONG pod cô lập"* đúng **theo cấu trúc** chứ không theo lời hứa.

Bốn khác biệt 2.C **phải** xử lý riêng (chi tiết: `docs/scenario-format.md` §4): `TTY:false, Stderr:true` để lấy được exit code (khác đường WS); không chiếm khe WS (D17=1, nếu không bấm Check sẽ đá văng terminal đang mở); cắt cỡ output; và giữ nguyên ranh giới "client không chọn lệnh" — script đến từ `Scenario.steps[i].verifyScript` đọc từ đĩa, **không** từ body người dùng.

---

## 7. Bốn thứ nhỏ hơn

- **Mã chết bị gỡ.** `loadScenarios` từng có vòng kiểm trùng `id` — không bao giờ chạm tới, vì `loadScenario` đã ép `id == tên thư mục` và filesystem lo phần duy nhất. Kèm nó là một test không kích hoạt được nhánh nào. Cả hai đã xoá.
- **`node` trần không chạy được `parse.mjs`.** Barrel của `shared-types` kéo theo `gen/…/session_pb.ts`, file có `enum` — thứ Node strip-only từ chối (`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`). Mở subpath `@devops-platform/shared-types/scenario`: vừa sửa lỗi vừa đúng phân tầng (parser vốn không cần type proto).
- **Khối eslint globals cho `scripts/**/*.mjs` lên base.** `packages/terminal` đã cần đúng khối đó; `packages/scenario` là lần thứ hai — ngưỡng rule-of-two. Kèm `no-console: off` cho scripts: với một CLI thì stdout **chính là** sản phẩm, ép dùng `console.warn` là đẩy output sang stderr.
- **`scripts/vendor-scenarios.mjs` chưa được lint.** Không package nào sở hữu `scripts/` ở gốc repo nên `turbo run lint` không chạm tới — giống `env-check.mjs`/`check-repo-settings.mjs` đã có sẵn. Nợ có sẵn từ trước, ghi lại chứ không mở rộng phạm vi ở chặng này.

---

## 8. Ô AC

| Ô | Trạng thái | Bằng chứng |
|---|---|---|
| Import scenario Katacoda thật → **parse không lỗi** (≥3 scenario mẫu) | ✅ | 4 scenario, 62 test, `harness/parse-*.txt` |
| … → **hiển thị đủ step** | ⬜ 2.D | tách khỏi ô trên: vế hiển thị là FE |
| Nội dung mẫu đã verify license (2.E) | ✅ | `dlp.json` mang SPDX + commit + licenseUrl; test khẳng định |
| Các ô còn lại của P2 | ⬜ | thuộc 2.B / 2.C / 2.D |

## 9. Còn để ngỏ

1. **`courseData` chưa biết ngữ nghĩa thật.** Docs Killercoda không có nó. Khi 2.C có đường chạy script, cân nhắc map `courseData → background` — hoặc xác nhận nó thật sự chết ở upstream.
2. **`capabilities: kubernetes` là nhãn cảnh báo, chưa phải lời hứa.** P1 chứng minh DinD trong pod Sysbox; kubeadm-trong-pod thì **chưa**. `ckad` mang nhãn `kubernetes, multi-node` — 2.C/2.D phải chặn hoặc cảnh báo, và ai đó phải trả lời "sandbox của ta có chạy nổi bài đó không".
3. **`--check` chưa có cổng CI.** Nó chạm mạng nên không nằm trong `pnpm test`. Đường đúng là một job chạy theo lịch (`pnpm scenarios:check`), chưa dựng ở chặng này.
4. **`format:check` vẫn đỏ trên main** (167 file, có sẵn từ trước — CI cố ý chưa bật cổng này). Không mở rộng phạm vi để sửa; file mới của chặng này đã prettier-clean.
