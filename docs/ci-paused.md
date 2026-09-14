# CI từng TẠM DỪNG — nay ĐÃ BẬT LẠI (2026-09-14)

> **Tài liệu này KHÔNG còn là hướng dẫn vận hành.** Trạng thái nó mô tả —
> "ci.yml chỉ chạy khi gọi tay" — đã chấm dứt ngày 2026-09-14, và ba việc dọn
> dẹp còn lại cũng đóng nốt trong cùng ngày. Giữ lại làm hồ sơ lịch sử, để người
> sau hiểu vì sao một quãng lịch sử git không có cổng nào gác — và đọc được hai
> ô nghiệm thu đã từng xanh mà chẳng gác gì, ở § "Ba việc dọn dẹp".
>
> Ba file workflow đang trỏ vào tài liệu này — `ci.yml`, `secret-scan.yml`,
> `no-commerce.yml` — nên đừng đổi tên file, sửa nội dung tại chỗ.

| | |
|---|---|
| **Tắt** | 2026-09-04 · điều kiện gỡ: hoàn thành phase 14 · chủ dự án quyết |
| **Bật lại** | 2026-09-14 · lúc đang đóng P16 để sang P17 — điều kiện gỡ đã qua hai chặng |

## Đã bật lại cái gì (2026-09-14)

Khối `on:` gốc trong `.github/workflows/ci.yml` bỏ comment, **nguyên văn** như
trước lúc tạm dừng, cộng thêm `workflow_dispatch:` giữ lại:

```yaml
on:
  push:
    branches: [main]
    tags: ['v*']
  pull_request:
  workflow_dispatch:
```

Từ giờ mọi PR chạy đủ chín cổng gom về `ci-ok`; mọi push lên `main` và mọi tag
`v*` chạy thêm job `images` (build & push ghcr).

**Hai thứ không được động vào khối đó**, cả hai đã ghi thành cảnh báo thường
trực ngay trong `ci.yml`:

- **Không để `push:` trần.** Với branch nằm trong chính repo này, GitHub bắn CẢ
  `push` LẪN `pull_request` ⇒ mọi PR chạy CI hai lượt, tốn đôi số phút runner.
