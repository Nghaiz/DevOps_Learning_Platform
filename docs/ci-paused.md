# CI đang TẠM DỪNG — và cách bật lại

**Bật từ:** 2026-09-04 · **Điều kiện gỡ:** hoàn thành phase 14
**Ai quyết định:** chủ dự án · **Lý do:** dồn sức làm hết các phase, không chờ cổng.

## Đang tắt cái gì

| Thứ | Trạng thái | Nằm ở |
|---|---|---|
| `ci.yml` — 8 job (`proto`, `ts`, `go`, `infra`, `sandbox-image`, `terminal-browser`, `ci-ok`, `images`) | chỉ chạy khi **gọi tay** | `.github/workflows/ci.yml` khối `on:` |
| Branch protection `main` (đòi `ci-ok` xanh, strict) | **đã gỡ** | GitHub repo settings |
| Hook `pre-push` chặn push thẳng lên `main` | **no-op** (`exit 0` ở đầu) | `scripts/git-hooks/pre-push` |

## KHÔNG tắt

**Quét secret (`gitleaks`) vẫn chạy mọi push** — tách sang
`.github/workflows/secret-scan.yml`.

Vì bảy cổng kia gác những thứ hỏng-thì-sửa-được-sau. Cổng này gác thứ duy nhất
mà bật lại CI ở phase 14 **không cứu được**: một secret đã nằm trong lịch sử git
thì phải xoay khoá và rewrite history. Nó chỉ **báo**, không chặn push.

Hook local `secret-guard.cjs` (kit) vẫn chặn stage/commit file nhạy cảm ở tầng máy.

## Nợ mà quyết định này tạo ra

Từ 2026-09-04 tới lúc bật lại, **không có gì đảm bảo** trên mỗi commit:

- kiểu TypeScript, lint, unit test (`ts`)
- build/vet/test/lint/govulncheck Go (`go`)
- helm template + kubeconform + shellcheck + actionlint (`infra`)
- `buf` breaking-change + `pnpm proto:check` (generated khớp committed) (`proto`)
- build thử `sandbox-base` + hai cổng `sha256sum -c` (`sandbox-image`)
- smoke terminal trên Chromium (`terminal-browser`)
- build & push image lên ghcr (`images`) — **kể cả trên `main`**

⚠ Hệ quả cụ thể đã lường trước: job `images` không chạy nghĩa là **không có tag
`sha-<short>` mới nào cho `dlp-sandbox-base`**. Chart ghép `sandboxImage` từ
`image.tag`, nên deploy trỏ vào tag chưa tồn tại sẽ `ImagePullBackOff`. Trong
giai đoạn này phải build + side-load image **bằng tay** (đường
`docker save → scp → ctr import` như 5.A), hoặc gọi tay `gh workflow run ci.yml`.

⚠ `pnpm repo:check` (`scripts/check-repo-settings.mjs`) sẽ **đỏ** vì nó khẳng
định branch protection tồn tại. Đó là đỏ ĐÚNG — đừng sửa script để nó xanh.

## Bật lại (phase 14)

Ba việc, theo thứ tự:

```bash
# 1) Đảo commit đã tắt (phục hồi on:, hook pre-push; xoá secret-scan.yml tách rời)
git revert <sha-của-commit "chore(ci): tạm tắt cổng CI">
rm -f .github/workflows/secret-scan.yml     # nếu revert chưa xoá — tránh quét trùng
git config core.hooksPath scripts/git-hooks # nếu chưa trỏ

# 2) Khôi phục branch protection từ bản sao lưu nguyên trạng
gh api -X PUT repos/:owner/:repo/branches/main/protection \
  --input <(python -c "
import json;d=json.load(open('docs/branch-protection-main.backup.json'))
print(json.dumps({
 'required_status_checks':{'strict':d['required_status_checks']['strict'],
                           'contexts':d['required_status_checks']['contexts']},
 'enforce_admins':d['enforce_admins']['enabled'],
 'required_pull_request_reviews':{k:v for k,v in d['required_pull_request_reviews'].items() if not k.endswith('url')},
 'restrictions':None}))")

# 3) Chạy CI đầy đủ MỘT LƯỢT trên main và đọc hết cái đỏ — đây là lúc trả nợ
gh workflow run ci.yml --ref main && gh run watch
```

⚠ Bước 3 sẽ đỏ **nhiều chỗ cùng lúc**, và đó là chuyện bình thường của quyết định
này chứ không phải dấu hiệu hỏng. Đọc theo thứ tự `proto` → `ts`/`go` → `infra`
→ image; sửa từ tầng contract lên, đừng sửa song song.

Bản sao lưu nguyên trạng branch protection: `docs/branch-protection-main.backup.json`.
