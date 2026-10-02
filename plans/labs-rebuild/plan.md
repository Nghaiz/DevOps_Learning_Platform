# Labs rebuild — bài học kiểu Killercoda + thực hành kiểu KodeKloud

Nhánh `feat/labs-rebuild`, worktree `D:/NCKH/dlp-labs`. Mở 2026-10-03.

## Yêu cầu của chủ dự án (2026-10-03)

1. Thiết kế lại toàn bộ bài tập: phần **học** theo kiểu Killercoda (dẫn từng bước, bấm lệnh, kiểm tra từng bước) và phần **tự thực hành theo chủ đề** kiểu KodeKloud (chỉ có đề và yêu cầu, **không gợi ý, không lệnh sẵn**, chấm tự động).
2. Sơ đồ/ảnh trong bài dựng bằng **TikZ/LaTeX**.
3. Terminal, IDE, pod cấp cho bài phải chạy trơn và đồng bộ.
4. Lỗi đã biết: image sandbox đang chạy (`sha-6f19cbe`) không có Theia.
5. Văn phong giống người viết, tránh AI slop (skill `t1k-human-writing`), có sáng tạo.
6. Tự làm hết, tự phát triển tính năng cần thiết, không để nợ.

## Ranh giới với hai phiên song song

| Phiên | Phạm vi | Worktree |
|---|---|---|
| 00 | Làm lại toàn bộ FE: `apps/web/src/**` (trừ `server/**`, `app/api/scenarios/**`, `components/k8s-arena/**`), `packages/{ui,motion,copy,terminal}` | `D:/NCKH/dlp-fe` (`feat/fe-ptit-rebuild`) |
| 5a | Trang landing `/` | `D:/NCKH/wt-landing-3d` (`feat/landing-3d`) |
| **0c (đây)** | `content/**`, `packages/{scenario,shared-types}`, `apps/web/src/server/**`, `apps/web/src/app/api/scenarios/**`, file logic `.ts` thuần trong `app/{lessons,labs}/[id]` và `components/session/*.ts` (trừ terminal-theme), `services/**`, `images/**`, `infra/**`, `.github/**`, `scripts/**` | `D:/NCKH/dlp-labs` |

Lỗi thuộc `packages/terminal` hay `.tsx` trình bày: gửi 00 chẩn đoán + bằng chứng, 00 sửa. Deploy cụm: báo trước, không chạy song song với 00; 0c chỉ deploy sandbox image + services.

⚠ Nội dung bài nằm TRONG image web (`apps/web/Dockerfile` COPY `content/`). Mọi lượt deploy web phải mang nội dung mới nhất — phối hợp với 00 trước lượt build web cuối.

## Quyết định đã chốt

### D1. Hai kiểu bài, một bộ máy

- **Bài học** = scenario (`content/scenarios/<id>`, định dạng Killercoda, `index.json` + `dlp.json`). Giữ nguyên cơ chế: bước, `{{exec}}`, nút Kiểm tra theo bước.
- **Lab thực hành** = lab (`content/labs/<id>`). Đề task chỉ nêu trạng thái cần đạt (tên, cổng, đường dẫn, giá trị cụ thể). Cấm: `hint`, khối `{{exec}}`, thông báo chấm chỉ cách sửa. Field `hint` bị gỡ khỏi schema (file, DTO, soạn bài DB).
- Mỗi chủ đề = một lộ trình: các bài học → các lab → quiz.

### D2. DTO cho người học không mang đáp án

Hôm nay `labs.get`/`lessons.get` gửi nguyên `verifyScript`, `hint`, script setup xuống trình duyệt — với lab không gợi ý thì đó là lộ đáp án. Dựng `ScenarioForLearner`/`LabForLearner` theo khuôn `QuizForLearner` (field cấm gõ `?: never`, test chống rò). Script thay bằng boolean `hasVerify`/`hasSetup`.

### D3. Kết quả chấm có danh sách tiêu chí

`verify.sh` in dòng `✓ <tiêu chí>` / `✗ <tiêu chí>`. Hàm thuần `parseCheckCriteria(output)` (packages/scenario) tách thành `criteria: {ok, label}[]`, trả kèm `checkTask`/`checkStep`/`getAttempt`. Exit code vẫn là phán quyết duy nhất (hợp đồng Killercoda giữ nguyên). Server ghép **prelude** (`withVerifyPrelude`) trước mọi verify: hàm `pass`/`fail`/`check` + trap EXIT ép exit ≠ 0 khi có `fail`, nên quên dòng kết luận không thành đỗ giả.

### D4. Sơ đồ TikZ → SVG lúc soạn, kiểm băm ở CI

