# Labs rebuild — trạng thái lúc chốt (2026-10-03)

Chủ dự án yêu cầu dừng giữa chừng và lấy phần đã xong. File này ghi phần đã gộp vào
`feat/labs-rebuild`, phần đang dở (nằm ở worktree, CHƯA commit) và phần chưa làm.
Kế hoạch gốc: [`plan.md`](plan.md) · hợp đồng: [`contracts.md`](contracts.md) ·
giáo trình: [`curriculum.md`](curriculum.md).

## Đã xong và đã gộp vào `feat/labs-rebuild`

**Bộ máy bài học / lab**
- Lab không còn gợi ý: `lab.json` từ chối `hint` và `setup.foreground`.
- `lessons.get`/`labs.get` trả DTO cho người học (`ScenarioForLearner`, `LabForLearner`): script chấm, gợi ý, script setup không còn xuống trình duyệt. Có test chống rò, đối chứng âm làm nó đỏ.
- Prelude verify (`pass`/`fail`/`check`, quên `exit 1` vẫn không đỗ giả) + dòng tiêu chí `✓`/`✗` tách bằng `parseCheckCriteria` cho kiểu chấm từng tiêu chí của KodeKloud.
- `topic` cho mọi nội dung + bộ lọc `topic` ở `lessons.list`/`labs.list`/`playgrounds.list`.
- Setup tự chờ dockerd (≤45 giây, không chặn) trước script nền.
- Xuất bản bài soạn trên giao diện chặn markdown hỏng và tham chiếu sơ đồ.
- Cổng LF cho nội dung first-party (`.gitattributes` + `content-lf.test.ts`).

**Sơ đồ TikZ → SVG** (`scripts/diagrams/`, `docs/diagrams.md`): font Be Vietnam Pro + JetBrains Mono đóng gói sẵn, bảng màu đạt ≥3:1 trên cả nền sáng lẫn tối, dựng tất định, `pnpm diagrams:check` chạy ở CI không cần TeX và tự kiểm 11 kiểu phá. Loader đọc SVG vào DTO; block `diagram` trong markdown.

**Bộ kiểm thử nội dung trên cụm thật** (`scripts/content-smoke/`): dựng pod sandbox giống hệt sản phẩm, gõ lệnh vào đúng tmux + zsh của người học, chứng minh mỗi verify trượt trước và đạt sau.

**Terminal** (`packages/terminal`, `lib/use-sandbox-session.ts`): sửa 9 lỗi (dán >32 KiB làm chết phiên, lệnh `{{exec}}` bị nuốt khi đang kết nối, resize mất, không copy/dán bằng phím được, Esc-Esc phá vim, hai tab stop, giật focus); thêm `reconnect()` và `setInputEnabled()`.

**Phiên trơn tru** (gateway + BFF): cookie theo từng phiên (hai tab hai phiên không đè nhau); token sống tới trần cứng của phiên (hết lỗi 401 sau ~1 giờ dù phiên còn sống); dùng IDE cũng gia hạn phiên; cache podIP bỏ pod đang xoá; thử lại một lần khi kết nối gRPC đứt; nối `gateway.ide.*` của Helm; trần chờ header Theia. Thêm trường proto `Session.hard_cap_at` (chỉ thêm).

**Image sandbox**: CI dựng image CÓ Theia (`INCLUDE_IDE=1`), Theia chỉ chạy khi profile `ide` đặt `DLP_IDE=1`; thêm nano, vim, iproute2, tree, netcat, dig, docker compose; zsh nhận chú thích và shebang khi gõ script; `dlp-k8s-wait` chờ cả coredns.

**Nội dung**: `dlp-sandbox-basics` viết lại từ đầu, smoke xanh (0 độ lệch) trên image `labs-b1`.

**Tài liệu**: `docs/content-style.md` (cách viết + dấu vết AI tiếng Việt cần tránh), `docs/lab-format.md`, `docs/scenario-format.md`, `docs/ws-terminal-protocol.md`, `docs/diagrams.md`.

## Đang dở — nằm ở worktree, CHƯA commit

| Ở đâu | Gì | Còn thiếu |
|---|---|---|
| `D:/NCKH/dlp-labs-w1` | `content/scenarios/dlp-linux-files/` | bước 4–5, `finish.md`, sơ đồ `fhs-tree.tex`; chưa shellcheck/smoke |
| `D:/NCKH/dlp-labs-w4` | `dlp-k8s-basics` (đang smoke lúc chốt), `dlp-k8s-deployments` một phần | xem báo cáo smoke trong worktree; deployments chưa xong |
| `D:/NCKH/dlp-labs-w5` | `content/scenarios/dlp-k8s-storage/` đủ 6 bước | SVG cũ hơn `.tex` (dựng lại), chưa test/shellcheck/smoke |

Tiếp tục: `cd` vào worktree, làm cho xong theo `plans/labs-rebuild/content-agent-brief.md`, commit, rồi `git merge` nhánh đó vào `feat/labs-rebuild`.

## Chưa làm

