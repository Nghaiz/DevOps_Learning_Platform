# Cấu hình repo GitHub — dự án một người

**Phần lớn file này đã được áp dụng rồi.** Nó tồn tại để bạn biết *cái gì đang
bật, vì sao*, kiểm lại thế nào, và đổi/tắt ra sao — không phải một danh sách việc
phải đi bấm.

> **Vì sao mọi thứ ghi bằng lệnh `gh` chứ không phải đường đi trong menu:** giao
> diện Settings của GitHub đổi liên tục, và nhãn nút trong tài liệu lệch với thứ
> bạn nhìn thấy là chuyện thường. Lệnh `gh` bên dưới **đã được chạy thật** trên
> repo này và output là thật. Khi nghi ngờ, tin lệnh — không tin ảnh chụp menu.
> Bảng "tương ứng trong UI" chỉ để bạn đối chiếu khi muốn bấm tay.

## 0. Quy trình hằng ngày (thứ tất cả những cài đặt dưới đây phục vụ)

```bash
git switch -c feat/ten-tinh-nang          # KHÔNG làm việc trên main
# ... code ...
git push -u origin feat/ten-tinh-nang
gh pr create --fill
gh pr merge --merge --auto                # tự merge NGAY KHI ci-ok xanh
```

`--auto` là mấu chốt của quy trình một người: bạn không phải ngồi canh CI. PR tự
merge khi cổng xanh, nhánh tự xoá, `main` nhận **đủ commit của nhánh** cộng một
merge commit đánh dấu ranh giới — xem §2 về việc bỏ squash.

Sau khi merge:

```bash
git switch main && git pull --ff-only
git branch -D feat/ten-tinh-nang          # nhánh remote GitHub đã tự xoá
```

**Không push thẳng lên `main`.** Máy bạn đã có hàng rào cho việc này — xem §7.

---

## 1. Branch protection cho `main` ⚠️ HIỆN KHÔNG BẬT

> **Đo lại 2026-09-08:** `gh api repos/Nghaiz/DevOps_Learning_Platform/branches/main/protection`
> trả **404 `Branch not protected`**. Nhánh `main` đang **không có** protection
> nào — không required check, không bắt buộc PR, không chặn force-push. Bản
> trước của mục này ghi "✅ đã áp dụng"; điều đó đã không còn đúng, và không rõ
> nó bị gỡ lúc nào. Bảng dưới là **cấu hình mong muốn**, không phải trạng thái
> đang chạy. Muốn bật lại thì chạy khối "Đặt lại từ đầu" ở cuối mục này.

Repo này dùng **classic branch protection**, KHÔNG phải ruleset. Đây chính là chỗ
một bản trước nữa của tài liệu này sai và bạn thấy lệch với giao diện.

Cấu hình mong muốn:

| Cài đặt | Giá trị | Vì sao |
|---|---|---|
| Required status check | **`ci-ok`** (chỉ một) | xem cảnh báo dưới |
| Require branches up to date | ✅ | chặn "semantic conflict": hai PR xanh riêng lẻ, gộp lại thì hỏng |
| Require a pull request | ✅ | không có PR = bỏ qua toàn bộ cổng CI |
| Số approval cần | **0** | bạn không thể tự duyệt PR của mình; để 1 là tự khoá mình vĩnh viễn |
| Require conversation resolution | ✅ | comment của Copilot review phải được xử lý, không trôi |
| Require linear history | ❌ | **đã đổi 2026-09-08** — §2 chuyển sang merge-commit, mà merge commit có hai cha nên linear history sẽ chặn nó |
| Allow force pushes / deletions | ❌ / ❌ | force-push viết lại lịch sử mà gitleaks đã quét |
| Do not allow bypassing (admin) | ❌ **tắt** | bạn giữ được lối thoát khẩn cấp — bù lại bằng hook local ở §7 |