- **Không thêm `paths:` ở cấp workflow.** `ci-ok` là required check, mà required
  check bị skip-vì-`paths` thì GitHub treo ở `Expected — Waiting` VĨNH VIỄN ⇒
  khoá merge (`rules/ci-cd-trigger-design.md` #3). Cần lọc thì lọc ở cấp step
  bằng `if:`.

`concurrency` giữ nguyên và đã kiểm lại: group là `ci-<workflow>-<ref>`, còn
`cancel-in-progress` là biểu thức `github.ref != 'refs/heads/main'`. Trên `main`
biểu thức ra `false` nên run trên main **không bao giờ bị huỷ giữa chừng** (đó là
chủ ý: cancel lúc job `images` đang push để lại tag `latest` nửa vời trên
registry). Run của PR mang ref `refs/pull/N/merge`, khác group với push trên
main, nên hai loại không huỷ chéo nhau.

### Vì sao phải bật — số đo tại thời điểm bật lại

`gh pr checks 119` trả **4 check pass** và `mergeStateStatus: CLEAN`. Nhìn thì
tưởng PR đã qua cổng. Thực tế cả 4 chỉ là:

```
Không có chuỗi giá / gói cước / thanh toán   pass   6s    run 34773097720
Không có chuỗi giá / gói cước / thanh toán   pass   7s    run 34773099061
Secret scan (gitleaks)                       pass  12s    run 34773097715
Secret scan (gitleaks)                       pass  11s    run 34773099097
```

— tức `secret-scan.yml` + `no-commerce.yml`, mỗi cái **hai lượt** vì cả hai khai
`on:` với `push:` trần lẫn `pull_request:`. Bảy cổng thật (`proto` `ts` `go`
`infra` `sandbox-image` `terminal-browser` `web-a11y`) **không chạy một dòng
nào**. Lần chạy `ci.yml` gần nhất trước hôm bật lại là run `34772290507`, ngày
2026-09-13, và nó là `workflow_dispatch` — gọi tay.

Đây đúng là chế độ hỏng mà `rules/green-that-proves-nothing.md` mô tả: một ô
xanh không thể đỏ vì thứ người đọc tưởng nó gác.

## Ba việc dọn dẹp — ĐÃ ĐÓNG NỐT 2026-09-14

Lượt bật lại buổi sáng chỉ sửa `on:` của `ci.yml` và để lại ba thứ vẫn ở trạng
thái "đang tạm dừng". Cả ba đóng trong ngày, đo lại từng cái:

| Thứ | Trạng thái cuối | Bằng chứng |
|---|---|---|
| Branch protection `main` | **BẬT** — required check `ci-ok`, `strict: true` | `pnpm repo:check` 18/18 |
| Hook `pre-push` chặn push thẳng `main` | **CHẶN THẬT** — khối tạm dừng + `exit 0` đã gỡ | chạy hook với stdin giả lập ⇒ exit != 0 |
| Hook local `workflow-artifact-gate` | **BẬT** — file cờ đã xoá | `.claude/t1k-artifact-gate.disabled` không còn |

`git config core.hooksPath` = `scripts/git-hooks` ✓.

### Ô kiểm hook cũ là một ô xanh không chứng minh gì

`scripts/check-repo-settings.mjs` từng kiểm hook bằng đúng một câu hỏi:
`git config core.hooksPath` có bằng `scripts/git-hooks` không. Suốt mười ngày
tạm dừng, câu trả lời là **có** — file nằm đúng chỗ, đường trỏ đúng, ô xanh mỗi
lượt — trong khi dòng `exit 0` ở đầu file làm hook không chặn gì cả.

Nay ô đó tách làm hai, và ô thứ hai **chạy thật** hook với một dòng stdin giả
lập push vào `main`, rồi đọc mã thoát. Đã phá thử: nhét lại `exit 0` ⇒ ô đỏ;
gỡ ra ⇒ ô xanh. Ô `core.hooksPath` thì xanh ở **cả hai** ca — đó chính là lý do
nó không thay thế được ô mới.

### Hai ô khác đỏ oan vì script gác lạc hậu hơn tài liệu

Cùng lượt này phát hiện `check-repo-settings.mjs` vẫn khẳng định chính sách
merge **trước** ngày 2026-09-08:

| Script đòi | Tài liệu (`docs/env/04` §1–2, đổi 2026-09-08) |
|---|---|
| `required_linear_history: true` | **false** — merge commit có hai cha, bật cờ là kẹt mọi PR |
| squash-only | **merge-commit only** — squash nén nhánh dài thành một commit, mất đường bisect |

Cấu hình repo thật khớp tài liệu; script mới là thứ sai. Đã sửa script theo tài
liệu, không sửa repo theo script. Chỉ `strict` là lệch thật (đặt `false` lúc bật
protection, tài liệu đòi `true`) — đã đặt lại `true`.

### Khôi phục branch protection — thứ tự vẫn còn giá trị

Giữ lại ghi chú này vì lần sau gỡ/bật lại protection vẫn cần nó.

Bản sao lưu `docs/branch-protection-main.backup.json` khai
`required_status_checks.contexts` = `["ci-ok"]`, `strict: true`,
`enforce_admins: false`, `required_approving_review_count: 0`.

**Đừng khôi phục trước khi `ci-ok` xanh được trên `main`.** `ci-ok` có
`if: always()` và kiểm `needs.*.result`, nên một job đỏ là nó đỏ theo; bật
`strict: true` với một required check đang đỏ là khoá sạch đường merge, kể cả PR
không liên quan. Thứ tự đúng: **sửa cho `ci-ok` xanh trên `main` trước → rồi mới
khôi phục protection.** Lệnh khôi phục (đọc thẳng từ bản sao lưu):

```bash
node -e "const d=require('./docs/branch-protection-main.backup.json');const r=d.required_pull_request_reviews||{};const rev={};for(const k of Object.keys(r))if(!k.endsWith('url'))rev[k]=r[k];process.stdout.write(JSON.stringify({required_status_checks:{strict:d.required_status_checks.strict,contexts:d.required_status_checks.contexts},enforce_admins:d.enforce_admins.enabled,required_pull_request_reviews:rev,restrictions:null}))" > bp.json
gh api -X PUT repos/:owner/:repo/branches/main/protection --input bp.json && rm bp.json
```

Sau đó `pnpm repo:check` phải xanh trở lại — suốt quãng tạm dừng nó đỏ, và **đó
là đỏ ĐÚNG**, đừng sửa script cho nó xanh.


## Trùng workflow sau khi bật lại

Đây là phần `ci.yml` trỏ tới. Hai file tách rời sinh ra hồi 2026-09-04 và
2026-09-06 nay trùng với job cùng tên vẫn còn nguyên trong `ci.yml` (cả hai đều
nằm trong `ci-ok.needs`):

| Cổng | Trong `ci.yml` | File tách rời | Lượt chạy mỗi commit trên PR |
|---|---|---|---|
| `secret-scan` (gitleaks) | job `secret-scan`, có trong `ci-ok.needs` | `secret-scan.yml`, `push:` trần + `pull_request:` | **3** (push + pull_request của file tách, cộng pull_request của ci.yml) |
| `no-commerce` | job `no-commerce`, có trong `ci-ok.needs` | `no-commerce.yml`, `push:` trần + `pull_request:` | **3** (cùng lý do) |

Chú thích trong chính hai file đó viết: "BẬT LẠI CI ĐẦY ĐỦ ⇒ XOÁ file này". Câu
đó đúng cho `no-commerce.yml` và **không hoàn toàn đúng** cho `secret-scan.yml`
— lý do dưới. Chưa file nào bị xoá; quyết định thuộc chủ dự án.

### `no-commerce.yml` → nên XOÁ

Trùng sạch: cùng chạy `node scripts/check-no-commerce.mjs`, cùng quét CÂY LÀM
VIỆC hiện tại chứ không quét lịch sử. Sau khi xoá, job trong `ci.yml` phủ PR,
push `main` và tag — và nó **mạnh hơn** bản tách rời ở một điểm: nằm trong
`ci-ok.needs`, nên khi branch protection quay lại thì nó CHẶN merge, còn bản
tách rời chưa bao giờ chặn gì.

Thứ mất đi khi xoá: push lên nhánh feature **chưa mở PR** không còn được quét.
Chấp nhận được, và chính `no-commerce.yml` đã tự nói vì sao — nó KHÔNG đạt tiêu
chí "bật lại CI sau không cứu được": một chuỗi giá lọt vào repo thì xoá được, và
nó sẽ bị bắt ở PR trước khi chạm `main`.

```bash
git rm .github/workflows/no-commerce.yml
```

### `secret-scan.yml` → ĐỪNG xoá theo phản xạ

Nội dung job trùng thật (cùng SHA action `gitleaks-action@e0c47f4` v3.0.0, cùng
`fetch-depth: 0`, cùng `pull-requests: read`). Nhưng **phạm vi trigger thì
không** trùng:

- `secret-scan.yml`: `push:` **trần** ⇒ mọi nhánh, mọi push.
- `ci.yml` sau khi bật lại: `push:` chỉ `main` + tag `v*`, cộng `pull_request:`.

⇒ Xoá `secret-scan.yml` là mất đúng một vùng: **push lên nhánh feature chưa mở
PR**. Và đó chính là chế độ hỏng mà cổng này sinh ra để gác — một secret đã được
push lên remote thì đã nằm trong lịch sử git trên GitHub; bắt nó muộn hơn ở
PR-time **không hoàn tác được** việc đó, vẫn phải xoay khoá và rewrite history.

Ghi chú lịch sử: thiết kế TRƯỚC lúc tạm dừng cũng có đúng lỗ hổng này (khối
`on:` gốc chưa bao giờ nghe push nhánh feature). Nên xoá file là *quay về nguyên
trạng*, không phải *tạo ra lỗ mới* — chỉ là nguyên trạng đó chưa từng được cân
nhắc tường minh.

Ba đường, chủ dự án chọn:

| | Làm gì | Lượt gitleaks / commit PR | Nhánh feature chưa có PR |
|---|---|---|---|
| **(a)** | Xoá `secret-scan.yml` | 1 | **không quét** |
| **(b)** | Giữ nguyên cả hai | 3 | quét |
| **(c)** | Giữ file, đổi `on:` thành `push:` với `branches-ignore: [main]`, bỏ `pull_request:` | 2 | quét |

**Khuyến nghị: (c).** Nó bỏ được lượt chạy thừa mà vẫn giữ vùng phủ, và tách
bạch hai câu hỏi khác nhau: file tách rời trả lời "mọi commit đã push đi đâu đó
có được quét chưa", job trong `ci.yml` trả lời "cổng có xanh để merge không" (và
chỉ job đó mới gác được, vì chỉ nó nằm trong `ci-ok.needs`). Nếu ưu tiên tuyệt
đối là ít file và ít lượt chạy thì (a) cũng bảo vệ được, chỉ cần biết rõ mình
đang đánh đổi vùng phủ nào.

