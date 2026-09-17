# Lane 18.A — gỡ K8s ra khỏi `core/verify.ts`

**Ngày:** 2026-09-14 · **Nhánh:** `feat/p18-oj-exam` · **Commit:** `1c1737d`
**Việc:** món nợ 18.A mà plan không nhắc, ghi ở `phase-18.md` §0.1 + khối cảnh báo AC-A.

---

## 1. Việc đã làm

`core/verify.ts` là bộ phát lại tất định chống gian lận, và §18.C (chấm lại phía server)
dựa thẳng vào nó. Nó còn import **năm kiểu K8s** — `CreateSession`, `K8sGameAction`,
`K8sSession`, `Level`, `SessionStatus` — từ `../k8s/contract.ts`. Hệ quả không phải
thẩm mỹ: "OJ đa-game" mới đúng ở tầng `Problem` mà chưa đúng ở tầng **chấm**, nên một
bài Git không có đường đi qua bộ xác minh.

Đo trước khi động vào: cả năm kiểu chỉ dùng trong **một** hàm, `sessionReplayEngine`
(`core/verify.ts:251`, ~47 dòng thân + ~17 dòng chú thích). 442 dòng còn lại của file
đã tổng quát từ 17.A.2. Nên việc là **chuyển nhà một hàm**, không phải viết lại bộ
xác minh.

| File | Thay đổi |
|---|---|
| `packages/games/src/k8s/replay-engine.ts` | **TẠO MỚI** (103 dòng) — `sessionReplayEngine` nguyên vẹn: cùng tên, cùng chữ ký, cùng thứ tự tham số, cùng thân hàm |
| `packages/games/src/k8s/replay-engine.test.ts` | **TẠO MỚI** (262 dòng) — 6 ô của `describe('sessionReplayEngine …')` + `FAKE_LEVEL`, `SessionSpy`, `makeFakeCreateSession`, `newSpy`, `scoreFromStatus` |
| `packages/games/src/core/verify.ts` | **SỬA** — bỏ khối import K8s (dòng 38–44) và hàm (234–297); giữ `ReplayEngine`, `verifyRun`, `checkDeterminism`, `tallyLog`, `isVerified`, `verifyLabel`, `COMMAND_KINDS` |
| `packages/games/src/core/verify.test.ts` | **SỬA** — bỏ import K8s, bỏ khối adapter, `genuineLog` trở về dạng rộng `RunLog` |

Khối test **không viết lại, không nới lỏng**: file mới dựng bằng script cắt thẳng văn
bản từ `git show HEAD:...`, có kiểm mốc từng dòng trước khi cắt (script chạy đỏ một lần
vì tôi gõ thiếu một ký tự ở mốc dòng 522 — đúng cái nó sinh ra để bắt).

### Hai chỗ buộc phải khác bản gốc, và vì sao

1. **`sessionResult()` dựng thẳng thay vì gọi `genuineResult()`.** Bản gốc lấy phần
   chung từ `genuineResult()`, hàm tính bằng engine thuần giả — thứ ở lại
   `core/verify.test.ts`. Mọi con số giữ **nguyên giá trị cũ**: `score` vẫn là hằng gõ
   tay `2 * 100 - 1 * 10` (tính lại bằng chính `scoreFromStatus` sẽ khớp kể cả khi hàm
   đó sai, tức là biến ô chiều dương thành tautology), `objectivesMet` vẫn **tính** từ
   `genuineLog` đúng như bản gốc tính nó từ engine.
2. **Hai câu chú thích trỏ sai chỗ sau khi chuyển.** `"khác hẳn engine thuần ở trên"`
   → `"ở core/verify.test.ts"`, và lý do `genuineLog` phải là `K8sRunLog` đi theo khối
   adapter sang file mới. Sửa con trỏ đã hỏng, không sửa phép kiểm.

---

## 2. Ô nghiệm thu

### 2.1 AC-A — `core/` hết phụ thuộc vào game nào

Lệnh (bản đã sửa ngày 2026-09-14, ghi ở khối cảnh báo AC-A của `phase-18.md`):

    grep -rn "from '../k8s|from '../git" packages/games/src/core/ --include=*.ts

(hai dấu chấm trong mẫu thật được thoát; ở đây viết trần để chính báo cáo này không
đi làm đỏ ô của lane khác.)

**Trả rỗng (rc=1). ĐẠT.**

**Đối chứng dương** — một ô không đỏ được thì không chứng minh gì
(`rules/green-that-proves-nothing.md`). Chạy chính mẫu đó trên bản **trước** commit
(`1c1737d~1` = `9d26857`):

    -- core/verify.ts --      44:} from '../k8s/contract.ts';
    -- core/verify.test.ts -- 23:} from '../k8s/contract.ts';

Mẫu grep **đỏ được**, nên "rỗng" ở trên mang thông tin.

> ⚠ Một cái bẫy đã tránh được: tôi suýt viết chính lệnh grep đó vào chú thích trong
> `core/verify.ts`. Làm vậy là dựng lại đúng hình dạng hỏng mà plan vừa sửa — một ô
> nghiệm thu chỉ qua được bằng cách cấm nhắc tên vấn đề trong văn xuôi. Chú thích giờ
> trỏ sang `phase-18.md` và nói thẳng rằng ô đo **phụ thuộc**, không đo chính tả.

