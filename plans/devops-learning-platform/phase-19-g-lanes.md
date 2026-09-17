# 19.G — brief chung cho hai lane viết level chương CD

**Nguồn:** [`phase-19.md`](phase-19.md) §19.G · SSOT thiết kế §4.3 bảng "Chương CD" của
[`2026-09-11-brainstorm-git-cicd-games.md`](../reports/2026-09-11-brainstorm-git-cicd-games.md)
**Nền lead đã gộp:** commit `537568e` trên `feat/p19-cd-chapter`.

Mỗi lane đọc hết file này trước khi viết dòng nào. Mục §2 và §3 là hợp đồng giữa hai lane — không
lane nào tự đổi.

---

## 1. Sở hữu file — tuyệt đối

| Lane | Được GHI | Level |
|---|---|---|
| **lane-1** | `packages/games/src/cicd/levels/cd-som.ts` + các file mới `levels/c15-*.ts` … `levels/c21-*.ts` | C15–C21 |
| **lane-2** | `packages/games/src/cicd/levels/cd-muon.ts` + các file mới `levels/c22-*.ts` … `levels/c28-*.ts` | C22–C28 |

⛔ **Không lane nào sửa** `contract.ts`, `cd-contract.ts`, `cd-run.ts`, `predicates.ts`, `engine.ts`,
`release.ts`, `gitops.ts`, `masking.ts`, `levels/index.ts`, `levels/cd-levels.test.ts`,
`levels/cheatsheet.test.ts`, hay bất kỳ file nào ngoài bảng trên. Thấy hợp đồng thiếu thứ một level
cần ⇒ **dừng level đó**, viết đề xuất vào báo cáo cuối (§6), làm level kế tiếp.

## 2. Hợp đồng — đọc, đừng chép

- `cicd/contract.ts` §8 `CicdLevel` (có trường mới `cd?`), `CicdCheatSheetEntry` (có biến thể `'cd-panel'`).
- `cicd/cd-contract.ts` toàn bộ, **đặc biệt §5** (ba quyết định chốt) và luật R1–R6, G1–G5, M1–M4.
- `cicd/predicates.ts` — tên vị từ và `CICD_PREDICATE_ARGS` (tham số đúng từng khoá).
- Mẫu level CI để bắt chước hình dạng: `levels/c05-viec-khong-chan.ts`, `levels/c14-toi-uu-ba-truc.ts`.
- Pipeline có môi trường/duyệt/artifact: `StageSpec.environment`, `.approval`, `StepSpec.requires/produces`,
  `CommitArrival.approvalRejected`, `artifacts.ts`, ca `WF_THANG_HANG`/`WF_CO_DUYET` trong `predicates.test.ts`.

## 3. Quy ước chung (cả hai lane phải giống hệt)

- **id** `cicd-cNN-slug-khong-dau`, `chapter: 'cd'`, `theoryId: null` (19.I chưa làm). Export tên
  `LEVEL_C15` … `LEVEL_C28` từ file level; mảng nửa chương theo đúng thứ tự số.
- **Tiếng Việt có dấu** cho `title`/`mission`/`brief`/`teaching`/`hints`/`label`. `mission` ≤ 20 từ,
  `brief` ≤ 400 từ và **không nói cách làm**, `primer` ≤ 250 từ, 2–4 `takeaways`, ≥ 3 `hints` cụ thể dần.
- **Mục tiêu:** ≥ 1 bắt buộc + **đúng MỘT** mục thưởng (`required: false`), và mục thưởng phải đạt ở
  ĐÚNG MỘT trong hai lời giải. Lời giải = (`solutionWorkflow`, `cd.solution`) và
  (`altSolutionWorkflow`, `cd.altSolution`), phải **khác nhau thật** — khác một tham số mà không đổi
  cách tiếp cận là chưa đủ; ghi một dòng chú thích trong file nói hai đường khác nhau ở đâu.
