# Phase 9 — Soạn bài trên UI: `ScenarioSource` bản DB, vai trò author, vòng đời nháp→xuất bản

**Mức chi tiết:** DETAILED · **Effort:** L · **Blocks:** P10 (lộ trình cần nội dung động), P13 (FE trang soạn) · **Blocked by:** P8 (format lab đã chốt — nếu soạn cả lab)

> Ràng buộc dài hạn #4 của chủ dự án: **"soạn bài trực tiếp trên UI, không hardcode vào repo"**. Đây là lý do `ScenarioSource` (`packages/scenario/src/source.ts`) tồn tại như một **interface** từ 2.B chứ không phải một lời gọi `loadScenarios()` rải khắp router. Phase này là hiện thực thứ hai mà seam đó được dựng để đón.

## Objective

Một người có vai trò author mở trang soạn, tạo bài mới, viết markdown từng bước, gắn script setup/verify, tải asset, xem trước, rồi **xuất bản**. Bài đó xuất hiện trong danh sách như mọi bài khác — router, `checkStep`, FE **không sửa một dòng nào**.

## Điều seam đã hứa, và điều nó chưa nói

`source.ts` ghi sẵn, giữ nguyên hiệu lực:
- `list()` trả **bản rút gọn**, `get()` trả bản đầy đủ — với nguồn DB, `list()` là một `SELECT` không chạm markdown.
- ⛔ **KHÔNG dựng bảng `scenarios` khi nội dung còn nằm trên đĩa** — lúc đó nó là bản sao (derived). **Phase này là ngày bảng đó được phép ra đời**, và ở đây nó là **NGUỒN**, không phải bản sao.

Điều seam chưa nói và phase này phải chốt: **hai nguồn cùng tồn tại** (đĩa vendored + DB). Bốn câu hỏi bắt buộc trả lời trong `docs/content-sources.md`:
1. Trùng `id` thì ai thắng? (đề xuất: **đĩa thắng**, vì nó ghim byte và có license upstream; DB không được che một bài vendored)
2. `list()` gộp hai nguồn — thứ tự ổn định thế nào? (cursor pagination đang dựa vào thứ tự ổn định theo `id`)
3. Một bài DB tham chiếu asset — asset nằm đâu, và ai phục vụ nó?
4. Cache: nguồn đĩa cache **promise** cả vòng đời tiến trình. Nguồn DB **không được** làm vậy — sửa bài xong phải thấy ngay.

## Task list

### 9.A — Vai trò `author`

1. `userRole` hiện là `['user','admin']`. Thêm `'author'`. Migration phải giữ mọi user cũ là `user`.
2. Quyền: `author` soạn/sửa/xuất bản **bài của chính mình**; `admin` sửa mọi bài. Không có "sửa bài người khác" cho `author`.
3. Luật 1 ở dạng mạnh: procedure soạn bài **không nhận `authorId` từ input** — lấy từ `ctx.user.id`. Đây là chỗ IDOR dễ lọt nhất trong cả dự án vì nó là API ghi.

### 9.B — Bảng nội dung (và chỉ những cột không tính được)

4. `content_items`: `id`, `kind` (lesson|lab|playground), `authorId`, `state` (draft|published|archived), `title`, `difficulty`, `tier`, `capabilities`, `interfaceLayout`, `createdAt`, `updatedAt`, `publishedAt`.
5. `content_steps`: `contentId`, `ordinal`, `title`, `markdown`, `setupScript`, `verifyScript`, `foregroundScript`.
6. **KHÔNG** cột `stepCount` (đếm được) · **KHÔNG** `estimatedMinutes` nếu tính được từ nội dung — nếu là số người soạn **nhập tay** thì nó KHÔNG phải derived và được phép lưu. Ghi rõ lý do tồn tại của mỗi cột trong migration.
7. `content_assets`: `contentId`, `path`, `sizeBytes`, `sha256`, `storageKey`.

### 9.C — Bản DB của seam

8. `dbContentSource(db)` hiện thực đúng interface hiện có. `list()` chỉ đọc cột metadata. `get()` mới nạp step + asset.
9. **Chỉ trả bài `published`** cho người học; author thấy thêm bài `draft` của chính mình. Điều kiện này nằm trong nguồn, không rải ra router.
10. Nguồn hợp nhất: `compositeContentSource([filesystem, db])` với luật ưu tiên của `docs/content-sources.md`. Trùng `id` ⇒ **log WARN kèm cả hai nguồn**, không im lặng.
11. Cache: nguồn DB không cache, hoặc cache có invalidation theo `updatedAt`. Một bài vừa sửa mà 5 phút sau mới thấy là một lỗi người soạn sẽ báo là "mất bài".

### 9.D — Validate lúc lưu, không lúc chạy

12. Dùng lại **đúng** Zod schema của `packages/shared-types/src/scenario.ts` để validate trước khi ghi. Một bài lưu được nhưng chạy hỏng là format thứ hai đang hình thành.
13. Script (`setup`/`verify`) do người soạn nhập: chạy `shellcheck` **lúc lưu** và hiện cảnh báo. Không chặn cứng (nội dung vendor upstream vốn không sạch — CI đã chốt chỉ soi `dlp-*`), nhưng cảnh báo phải hiện.
14. ⚠ Bẫy đã trả giá: `execShell` là `bash`, không phải `sh`. Trang soạn phải nói rõ script chạy bằng bash, kèm ví dụ.