> ⚠ Lần chạy đối chứng **đầu tiên** dùng `HEAD~1` và trả rỗng — đọc ra như "mẫu grep
> hỏng". Không phải: lane khác đã commit đè lên nên `HEAD~1` không còn là cha của
> commit tôi. Mốc đúng là `1c1737d~1`. Trong một cây có nhiều phiên cùng ghi thì
> `HEAD~n` là mốc trôi, phải neo bằng SHA.

### 2.2 Số test — trước / sau

Phép đo quy được về lane này là phép đo có mục tiêu; suite đầy đủ trôi vì lane khác
thêm file giữa hai lần chạy.

| Phép đo | Trước | Sau |
|---|---|---|
| `core/verify.test.ts` | **32** passed | **26** passed |
| `k8s/replay-engine.test.ts` | — (chưa có) | **6** passed |
| **Tổng hai file** | **32** | **32** ✅ |

**32 → 32.** Không ô nào bốc hơi; 6 ô chuyển đúng sang nhà mới. Con số `passed` là
tường minh, không phải mã thoát 0 của một suite skip sạch.

Suite đầy đủ `pnpm --filter @devops-platform/games test`:

| | Trước (18:19) | Sau (18:35) |
|---|---|---|
| Test Files | 57 passed (57) | **60 passed (60)** |
| Tests | 1256 passed | **1287 passed** |
| Errors | **1** (xem §4) | **0** |
| Exit | 1 | **0** |

Chênh +3 file / +31 ô **không đến từ lane này** (lane này net 0):
`git/determinism.jsdom.test.ts` lần này khởi động được worker (+1 file),
`k8s/replay-engine.test.ts` của tôi (+1 file, net 0 ô vì `core/verify.test.ts` giảm
đúng 6), và `problem-plugins.test.ts` của lane plugin (+1 file).

### 2.3 Cổng khác

| Cổng | Kết quả |
|---|---|
| `pnpm --filter @devops-platform/games typecheck` | **exit 0**, sạch |
| `npx eslint` trên 4 file sở hữu | **exit 0**, sạch |

Lint chạy tường minh vì repo này đã trả giá: lane chỉ chạy `tsc` + `test` để 8 lỗi
lint sống sót trọn chặng P17.

---

## 3. Chỗ phải dừng vì ranh giới lane khác

### 3.1 Barrel — đã được lead xử lý trong lúc lane này chạy

`packages/games/src/index.ts` là của lead. Sau commit của tôi, `tsc` đỏ **đúng một
dòng**:

    src/index.ts(176,3): error TS2305: Module '"./core/verify.ts"' has no exported member 'sessionReplayEngine'.

Lead đã vá ở `16f508e` (`feat(games): wire barrel cho bảng đăng ký plugin và chỗ ở mới
của replay engine`). Barrel giờ:

    index.ts:197  export { sessionReplayEngine } from './k8s/replay-engine.ts';

Typecheck sau đó **exit 0**. Tên export giữ nguyên, nên `apps/web/` không phải sửa một
dòng nào — đã kiểm: `apps/web/src/server/problems/replay.ts` import qua gốc package
`@devops-platform/games`, và `packages/games/package.json` chỉ mở đúng một subpath `"."`.

### 3.2 Không chạm

`apps/web/**`, `k8s/problem-plugin.ts`, `problem-plugins.test.ts`,
`k8s/problem-regression.test.ts`, `core/problem.ts`, `core/problem-plugin.ts` — có thay
đổi chưa commit của lane khác trong cây suốt phiên; commit của tôi dùng pathspec đúng 4
đường dẫn, `git add` chỉ 2 file mới.

---

## 4. Việc còn để lại (ngoài lane này)

**`git/determinism.jsdom.test.ts` không khởi động được worker — có sẵn từ trước, không
do thay đổi này.** Ở lần chạy nền lúc 18:19 nó đỏ, và chạy **một mình** cũng đỏ y hệt:

    Error: [vitest-pool]: Failed to start forks worker ...
    Caused by: [vitest-pool-runner]: Timeout waiting for worker to respond
    Test Files  no tests

Nguyên nhân đo được: `jsdom@30.0.1` **có** trong store pnpm nhưng **không** được liên
kết vào `packages/games/node_modules/` (chỉ có `@devops-platform`, `@eslint`, `@types`,
`@typescript`, `eslint`, `eslint-config-prettier`, `typescript`, `typescript-eslint`,
`vitest`). File đó khai `@vitest-environment jsdom` bằng docblock nên worker chết lúc
nạp môi trường.

Ở lần chạy 18:35 nó **chạy được** — tức là hành vi không ổn định (timeout 60s, có lẽ
đua với tải máy). Hai điều đáng lo, cả hai nằm ngoài 4 file tôi sở hữu:

1. `packages/games/package.json` thiếu `jsdom` trong `devDependencies` — không thuộc
   lane này, **không sửa**.
2. Chính file đó tự khai mình là *"điều kiện sống còn của P18"* (§17.J.5: engine phải
   ra cùng kết quả từng byte ở Node và trình duyệt). Một ô gác sống còn mà **hỏng im
   lặng thành "no tests"** thì đúng hình dạng `green-that-proves-nothing.md`. Đề nghị
   lead giao cho lane sở hữu `package.json`.

---

## 5. Cần ở lead

Không còn gì chặn: barrel đã wire, typecheck và lint xanh, test 32 → 32. Chỉ còn mục
§4 để lead phân lane.
