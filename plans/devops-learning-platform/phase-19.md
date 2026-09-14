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
| `checkout` là tên an toàn cho bước đầu pipeline | **Có, trong phase này.** `scripts/check-no-commerce.mjs` bắt token trần `checkout`, nhưng `packages/games/src` **không** nằm trong `ROOTS`, và chốt 2026-09-11 là giữ nguyên như vậy (xem 17.C.3). Nên game dùng được `checkout` đúng tên GitHub Actions gọi nó. ⚠ Nếu ai đó mở lại quyết định đó thì bước đầu phải đổi tên, và đây là chỗ vỡ đầu tiên. |

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

**AC-B:** rebuild rồi promote ⇒ engine báo artifact khác danh tính · ba chiến lược cho ba thời
gian lùi khác nhau, có test khẳng định thứ tự (blue-green < canary < rolling) · drift tồn tại
đúng số tick giữa hai lần reconcile, có test.

### 19.C — Bộ đọc/ghi YAML GitHub Actions (M, ~4 ngày)

| # | Việc | Ước |
|---|---|---|
| C.1 | Phân tích YAML → `WorkflowSpec`. `jobs`/`steps`/`needs`/`strategy.matrix`/`uses`/`continue-on-error`/`environment` | 4h |
| C.2 | Ghi ngược `WorkflowSpec` → YAML (cần cho Level Builder và cho nút "gợi ý sửa") | 4h |
| C.3 | Lỗi cú pháp trỏ về **đúng dòng, đúng cột** | 4h |
| C.4 | Lỗi ngữ nghĩa trỏ về đúng dòng: `needs` trỏ job không tồn tại, DAG có chu trình, matrix rỗng | 4h |
| C.5 | Bước đầu giữ tên `checkout` đúng như GitHub Actions gọi — xem §0. Việc ở đây là *test khoá* khẳng định `packages/games/src` vẫn ngoài `ROOTS` của `check-no-commerce.mjs`, để nếu ai thêm vào thì đỏ ngay tại chỗ chứ không đỏ ở CI sáu tuần sau. | 1h |
| C.6 | Ranh giới: **chỉ tầng này biết GitHub Actions.** Có test khẳng định `cicd/contract.ts` và `cicd/engine.ts` không chứa chuỗi `uses:`, `actions/`, `runs-on`. | 2h |

**AC-C:** một workflow YAML thật (lấy từ chính `.github/workflows/` của repo, rút gọn) đọc được
· C.6 xanh, có đối chứng dương.

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
| Ai đó thêm `packages/games/src` vào `ROOTS` sau lưng, làm đỏ mọi tên stage | 2 | 3 | 6 | Test khoá ở C.5 đỏ ngay tại chỗ thay vì đỏ ở CI nhiều tuần sau |
| Mô hình steady-state kiểu Factorio lọt vào, dạy sai | 2 | 5 | 10 | Comment cảnh báo ở đầu module + review khi làm A.9 |
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