> ### ⚠️ Cái bẫy đã cắn thật, ngày 2026-08-08
>
> Protection cũ bắt buộc hai check tên `CI (TS + proto + Go)` và
> `Secret scan (gitleaks)`. Khi CI được tách job, **job tên cũ không còn tồn
> tại** — mà GitHub thì chờ một check không bao giờ báo cáo. PR #2 rơi vào
> `state=BLOCKED` dù cả 7 job đều xanh.
>
> Đó là lý do required check **chỉ có đúng một tên: `ci-ok`**. Job đó tự kiểm kết
> quả của tất cả các cổng còn lại. Thêm/đổi/xoá job trong `ci.yml` không bao giờ
> phải đụng lại Settings nữa.
>
> **Đừng thêm tên job khác vào danh sách required.**

### Kiểm lại

```bash
gh api repos/Nghaiz/DevOps_Learning_Platform/branches/main/protection \
  --jq '{checks: .required_status_checks.contexts,
         strict: .required_status_checks.strict,
         approvals: .required_pull_request_reviews.required_approving_review_count,
         admin_bypass: (.enforce_admins.enabled | not),
         linear: .required_linear_history.enabled}'
```

### Đặt lại từ đầu (nếu lỡ tay sửa hỏng)

```bash
gh api -X PUT repos/Nghaiz/DevOps_Learning_Platform/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["ci-ok"] },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0,
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "require_last_push_approval": false
  },
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true,
  "block_creations": false,
  "lock_branch": false,
  "allow_fork_syncing": false
}
JSON
```

**Tương ứng trong UI:** Settings → Branches → mục "Branch protection rules" → nút
Edit ở dòng `main`. Ô "Require approvals" phải để số **0**; ô "Do not allow
bypassing the above settings" để **trống**.

---

## 2. Cách merge ✅ đã áp dụng

| Cài đặt | Giá trị |
|---|---|
| Allow merge commits | ✅ (tiêu đề = tiêu đề PR, mô tả = body PR) |
| Allow squash merging | ❌ **đổi 2026-09-08** |
| Allow rebase merging | ❌ |
| Automatically delete head branches | ✅ |
| Allow auto-merge | ✅ |
| Allow update branch | ✅ |

**Đổi 2026-09-08 — vì sao bỏ squash.** Squash-only ép mỗi PR thành đúng một
commit trên `main`. Với PR nhỏ thì gọn, nhưng nhánh dài (P14 vào main với **100
commit**) thì toàn bộ lịch sử — thứ tự phát hiện lỗi, commit nào là bản vá của
commit nào, `git bisect` — bị nén phẳng thành một dòng và mất vĩnh viễn. Không
có cờ nào của `gh pr merge --squash` giữ lại được phần đó.

Giờ chỉ còn merge-commit ⇒ `main` nhận **đủ commit gốc, giữ nguyên SHA**, cộng
một merge commit đánh dấu ranh giới tính năng. Revert một tính năng vẫn là một
lệnh: `git revert -m 1 <sha-merge-commit>`.

Rebase để tắt vì nó viết lại SHA — commit trên `main` không còn khớp commit bạn
đã ký/đã đo trên nhánh.

Auto-merge là thứ khiến quy trình PR không tốn thời gian chờ của bạn.

> **Đi cặp với §1:** merge commit có **hai cha**, nên `required_linear_history`
> phải **tắt**. Bật lại protection mà quên tắt cờ đó là mọi PR kẹt vĩnh viễn.

```bash
# kiểm lại
gh api repos/Nghaiz/DevOps_Learning_Platform \
  --jq '{squash: .allow_squash_merge, merge: .allow_merge_commit, rebase: .allow_rebase_merge,
         auto_merge: .allow_auto_merge, delete_branch: .delete_branch_on_merge}'
```

**Tương ứng trong UI:** Settings → General → cuộn tới mục "Pull Requests".

---

## 3. Copilot code review tự động ✅ đã áp dụng

Bạn dùng **Copilot Student** (= quyền lợi Copilot Pro), nên tính năng này dùng
được trên repo private.

Đây là thứ **duy nhất** trong repo cấu hình bằng **ruleset** — vì GitHub chỉ cho
bật nó qua đường đó, không có ở classic branch protection:

