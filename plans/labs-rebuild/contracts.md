# Hợp đồng dùng chung — labs rebuild

Mọi mạch (A–H) và mọi agent viết nội dung đọc file này. Đổi hợp đồng = sửa file này TRƯỚC, rồi báo các mạch liên quan.

## C1. Prelude của verify script và dòng tiêu chí

Server ghép đoạn bash dưới đây vào ĐẦU mọi verify script trước khi gửi xuống pod (`withVerifyPrelude(script)` trong `packages/scenario/src/verify-prelude.ts`). Bộ kiểm thử nội dung (`scripts/content-smoke`) dùng CHÍNH hàm đó.

```bash
# --- dlp verify prelude v1 ---
__dlp_fail_count=0
pass() { printf '✓ %s\n' "$*"; }
fail() { printf '✗ %s\n' "$*"; __dlp_fail_count=$((__dlp_fail_count + 1)); }
check() { local __label=$1; shift; if "$@" >/dev/null 2>&1; then pass "$__label"; else fail "$__label"; fi; }
trap '__dlp_rc=$?; if [ "$__dlp_fail_count" -gt 0 ] && [ "$__dlp_rc" -eq 0 ]; then exit 1; fi' EXIT
# --- end dlp verify prelude ---
```

- `pass "<tiêu chí>"` / `fail "<tiêu chí>"` in một dòng tiêu chí. `check "<tiêu chí>" <lệnh…>` chạy lệnh, nuốt output, in đạt/trượt theo exit code.
- Có ít nhất một `fail` ⇒ script thoát ≠ 0 kể cả khi tác giả quên `exit 1`. Không `fail` nào ⇒ exit code là của chính script.
- Dòng tiêu chí: bắt đầu bằng `✓ ` (U+2713 + dấu cách) hoặc `✗ ` (U+2717 + dấu cách). Mọi dòng khác là ghi chú.
- `parseCheckCriteria(output: string): { criteria: { ok: boolean; label: string }[]; notes: string }` — hàm thuần, cùng file prelude.
- Verify script vẫn bắt đầu `#!/bin/bash` + `set -uo pipefail`, KHÔNG `set -e` (lab-format §4.4). Không chạm mạng nếu không có `timeout`. Mỗi lượt chấm phải xong trong **20 giây** trên node rảnh (trần hạ tầng 120s là để chịu tải, không phải ngân sách).

**Lab (KodeKloud):** mỗi task in ≥1 dòng tiêu chí. Nhãn tiêu chí nêu ĐIỀU KIỆN cần đạt và có thể kèm trạng thái quan sát được (`(hiện: 1/3)`), KHÔNG BAO GIỜ nêu lệnh hay cách sửa. Sai: `✗ Hãy chạy chmod +x …`. Đúng: `✗ /opt/app/run.sh thực thi được trực tiếp`.
**Bài học (Killercoda):** được phép nhắc lệnh của chính bước đó khi trượt.

## C2. Bố cục nội dung trên đĩa

```
content/scenarios/<id>/            bài học
  index.json  dlp.json  intro.md  step1.md … finish.md
  stepN/verify.sh                  (tuỳ bước)
  stepN/solution.sh                CHỈ khi bước cần thao tác không viết được bằng {{exec}} (vd. sửa file trong IDE)
  intro/background.sh  intro/foreground.sh
  assets/…                         file đẩy vào pod (khai trong index.json)
  diagrams/<tên>.tex + <tên>.svg   sơ đồ (C4)

content/labs/<id>/                 lab thực hành
  lab.json
  task-<taskId>.md
  task-<taskId>/verify.sh
  task-<taskId>/solution.sh        BẮT BUỘC — đáp án ẩn cho bộ kiểm thử
  setup/background.sh              dựng cảnh MỘT LẦN cho mọi task
  diagrams/<tên>.tex + <tên>.svg
```

- `solution.sh`: không loader nào đọc, không route nào phục vụ, không bao giờ vào DTO. Có test chặn rò.
- `lab.json`: field `hint` và `setup.foreground` KHÔNG còn hợp lệ (schema strict sẽ từ chối).
- Mọi file văn bản trong `content/` là UTF-8, xuống dòng LF.
- `dlp.json` (bài học), `lab.json`, playground JSON có field bắt buộc `topic` (C5).

## C3. Bộ kiểm thử nội dung (`scripts/content-smoke`)

