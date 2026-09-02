# Phase 14 — Trụ cột ③ Games, hoàn thiện, và bản phát hành ứng viên

**Mức chi tiết:** DETAILED · **Effort:** L · **Blocks:** không (đây là phase cuối) · **Blocked by:** P13; CTF cần P11

> Trụ cột ③ của thiết kế: game tương tác trong trình duyệt, **phần lớn frontend-only (0 backend)** — rẻ, scale vô hạn, không tốn một pod nào. Cộng với vòng hoàn thiện và mọi thứ cần để gọi hệ này là "chạy được", không phải "chạy được trên máy tôi".

## Objective

1. Trụ cột ③ có nội dung thật và **không tiêu tốn sandbox**.
2. CTF (P11) vào đúng chỗ của nó trong phần thử thách.
3. Hệ thống có runbook, có đường sao lưu **đã thử khôi phục**, có bộ tài liệu cho người vận hành và người soạn bài, và một lượt pentest cuối trên bản sẽ phát hành.

## Task list

### 14.A — Game frontend-only

1. Logic chạy **hoàn toàn trong trình duyệt**. Không route BE, không pod, không phiên. Đây là ràng buộc kiến trúc, không phải một tối ưu — nó là lý do trụ cột ③ tồn tại (design §7.5).
2. 3–5 game đầu tiên, chủ đề DevOps: đọc/sửa YAML K8s, ghép kiến trúc, phân loại lệnh, tìm lỗi trong Dockerfile, đoán output.
3. Tiến độ game: `localStorage`, hoặc — nếu muốn đồng bộ theo tài khoản — **một** bảng tối thiểu (`gameId`, `userId`, `bestResult`, `updatedAt`). ⛔ Không cột nào suy ra được. Chốt một trong hai và ghi lý do; đừng làm cả hai.
4. Tham chiếu k8sgames (Apache-2.0) hợp lệ — **ghi attribution** nếu mượn ý tưởng/asset, như `content/scenarios/*/LICENSE.upstream` đang làm.

### 14.B — Thư viện game và CTF

5. `/games`: lưới thẻ, lọc theo chủ đề/độ khó, đánh dấu game nào cần đăng nhập (nếu đồng bộ tiến độ).
6. CTF của P11 nằm ở phần **thử thách** cạnh game, nhưng nói rõ nó **tốn một sandbox** — người dùng phải biết trước cái gì tốn chỗ và cái gì không.

### 14.C — Vòng hoàn thiện

7. Rà **toàn bộ** chuỗi tiếng Việt: một giọng, một cách xưng hô, không lẫn Anh-Việt tuỳ tiện. Thuật ngữ giữ nguyên tiếng Anh phải nhất quán (pod, container, cluster, sandbox).
8. Rà mọi **thông báo lỗi** người dùng thấy: nói được **chuyện gì xảy ra** và **làm gì tiếp**. ⚠ Đây là chỗ hệ này đã trả giá nhiều lần — "script chạy quá hạn: context deadline exceeded" là thứ đúng cho log và vô nghĩa cho người học.
9. Ảnh/asset: kích thước, lazy-load, `alt` thật (không phải tên file).
10. Rà hiệu năng: bundle của trang danh mục và trang học, tách mã theo route, không kéo xterm.js vào trang không có terminal.

### 14.D — Vận hành: sao lưu, khôi phục, runbook

11. Sao lưu Postgres (tiến độ, người dùng, nội dung DB) + asset của P9. Redis **không** cần sao lưu (session là phù du) — ghi rõ điều đó để không ai tưởng là thiếu sót.
12. ⛔ **Một bản sao lưu chưa từng khôi phục không phải một bản sao lưu.** Diễn tập: khôi phục vào một database sạch, chạy hệ trên đó, đăng nhập, thấy đúng tiến độ. Ghi thời gian khôi phục thật.
13. `docs/runbook.md`: cụm không lên · pod ấm cạn · gateway restart · Postgres đầy đĩa · đổi chứng chỉ · rollback một bản deploy. Mỗi mục: dấu hiệu nhận biết → lệnh → cách xác nhận đã khỏi.
14. Đưa vào runbook những bẫy đã trả giá: `~/dlp-deploy` đã chết · `kubectl delete pod` làm lệch warm pool (dùng reaper) · **CẤM `crictl rmi --prune`** · probe 1s giết datastore khi node đói CPU · đồng hồ VM lệch.

### 14.E — Tài liệu

15. `docs/for-authors.md`: soạn bài trên UI, format, script chạy bằng **bash**, verify pass = exit 0, cách thử trước khi xuất bản.
16. `docs/for-operators.md`: cài từ đầu (`infra/host/setup-all.sh` → deploy), cấu hình, giới hạn đã biết, trần đồng thời **đo được** (không phải hứa).
17. Cập nhật `README.md` gốc: hệ này là gì, chạy được gì, **không** làm gì (không thương mại), và trạng thái thật của từng trụ cột.

### 14.F — Cổng phát hành

