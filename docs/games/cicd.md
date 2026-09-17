# Game Đường ống CI/CD (`gameId: 'cicd'`) <!-- updated 260917 -->

Tài liệu cho người phát triển. Nó mô tả **hợp đồng, kiến trúc và quyết định**, không chép lại
mã. Khi tài liệu và mã lệch nhau, mã thắng; sửa tài liệu và ghi ngày.

Mã nguồn: `packages/games/src/cicd/`. Bài lý thuyết: `content/games/cicd/theory/`.
Kế hoạch: [`phase-19.md`](../../plans/devops-learning-platform/phase-19.md).

---

## 1. Mục tiêu

Người chơi soạn một workflow (YAML), bấm chạy, và đọc **ba con số** cùng một bản ghi mô phỏng.
Game dạy những thứ một bài giảng CI/CD thường chỉ kể: song song trên giấy khác song song trên
máy, đường găng, khoá cache sai theo hai hướng, cỡ mẫu của một lượt xanh, retry che lỗi thật,
danh tính artifact, chiến lược phát hành và thời gian lùi, drift GitOps, che bí mật trong log.

Nguyên tắc thiết kế cốt lõi, ghi ở đầu `contract.ts`: **DAG của CI/CD không có vòng lặp và không
có trạng thái ổn định.** Mỗi commit là một lô chạy một lần. Mô hình chấm vì thế mượn "chạy một
lô, chấm ba trục tách bạch" chứ không mượn dây chuyền chạy mãi kiểu steady-state.

## 2. Kiến trúc

```
packages/games/src/cicd/
  contract.ts        # hợp đồng lõi TRUNG LẬP (lead sở hữu)
  cd-contract.ts     # hợp đồng chương CD: ba bộ mô phỏng + khối cd của level (lead sở hữu)
  engine.ts          # engine CI: vòng tick, hàng đợi, máy chạy, cache, flake, retry
  graph.ts           # kiểm cạnh treo + chu trình (bản chính tắc duy nhất)
  rng-keys.ts        # khoá rút ngẫu nhiên, băm FNV-1a
  critical-path.ts   # đường găng: phép chiếu đọc bản ghi
  score.ts           # ba trục điểm + phân bố: phép chiếu đọc bản ghi
  artifacts.ts       # danh tính artifact, "môi trường nào chạy bản nào"
  release.ts         # bộ mô phỏng phát hành (rolling / blue-green / canary)
  gitops.ts          # bộ mô phỏng đối soát GitOps
  masking.ts         # bộ mô phỏng che bí mật trong log
  cd-run.ts          # chạy khối cd của một level; khoá chính sách theo núm
  predicates.ts      # vị từ chấm mục tiêu, gọi phép chiếu của các file trên
  yaml-read.ts · yaml-write.ts · yaml-kind.ts   # tầng YAML: nơi DUY NHẤT biết GitHub Actions
  hydrate.ts         # ghép YAML người chơi với dữ liệu YAML không chở được
  controls.ts        # núm bảng điều khiển ngoài ô soạn (retries, cache)
  job-shapes.ts      # khuôn job: chặn đổi tên / xoá bước để lách chấm
  cheatsheet-example.ts
  problem-plugin.ts  # bộ chấm OJ cho gameId 'cicd'
  levels/            # ci-som · ci-muon · cd-som · cd-muon · index
```

### 2.1 Lõi trung lập

`contract.ts` và `engine.ts` không mang tên khoá YAML, tên hành động dựng sẵn hay nhãn máy chạy
của bất kỳ nhà cung cấp CI nào. Ví dụ: cạnh phụ thuộc là `dependsOn` (không phải `needs`), dấu
đi-tiếp-khi-đỏ là `blocking` với nghĩa **đảo** so với `continue-on-error`, bước đầu tiên có loại
`clone`. Thêm nhà cung cấp thứ hai là thêm một bộ đọc/ghi, không đụng lõi.

Cổng `scripts/check-cicd-vendor-neutral.mjs` quét thư mục `cicd/` và có đối chứng dương. Nó chạy
ở tầng repo vì `packages/games` cố ý không có `@types/node`. Level cũng là lõi: mục cheatsheet
chở `WorkflowSpec`, không chở chuỗi YAML viết tay.