- **Bài học**: dựng pod theo profile của bài → đẩy assets → chạy `intro/background.sh` rồi `intro/foreground.sh` (nếu có) → với mỗi bước có verify: verify (PHẢI trượt) → chạy lần lượt mọi khối `{{exec}}`/`{{exec interrupt}}` của bước bằng `zsh -c` (shell của terminal người học là zsh) → `stepN/solution.sh` nếu có → verify (PHẢI đạt). Bước không verify: vẫn chạy các khối exec (để bước sau có trạng thái đúng).
- **Lab**: dựng pod → `setup/background.sh` → mỗi task: verify (PHẢI trượt) → `solution.sh` → verify (PHẢI đạt) → cuối cùng chấm lại MỌI task (PHẢI đạt cả) để bắt lời giải task này phá task kia.
- Khối `{{exec}}` phải tự kết thúc (cấm `-f`, `-w`, `watch`, `top` không `-b -n1`, trình soạn thảo tương tác). Muốn cho người học lệnh chạy mãi thì dùng `{{copy}}`.
- Báo cáo: `plans/labs-rebuild/reports/smoke/<id>.md`.

## C4. Sơ đồ

- Nguồn `diagrams/<tên>.tex` chỉ chứa thân (`\begin{tikzpicture}…\end{tikzpicture}`, có thể kèm `\usetikzlibrary`), preamble chung do `scripts/diagrams/` cấp. Chỉ dùng màu bảng: `dlpink` (chữ/nét chính → `currentColor`), `dlpmuted`, `dlppaper`, `dlpblue`, `dlpgreen`, `dlpamber`, `dlpred`, `dlpviolet`, `dlpteal`. Tô nhạt bằng `fill opacity=…`, KHÔNG pha `màu!15` (pha trộn làm mất mã màu, công cụ sẽ từ chối).
- Đầu ra `diagrams/<tên>.svg`: dòng đầu `<!-- dlp-diagram v1 src=<sha256 nguồn> out=<sha256 phần còn lại> -->`, sau đó `<svg …>` có `viewBox`, `width`, `height` (px), `role="img"`. Chỉ phần tử/thuộc tính trong danh sách cho phép; mọi `id` mang tiền tố riêng của sơ đồ; không script, không tham chiếu ngoài.
- Màu: `dlpink` → thuộc tính `currentColor`; màu khác giữ hex sáng làm fallback và thêm class `dia-f-<tên>` / `dia-s-<tên>` (fill/stroke).
- Markdown: `![Mô tả cho người đọc màn hình](diagrams/<tên>.svg "Chú thích hiện dưới hình")` đứng RIÊNG một dòng ⇒ block `{ kind: 'diagram', src, alt, caption }`. Alt bắt buộc, ≥ 20 ký tự, nói được nội dung hình.
- `pnpm diagrams:build [đường dẫn…]` dựng lại; `pnpm diagrams:check` (CI) kiểm: mỗi `.tex` có `.svg`, băm nguồn khớp, băm đầu ra khớp, danh sách cho phép.

## C5. `topic`

`'linux' | 'bash' | 'git' | 'docker' | 'kubernetes' | 'observability' | 'networking'`. Hằng số SSOT: `CONTENT_TOPICS` trong `packages/shared-types/src/scenario.ts`.

## C6. DTO cho người học (gửi 00)

```ts
// lessons.get
{ scenario: ScenarioForLearner; profile: string; progress: ProgressView; unsupportedCapabilities: ScenarioCapability[] }
type PhaseForLearner = { title: string | null; markdown: string; hasVerify: boolean; hasSetup: boolean };
type ScenarioForLearner = Omit<Scenario, 'intro' | 'finish' | 'steps'> & {
  intro: PhaseForLearner | null; finish: PhaseForLearner | null;
  steps: (PhaseForLearner & { index: number })[];
  diagrams: Record<string, DiagramSvg>;           // key = src trong markdown, vd 'diagrams/layers.svg'
};
// labs.get
{ lab: LabForLearner; profile: string; unsupportedCapabilities: ScenarioCapability[] }
type LabForLearner = Omit<Lab, 'tasks' | 'setup'> & {
  tasks: { id: string; title: string; markdown: string; weight: number }[];
  diagrams: Record<string, DiagramSvg>;
};
type DiagramSvg = { svg: string; width: number; height: number };
type CheckCriterion = { ok: boolean; label: string };
// labs.checkTask → { exitCode, passed, output, criteria: CheckCriterion[] }
// lessons.checkStep → { passed, exitCode, output, truncated, progress, criteria: CheckCriterion[] }
// labs.getAttempt → attempt.results[] mỗi phần tử thêm criteria
// ContentBase (+ mọi Summary) thêm topic: ContentTopic | null; list nhận filter topic?
```