```bash
gh api repos/Nghaiz/DevOps_Learning_Platform/rulesets --jq '.[] | {name, enforcement}'
gh api repos/Nghaiz/DevOps_Learning_Platform/rulesets/$(gh api repos/Nghaiz/DevOps_Learning_Platform/rulesets --jq '.[0].id') --jq .rules
```

Kết quả mong đợi:

```json
[{"type":"copilot_code_review","parameters":{"review_on_push":true,"review_draft_pull_requests":false}}]
```

- `review_on_push: true` — review lại mỗi lần bạn đẩy commit mới lên PR. Trên dự
  án một người, đây chính là "cặp mắt thứ hai" mà bạn không có.
- `review_draft_pull_requests: false` — không review PR nháp. Mở PR dạng draft
  khi đang làm dở, chuyển sang Ready khi muốn được review.

Copilot đọc [.github/copilot-instructions.md](../../.github/copilot-instructions.md)
trước mỗi lần review, cộng với hai file theo đường dẫn trong
[.github/instructions/](../../.github/instructions/). Review vô dụng thì sửa mấy
file đó, đừng tắt tính năng.

**Tương ứng trong UI:** Settings → Rules → Rulesets → `copilot-code-review`.
(Bấm tay: New ruleset → New branch ruleset → Enforcement **Active** → Target
branches: `main` → tick **"Automatically request Copilot code review"**.)

---

## 4. Quyền của GitHub Actions ✅ vốn đã đúng

Không phải làm gì — repo đã ở trạng thái đúng từ trước:

```
default_workflow_permissions   : read
can_approve_pull_request_reviews: false
allowed_actions                : all
```

`read` là least privilege: workflow nào cần hơn thì tự khai `permissions:` trong
file của nó (job `images` khai `packages: write`). Để mặc định read-write là cấp
thừa cho **mọi** job, kể cả job chỉ chạy lint.

```bash
gh api repos/Nghaiz/DevOps_Learning_Platform/actions/permissions/workflow
```

**Tương ứng trong UI:** Settings → Actions → General → mục "Workflow permissions".

---

## 5. Tính năng bảo mật

| Tính năng | Trạng thái | Ghi chú |
|---|---|---|
| Dependabot alerts | ✅ **vừa bật** | trước đó đang tắt — cảnh báo CVE trong dependency |
| Dependabot security updates | ✅ **vừa bật** | tự mở PR vá |
| Dependabot version updates | ✅ | [dependabot.yml](../../.github/dependabot.yml), tự chạy khi file lên `main` |
| Private vulnerability reporting | ✗ | **chỉ có trên repo PUBLIC** — xem dưới |
| Secret scanning / Push protection | ✗ | cần GitHub Advanced Security trên repo private |
| Code scanning / CodeQL | ✗ | cùng điều kiện — xem dưới |

**Không còn việc nào phải bấm tay.** Bản trước của tài liệu này bảo đi bật
"Private vulnerability reporting" trong Settings — **sai hai lần**: tính năng đó
chỉ tồn tại trên repo **public** (nên không có trong menu của bạn), và nó *có*
API công khai (`PUT /repos/{owner}/{repo}/private-vulnerability-reporting`), chỉ
là API đó trả 404 trên repo private.

Hệ quả: [SECURITY.md](../../.github/SECURITY.md) không thể dùng đường báo lỗi
riêng của GitHub khi repo còn private — nó trỏ sang email maintainer. Khi repo
chuyển sang public thì bật bằng một lệnh:

```bash
gh api -X PUT repos/Nghaiz/DevOps_Learning_Platform/private-vulnerability-reporting
```

### Vì sao không có CodeQL và dependency review

Cả hai đã được thử ở PR #2 và **đỏ ngay**:

```
Code scanning is not enabled for this repository.
Dependency review is not supported on this repository.
```

Cả hai đòi **GitHub Advanced Security**, thứ không có trên repo private của tài
khoản cá nhân. Đã gỡ chứ không để lại — workflow luôn đỏ là workflow bị phớt lơ,
và nó huấn luyện người ta bỏ qua màu đỏ nói chung.