## ── Từ đây xuống là LỊCH SỬ (trạng thái 2026-09-04 → 2026-09-14) ──

Giữ nguyên để người sau đọc được vì sao quãng lịch sử git đó không có cổng nào.

### Đã tắt cái gì, hồi đó

| Thứ | Trạng thái hồi đó | Nằm ở |
|---|---|---|
| `ci.yml` — các job `proto` `ts` `go` `infra` `secret-scan` `sandbox-image` `terminal-browser` `web-a11y` `no-commerce` `ci-ok` `images` | chỉ chạy khi **gọi tay** | khối `on:` |
| Branch protection `main` (đòi `ci-ok`, strict) | đã gỡ | GitHub settings |
| Hook `pre-push` | no-op (`exit 0` ở đầu) | `scripts/git-hooks/pre-push` |
| Hook `workflow-artifact-gate` (advisory, ồn) | tắt | `.claude/t1k-artifact-gate.disabled` |

### Cái gì KHÔNG tắt, và vì sao

**Quét secret (`gitleaks`)** — tách sang `secret-scan.yml`, chạy mọi push. Bảy
cổng kia gác những thứ hỏng-thì-sửa-được-sau. Cổng này gác thứ DUY NHẤT mà bật
lại CI sau không cứu được: secret đã nằm trong lịch sử git thì phải xoay khoá và
rewrite history. Nó chỉ **báo**, không chặn (branch protection đã gỡ). Hook local
`secret-guard.cjs` của kit vẫn chặn stage/commit file nhạy cảm ở tầng máy.