Ràng buộc tất định áp cho mọi file: không `Map`/`Set` trong bản ghi, không `Date.now()` hay
`Math.random()`, không `localeCompare` (so chuỗi bằng mã đơn vị), mọi định danh ASCII.

### 2.2 Engine CI

`evaluate(workflow, workload, evaluation)` chạy `passes` lượt mô phỏng và trả `EvaluationRecord`.
Ba đầu vào tách vai rõ ràng:

| Kiểu | Ai cấp | Chứa gì |
|---|---|---|
| `WorkflowSpec` | người chơi | stage, bước, cạnh, blocking, retries, cache, fan-out |
| `WorkloadSpec` | level | dàn máy, đầu vào workspace và nhịp đổi, dòng commit |
| `EvaluationSpec` | level | `baseSeed`, số lượt (mặc định 20) |

Những điểm engine **ghi chứ không suy**: `blockedBy` (ràng buộc quyết định lúc bắt đầu, phân biệt
chờ phụ thuộc và chờ máy), `runnerTicks` (cộng mọi lần thử), `cacheHit` (trúng khoá, khác đúng
nội dung), `flakeNature` (chỉ đọc sau khi chấm xong), `suppliers` (thực thể nào cấp sản phẩm).

Hai luật tất định không diễn đạt được bằng kiểu, ghi ở `contract.ts` §4:

1. **Rút ngẫu nhiên theo khoá** `(pass, commit, instance, attempt, draw)`, không theo một bộ sinh
   chạy dọc. Đổi số máy đổi *khi nào* một bước chạy, không đổi *nó rút được gì*.
2. **Thứ tự hàng đợi toàn phần**: sẵn sàng sớm hơn · commit tới sớm hơn · mã commit · mã stage ·
   chỉ số fan-out. Vị trí trong mảng `stages` không bao giờ đi vào luật.

Tick là 10 giây (`SECONDS_PER_TICK`), một hằng **trình bày**; engine chỉ tính bằng tick nguyên.

### 2.3 Ba bộ mô phỏng CD

Chương CD không nhồi phát hành vào vòng xếp lịch. Engine CI chỉ thêm đúng thứ phải xảy ra trong
vòng đó (kẻ cấp sản phẩm, cổng phê duyệt). Phần còn lại là ba **hàm thuần** độc lập, đếm bằng
**giây nguyên**, không hàm nào đọc bản ghi của hàm khác:

| File | Cửa vào | Luật |
|---|---|---|
| `release.ts` | `simulateRelease(policy, scenario, evaluation)` | R1–R6 ở `cd-contract.ts` §1 |
| `gitops.ts` | `simulateGitOps(policy, scenario)` | G1–G5 ở `cd-contract.ts` §2 |
| `masking.ts` | `renderMaskedLog(policy, scenario)` | M1–M4 ở `cd-contract.ts` §3 |

Mỗi bộ ghi **sự kiện**; độ dài, tỷ lệ, số đếm (thời gian lùi, số lần giành nhau, số mục rò) là
phép chiếu đặt cùng file. Nhiễu canary dùng tổng Irwin–Hall 12 lần rút thay vì Box–Muller, vì
`Math.log`/`Math.cos` được phép lệch giữa các engine JavaScript và chấm lại OJ chạy trên Node.

Một level CD khai khối `cd` tuỳ chọn: kịch bản (sự thật của level), `editable` (núm nào mở),
và ba bộ chính sách `initial` / `solution` / `altSolution` đi cặp với ba workflow sẵn có.
`mergeCdPolicies` lấy núm không mở từ `initial`, bất kể bảng điều khiển gửi gì.

### 2.4 Tầng YAML

`readWorkflowYaml` / `writeWorkflowYaml` là tầng duy nhất biết GitHub Actions. Quyết định kiến
trúc 2026-09-16: **YAML là khung soạn, không phải bản tuần tự hoá.** Chín trường của hợp đồng
không có khoá YAML nào chở được (`retries`, `runnerSlots`, `approval`, `durationTicks`,
`durationSpreadTicks`, `flake`, `cache`, `requires`, `produces`). Bộ đọc áp mặc định trung tính,
bộ ghi trả kèm danh sách `dropped`. `yaml-kind.ts` suy loại stage từ nội dung job.

### 2.5 Tầng ghép `hydrate.ts`

