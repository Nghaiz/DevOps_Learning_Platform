# Phase 19 — Game "Đường ống CI/CD"

**Mức chi tiết:** DETAILED · **Effort:** XL · **Blocked by:** P17 (17.A, 17.B, 17.J), P18 (18.A) · **Blocks:** không
**SSOT thiết kế:** [`plans/reports/2026-09-11-brainstorm-git-cicd-games.md`](../reports/2026-09-11-brainstorm-git-cicd-games.md) §4
**Chạy:** tuần tự một luồng (`/t1k:cook`).
**Plane:** bỏ qua theo `rules/no-outbound-from-this-project.md`.

> `GameId: 'cicd'`. **Không** dùng lại `GameId: 'pipeline'` — quyết định #2 là thiết kế lại từ
> đầu và rộng hơn CI thuần. `'pipeline'` giữ trống trong union để bản lưu cũ không vỡ và để sau
> này còn chỗ cho một game CI thuần dạng giải đố nếu muốn.
>
> `docs/games/pipeline.md` là **tài liệu tham khảo**, không phải đặc tả. Mô hình `StageSpec`,
> `CacheSpec`, khái niệm đường găng của nó vẫn tốt và nên đọc; tầng trình bày 2D của nó thì không.

---

## 0. Hiện trạng đo được (scout 2026-09-11)

| Giả định | Thực tế đo được |
|---|---|
| Đã có thiết kế CI/CD trong repo | **Có.** `docs/games/pipeline.md` — DAG stage, runner có hạn, flaky, cache key, đường găng. Viết cho 2D, chưa code dòng nào. |
| Có prior art game 3D dạy CI/CD | **Không tìm thấy**, trong phạm vi 14 truy vấn WebSearch tiếng Anh. Chưa quét itch.io, Steam, GDC vault, kỷ yếu SIGCSE/ITiCSE/CSEE&T. **Đừng viết "chưa từng có" vào báo cáo NCKH trước khi tìm ở đó.** |
| Đã có ~50 simulator 2D dạy DevOps | **Có** (devops-daily.com/games), gồm Deployment Strategies Simulator và GitOps Workflow Simulator. Đóng góp của game này phải là **hệ thống**, không phải từng khái niệm rời. |
| `checkout` là tên an toàn cho bước đầu pipeline | **Có, nhưng KHÔNG vì lý do đã ghi.** Dòng cũ ở đây viết `packages/games/src` không nằm trong `ROOTS` của `scripts/check-no-commerce.mjs`. **Tiền đề đó SAI** và chính file đó đã nói ra (chú thích ngay trên `KEYWORD_EXEMPTIONS`): `packages/games/src` được thêm vào `ROOTS` ngày **2026-09-08**, commit `5c3815c`, tức là TRƯỚC lượt scout của P17 — scout đọc một trạng thái đã cũ, rồi P19 chép lại. Cơ chế thật đang chạy: (1) `MASKS` che `actions/checkout` và `git checkout` ở **mọi** vùng, nên YAML Actions viết đúng tên thì an toàn; (2) `KEYWORD_EXEMPTIONS` miễn trừ hẹp theo *đường dẫn + luật + đúng một từ*, hiện chỉ phủ `packages/games/src/git/` và `content/games/git/theory/` — **chưa dòng nào phủ `cicd/`**. Sửa lại 2026-09-16. |

---

## 0b. Tiến độ (cập nhật 2026-09-16)

| Chuỗi | Trạng thái | Bằng chứng |
|---|---|---|
| 19.A engine CI | **XONG** | PR #139, gộp vào `main` ở `1ef856a` |
| 19.B engine CD | chưa bắt đầu | — |
| 19.C.1/C.2/C.3 cầu nối YAML | **XONG** | PR #139 (`0c41efd`, `f457fe8`) |
| 19.C.5/C.6 khoá tên stage + cổng lõi-trung-lập | **XONG** | PR #139 (`cbc7bac`), `scripts/check-cicd-vendor-neutral.mjs` |
| 19.C.4 lỗi ngữ nghĩa | **XONG** | đợt 2 — xem hộp cảnh báo ở §19.C |
| 19.D tầng 3D | chưa bắt đầu | — |
| 19.E giao diện soạn YAML | **XONG (E.1–E.5)** | đợt 2 — kèm tầng ghép `cicd/hydrate.ts`, thứ plan không dự liệu |
| 19.F chương CI, 14 level | **XONG** | PR #139 (`e0f4ed9`, `824ee8b`, `2d8fce5`) |
| 19.G chương CD | chưa bắt đầu | — |
| 19.H sandbox + tích hợp | **XONG phần web** | route, ô danh mục, sandbox, plugin OJ. Còn thiếu ô Playwright đo AC-H |
| 19.I lý thuyết + tài liệu | chưa bắt đầu | `content/games/cicd/` và `docs/games/cicd.md` chưa tồn tại |