Thêm lại khi repo chuyển sang **public** (lúc đó cả hai miễn phí). Trong lúc đó
mọi cổng thật sự chặn được thứ gì đều đang chạy: `gitleaks`, `govulncheck` (có
phân tích reachability), Dependabot, Trivy (in ra log job).

---

## 6. Package GHCR

Bốn package **đã tồn tại** và đang **private**:

```bash
for p in dlp-web dlp-orchestrator dlp-terminal-gateway dlp-sandbox-base; do
  echo "$p: $(gh api user/packages/container/$p --jq .visibility)"
done
```

Private là **ổn cho hiện tại**: `values-selfhost.yaml` đặt
`imagePullPolicy: Never` (image import thẳng vào containerd trên node bằng
`ctr images import`), nên cluster lab không kéo image từ registry.

Chỉ khi nào deploy lên cluster **thật sự kéo image từ GHCR** mới phải chọn:

- **Public** — đơn giản nhất, không cần imagePullSecret. Image công khai với cả
  thế giới.
- **Giữ private** — tạo imagePullSecret trên cluster:
  ```bash
  kubectl create secret docker-registry ghcr \
    --docker-server=ghcr.io --docker-username=Nghaiz \
    --docker-password="$(gh auth token)" -n <namespace>
  ```
  rồi thêm `imagePullSecrets` vào Helm values.

**UI:** trang package → Package settings → Danger Zone → Change visibility.

---

## 7. Hàng rào ở máy bạn (bù cho việc admin bypass được)

Branch protection để `enforce_admins: false` — cố ý, để bạn còn đường xử lý khi
CI hỏng. Nhưng trên dự án một người, "admin bypass được" nghĩa là luật không áp
cho ai cả. Nên hàng rào nằm ở máy bạn:

```bash
make install-hooks     # đã chạy sẵn cho bạn
```

Nó set `core.hooksPath=scripts/git-hooks`, và
[pre-push](../../scripts/git-hooks/pre-push) từ chối mọi lần push lên `main`:

```
BỊ CHẶN: push thẳng lên "main".
  Thật sự cần đẩy thẳng (CI hỏng, sửa gấp): git push --no-verify
```

Chặn thao tác nhầm, không chặn quyết định có ý thức. Gỡ bằng
`git config --unset core.hooksPath`.

---

## 8. Lối thoát khẩn cấp

Khi CI hỏng vì lý do hạ tầng (runner GitHub sự cố, registry sập) và bạn phải đẩy
gấp:

| Cách | Lệnh | Ghi chú |
|---|---|---|
| Bỏ qua hook local, vẫn qua PR | `git push --no-verify` rồi tạo PR | **ưu tiên cách này** |
| Merge PR bỏ qua required check | `gh pr merge <n> --merge --admin` | được vì `enforce_admins: false` |
| Tắt protection tạm thời | `gh api -X DELETE repos/Nghaiz/DevOps_Learning_Platform/branches/main/protection` | **nhớ bật lại bằng lệnh ở §1** |

Cách thứ ba là cách dễ quên bật lại nhất. Nếu dùng, đặt luôn một lời nhắc.

---

## 9. Về `GITLEAKS_LICENSE`

Không cần. `gitleaks-action` chỉ đòi license key khi repo thuộc một **GitHub
Organization**. Repo cá nhân dùng miễn phí.

Khi chuyển repo sang org (vd tài khoản của trường), job `secret-scan` sẽ đỏ với
thông báo về license. Lúc đó lấy key miễn phí ở [gitleaks.io](https://gitleaks.io/),
thêm vào Settings → Secrets and variables → Actions với tên `GITLEAKS_LICENSE`,
rồi thêm vào step gitleaks trong `ci.yml`:

```yaml
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  GITLEAKS_LICENSE: ${{ secrets.GITLEAKS_LICENSE }}
```

---

## 10. Kiểm toàn bộ trong một lệnh

```bash
node scripts/check-repo-settings.mjs
```

Script đọc trạng thái thật qua `gh api` và so với những gì tài liệu này khẳng
định. Lệch là in ra đúng chỗ lệch kèm lệnh sửa — để tài liệu không âm thầm nói
sai về hệ thống như bản trước đã làm.