Đọc YAML trần rồi chấm cho ra số vô nghĩa (lời giải C01 đọc lại cho lead time 0). `hydrateWorkflow`
ghép theo luật một dòng: phần **có** trong `CicdLevel.editable` lấy của người chơi, phần **không
có** lấy của workflow gốc. `retries` và `cache` không đi qua YAML mà qua núm bảng điều khiển
(`controls.ts`), vào tầng ghép dưới dạng `overrides`.

### 2.6 Khuôn job `job-shapes.ts`

Vì thời lượng, flake và sản phẩm tra theo id bước, đổi tên hoặc xoá bước từng thắng phần lớn level
mà không qua ô test nào. `checkJobShapes` đòi `(id job, dãy id bước)` và **tập id job** trùng
đúng một cấu hình ở một workflow đã biết (khởi đầu, lời giải, lời giải thay thế). Lệch thì báo lỗi,
không chấm. Phần tự do còn lại đúng là phần `editable` mở.

### 2.7 Bộ chấm OJ `problem-plugin.ts`

Spec của bài OJ là **bộ ba** `(workflow, workload, evaluation)`, vì bài không có level nào đứng
sau để cấp workload. Workflow đọc được mà chạy không được (chu trình) là `WA`, không phải `CE`.
Không khai `seedSpec`: `baseSeed` là hạt giống mô phỏng, không sinh đề khác nhau. Vị từ đọc bản
ghi của ba bộ mô phỏng CD (`CD_SIMULATION_PREDICATES`) bị loại khỏi tập khai được, vì bộ ba không
chở kịch bản; hai vị từ CD đọc bản ghi đường ống (`promotedArtifactUnchanged`,
`environmentGuardedByApproval`) vẫn khai được.

## 3. Hai chương, 28 level

`levels/index.ts` gộp bốn nửa: `CI_LEVELS = ci-som + ci-muon`, `CD_LEVELS = cd-som + cd-muon`,
`CICD_LEVELS = CI + CD`. Thứ tự mảng là thứ tự chơi. Giao diện đọc `CICD_LEVELS`.

| # | Id | Chủ đề | Bộ mô phỏng CD | Bài lý thuyết |
|---|---|---|---|---|
| C01 | `cicd-c01-mot-job-mot-step` | stage và bước | | `01-duong-ong-la-do-thi` |
| C02 | `cicd-c02-canh-phu-thuoc` | cạnh thiếu là đỏ thật | | `01-duong-ong-la-do-thi` |
| C03 | `cicd-c03-song-song-tren-may` | máy hữu hạn, sàn cứng | | `02-song-song-can-may-chay` |
| C04 | `cicd-c04-duong-gang` | đường găng | | `03-duong-gang` |
| C05 | `cicd-c05-viec-khong-chan` | blocking ở stage và bước | | `04-viec-khong-chan` |
| C06 | `cicd-c06-cache-la-buffer` | cache đặt đúng chỗ | | `05-cache-dat-dung-cho` |
| C07 | `cicd-c07-khoa-cache-qua-rong` | khoá cache quá rộng | | `06-khoa-cache-rong-va-hep` |
| C08 | `cicd-c08-khoa-cache-qua-hep` | khoá cache quá hẹp | | `06-khoa-cache-rong-va-hep` |
| C09 | `cicd-c09-mot-luot-xanh-khong-chung-minh-gi` | cỡ mẫu, flaky | | `07-flaky-mot-luot-xanh` |
| C10 | `cicd-c10-retry-khong-cuu-duoc-do-that` | retry trên lỗi cấu trúc | | `08-retry-va-loi-that` |
| C11 | `cicd-c11-chay-lai-che-mat-loi-that` | retry che latent-defect | | `08-retry-va-loi-that` |
| C12 | `cicd-c12-ma-tran-quat-ra` | fan-out | | `09-ma-tran` |
| C13 | `cicd-c13-gom-ket-qua-nhieu-nhanh` | fan-in | | `10-gom-ket-qua-nhieu-nhanh` |
| C14 | `cicd-c14-toi-uu-ba-truc` | ba trục cùng lúc | | `11-ba-truc-diem` |
| C15 | `cicd-c15-artifact-co-danh-tinh` | danh tính artifact | | `12-artifact-co-danh-tinh` |
| C16 | `cicd-c16-thang-hang-dung-dung-lai` | thăng hạng thay vì dựng lại | | `13-thang-hang-dung-dung-lai` |
| C17 | `cicd-c17-cong-duyet-prod` | cổng duyệt | | `14-cong-duyet-moi-truong` |
| C18 | `cicd-c18-rolling-tung-dot` | rolling | phát hành | `15-rolling-va-blue-green` |
| C19 | `cicd-c19-blue-green-doi-bo-chon` | blue-green | phát hành | `15-rolling-va-blue-green` |
| C20 | `cicd-c20-canary-gioi-han-luu-luong` | canary, đỉnh tài nguyên | phát hành | `16-canary-va-co-mau` |
| C21 | `cicd-c21-doc-tin-hieu-canary` | canary, cỡ mẫu | phát hành | `16-canary-va-co-mau` |
| C22 | `cicd-c22-migration-khong-lui` | migration không lùi | phát hành | `17-migration-khong-lui` |
| C23 | `cicd-c23-git-la-nguon-that` | đồng bộ Git | GitOps | `18-gitops-va-drift` |
| C24 | `cicd-c24-drift-giua-hai-nhip` | drift giữa hai nhịp | GitOps | `18-gitops-va-drift` |
| C25 | `cicd-c25-tu-sua-va-quyen-so-huu` | tự sửa, loại trừ trường | GitOps | `19-tu-sua-va-quyen-so-huu` |
| C26 | `cicd-c26-che-chuoi-da-dang-ky` | che bí mật | che log | `20-che-bi-mat-trong-log` |
| C27 | `cicd-c27-hotfix-hai-gio-sang` | hotfix giữ bảo đảm | phát hành | `21-hotfix-va-ca-truc` |
| C28 | `cicd-c28-ca-truc-tong-hop` | ca trực tổng hợp | cả ba | `21-hotfix-va-ca-truc` |