- **Trạng thái ban đầu** (`initialWorkflow` + `cd.initial`) trượt ≥ 1 mục bắt buộc.
- **Khoá núm (`cd.editable`)**: mở đúng núm bài học cần. C18/C19/C20 **cấm** mở `release.strategy`
  và phải dạy đúng rolling / blue-green / canary (ô test ghim). Level không có bộ mô phỏng nào (dạy
  bằng workflow) thì bỏ hẳn khối `cd`.
- **Lời giải đi tới được:** mọi trường không nằm trong `cd.editable` phải bằng đúng `cd.initial`.
- **Vị từ "đạt bằng cách không làm gì"** — `noDataIncident` phải ghép `badReleasePromotedAtMost` hoặc
  `rollbackUnder`; `selfHealFightsAtMost` phải ghép `driftLongestUnder` trên trường KHÔNG do bộ điều
  khiển quản (đọc chú thích của hai tên đó trong `contract.ts`).
- **Số liệu kịch bản theo thiết kế §4.3**: rolling lùi ~3–5 phút, blue-green lùi < 5 giây
  (`switchSeconds`), canary lùi < 30 giây (`routeSeconds`), weight canary 2–5% là điểm xuất phát thực tế.
- **Ba trục CI** (`thresholds`) vẫn được kiểm ở cả hai lời giải — đặt ngưỡng rộng cho level mà
  workflow không phải trọng tâm, nhưng `par ≤ budget` vẫn phải đúng.
- **Nhiễu canary**: số lượt `cd.release.evaluation.passes` đủ lớn để thấy tỷ lệ (C20–C21: ≥ 20).

## 4. Bẫy đã biết — đọc kỹ

1. **Cổng chống-thương-mại** (`scripts/check-no-commerce.mjs`) quét cả `packages/games/src`: CẤM
   `payment`, `checkout`, `billing`, `invoice`, `price`, `premium`, `subscription`, `purchase`,
   `refund`, `coupon`, `discount`, "thanh toán", "hoá đơn", "giỏ hàng", "khuyến mãi", "giảm giá"…
   ⇒ **đừng** đặt tên dịch vụ ví dụ kiểu "payment-service" / "dịch vụ thanh toán". Dùng
   `dich-vu-dat-lich`, `api-tim-kiem`, `dich-vu-thong-bao`.
2. **Cổng lõi trung lập** (`scripts/check-cicd-vendor-neutral.mjs`) quét `cicd/`: CẤM `github`,
   `gitlab`, `azure`, `jenkins`, `actions/`, `runs-on`, `ubuntu-latest`, và chuỗi chứa `jobs:` /
   `needs:` / `uses:`. Cũng không tên công cụ GitOps cụ thể — nói "bộ đối soát", không nói tên sản phẩm.
3. **Cheatsheet `'yaml'` là `WorkflowSpec`**, không phải chuỗi YAML (xem chú thích `CicdCheatSheetEntry`).
   Dùng `cheatsheetExample` trong `cicd/cheatsheet-example.ts`. Núm CD dùng `where: 'cd-panel'`.
4. **Khuôn job**: tập job và dãy bước người chơi gửi phải trùng một trong ba workflow level khai.
   Level cho sửa `stages` mà cần một cách chia job khác thì phải KHAI nó thành một workflow.
5. **`editable` workflow ↔ lời giải**: cho thêm/bớt stage thì phải cho nối lại stage (`'edges'`).
6. `CicdScoringContext.cd.release` là **mảng**, một mục mỗi kịch bản; kịch bản thứ i chạy với
   `baseSeed + i`. `GitOpsScenario` ném khi dữ liệu sai (đọc cuối `cd-contract.ts` §2).
7. **CRLF**: file mới ghi LF; đừng chạy script sửa hàng loạt mà đổi đuôi dòng file khác.

## 5. Ý đồ từng level (design-intent — giữ ý, tự chọn số)