**Đợt 2 đóng xong 19.C.4 + 19.E + 19.H.** 14 level của 19.F nay chơi được ở `/games/cicd`, và
bài OJ cho `gameId: 'cicd'` soạn được qua `/author/problems`.

### Việc để lại của đợt 2 — đọc trước khi mở đợt 3

| # | Việc | Vì sao chưa làm |
|---|---|---|
| ~~1~~ | ~~Ô Playwright cho AC-H và AC-6~~ | **XONG** — `apps/web/e2e/games-cicd.spec.ts`, 5 ô, đã vào `e2e:ci` |
| ~~2~~ | ~~Chưa chạy trong trình duyệt thật~~ | **XONG** — 5/5 xanh trên Chromium thật, hai lượt độc lập |
| 3 | Rà cheatsheet của cả 14 level | Xem §19.E.bis mục 2 — mới biết c01 sai, chưa quét 13 level còn lại |
| 4 | Ô cache dùng `invalidatedBy` = `keyParts` | Cách hiểu của người dựng màn, engine giữ hai trường RIÊNG. C07/C08 dạy đúng chỗ khác nhau giữa chúng nên có thể cần tách |
| 5 | Ô retries chỉ liệt kê stage của `initialWorkflow` | Job người chơi tự thêm trong YAML không có ô chỉnh retries |
| 6 | Mẩu chèn nhanh nối vào CUỐI văn bản, không vào vị trí con trỏ | `YamlEditor` chưa mở ref ra ngoài |
| 7 | Chú thích trong 4 file của màn chơi mất dấu tiếng Việt | Do một lượt vá bằng script. Chỉ ảnh hưởng khả năng đọc |
| 8 | Đường ống RỖNG vẫn hiện ba con số 0 thay vì một câu | Phát hiện lúc viết ô e2e: mở c01 (khởi đầu không stage nào) rồi bấm "Chạy thử" ngay cho `0 giây / 0 runner-phút`, đọc ra thành "cực nhanh, chẳng tốn gì". Cùng hình dạng mà chính `cicd-result-panel.tsx` đã cấm cho nhánh `engine-error`. Chưa sửa vì nó là câu hỏi thiết kế, không phải lỗi mã |

### Đợt 3 — phạm vi và phát hiện lúc scout (2026-09-16)