Mỗi level thuộc đúng một bài lý thuyết; `validateTheoryDocs` (`git/theory.ts`) kiểm ánh xạ hai
chiều và kiểm `readMinutes` theo số từ văn xuôi (200 từ/phút, sai số 1 phút). Nối `theoryId`
trên từng level và bộ nạp bài thuộc phần việc của lead.

## 4. Ba trục điểm, và vì sao không gộp

| Trục | Phép chiếu trên `EvaluationRecord` | Lấy gì qua các mẫu |
|---|---|---|
| ① Lead time | `(finishedTick − arrivalTick) × 10` giây, mỗi commit mỗi lượt | trung vị |
| ② Thông lượng | `runs × 3600 / (pass.finishedTick × 10)`, mỗi lượt | trung vị |
| ③ Runner-phút | `Σ runnerTicks × 10 / 60`, mỗi lượt | **trung bình** |

`greenRate` không phải trục thứ tư mà là ngưỡng đạt/trượt: gộp nó vào mời người chơi đổi độ tin
cậy lấy tốc độ.

Ba trục là **ba phép tính trên cùng một bản ghi**, không phải ba trường được lưu. `contract.ts` §6
nêu ba nhân chứng, mỗi nhân chứng cố định hai trục và đổi trục thứ ba: cùng lead khác thông lượng
(commit chồng nhau trên dàn máy rộng hơn), cùng lead và thông lượng khác runner-phút (thêm một
stage ngoài đường găng), cùng runner-phút khác lead (nối tiếp so với song song). Level dạy thông
lượng cần ít nhất 3 commit, nếu không ② chỉ là `3600 / ①`.

Trung vị cho ① và ② vì phân bố có hai đỉnh (lượt trơn tru, lượt phải thử lại) và trung bình mô
tả một lượt chưa từng xảy ra. Trung bình cho ③ vì đó là tài nguyên cộng dồn. Phân vị lấy theo hạng
gần nhất, không nội suy. Bản ghi lỗi (`error !== null`) cho `null`, không cho ba số 0.

`RunResult.score` (0..1000) tồn tại cho hạ tầng tiến độ và là thứ phái sinh hạng hai; giao diện
không được hiện nó thay cho ba trục. Ngưỡng (`CicdThresholds`) là dữ liệu từng level, đo từ lượt
chạy thật, không phải hằng toàn cục.

## 5. Thêm một level

1. Tạo `levels/cNN-slug.ts`, id `cicd-cNN-slug`. **Số là định danh, không phải vị trí**: đánh số
   lại làm mồ côi tiến độ đã lưu trong `localStorage`.