**Cổng cấm thương mại** (thêm 2026-09-06) — tách sang `no-commerce.yml`, chạy
`scripts/check-no-commerce.mjs`, ~20s mỗi push, Node thuần nên không cần
`pnpm install`.

⚠ Cổng này **KHÔNG đạt** tiêu chí ở trên: một chuỗi giá lọt vào repo thì xoá
được. Nó ở đây vì lý do khác, chủ dự án quyết: "hệ thống không có liên quan gì
tới bán khoá học" là ràng buộc SẢN PHẨM, và nó đã trượt một lần rồi — chuỗi
`price`/`billing`/`subscribe` từng lọt vào việc đang làm và phải nhắc hai lần.
Thứ đã trượt một lần thì không nên chỉ dựa vào trí nhớ để giữ.

### Nợ mà quyết định đó tạo ra

Từ 2026-09-04 tới 2026-09-14, **không có gì đảm bảo** trên mỗi commit:

- kiểu TypeScript, lint, unit test (`ts`)
- build/vet/test/lint/govulncheck Go (`go`)
- helm template + kubeconform + shellcheck + actionlint (`infra`)
- `buf` breaking-change + `pnpm proto:check` (generated khớp committed) (`proto`)
- build thử `sandbox-base` + hai cổng `sha256sum -c` (`sandbox-image`)
- smoke terminal trên Chromium (`terminal-browser`)
- axe + CSP trên `next start` (`web-a11y`)
- build và push image lên ghcr (`images`) — **kể cả trên `main`**

⚠ Hệ quả cụ thể đã lường trước: `images` không chạy nghĩa là **không có tag
`sha-<short>` mới cho `dlp-sandbox-base`**. Chart ghép `sandboxImage` từ
`image.tag`, nên deploy trỏ vào tag chưa tồn tại sẽ `ImagePullBackOff`. Suốt
quãng đó phải build và side-load bằng tay (đường `docker save` → `scp` →
`ctr import`, kiểu 5.A) hoặc gọi tay `gh workflow run ci.yml`.

### Lượt trả nợ đầu tiên

Chạy CI đầy đủ một lượt trên `main` và đọc hết cái đỏ:

```bash
gh workflow run ci.yml --ref main && gh run watch
```

⚠ Nó sẽ đỏ **nhiều chỗ cùng lúc**, và đó là chuyện bình thường của quyết định
tạm dừng chứ không phải dấu hiệu hỏng. Đối chứng: run `34526505858` (main,
2026-09-10) đỏ 4 job thật — `web-a11y`, `secret-scan`, `terminal-browser`, `go`.
Đọc theo thứ tự `proto` → `ts`/`go` → `infra` → image; sửa từ tầng contract lên,
đừng sửa song song.