**Phạm vi chốt (chủ dự án):** dọn nợ đợt 2 (#3–#8) rồi dựng 19.B. #8 chốt: đường ống rỗng hiện
một câu thay cho ba con số.

Scout đo ra việc để lại **lớn hơn bảng trên nói**, ở bốn chỗ:

| # | Phát hiện | Đo bằng |
|---|---|---|
| S1 | `teaching.cheatsheet` **không được màn nào render**. Sửa nội dung một mình không đổi gì người chơi thấy | grep `apps/web`: chỉ một chú thích nhắc tới nó |
| S2 | Ô "lời giải đi qua ô soạn và vẫn thắng" (`cicd-run.test.ts`) nạp `CacheSpec` ĐẦY ĐỦ của lời giải — thứ bảng điều khiển không bao giờ phát ra được. Xanh mà không đo đường người chơi đi | probe: C06 (cả hai lời giải), C09 alt, C14 alt KHÔNG dựng được bằng bảng điều khiển |
| S3 | Bảng điều khiển đặt `invalidatedBy = keyParts` — đúng thứ hợp đồng cấm tên ("C08 không bao giờ kích hoạt được"); `hydrate` còn nhận nguyên `invalidatedBy`/`savesTicks` từ client | đọc `cicd-overrides-panel.tsx:156,196`, `hydrate.ts:160` |
| S4 | **Bộ chấm OJ chấm workflow CHƯA GHÉP**: nộp YAML lời giải c01 ⇒ `leadTimeUnder 1 giây` ra **AC**; cùng workflow không qua YAML ⇒ WA | probe `gradeCicdProblem`, có đối chứng âm. Tiềm ẩn vì chế độ làm bài CI/CD chưa mở |

Thêm: C06 khai hai sự thật khác nhau cho CÙNG một bước (`tai-goi` tiết kiệm 8 ở lời giải A, 5 ở
lời giải B); một stage người chơi tự thêm mà trùng id stage của lời giải thì tự nhận cache của
lời giải; #7 là 3 file chứ không phải 4.

**Mô hình cache chốt cho đợt này** (theo đúng hợp đồng, không đổi hợp đồng): mỗi bước có
**một** khuôn cache là sự thật của level (`id`, `invalidatedBy`, `savesTicks`), lấy từ bất kỳ
workflow nào của level và ba bản phải khớp nhau; **bật hay tắt mặc định** chỉ theo bước ở bản
chuẩn; người chơi chỉ sửa bật/tắt và `keyParts`.

⛔ Còn MỞ, không làm đợt này: `CicdGameAction.evaluate` chỉ chở YAML, nên retries/cache của bảng
điều khiển không vào được nhật ký phát lại. Ngày mở chế độ làm bài CI/CD phải quyết điểm này
trước, nếu không bài OJ về cache/retries không giải được.

### Cách chạy lượt e2e của màn này

Cần Postgres (auth), nên dựng nó trước:

```
docker compose up -d postgres redis
pnpm --filter @devops-platform/web db:migrate
pnpm --filter @devops-platform/web build
cd apps/web && E2E_START_SERVER=1 \
  E2E_BASE_URL=http://localhost:3000 E2E_ORIGIN=http://localhost:3000 \
  npx playwright test games-cicd.spec.ts
```

⚠ `E2E_ORIGIN` phải là **`localhost`**, không phải `127.0.0.1`: app khai
`BETTER_AUTH_URL=http://localhost:3000` và Better Auth so CHUỖI, nên
`127.0.0.1` trả 403 `INVALID_ORIGIN` ngay ở `globalSetup`. Thiếu
`E2E_START_SERVER=1` thì Playwright trỏ vào CỤM, tức đo một binary khác.

---

## 1. Quyết định chi phối

- **#2** Thiết kế lại từ đầu, rộng hơn CI thuần: có CD, môi trường, rollback, GitOps.
- **#6** Phải có dạng bài dùng được cho **thực hành và thi cử** — nghĩa là mọi level phải chấm
  được bằng testcase tất định, không có level "cảm nhận".
- **#10** GitHub Actions làm chính; **lõi trung lập**, chỉ tầng đọc/ghi YAML biết GitHub.
- **#13** Trục Y **đổi theo chương**: chương CI = thời gian chờ, chương CD = môi trường.
- **#15** Camera orthographic, snap 4–8 góc.

---

## 2. Chuỗi công việc

### 19.A — Engine CI/CD, phần CI (L, ~1 tuần)

| # | Việc | Ước |
|---|---|---|
| A.1 | `cicd/contract.ts` — `StageSpec`, `CacheSpec`, `RunnerPool`, `WorkflowSpec`. Mô hình **trung lập**, không mang tên GitHub. | 4h |
| A.2 | Bộ lập lịch: DAG + runner có hạn + hàng đợi. Tick tất định. | 4h |
| A.3 | Kiểm chu trình DAG, báo lỗi trỏ về **đúng job** | 3h |
| A.4 | Cache: khoá, trúng/trượt, `invalidatedBy` | 4h |
| A.5 | Flaky: `flakeRate` rút từ PRNG có seed. Một lượt xanh không chứng minh gì. | 3h |
| A.6 | Retry: chỉ cứu được đỏ giả. Retry lỗi thật là đốt runner-phút. | 3h |
| A.7 | **Đường găng**: tính sau mỗi lượt chạy, đánh dấu `critical` trên cạnh | 4h |
| A.8 | Chạy N lượt có seed, tổng hợp phân bố | 3h |
| A.9 | Ba trục điểm: **lead time một commit** · **thông lượng** · **runner-phút**. Ba con số tách bạch, không gộp thành một "điểm". | 4h |

⚠ **Cảnh báo mô hình, ghi vào comment đầu module:** DAG của CI/CD **không có vòng lặp** và
**không có trạng thái ổn định** — mỗi commit là một lô chạy một lần. Bê nguyên mô hình
steady-state kiểu Factorio vào đây là **dạy sai**. Đó là lý do mô hình chấm mượn Opus Magnum
(có khái niệm "chạy một lô" rõ ràng), không mượn Factorio.

**AC-A:** cùng `(WorkflowSpec, seed)` ⇒ cùng kết quả qua 1000 lượt · đường găng tính đúng trên
ít nhất 5 đồ thị mẫu có đáp án tính tay · ba trục điểm là ba số độc lập, có test chứng minh
chúng không suy ra được từ nhau.

### 19.B — Engine CI/CD, phần CD (M, ~4 ngày)

| # | Việc | Ước |
|---|---|---|
| B.1 | `Artifact` có danh tính (băm từ nội dung build), `Environment` (dev/staging/prod) | 4h |
| B.2 | Promote vs rebuild: rebuild sinh artifact **khác danh tính** ⇒ staging mất nghĩa | 3h |
| B.3 | Approval gate + reviewer bắt buộc | 3h |
| B.4 | Ba chiến lược: rolling · blue-green · canary. Mỗi cái có thời gian lùi **khác nhau** và chi phí tài nguyên **khác nhau**. | 4h |
| B.5 | Mét-ric canary: tỷ lệ lỗi có nhiễu. Người chơi phải phân biệt tín hiệu với nhiễu. | 4h |
| B.6 | Rollback vs roll-forward; migration DB không lùi được | 3h |
| B.7 | GitOps: reconcile loop **chạy theo chu kỳ**, nên drift sống được một lúc | 4h |
| B.8 | Self-heal bật/tắt + exclusion list | 3h |
| B.9 | Secret masking + chỗ nó rò ra | 3h |

> **Chốt 2026-09-17 (chủ dự án), trước khi viết dòng nào.** Hợp đồng:
> `packages/games/src/cicd/cd-contract.ts`.
> 1. Đường ống + ba bộ mô phỏng thuần: B.1–B.3 vào `engine.ts` (ai cấp sản phẩm cho ai, cổng
>    phê duyệt); B.4–B.6 `release.ts`; B.7–B.8 `gitops.ts`; B.9 `masking.ts`.
> 2. Chương CD đếm bằng **giây nguyên** — tick 10 giây không viết được "blue-green lùi dưới 5 giây".
> 3. Rebuild **luôn** ra danh tính khác: băm(commit, sản phẩm, stage đã dựng).
> 4. Nhiễu canary **theo số request** (xấp xỉ nhị thức) — weight nhỏ thì nhiễu lớn, bài C21 là cỡ mẫu.

**AC-B:** rebuild rồi promote ⇒ engine báo artifact khác danh tính · ba chiến lược cho ba thời
gian lùi khác nhau, có test khẳng định thứ tự (blue-green < canary < rolling) · drift tồn tại
đúng số tick giữa hai lần reconcile, có test.

### 19.C — Bộ đọc/ghi YAML GitHub Actions (M, ~4 ngày)

| # | Việc | Ước |
|---|---|---|
| C.1 | Phân tích YAML → `WorkflowSpec`. `jobs`/`steps`/`needs`/`strategy.matrix`/`uses`/`continue-on-error`/`environment` | 4h |
| C.2 | Ghi ngược `WorkflowSpec` → YAML (cần cho Level Builder và cho nút "gợi ý sửa") | 4h |
| C.3 | Lỗi cú pháp trỏ về **đúng dòng, đúng cột** | 4h |
| C.4 | Lỗi ngữ nghĩa trỏ về đúng dòng: `needs` trỏ job không tồn tại, DAG có chu trình, matrix rỗng, **và hai job trùng tên** | 5h |
| C.5 | Bước đầu giữ tên `checkout` đúng như GitHub Actions gọi — xem §0 (đã sửa 2026-09-16). Ba việc, theo đúng cơ chế THẬT: (a) engine + level viết đủ `actions/checkout`, vì `MASKS` đã che chuỗi đó — không dựa vào may rủi; (b) **chỉ khi** có một tên stage trần là `checkout` thật sự cần, mới thêm MỘT dòng `KEYWORD_EXEMPTIONS` cho `packages/games/src/cicd/` (và `content/games/cicd/theory/` nếu bài học cần), hẹp theo đúng một từ trên đúng một luật; (c) test khoá khẳng định **miễn trừ còn hiệu lực**, kèm đối chứng dương. ⛔ KHÔNG viết test khẳng định `packages/games/src` vắng mặt trong `ROOTS` — nó đang có mặt, test đó đỏ ngay ngày đầu, và gỡ nó khỏi `ROOTS` sẽ mở toang lại vùng mã mà `5c3815c` vừa đóng, mở toang trong im lặng. | 2h |
| C.6 | Ranh giới: **chỉ tầng này biết GitHub Actions.** Có test khẳng định `cicd/contract.ts` và `cicd/engine.ts` không chứa chuỗi `uses:`, `actions/`, `runs-on`. | 2h |

**AC-C:** một workflow YAML thật (lấy từ chính `.github/workflows/` của repo, rút gọn) đọc được
· C.6 xanh, có đối chứng dương · **C.4 từ chối được một YAML có hai job trùng tên**.

> ⚠ **Vì sao "hai job trùng tên" là việc của 19.C chứ không của engine** (phát hiện lúc làm
> 19.A.3, 2026-09-16). `WorkflowSpec.stages` là một mảng, nên hai mục cùng `id` là hình dạng
> hợp lệ về kiểu, và YAML thì làm ra nó dễ dàng. Engine không có đường xử lý đúng: chọn một
> mục là bịa ngữ nghĩa, bỏ một mục là bỏ sót cạnh và có thể bỏ sót luôn một chu trình. Hiện
> `graph.ts` lấy **hợp các cạnh** của mọi mục trùng id và ghim hành vi đó bằng test — đó là
> lựa chọn an toàn nhất trong các lựa chọn sai, không phải lời giải. Lời giải là chặn ở biên,
> nơi YAML thành `WorkflowSpec`, trước khi engine nhìn thấy nó.
>
> **ĐÃ ĐO LẠI 2026-09-16, và đoạn trên SAI ở một vế.** "YAML thì làm ra nó dễ dàng" — không.
> Bộ quét dựng map bằng `map[khoá] = giá trị`, nên hai job trùng tên **gộp thành một** trước
> khi `yaml-read.ts` nhìn thấy: mục thứ hai đè mục thứ nhất, job khai trước biến mất sạch,
> không lỗi, không cảnh báo, và mọi `needs` trỏ vào phần đã mất bỗng thành "phụ thuộc trỏ vào
> hư không" ở một chỗ khác hẳn nơi gây ra. Đây là **mất dữ liệu im lặng ở bộ quét**, không
> phải hai mục cùng id ở engine. Nên phép chặn nằm ở `core/yaml.ts` (khoá trùng = lỗi cứng,
> áp cho cả game k8s), chứ không ở `yaml-read.ts` như câu cuối đoạn trên đoán.
>
> Hợp-các-cạnh trong `graph.ts` **ở lại**: đường YAML đã đóng, nhưng `WorkflowSpec` còn viết
> TAY được (level là mã nguồn) và ở đó kiểu vẫn cho phép hai mục cùng id.
>
> Đây là lần thứ hai trong cùng một phase mà một dòng "hiện trạng đo được" của plan được chép
> lại mà không kiểm nguồn — xem §4, hàng rủi ro cùng tên. Lần này nguồn là chính bộ quét, và
> một lượt `parseYaml` mười dòng đã đủ bác bỏ.

### 19.D — Tầng 3D (L, ~1 tuần)

| # | Việc | Ước |
|---|---|---|
| D.1 | Camera orthographic snap góc, dùng lại khung của 17.K.1 | 2h |
| D.2 | Bố cục Sugiyama phân tầng trên XZ, dùng lại 17.B.1 | 3h |
| D.3 | **Trục Y đổi theo chương**: CI = thời gian chờ (job xếp hàng đẩy lên cao, nghẽn thành cột); CD = môi trường (dev→staging→prod xếp chồng) | 4h |
| D.4 | Chuyển tiếp giữa hai cách đọc không gian khi đổi chương — **đây là rủi ro thật của quyết định #13**, người chơi phải học lại cách đọc. Cần một màn chuyển tiếp giải thích. | 4h |
| D.5 | Định tuyến cạnh orthogonal theo làn. **Không** edge bundling. | 4h |
| D.6 | **Chuyển động mang dữ liệu** (mượn Netflix Vizceral): chấm chạy dọc cạnh, mật độ = lưu lượng. Artifact chảy qua pipeline. | 4h |
| D.7 | Ba cấp drill-in: workflow → job → step | 4h |
| D.8 | Promotion là chuyển động **đi lên**; rebuild là **rơi xuống rồi leo lại** | 3h |
| D.9 | Node bằng `InstancedMesh`, badge qua atlas, < 100 draw call | 4h |
| D.10 | Bảng màu riêng game này + mã hoá ba kênh + kiểm tương phản hai theme (hạng mục có tên, song song với 17.C.4–C.5) | 4h |

**AC-D:** draw call < 100 ở level đông nhất, có số đo · đổi chương ⇒ có màn giải thích cách đọc
trục Y mới · axe 0 vi phạm.

### 19.E — Giao diện soạn YAML (M, ~3 ngày)

| # | Việc | Ước |
|---|---|---|
| E.1 | Ô soạn thảo có tô cú pháp YAML | 4h |
| E.2 | Báo lỗi ngay trong ô soạn, trỏ đúng dòng | 3h |
| E.3 | Chèn mẫu nhanh: `+ job`, `+ step`, `+ needs` | 3h |
| E.4 | Bảng ba trục điểm hiển thị **thường trực**, không giấu sau nút | 3h |
| E.5 | Bảng so lời giải: giữ lịch sử các lần thử của chính người chơi trên cùng level | 4h |

**AC-E:** soạn YAML bằng bàn phím hoàn toàn, không cần chuột · ba số hiển thị cùng lúc.

> ⛔ **19.E KHÔNG CHẠY ĐƯỢC NHƯ VIẾT Ở TRÊN — đo 2026-09-16.** Vòng "soạn YAML ⇒ chấm ba trục"
> cho `leadTimeSeconds: 0` và `runnerMinutes: 0` trên MỌI level, vì `readWorkflowYaml` áp mặc
> định trung tính cho chín trường mà YAML không chở được. Chấm bản đọc-lại của chính
> `solutionWorkflow` c01 ra `0 / 0` thay vì `120 / 6`.
>
> Đây không phải lỗi của bộ đọc: `contract.ts` đã chốt "YAML là KHUNG SOẠN, không phải bản
> tuần tự hoá", và `CicdLevel.editable` là lời khai về thứ người chơi được sửa. Thiếu là một
> **tầng ghép**, nay có ở `cicd/hydrate.ts`: bản chuẩn của level cấp thời lượng, người chơi cấp
> phần `editable` cho phép, và `retries`/`cache` vào qua ô điều khiển riêng vì YAML không có
> khoá nào chở chúng. Chốt 2026-09-16 (chủ dự án) theo đường "ô điều khiển riêng", là một trong
> hai đường hợp đồng đã nêu.
>
> **Hai hệ quả cho 19.E:**
> - E.3 snippet phải dùng từ vựng của BỘ ĐỌC (`jobs:`, `needs:`, `runs-on:`), không phải của
>   hợp đồng.
> - Màn chơi cần một ô phụ cho `cache`/`retries`, hiện theo `level.editable`. Bảy level
>   (C06–C11, C14) không giải được nếu thiếu nó.

### 19.E.bis — hai lỗi 19.F lộ ra khi dựng 19.E

Cả hai đều là **nợ của chương CI đã phát hành**, không phải việc mới.

1. **`cicd-c07` khai thiếu `edges`** — ĐÃ SỬA. `altSolutionWorkflow` của nó tách một stage rồi
   trỏ lại hai cạnh, mà `editable` chỉ có `['cache','stages']`, nên lời giải thay thế KHÔNG đi
   tới được và AC-F ở level đó là lời khai chứ không phải phép đo. Nằm im được vì `editable`
   **chưa bao giờ được mã nào đọc** — chỗ duy nhất nhắc tới nó là một chú thích trong
   `contract.ts`. `hydrate.ts` là hộ tiêu dùng đầu tiên và ô AC của nó đỏ ngay.
   → Luật rút ra: **cho thêm/bớt stage thì phải cho nối lại stage.**
2. **Cheatsheet dạy cú pháp bộ đọc TỪ CHỐI** — CHƯA SỬA. `teaching.cheatsheet` của c01 (và có
   thể nhiều level khác) dùng từ vựng hợp đồng — `stages:`, `dependsOn:`, `runnerClass:` —
   trong khi `readWorkflowYaml` nhận từ vựng nhà cung cấp — `jobs:`, `needs:`, `runs-on:`.
   Người chơi chép nguyên cheatsheet vào ô soạn sẽ nhận lỗi cú pháp. Chưa rà hết 14 level.
   → Việc để lại: rà cheatsheet của cả 14 level, và thêm một ô test khẳng định mọi `snippet`
   trong `teaching.cheatsheet` đọc được bằng chính `readWorkflowYaml` — nếu không thì lần lệch
   sau cũng sẽ im lặng y như lần này.

### 19.F — Chương CI, level C01–C14 (L, ~1.5 tuần)

Bản đồ chủ đề ở design §4.3. 14 level × ~3h.

Bốn level cần chú ý riêng:

- **C04 đường găng** — level đầu tiên dạy được thứ 2D khó thể hiện. Đường găng tô sáng sau mỗi lượt.
- **C07/C08 khoá cache** — quá rộng thì không bao giờ trúng; quá hẹp thì lấy nhầm. Hai level, hai hướng sai.
- **C09 flaky** — phải chạy **20 lượt** mới thấy. Level này dạy rằng một lượt xanh không chứng minh gì.
- **C11 rerun che bug thật** — bỏ qua flaky failure ⇒ build đã deploy gặp nhiều crash hơn.

**AC-F:** mỗi level ≥ 2 lời giải cùng qua · `solutionCommand` (ở đây là một `WorkflowSpec` mẫu)
của cả 14 level chạy được và cho AC.

### 19.G — Chương CD, level C15–C28 (L, ~1.5 tuần)

14 level × ~3h. Bốn level cần chú ý:

- **C16 promote đừng rebuild** — level trung tâm của cả chương, và là anti-pattern đắt nhất.
- **C21 đọc mét-ric canary** — dạy phân biệt tín hiệu với nhiễu. Cần PRNG có seed để nhiễu tái lập được.
- **C24 drift** — reconcile chạy theo chu kỳ nên drift sống được một lúc; người chơi phải thấy khoảng thời gian đó.
- **C27 hotfix lúc 2 giờ sáng** — bỏ qua bước nào thì trả giá gì. Level có áp lực thời gian.

**AC-G:** như AC-F, cho 14 level chương CD.

### 19.H — Sandbox + tích hợp (M, ~2 ngày)

Sandbox: workflow trống, runner tuỳ chỉnh, chạy bao nhiêu lượt tuỳ ý · `/games/cicd` · thêm ô
vào `games-catalog.ts` · bài OJ cho game này qua plugin của 18.A.

**AC-H:** Playwright network trace lúc chơi = **0 lời gọi backend** · soạn được một bài OJ cho
`gameId: 'cicd'` qua `/author/problems`.

### 19.I — Nội dung lý thuyết + tài liệu (M, ~3 ngày)

`content/games/cicd/theory/` ~20 bài · `docs/games/cicd.md` · cập nhật `docs/games/README.md`
· ghi rõ quan hệ với `pipeline.md` (tham khảo, không phải đặc tả).

**AC-I:** kiểm **file cụ thể** có trong image, không kiểm thư mục.

---

## 3. Ô nghiệm thu của cả chặng

| # | Ô | Đo bằng |
|---|---|---|
| AC-1 | Toàn cây xanh | `turbo run build lint typecheck test --force`, đọc `Tasks: X/Y` trước khi trích số |
| AC-2 | 0 lời gọi backend lúc chơi | Playwright network trace |
| AC-3 | Engine tất định | Cùng `(spec, seed)` ⇒ cùng kết quả, 1000 lượt |
| AC-4 | Lõi trung lập | Test 19.C.6 xanh, có đối chứng dương |
| AC-5 | Đường 2D dùng được | Playwright `--disable-3d-apis`, có đối chứng dương |
| AC-6 | a11y | axe 0 vi phạm, cả hai theme |
| AC-7 | Hiệu năng | draw call < 100, có số đo |
| AC-8 | 28 level qua được | Test chạy lời giải mẫu của cả 28 |
| AC-9 | Ba trục điểm độc lập | Test chứng minh không suy ra được từ nhau |
| AC-10 | Bài lý thuyết có trong image | Kiểm file cụ thể |

---

## 4. Rủi ro

| Rủi ro | L | I | Điểm | Giảm thiểu |
|---|---|---|---|---|
| Trục Y đổi giữa hai chương làm người chơi mất phương hướng | 4 | 3 | 12 | Màn chuyển tiếp D.4. **Không có phương án lùi** — chủ dự án chốt 2026-09-11 giữ đổi-theo-chương. Màn chuyển tiếp chưa đủ thì làm nó tốt hơn, không đổi mô hình |
| Lõi rò rỉ tên GitHub, thêm GitLab sau phải viết lại | 3 | 4 | 12 | Test 19.C.6 chạy trong CI, có đối chứng dương |
| Một tên stage trần (`checkout`) lọt vào `cicd/` mà chưa có dòng miễn trừ ⇒ cổng chống-thương-mại đỏ | 3 | 2 | 6 | `MASKS` đã che `actions/checkout`, nên đường mặc định là viết đủ tên. Tên trần thì thêm đúng một dòng `KEYWORD_EXEMPTIONS` cho `cicd/` (C.5b). Cổng có chiều xuống nên một dòng miễn trừ thừa cũng đỏ — không thành nghĩa địa |
| Một phép đo trong plan được chép lại mà không kiểm lại nguồn | 5 | 3 | 15 | Đã cắn **hai lần**. (1) §0 dòng 4 chép nguyên tiền đề sai từ P17 §0, trong khi `check-no-commerce.mjs` đã bác bỏ nó bằng văn bản từ 2026-09-08. (2) Hộp cảnh báo §19.C khẳng định "YAML làm ra hai mục cùng id dễ dàng"; một lượt `parseYaml` mười dòng ngày 2026-09-16 cho thấy bộ quét gộp chúng thành một, tức lỗi nằm ở tầng khác hẳn. Cả hai lần, nguồn bác bỏ đều nằm sẵn trong kho. Trước khi dùng bất kỳ dòng "hiện trạng đo được" nào, **chạy lại phép đo**, đừng chỉ mở file — số dòng đúng không có nghĩa là nội dung còn đúng, và một câu đọc xuôi tai vẫn có thể chưa ai đo |
| Mô hình steady-state kiểu Factorio lọt vào, dạy sai | 2 | 5 | 10 | Comment cảnh báo ở đầu module + review khi làm A.9 |
| Một trường của hợp đồng không được MÃ NÀO đọc, rồi trôi trong im lặng | 4 | 4 | 16 | Đã cắn: `CicdLevel.editable` sống từ 19.A tới 19.E mà chỗ duy nhất nhắc tới nó là một chú thích — và ngay lượt đầu có hộ tiêu dùng thật, nó lộ ra `c07` khai sai. Cùng họ với cheatsheet dạy cú pháp bộ đọc từ chối. **Luật:** một trường khai trong hợp đồng mà chưa có mã đọc thì phải có một ô test đọc nó, nếu không nó là tài liệu chứ không phải dữ liệu. Xem `rules/wired-not-just-present.md` |
| Chương CD nhiều khái niệm hơn thời gian cho phép | 4 | 3 | 12 | Đây là chuỗi **cắt trước tiên** trong toàn bộ ba phase — xem §6 |
| Đọc mét-ric canary trở thành đoán mò | 3 | 3 | 9 | Nhiễu phải tái lập được bằng seed; level phải có ngưỡng phân biệt được |

---

## 5. Thời lượng

| Chuỗi | Effort | Ghi chú |
|---|---|---|
| 19.A engine CI | L (1wk) | Đường găng |
| 19.B engine CD | M (4d) | |
| 19.C bộ đọc YAML | M (4d) | |
| 19.D tầng 3D | L (1wk) | Dùng lại khung 17.B, 17.K |
| 19.E giao diện soạn YAML | M (3d) | |
| 19.F chương CI | L (1.5wk) | |
| 19.G chương CD | L (1.5wk) | Cắt trước tiên **nếu** hết giờ. Chủ dự án chốt 2026-09-11: **không gấp**, giữ nguyên quy mô |
| 19.H sandbox + tích hợp | M (2d) | |
| 19.I lý thuyết + tài liệu | M (3d) | |
| **Tổng** | **~6–7 tuần** | Đường găng: A → C → F |

---

## 6. Thứ tự cắt nếu hết thời gian — cho cả ba phase

Design §8 chốt thứ tự này. Ghi lại ở đây vì P19 là chỗ nó cắn đầu tiên.

**Chốt 2026-09-11: không có deadline, giữ nguyên quy mô ba phase.** Thứ tự dưới đây là phòng xa,
không phải kế hoạch đang dùng. Đừng cắt trước khi thật sự chạm giới hạn thời gian.

1. **Cắt 19.G (chương CD)** trước hết. Game CI/CD còn chương CI vẫn là một game hoàn chỉnh chơi
   được, chỉ hẹp hơn.
2. **Rồi cắt 18.E (Level Builder).**
3. Rồi cắt số level của 17.P và 17.O — nhưng **giữ cơ chế conflict**, chỉ giảm số lượng.

**Không cắt trong bất kỳ hoàn cảnh nào:** 17.A (nợ hợp đồng), 17.J (test tất định), 18.A (tổng
quát hoá OJ), 18.C (chấm lại phía server). Bốn chuỗi này chặn thứ khác hoặc là điều kiện để một
tính năng đã hứa không trở thành hình thức.

---

## 7. Kỷ luật git

Nhánh `feat/p19-cicd-game`, tách từ `main` **sau khi P18 đã gộp**.

`git status` trước mọi lệnh git; commit dạng pathspec.
