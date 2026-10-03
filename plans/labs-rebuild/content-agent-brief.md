# Giao việc chung cho agent viết nội dung (mạch F)

Bạn viết bài học (Killercoda) và lab (KodeKloud) cho một nhóm chủ đề. Mỗi agent có
worktree + nhánh riêng và danh sách id riêng (trong prompt). Không đụng id của nhóm
khác.

## Đọc trước khi viết (theo thứ tự)

1. `D:/NCKH/dlp-labs/docs/content-style.md` — cách viết, giới hạn môi trường. Bắt buộc.
2. `D:/NCKH/dlp-labs/plans/labs-rebuild/curriculum.md` — khung từng bài/lab của bạn.
3. `D:/NCKH/dlp-labs/plans/labs-rebuild/contracts.md` — prelude verify (§C1), bố cục
   file (§C2), smoke (§C3), sơ đồ (§C4).
4. `D:/NCKH/dlp-labs/docs/diagrams.md` — soạn TikZ, style có sẵn, lệnh dựng.
5. `docs/scenario-format.md`, `docs/lab-format.md` trong worktree của bạn — định dạng
   file (`index.json` + `dlp.json` cho bài học, `lab.json` cho lab). `lab.json` KHÔNG
   còn `hint`, `setup.foreground`; `dlp.json`/`lab.json` BẮT BUỘC có `topic`.
6. Gọi skill `t1k-human-writing` (chế độ guide) trước khi viết câu văn đầu tiên, và
   lint lại mỗi bài trước khi coi là xong. Viết tiếng Việt có dấu đầy đủ.

## Cách làm một bài

1. Viết `index.json` + `dlp.json` (hoặc `lab.json`), markdown, script. Bài cũ cùng id
   (nếu có) bị VIẾT LẠI HOÀN TOÀN — xoá file cũ không còn dùng (`git rm`).
2. Sơ đồ: `diagrams/<tên>.tex` → `pnpm diagrams:build content/<…>/<id>/diagrams` →
   `pnpm diagrams:check`. Viết `.tex` bằng công cụ Write, không bằng heredoc của Git
   Bash (heredoc nuốt dấu `\`).
3. `pnpm --filter @devops-platform/scenario test` — bài phải nạp được, markdown parse
   được. Bỏ qua (lead sẽ sửa lúc tích hợp) đúng ba nhóm đỏ: danh sách id ghim trong
   `source.test.ts`, các khẳng định riêng theo id trong `content-scenarios.test.ts` và
   `content-labs.test.ts`, và test ratchet T7 trong `packages/copy`. Mọi đỏ khác là lỗi
   của bạn.
4. Shellcheck mọi `.sh`: `docker run --rm -v "$(pwd -W 2>/dev/null || pwd):/mnt" -w /mnt koalaman/shellcheck:stable --severity=warning <đường dẫn>`.
5. Smoke trên cụm thật: `node scripts/content-smoke/smoke.mjs lesson <id>` hoặc
   `lab <id>` (đọc `scripts/content-smoke/README.md`). Bài chỉ xong khi smoke xanh: mọi
   verify TRƯỢT trước khi làm và ĐẠT sau khi làm. Lab: mỗi task có `solution.sh`.
   Khi lead báo image sandbox mới (có nano, vim, iproute2, tree, netcat, dig, docker
   compose, Theia), chạy smoke với `--image <tag lead đưa>`.
6. Commit từng bài một, dạng pathspec: `git add <đường dẫn mới cụ thể>` rồi
   `git commit -m "content(<chủ đề>): <id> …" -- <các đường dẫn>`. Không `git add -A`.

## Lấy bản mới của công cụ

Lead gộp công cụ (harness smoke, image) vào `feat/labs-rebuild`. Khi được báo, chạy
`git merge feat/labs-rebuild` trong worktree của bạn (không rebase, không checkout).

## Cụm Kubernetes thật dùng chung

Một node, ít RAM. Smoke tự giới hạn số pod đồng thời; đừng vượt rào đó. Không bao giờ
tạo hay xoá gì trong namespace `default` và `dlp-sandbox`. Pod smoke của bạn phải được
xoá khi xong (smoke tự xoá trừ khi `--keep`).

## Báo cáo

Tin nhắn cuối: bảng id → trạng thái (xong / dở / chặn), đường dẫn báo cáo smoke, số
commit, và những gì chưa chứng minh được. Gần trần ngân sách thì commit trước, báo
phần dở dang sau.
