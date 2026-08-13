# `packages/scenario`

Parser scenario Katacoda/Killercoda (`index.json` + markdown) → DTO chung của
nền tảng. Chặng **P2 / 2.A** ([phase-2.md](../../plans/devops-learning-platform/phase-2.md)).

Contract đầy đủ (format upstream, quyết định thiết kế, bảng ánh xạ imageid, chốt
transport cho 2.C): **[`docs/scenario-format.md`](../../docs/scenario-format.md)**.

## Dùng

```ts
import { loadScenario, loadScenarios, parseContentBlocks } from '@devops-platform/scenario';

const scenarios = await loadScenarios('content/scenarios');   // ném nếu BẤT KỲ bài nào hỏng
const blocks = parseContentBlocks(scenarios[0].steps[0].markdown);
```

DTO (`Scenario`, `ScenarioStep`, …) sống ở
`@devops-platform/shared-types/scenario` — package này chỉ SINH ra nó.

## Ranh giới

- **Không render HTML.** DTO mang markdown nguyên văn; `parseContentBlocks` tách
  ra khối hành động (`{{exec}}`/`{{copy}}`) để FE gắn nút. Lý do đầy đủ:
  `docs/scenario-format.md` §2.1.
- **Không chạy script.** Loader ĐỌC nội dung `verify`/`foreground`/`background`
  thành chuỗi. Chạy chúng trong pod là việc của 2.C.
- **Không chạm mạng.** Kéo nội dung upstream là việc của
  `scripts/vendor-scenarios.mjs`, không nằm trong `pnpm test`.

## Errors-over-fallback

Không có scenario "gần đúng". Mọi lỗi ném `ScenarioError` kèm tên thư mục:
field lạ chưa khai, `id` lệch tên thư mục, `imageid` chưa xem xét, không có step
nào, đường dẫn trỏ ra ngoài thư mục, file vắng mặt, JSON hỏng. Trong
`loadScenarios`, **một** bài hỏng làm hỏng cả mẻ — bỏ qua nó nghĩa là `/lessons`
thiếu một bài trong khi CI vẫn xanh.

## Verify

```bash
pnpm --filter @devops-platform/scenario test
node packages/scenario/scripts/parse.mjs content/scenarios/ckad-configmap-as-files [--json]
```
