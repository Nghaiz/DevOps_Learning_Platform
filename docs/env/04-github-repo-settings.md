# Cấu hình repo GitHub (làm một lần)

Những việc phải bấm tay trong **Settings** của repo. Không có cái nào ở trong
code — đó chính là lý do file này tồn tại.

Làm theo thứ tự: mục 1 vô nghĩa nếu chưa có run CI nào để chọn tên check.

## 1. Branch protection cho `main`

**Settings → Branches → Add branch ruleset** (hoặc Add rule ở giao diện cũ).

| Cài đặt | Giá trị | Vì sao |
|---|---|---|
| Target branch | `main` | |
| Require a pull request before merging | ✅ | Push thẳng lên main là bỏ qua **toàn bộ** cổng CI |
| Required approvals | `0` (dự án 1 người) hoặc `1` | Tự duyệt PR của mình là nghi thức rỗng; nhưng bắt buộc *có* PR thì không |
| Dismiss stale approvals | ✅ | Duyệt xong rồi push thêm commit thì lượt duyệt đó không còn nói về code đang merge |
| **Require status checks to pass** | ✅ | |
| **Required check** | **`ci-ok`** | **Chỉ một tên này.** Xem ghi chú dưới |
| Require branches up to date | ✅ | Chặn "semantic conflict": hai PR đều xanh riêng lẻ nhưng gộp lại thì hỏng |
| Require conversation resolution | ✅ | |
| Block force pushes | ✅ | Force-push lên main viết lại lịch sử mà gitleaks đã quét |

> **Chỉ khai `ci-ok`, đừng khai từng job.** Job `ci-ok` trong
> [ci.yml](../../.github/workflows/ci.yml) kiểm kết quả của **tất cả** các cổng và
> chỉ xanh khi mọi cổng đạt. Khai 6 tên job riêng nghĩa là mỗi lần đổi tên job
> phải nhớ vào đây sửa — và quên thì cổng biến mất trong im lặng, PR vẫn xanh.
>
> GitHub chỉ gợi ý tên check **đã từng chạy**. Chưa thấy `ci-ok` thì mở một PR
> nháp cho CI chạy một lượt, rồi quay lại.

## 2. Quyền của GitHub Actions

**Settings → Actions → General**:

| Cài đặt | Giá trị | Vì sao |
|---|---|---|
| Actions permissions | Allow all / Allow select | Workflow dùng action của bên thứ ba (docker, gitleaks, trivy) — nếu chọn "select" thì phải allowlist chúng |
| **Workflow permissions** | **Read repository contents** | Least privilege. Workflow đã tự khai `permissions:` cho job nào cần thêm; để mặc định read-write là cấp thừa cho **mọi** job |
| Allow Actions to create and approve pull requests | ❌ | Không workflow nào cần. Bật lên là mở đường leo thang quyền |

## 3. Package GHCR

Lần đầu chạy job `images` sẽ tạo 4 package dưới tài khoản của bạn.

Với **mỗi** package (`dlp-web`, `dlp-orchestrator`, `dlp-terminal-gateway`,
`dlp-sandbox-base`) — mở trang package → **Package settings**:

1. **Manage Actions access** → thêm repo `DevOps_Learning_Platform` với quyền
   **Write**. Thiếu bước này thì lần push thứ hai trở đi báo `denied: installation
   not allowed to Create organization package`.
2. **Visibility**:
   - **Public** — cluster kéo image không cần imagePullSecret. Đơn giản nhất, và
     đúng cho dự án NCKH. Lưu ý: image **là công khai** với cả thế giới.
   - **Private** — phải tạo imagePullSecret trên cluster và trỏ `imagePullSecrets`
     trong Helm values.

   > `values-selfhost.yaml` đặt `imagePullPolicy: Never` (image import thẳng vào
   > containerd trên node), nên deploy self-host **không phụ thuộc** lựa chọn này.

## 4. Tính năng bảo mật

**Settings → Code security**:

| Tính năng | Bật? | Ghi chú |
|---|---|---|
| Private vulnerability reporting | ✅ | [SECURITY.md](../../.github/SECURITY.md) trỏ vào đây; không bật thì link đó chết |
| Dependency graph | ✅ | Điều kiện cần cho Dependabot alerts |
| Dependabot alerts | ✅ | Cảnh báo CVE trong dependency |
| Dependabot security updates | ✅ | Tự mở PR vá |
| Secret scanning | nếu có | Của GitHub, **bổ sung** chứ không thay `gitleaks`. Trên repo private cần GHAS |
| Push protection | nếu có | Chặn secret **trước khi** lên server; `gitleaks` chỉ báo *sau* khi đã push. Cùng điều kiện GHAS |
| Code scanning / CodeQL | ✗ | **Không dùng được trên repo private nếu không có GHAS.** Xem ghi chú dưới |

### Vì sao không có CodeQL và dependency review

Cả hai đã được thử ở PR #2 và **đỏ ngay**:

```
Code scanning is not enabled for this repository.
Dependency review is not supported on this repository.
```

Cả hai đòi **GitHub Advanced Security**, thứ không có trên repo private của tài
khoản cá nhân. Chúng đã bị gỡ chứ không để lại — một workflow luôn đỏ là một
workflow bị phớt lơ, và nó huấn luyện người ta bỏ qua màu đỏ nói chung.

Thêm lại khi repo chuyển sang **public** (lúc đó cả hai miễn phí). Trong lúc đó,
mọi cổng thật sự chặn được thứ gì đều đang chạy: `gitleaks`, `govulncheck` (có
phân tích reachability), Dependabot alerts, Trivy (in ra log job).

## 5. Dependabot

[dependabot.yml](../../.github/dependabot.yml) đã có sẵn — không cần bấm gì thêm,
GitHub tự đọc khi file lên `main`.

Việc cần biết: PR của Dependabot chạy với **token quyền thấp** và **không đọc
được secret của repo**. CI hiện tại không dùng secret nào ngoài `GITHUB_TOKEN` tự
động, nên mọi cổng vẫn chạy bình thường trên PR của Dependabot.

## 6. Về `GITLEAKS_LICENSE`

Không cần. `gitleaks-action` chỉ đòi license key khi repo thuộc một **GitHub
Organization**. Repo cá nhân dùng miễn phí.

Khi nào chuyển repo sang org (vd tài khoản của trường) thì job `secret-scan` bắt
đầu đỏ với thông báo về license. Lúc đó: lấy key miễn phí ở
[gitleaks.io](https://gitleaks.io/), thêm vào **Settings → Secrets and variables →
Actions** với tên `GITLEAKS_LICENSE`, rồi thêm vào step gitleaks:

```yaml
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  GITLEAKS_LICENSE: ${{ secrets.GITLEAKS_LICENSE }}
```

## 7. Kiểm lại

Sau khi làm xong:

```bash
gh api repos/Nghaiz/DevOps_Learning_Platform/rulesets
gh api repos/Nghaiz/DevOps_Learning_Platform/actions/permissions/workflow
```

Rồi thử thật: mở một PR nháp, xác nhận `ci-ok` xuất hiện dưới dạng **required**,
và nút merge bị khoá cho tới khi nó xanh.