| # | Công cụ | Ý đồ phải giữ |
|---|---|---|
| C15 | workflow | Artifact là vật thể có danh tính: deploy `dev` phải NHẬN sản phẩm từ build (`requires`/`produces`). Ban đầu deploy không nối vào build ⇒ `missing-output`. |
| C16 | workflow | **Level trung tâm.** Ban đầu prod dựng lại (`build-prod`); lời giải: prod thăng hạng đúng artifact staging đã chạy (`promotedArtifactUnchanged`). |
| C17 | workflow | `environment` prod + cổng duyệt ≥ 1 người; workload có commit bị từ chối (`approvalRejected`) để cổng thật sự chặn (`environmentGuardedByApproval`). |
| C18 | release rolling | Batch nhỏ lùi lâu (nhiều đợt đã đổi), batch lớn tốn máy — cân `rollbackUnder` với `peakInstancesAtMost`. |
| C19 | release blue-green | Lùi < 5 giây nhưng đội máy gấp đôi. Ban đầu chọn tiến (`roll-forward`) nên chậm. Tìm đường thứ hai thật sự khác (có thể ở workflow). |
| C20 | release canary | Lùi < 30 giây, rẻ hơn blue-green (`peakInstancesAtMost` < 2 × instances). |
| C21 | release canary, **≥ 1 bản tốt + ≥ 1 bản xấu** | Đọc tín hiệu khỏi nhiễu bằng CỠ MẪU. Ban đầu weight/khoảng đo quá nhỏ ⇒ hủy nhầm hoặc lọt. Hai đường: tăng weight vs tăng số khoảng đo. |
| C22 | release, migration `irreversible` | Rollback DB thường bất khả: lùi ⇒ `rollback-blocked`. Ghép `noDataIncident` với vị từ chống "không xử lý". |
| C23 | gitops | Git là nguồn sự thật: commit `'git'` chỉ lên sống ở nhịp đối soát kế tiếp. |
| C24 | gitops | **Drift** sống ĐÚNG khoảng giữa hai nhịp đối soát; người chơi phải thấy khoảng đó. |
| C25 | gitops, `'controller'` + `'human'` | Tự sửa không loại trừ trường bộ điều khiển quản ⇒ giành nhau mãi. Phần lớn đội bật phát hiện, tắt tự sửa cho tới khi tin exclusion list. |
| C26 | masking | Bộ che chỉ biết chuỗi ĐÃ ĐĂNG KÝ; base64/url/đảo ngược lọt nguyên vẹn. Dòng `split` không che được bằng đăng ký — dạy trong `pitfalls`, đừng đặt mục bắt buộc không ai đạt. |
| C27 | tổng hợp, áp lực thời gian | Hotfix 2 giờ sáng: bỏ bước nào thì trả giá gì — `leadTimeUnder` chặt kéo ngược với cổng duyệt / phát hành an toàn. |
| C28 | tổng hợp tự do | Sự cố tổng hợp: ít nhất hai bộ mô phỏng + workflow, nhiều mục bắt buộc. |

## 6. Kỷ luật chạy và báo cáo

- Bạn chạy trong **git worktree riêng**. `git status` trước mọi lệnh git. Commit dạng pathspec
  (`git add <file mới cụ thể>` rồi `git commit -m … -- <các file>`). CẤM `add -A`, `checkout`, `switch`,
  `rebase`, `push`.
- **Commit sau MỖI level xanh** — đừng dồn. Chạm ~80% ngân sách lượt ⇒ commit ngay và báo cáo phần đã xong.
- **Xác minh một level** (trong `packages/games`):
  `npx vitest run src/cicd/levels/cd-levels.test.ts src/cicd/levels/cheatsheet.test.ts -t cNN`
  — lưu ý ô "id tăng dần từ 15" chạy trên cả mảng; và cuối lane chạy lại **không** `-t`.
  Rồi `npx tsc --noEmit -p .` · `npx eslint src/cicd/levels` · ở gốc repo:
  `node scripts/check-cicd-vendor-neutral.mjs && node scripts/check-no-commerce.mjs`.
- ⚠ Ô AC-G đang `describe.runIf` — **đếm số test đã CHẠY** trong output, đừng chỉ đọc "passed".
- **Báo cáo cuối** (tin nhắn cuối của bạn): bảng level × (commit SHA đọc lại bằng `git log`, hai lời
  giải khác nhau ở đâu, mục thưởng), số test đã chạy, và mọi đề xuất đổi hợp đồng kèm lý do.