### 9.E — Asset: tải lên, phục vụ, và không thành lỗ hổng

15. Lưu ở PVC (`local-path` đang có) hoặc object store; **không** lưu blob trong Postgres.
16. Trần kích thước + kiểu file (allowlist), `sha256` ghi lại. Tên file **không** đi thẳng vào đường dẫn — dùng `storageKey` sinh ra, giữ tên gốc chỉ để hiển thị (chống path traversal; `E8` của image sandbox đã có guard `..`, đừng để tầng web yếu hơn).
17. Route phục vụ asset đã tồn tại (`/api/scenarios/[id]/assets/[...path]`) — mở rộng cho nguồn DB, **giữ nguyên** kiểm quyền.

### 9.F — Nháp → xuất bản → thu hồi

18. `publish` chạy validate đầy đủ + **một lượt chạy thử thật** trong sandbox (setup + verify của từng bước) rồi mới đổi `state`. Xuất bản một bài chưa từng chạy là cách nhanh nhất mất niềm tin của người học.
19. `archive` thay cho xoá: bài đã có tiến độ của người học không được biến mất.
20. Sửa bài **đã xuất bản** ⇒ tạo bản nháp mới, không sửa tại chỗ — người đang học dở không được đổi bài dưới chân.

## File / dir ownership

`apps/web/src/server/db/schema.ts` + migration · `apps/web/src/server/trpc/routers/authoring.ts` · `packages/scenario/src/{source.ts,db-source.ts,composite-source.ts}` · `apps/web/src/app/api/scenarios/[id]/assets/[...path]/route.ts` · `apps/web/src/server/content/**` · `docs/content-sources.md`

## Dependencies

- **Blocked by:** P8 nếu soạn được cả lab (format lab phải chốt trước). Soạn lesson thuần thì chỉ cần P5.
- **Blocks:** P10 (lộ trình trỏ tới nội dung động), P13 (FE trang soạn — dùng lại editor của P6).

## Acceptance criteria

- [ ] `docs/content-sources.md` trả lời **cả bốn** câu hỏi ở trên, kèm luật ưu tiên.
- [ ] Router/`checkStep`/FE **không sửa** khi thêm nguồn DB (chứng minh bằng diff: 0 dòng ở 3 chỗ đó).
- [ ] Bài `draft` **không** hiện cho người học; author thấy bài nháp của chính mình, không thấy của người khác.
- [ ] Procedure ghi **không có field `authorId`** trong input (luật 1 dạng mạnh); test IDOR có đối chứng dương.
- [ ] Trùng `id` giữa hai nguồn ⇒ luật ưu tiên đúng như tài liệu + log WARN nêu cả hai nguồn.
- [ ] Sửa bài xong **thấy ngay** (không cache lỗi thời) — test có mốc thời gian.
- [ ] Lưu bài sai format ⇒ từ chối kèm tên field (luật 3); script bẩn ⇒ cảnh báo, không chặn.
- [ ] Upload: allowlist kiểu file, trần kích thước, `storageKey` sinh ra, thử `../` bị chặn.
- [ ] `publish` chạy thử thật trong sandbox rồi mới đổi state; bài trượt không xuất bản được.
- [ ] Sửa bài đã xuất bản không đổi nội dung dưới chân người đang học.

## Verify commands

```bash
pnpm --filter web test -- authoring content-source
curl -X POST .../assets -F 'file=@../../etc/passwd'    # phải bị từ chối
psql -c "select id, state, author_id from content_items"
```

## Risk Assessment (P9)

| Rủi ro | L | I | Score | Mitigation |
|---|---|---|---|---|
| API ghi mở đường IDOR (sửa bài người khác) | 4 | 5 | **20** | Không nhận `authorId`; kiểm chủ sở hữu trong nguồn; test IDOR + đối chứng dương; review riêng cho router này. |
| Upload thành đường ghi file tuỳ ý | 3 | 5 | **15** | `storageKey` sinh ra, allowlist, trần cỡ, không dùng tên gốc làm đường dẫn. |
| Người soạn nhập script chạy trong sandbox của người học | 3 | 4 | 12 | Đó là **thiết kế**, không phải lỗ hổng — nhưng chỉ author/admin soạn được, và sandbox vẫn là ranh giới cô lập (luật 10). Ghi rõ mô hình mối đe doạ. |
| Hai nguồn trôi khỏi nhau, một bài hiện hai lần | 3 | 3 | 9 | Luật ưu tiên + log WARN + test cho ca trùng id. |
| Bảng nội dung mọc cột derived theo thời gian | 3 | 3 | 9 | Mỗi cột phải có lý do trong migration; review chặn. |

## Timeline (P9)

| Task | Effort |
|---|---|
| 9.A vai trò | S |
| 9.B bảng + migration | M |
| 9.C nguồn DB + hợp nhất | L |
| 9.D validate lúc lưu | M |
| 9.E asset | M |
| 9.F vòng đời | M |
| **Total** | **L** |