18. Lượt pentest cuối trên **bản sẽ phát hành**: `secure-test-devops` 10/10 + 10/10 đối chứng dương; netpol 22/22; escape test của P11; reaper-verify đầy đủ.
19. Smoke đầy đủ trên cụm sạch: cài từ đầu bằng `setup-all.sh` trên một VM mới hoặc cụm đã reset, rồi chạy hết luồng chính. ⛔ Cụm hiện tại đã chạy 25 ngày và mang trạng thái tích luỹ — nó **không** chứng minh được đường cài mới.
20. Gắn tag `v0.1.0-rc1`, ghi changelog, chốt danh sách **giới hạn đã biết** (autoscaler chưa chứng minh, 40 người ở mức nào, Kata ngoài phạm vi, `multi-node` chưa hỗ trợ nếu P7 chưa mở).
21. Báo cáo NCKH: gom số đo của cả P0–P14 thành một mạch — vấn đề, thiết kế, hiện thực, **phép đo**, giới hạn. Mọi con số trích từ report có sẵn, không đo lại từ trí nhớ.

## File / dir ownership

`apps/web/src/app/games/**` · `packages/games/**` (nếu tách) · `content/games/**` · `docs/{runbook,for-authors,for-operators}.md` · `README.md` · `infra/host/*backup*` · `plans/devops-learning-platform/reports/`

## Dependencies

- **Blocked by:** P13 (hệ thiết kế + vỏ ứng dụng); P11 cho CTF.
- **Blocks:** không — phase cuối.

## Acceptance criteria

- [ ] 3–5 game chạy **0 lời gọi backend** (kiểm bằng network trace: rỗng sau khi tải trang).
- [ ] Tiến độ game: chốt **một** cách (local hoặc DB), có lý do ghi lại; nếu DB thì không cột derived.
- [ ] Attribution đúng license cho mọi thứ mượn.
- [ ] `/games` lọc được; CTF nói rõ nó tốn một sandbox.
- [ ] Chuỗi tiếng Việt một giọng; thuật ngữ nhất quán (rà toàn bộ, không rà mẫu).
- [ ] Mọi thông báo lỗi người dùng thấy nói được **chuyện gì** + **làm gì tiếp**.
- [ ] Trang không có terminal **không** tải xterm.js (kiểm bằng bundle analyzer).
- [ ] Sao lưu Postgres + asset **đã khôi phục thật** vào DB sạch, đăng nhập thấy đúng tiến độ, thời gian khôi phục ghi lại.
- [ ] `docs/runbook.md` có ≥6 sự cố, mỗi mục đủ ba phần, và mang đủ 5 bẫy đã trả giá.
- [ ] `docs/for-authors.md` + `docs/for-operators.md` đủ để người mới làm được mà không hỏi.
- [ ] Cài từ đầu trên cụm sạch chạy hết luồng chính (**không** dùng cụm 25 ngày tuổi làm bằng chứng).
- [ ] Pentest cuối: 10/10 luật + 10/10 đối chứng dương; netpol 22/22; escape 6/6; reaper đầy đủ.
- [ ] `v0.1.0-rc1` có changelog + **danh sách giới hạn đã biết** viết thẳng.
- [ ] Báo cáo NCKH gom đủ số đo, mọi con số truy được về report gốc.

## Verify commands

```bash
# game không gọi backend
pnpm --filter web exec playwright test --grep @games-offline
# khôi phục thật
pg_restore -d dlp_restore_test backup.dump && bash infra/host/12-helm-deploy.sh --db dlp_restore_test
# cụm sạch
bash infra/host/setup-all.sh && bash infra/host/12-helm-deploy.sh
bash secure-test-devops/run-all.sh --target https://<host>
```

## Risk Assessment (P14)

| Rủi ro | L | I | Score | Mitigation |
|---|---|---|---|---|
| Sao lưu chưa từng khôi phục, phát hiện lúc mất dữ liệu | 3 | 5 | **15** | 14.D bắt diễn tập khôi phục thật là AC, không phải khuyến nghị. |
| Cụm sạch lộ ra bước cài đã hỏng từ lâu | 4 | 4 | **16** | 14.F chạy `setup-all.sh` trên cụm reset; đó chính là lý do ô này tồn tại. |
| Game trượt sang có backend "cho tiện" | 3 | 3 | 9 | AC kiểm bằng network trace; 0 lời gọi là điều kiện, không phải mục tiêu. |
| Tài liệu viết theo trí nhớ, lệch với hệ thật | 3 | 4 | 12 | Mọi lệnh trong runbook phải được chạy một lần khi viết; số trích từ report. |
| RC gắn tag trong khi giới hạn bị giấu | 2 | 4 | 8 | Danh sách giới hạn đã biết là AC; các ô mở của P3/P12 phải xuất hiện ở đó. |

## Timeline (P14)

| Task | Effort |
|---|---|
| 14.A game | L |
| 14.B thư viện + CTF | S |
| 14.C hoàn thiện | M |
| 14.D backup + runbook | M |
| 14.E tài liệu | M |
| 14.F cổng phát hành | M |
| **Total** | **L** |