**Nội dung theo giáo trình** (đều chưa có): Linux `dlp-linux-text`, `dlp-linux-permissions`, `dlp-linux-processes`, `dlp-net-basics`, lab `dlp-linux-files-lab`, viết lại lab `dlp-linux-triage`; Bash `dlp-ide-config-edit` (viết lại), `dlp-bash-first-script`, `dlp-bash-control-flow`, `dlp-bash-robust`, lab `dlp-bash-lab`; Git `dlp-git-basics`, `dlp-git-branching`, `dlp-git-remote`, `dlp-git-undo`, lab `dlp-git-lab`; Docker cả 6 bài + 3 lab (bài `dlp-docker-basics` cũ vẫn còn nguyên); Kubernetes `dlp-k8s-services`, `dlp-k8s-config`, `dlp-k8s-health`, `dlp-k8s-jobs`, `dlp-k8s-rbac`, viết lại `dlp-k8s-multinode-scheduling`, 4 lab (`dlp-k8s-broken-deploy` cũ vẫn còn, chưa có `solution.sh`). Quiz `dlp-quiz-bash-script`, `dlp-quiz-git-thuc-hanh` và cập nhật 4 quiz cũ; lộ trình mới `dlp-path-bash-script`, `dlp-path-git-thuc-hanh`; playground `dlp-k8s-playground`.

**Khi thay nội dung** phải sửa kèm: danh sách id ghim trong `packages/scenario/src/source.test.ts` (phân trang đang giả định đúng 9 bài), khẳng định theo id trong `content-scenarios.test.ts`/`content-labs.test.ts`, test ratchet T7 trong `packages/copy` (đỏ khi `dlp-docker-basics/finish.md` được viết lại — đảo ngược theo đúng chú thích của nó), và `scripts/seed-content.mjs` (lộ trình/quiz bị bỏ vẫn `published` trong DB cũ).

**Deploy**: cụm vẫn chạy sandbox `sha-6f19cbe` (không có Theia ⇒ `/ide` 503). Image `labs-b1` (có Theia, thiếu tuỳ chọn zsh + chờ coredns) đã nằm trên node; `labs-b2` chỉ có ở máy dev. Thứ tự đúng: dựng image từ nhánh này (CI hoặc `docker build --build-arg INCLUDE_IDE=1`), side-load lên node, đặt `sandboxImage` trong `values-selfhost.yaml`, rồi `helm upgrade --reset-then-reuse-values` cùng lúc cho orchestrator + gateway + web (proto mới, cookie mới phải đi cùng nhau). Phiên 00 đang deploy riêng web của nhánh FE.

**Tính năng đã thiết kế, chưa làm**
- Tải lại trang thì nối lại pod cũ thay vì tạo pod mới: bài học nhớ phiên qua cột mới `progress.session_id`; lab nối lại lần thử chưa nộp; `runSetup` đánh dấu phase đã chạy bằng file sentinel trong pod để không chạy lại setup đè lên bài làm dở. Kiểm orchestrator: đúng chủ, CLAUDE/RUNNING, đúng profile, còn ≥2 phút. ⚠ Phiên 00 đã dùng số migration 0018 trên nhánh FE.
- Thi: ghi bài nộp vào lượt thi đang mở (suy ra phía server, cổng seed chỉ áp khi client gửi `examId`; cần migration). Ca kiểm bắt buộc: nộp bài K8s KHÔNG kèm `examId`, seed ngẫu nhiên, vẫn được nhận và tính vào lượt. Phần còn lại của mảng thi do phiên 00 làm trên nhánh FE: `problems.list` lọc `gameId`, `examSitting.get` trả `problems`, cửa sổ chấm `[started_at, least(submitted_at, deadline)]` (không migration).
- Gỡ ô "gợi ý" khỏi giao diện soạn lab (phiên 00) rồi bỏ `hint` ở input soạn bài + cột `content_steps.hint`.

**Hở đã biết**
- Gói keepalive của Theia cũng tính là hoạt động ⇒ một tab IDE bị quên giữ phiên tới trần cứng 2 giờ.
- Gateway giới hạn stdin 256 KiB/s (burst 512 KiB): dán một lần >512 KiB vẫn có thể bị đóng 4429.
- Lab `dlp-k8s-scheduling-lab` trong giáo trình tự mâu thuẫn (taint node 1 rồi drain node 2 thì `web` không còn chỗ). Đề xuất: drain node control-plane thay vì node 2.

**Sự thật đo được cho người viết tiếp**
- Trong zsh của người học `ls` là `eza --icons` (không có cột link/group), `cat` là `bat --plain`: bài về quyền dùng `command ls -l` hoặc `stat`.
- Image không có `lsof`/`fuser`; truy file đang mở qua `/proc/*/fd`.
- Cụm k3s: coredns Available muộn hơn node Ready ~55 giây; ConfigMap mount cập nhật tới pod mất ~80 giây (chỉ minh hoạ, đừng chấm); NodePort trả lời từ shell sandbox ở `172.17.0.2`; tên node là ID container ngẫu nhiên, chọn node bằng nhãn `node-role.kubernetes.io/control-plane`.
- Mỗi `kubectl exec` từ máy Windows tốn ~1 giây; một lượt smoke bài k8s mất vài phút.
