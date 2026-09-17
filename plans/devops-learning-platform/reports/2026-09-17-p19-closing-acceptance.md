# P19 — nghiệm thu đóng chặng (2026-09-17)

Chặng 19 (game "Đường ống CI/CD") đã đủ A→J. Báo cáo này chạy **mười ô nghiệm thu của cả
chặng** ở [`phase-19.md`](../phase-19.md) §3 và ghi lại phép đo của từng ô.

Nhánh đo: `feat/p19-j-oj-mode` (PR #146) trên nền `main` = `e0ca524`.

---

## Bảng kết quả

| # | Ô | Kết quả | Đo bằng |
|---|---|---|---|
| AC-1 | Toàn cây xanh | **ĐẠT** | `pnpm turbo run lint typecheck build test --force --concurrency=3` → `Tasks: 32 successful, 32 total` |
| AC-2 | 0 lời gọi backend lúc chơi | **ĐẠT** | `e2e:ci` — `games-cicd.spec.ts` (2 ô trace mạng) + `games-cicd-problem.spec.ts` AC-J7 |
| AC-3 | Engine tất định | **ĐẠT** | `cicd/engine.test.ts:625` — 1000 lượt cùng `(spec, seed)` ra một kết quả, kèm HAI đối chứng |
| AC-4 | Lõi trung lập | **ĐẠT** | `scripts/check-cicd-vendor-neutral.mjs` — 86 file lõi, 6 file tầng YAML, có đối chứng dương 14 mẫu |
| AC-5 | Đường 2D dùng được | **ĐẠT** | `games-cicd-nowebgl.spec.ts` — chọn 3D trên máy không WebGL2 thì rơi về 2D |
| AC-6 | a11y | **ĐẠT** | `e2e:ci` — `a11y.spec.ts` + quét axe trong `games-cicd.spec.ts`, cả hai theme |
| AC-7 | Hiệu năng | **ĐẠT** | `games-cicd-scene.spec.ts` — ngân sách draw call, có số đo |
| AC-8 | 28 level qua được | **ĐẠT** | `cicd/levels/{ci-som,ci-muon,cd-levels}.test.ts` — chạy lời giải mẫu của cả 28 |
| AC-9 | Ba trục điểm độc lập | **ĐẠT** | `cicd/score.test.ts` — chứng minh không trục nào suy ra được từ hai trục kia |
| AC-10 | Bài lý thuyết có trong image | **ĐẠT** | `docker build --target runner` + đếm FILE trong image (chi tiết bên dưới) |

**Con số thô của AC-1**

```
Tasks:    32 successful, 32 total
@devops-platform/games:test    2562 passed
@devops-platform/web:test      2955 passed
@devops-platform/ui:test       1083 passed
@devops-platform/scenario:test  289 passed
@devops-platform/terminal:test  133 passed
@devops-platform/motion:test    110 passed
@devops-platform/copy:test       72 passed
@devops-platform/shared-types    48 passed
```

`--force` là bắt buộc ở ô này: thiếu nó turbo trả cache và `Tasks: 32 successful` nói về một
lượt chạy CŨ. Và đọc `Tasks: X/Y` TRƯỚC khi trích bất kỳ con số test nào — turbo DỪNG sau một
task đỏ, nên một suite phía sau có thể chưa chạy lần nào.

**AC-3 / AC-8 / AC-9 chạy chung một lượt:** `npx vitest run src/cicd/engine.test.ts
src/cicd/score.test.ts src/cicd/levels` → `7 passed (7) · 381 passed (381)`.

**AC-2 / AC-5 / AC-6 / AC-7 chạy chung `e2e:ci`:** `135 passed / 40 skipped`, 5.1 phút, trên
`next start` của một bản build mới. 40 ô skip là các ô đòi vai trò (`@flow`, quét theo vai trò
của `responsive.spec.ts`) — có từ trước, không phải hệ quả của chặng này.

---

## AC-10 — và một phép đo SAI suýt báo động nhầm

Lượt đầu báo **0 file** và tôi suýt ghi AC-10 đỏ. Phép đo sai, không phải image sai: nó đọc
`/app/content/...` trong khi `WORKDIR` của stage `runner` là **`/repo`**. Cùng một lệnh, đổi
đường dẫn, ra 21 file.

Bài học nằm đúng chỗ `docs/` đã ghi cho `.dockerignore`: một phép kiểm trên image phải đếm
**FILE**, và phải đếm ở **đường dẫn runtime thật**. Đếm ở một đường dẫn không tồn tại cho ra `0`
— trông y hệt "image rỗng nội dung", và nó đẩy người đọc đi sửa `.dockerignore`, thứ hoàn toàn
lành.

Phép đo đúng, sau khi `docker build -f apps/web/Dockerfile --target runner`:

```
find /repo/content/games/cicd/theory -name "*.md" -type f | wc -l   →  21

01-duong-ong-la-do-thi.md: 3920 byte
16-canary-va-co-mau.md:    3917 byte
21-hotfix-va-ca-truc.md:   3493 byte

đối chứng âm: 99-khong-ton-tai.md  →  vắng (đúng)
```

Ba file kiểm theo BYTE chứ không theo sự tồn tại: `.dockerignore` có `**/*.md` ở dòng 27 và
`!content/**/*.md` ở dòng 40, nên một lượt sửa đánh rơi dòng miễn trừ sẽ để lại đủ thư mục và
đủ `index.json` mà rỗng nội dung. Đối chứng âm ở cuối là thứ phân biệt "đếm đúng" với "lệnh
`find` trả mọi thứ".

---

## Việc còn mở sau khi đóng chặng

Ghi đầy đủ ở [`phase-19.md`](../phase-19.md) §0b. Một mục đáng nhắc lại vì nó **lớn hơn P19**:

> ⛔ **Ô chọn vị từ của trang soạn bài chỉ biết K8s.** `objective-fields.tsx:154` dựng danh sách
> bằng `PREDICATE_NAMES` (riêng K8s) và `predicate-spec.ts:37` khai `PREDICATE_SPECS` là
> `Record<PredicateName, …>`. Hệ quả: **không soạn được testcase cho bất kỳ game nào khác K8s**
> qua giao diện — game Git cũng dính, và nó có từ 18.D chứ không phải từ 19.J.

Đo được bằng một lượt `@flow` chạy thật (Postgres cục bộ + `next start`, tài khoản nâng vai trò
`author` thẳng trong DB): lưu một bài CI/CD dừng ở đúng một ô — *"Chưa chọn vị từ kiểm tra"*.
`importProblemJson` giữ nguyên `check: 'rollbackUnder'` (đo riêng bằng một ô vitest), nên thứ
đánh rơi giá trị là ô chọn trên màn hình.

Sửa cho tử tế đòi một bảng đặc tả tham số theo TỪNG game, tức một ô mới trong hợp đồng
`GameProblemPlugin` — hôm nay nó có `predicateNames` nhưng không có đặc tả tham số. Đó là một
việc riêng, không phải một dòng vá.

Ô `@flow` (`apps/web/e2e/flows/cicd-problem.flow.spec.ts`) để ở `test.fixme` kèm bằng chứng,
không xoá: ngày ô chọn biết đa-game thì bỏ `fixme` là có ngay một phép đo. Đường GHI thì đã
lành và có ô gác chạy trong CI mỗi lượt —
`apps/web/src/server/problems/save-cicd-problem.integration.test.ts` đi trọn body → biên ghi Zod
→ Postgres → đọc lại → CHẤM.

---

## Cách chạy lại trọn bộ

```bash
docker compose up -d postgres redis
pnpm --filter @devops-platform/web db:migrate
DATABASE_URL=... node scripts/seed-content.mjs

pnpm turbo run lint typecheck build test --force --concurrency=3     # AC-1
node scripts/check-cicd-vendor-neutral.mjs                            # AC-4
cd packages/games && npx vitest run src/cicd/engine.test.ts src/cicd/score.test.ts src/cicd/levels   # AC-3/8/9

pnpm --filter @devops-platform/web build
cd apps/web && E2E_START_SERVER=1 E2E_BASE_URL=http://localhost:3000 \
  E2E_ORIGIN=http://localhost:3000 pnpm e2e:ci                        # AC-2/5/6/7

docker build -f apps/web/Dockerfile --target runner -t dlp-web:ac10 . # AC-10
docker run --rm --entrypoint sh dlp-web:ac10 -c \
  'find /repo/content/games/cicd/theory -name "*.md" -type f | wc -l'
```

⚠ `E2E_ORIGIN` phải là **`localhost`**, không phải `127.0.0.1`: app khai
`BETTER_AUTH_URL=http://localhost:3000` và Better Auth so CHUỖI. Thiếu `E2E_START_SERVER=1` thì
Playwright trỏ vào CỤM, tức đo một binary khác binary vừa sửa.