`content/{scenarios,labs}/<id>/diagrams/<tên>.tex` (chỉ thân `tikzpicture`, preamble chung ở `scripts/diagrams/`). Dựng: XeLaTeX `-no-pdf` → XDV → `dvisvgm --no-fonts --optimize=all` → hậu xử lý (tiền tố id, màu bảng → `currentColor`/class, `<title>`), ghi `<tên>.svg` cạnh nguồn kèm băm nguồn + băm đầu ra. CI chỉ kiểm băm (không cần TeX). Markdown: `![alt](diagrams/<tên>.svg "chú thích")` đứng riêng một dòng → block `diagram`; loader đọc SVG vào DTO `diagrams`. SVG không đi qua route asset.

### D5. `topic` cho mọi nội dung

`topic ∈ {linux, bash, git, docker, kubernetes, observability, networking}`, bắt buộc ở `dlp.json`/`lab.json`/playground JSON, nullable ở DTO (bài soạn trong DB chưa có). Bộ lọc `topic` ở `list`.

### D6. Theia: có trong image CI, chỉ chạy khi profile `ide` bật

CI dựng `sandbox-base` với `INCLUDE_IDE=1`. Entrypoint chỉ khởi động Theia khi `DLP_IDE=1`; `sandbox.profiles.ide.env.DLP_IDE: '1'`. Pod mặc định không gánh +200–450Mi của Theia.

### D7. Phiên trơn tru — sửa ở tầng 0c

1. Token/cookie sandbox: cookie theo đường dẫn riêng từng phiên (`/ws/session/<id>`, `/ide/session/<id>`); `exp` = trần cứng của phiên thay vì `expiresAt` lúc mint (Redis vẫn là cổng thật).
2. Hoạt động IDE gia hạn phiên như terminal.
3. Pod sandbox có readinessProbe: dockerd sẵn sàng (+ Theia khi `DLP_IDE=1`) mới Ready.
4. Bấm Bắt đầu lại (tải lại trang) trả về phiên đang sống của đúng người + đúng bài, không tạo pod mới.
5. Cache podIP bỏ pod đang xoá; `GetSession` thử lại một lần khi kết nối gRPC đứt.
6. Nối `gateway.ide.*` của Helm vào env thật.

### D8. Bộ kiểm thử nội dung trên cụm thật

`scripts/content-smoke`: dựng pod sandbox ở namespace riêng (nhân bản podspec thật + netpol), chạy setup như sản phẩm, rồi với MỖI bước/task: chấm trước (phải trượt) → chạy lệnh `{{exec}}` của bước (zsh) hoặc `solution.sh` ẩn → chấm sau (phải đạt). `solution.sh` không bao giờ được loader đọc, không route nào phục vụ.

## Các mạch việc

| Mạch | Ai | File sở hữu | Xong khi |
|---|---|---|---|
| A. Định dạng + DTO + router | 0c (inline) | `packages/{scenario,shared-types}/**`, `apps/web/src/server/**`, logic `.ts` FE | test + typecheck xanh; hợp đồng gửi 00 |
| B. Image + CI + readiness | agent | `images/sandbox-base/**`, `.github/workflows/ci.yml`, `infra/helm/**` (profiles, sandboxImage), `services/orchestrator/internal/k8s/podspec*` | image mới side-load lên node, `/ide` 200 trong pod profile ide |
| C. Phiên trơn tru (gateway + auth) | agent | `services/terminal-gateway/**`, `apps/web/src/server/auth/{jwt,sandbox-cookie}.ts`, `apps/web/src/server/grpc/**`, `infra/helm/**` (gateway) | go test + vitest xanh |
| D. Công cụ TikZ | agent | `scripts/diagrams/**`, `docs/diagrams.md`, script trong `package.json` gốc | build + check chạy được, sơ đồ mẫu |
| E. Bộ kiểm thử nội dung | agent | `scripts/content-smoke/**` | chạy được 1 bài + 1 lab hiện có trên cụm |
| F. Nội dung theo chủ đề | agent × chủ đề | `content/{scenarios,labs}/<id của chủ đề>/**` | smoke xanh cả hai trạng thái mọi bước/task |
| G. Quiz + lộ trình + seed | agent | `content/{quizzes,paths}/**`, `scripts/seed-content.mjs` | seed xanh, lộ trình cũ bị archive |
| H. Tài liệu | 0c/agent | `docs/{scenario-format,lab-format,content-style}.md` | khớp mã |

Hợp đồng dùng chung giữa các mạch: [`contracts.md`](contracts.md). Giáo trình: [`curriculum.md`](curriculum.md). Văn phong: [`docs/content-style.md`](../../docs/content-style.md).