2. Thêm vào mảng của nửa chương tương ứng. `index.ts` và ô ghim số lượng trong
   `levels/index.test.ts` là việc của lead.
3. Khai đủ `solutionWorkflow` và `altSolutionWorkflow` **khác nhau thật** (khác đồ thị hoặc khác
   chính sách, không chỉ đổi thứ tự hai stage độc lập). Level CD khai thêm `cd.solution` và
   `cd.altSolution`, với mọi trường ngoài `cd.editable` bằng đúng `cd.initial`.
4. Đo ba trục của cả ba workflow trên engine thật rồi mới đặt ngưỡng. Ghi bảng đo vào chú thích.
5. Viết cheatsheet chỉ bằng thứ đi qua được cặp ghi/đọc YAML, và núm bảng điều khiển mà level thật
   sự mở.
6. Thêm id level vào `usedByLevels` của đúng một bài lý thuyết.

Các ô test sẽ ghim (tên ô ở `ci-som.test.ts`, `ci-muon.test.ts`, `cd-levels.test.ts`,
`cheatsheet.test.ts`, `hydrate.test.ts`):

- id đúng mẫu, số tăng dần, thuộc đúng chương; level CI không mang khối `cd`.
- workflow ban đầu **trượt** ít nhất một mục tiêu bắt buộc.
- cả hai lời giải đạt **mọi** mục tiêu bắt buộc, kể cả sau vòng YAML + tầng ghép.
- hai lời giải khác nhau thật; ở chương CD mục thưởng chia đôi hai lời giải.
- cả hai lời giải nằm trong ngân sách ba trục và đường găng không đứt.
- khối `cd`: kịch bản có mặt ⇔ chính sách có mặt; mọi núm trỏ vào khối có kịch bản; hai lời giải đi
  tới được bằng bảng điều khiển; dữ liệu level không làm bộ mô phỏng nào ném, và chạy tất định.
- mỗi mục cheatsheet dùng được ở đúng chỗ nó chỉ tới, với đối chứng đỏ cho từng dạng hỏng.
- `editable` đủ để đi tới mọi lời giải (hộ tiêu dùng đầu tiên của trường này là `hydrate.ts`).

Chữ trong level và bài lý thuyết qua cổng chống-thương-mại (`scripts/check-no-commerce.mjs`).

## 6. Quan hệ với `pipeline.md`

[`pipeline.md`](pipeline.md) là **tài liệu tham khảo, không phải đặc tả**. Mô hình stage, cache và
đường găng của nó vẫn tốt và được giữ ý; tầng trình bày 2D thì bỏ. Những chỗ `cicd` đi khác đều ghi
lý do tại chỗ trong `contract.ts`, đáng nhớ nhất:

- cạnh là `dependsOn`, không phải `needs` (lõi trung lập);
- cache có **hai** danh sách `keyParts` và `invalidatedBy`, không chỉ `invalidatedBy`, vì khoảng
  cách giữa chúng là bài học C07/C08;
- có dòng nhiều commit và ba trục tách bạch thay cho một con số;
- có cả chương CD mà `pipeline.md` không có.

`GameId` vẫn giữ `pipeline` để không làm hỏng khoá `localStorage` cũ; game mới dùng id `cicd`.

## 7. Việc còn mở

- **Tầng 3D (19.D) chưa làm.** `CicdView` đã khai sẵn ranh giới engine ↔ renderer (nút, cạnh có cờ
  `critical` và `resourceEdge`, làn máy chạy, trục Y đổi theo chương), nhưng chưa có renderer nào
  đọc nó.
- **Chế độ làm bài OJ cho `cicd` chưa mở.** `CicdGameAction` loại `evaluate` chỉ chở **toàn văn
  YAML**. Giá trị bảng điều khiển (`retries`, `cache`) và chính sách CD không đi qua YAML, nên một
  nhật ký chơi không đủ để dựng lại bài làm khi phát lại phía máy chủ.
- `retries` và `cache` nằm trong `EDITABLE_PARTS` nhưng không có khoá YAML; hướng đã chọn là núm
  riêng ngoài ô soạn. Hướng ánh xạ qua `with:` của một hành động dùng lại chưa bị loại hẳn.
- Khuôn job từ chối những cách tách job sáng tạo nằm ngoài các cấu hình đã khai. Đây là đánh đổi
  đã chấp nhận để chặn lách chấm.
