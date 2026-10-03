# content-smoke — kiểm nội dung trên cụm thật

Một lệnh chứng minh mọi bước của bài học và mọi task của lab chạy được trên
sandbox thật, ở cả hai trạng thái: verify **trượt** trước khi làm và **đạt** sau
khi làm. Hợp đồng: `plans/labs-rebuild/contracts.md` §C1–C3.

## Chạy

```bash
node scripts/content-smoke/smoke.mjs lesson dlp-docker-basics
node scripts/content-smoke/smoke.mjs lab dlp-linux-triage
node scripts/content-smoke/smoke.mjs all                    # mọi bài + lab, tuần tự
node scripts/content-smoke/smoke.mjs teardown               # gỡ namespace, netpol, pod của harness
```

Cờ hay dùng:

| Cờ | Nghĩa |
|---|---|
| `--only-step 3` | bài học: kiểm riêng bước 3 (bước 1–2 chỉ chạy lệnh để dựng trạng thái) |
| `--only-task <id>` | lab: kiểm riêng một task |
| `--keep` | giữ pod lại, in lệnh `kubectl exec … tmux attach -t dlp` để vào đúng terminal harness đã gõ |
| `--image <ref>` | image sandbox khác (mặc định: `SANDBOX_IMAGE` của orchestrator đang chạy) |
| `--content-root <dir>` | gốc nội dung khác (mặc định `content/`, chứa `scenarios/` và `labs/`) |
| `--timeout <s>` | trần mỗi khối exec / `solution.sh` (mặc định 300) |
| `--max-pods <N>` | trần pod smoke cùng lúc trên máy này, mọi tiến trình cộng lại (mặc định 2) |
| `--concurrency <N>` | `all`: số nội dung chạy song song (vẫn bị `--max-pods` chặn) |

Mã thoát: `0` đạt hết · `1` nội dung lệch hợp đồng · `2` hạ tầng hỏng (pod không
lên, kubectl lỗi) — lỗi loại 2 không phải lỗi của bài.

Báo cáo: `plans/labs-rebuild/reports/smoke/<id>.md` (người đọc, độ lệch ở đầu) và
`<id>.json` (máy đọc). `all` ghi thêm `_summary.md`.

## Harness làm gì

1. Pod ở namespace `dlp-content-smoke` (KHÔNG BAO GIỜ `dlp-sandbox` — reaper xoá pod
   không có phiên sau 5 phút). Podspec chép `BuildSandboxPod`; image, runtimeClass,
   mirror, profile đọc sống từ Deployment orchestrator; 4 netpol chép từ
   `dlp-sandbox` + 1 netpol ở `dlp-registry` mở mirror cho namespace này.
2. Chờ dockerd (và `dlp-k8s-wait` với profile k8s), mở tmux `dlp` ở `/root` với zsh
   — đúng terminal của người học.
3. **Bài học**: setup như `lessons.runSetup` (công cụ → asset → background), gõ
   `foreground` vào terminal; mỗi bước: verify trước → gõ từng khối `{{exec}}` vào
   tmux (cwd, biến, job nền sống qua các bước) → `stepN/solution.sh` nếu có → verify sau.
4. **Lab**: setup như `labs.startAttempt` (background phóng rời + sentinel); mỗi task:
   verify trước → `bash task-<id>/solution.sh` trong terminal → verify sau; cuối cùng
   chấm lại mọi task.
5. Verify chạy ĐÚNG như server: `withVerifyPrelude(script)` qua STDIN của `bash`, cwd `/`.

Mọi hàm sản phẩm (prelude, loader, `setupScriptPlan`, asset push, phóng background)
được IMPORT từ mã thật, không chép — xem `lib/product.mjs`.

## Đọc độ lệch

| Mã | Nghĩa | Sửa ở đâu |
|---|---|---|
| `pre-pass` | verify đạt trước khi làm — không phân biệt trước/sau | verify phải kiểm thứ người học tạo ra |
| `post-fail` | làm xong mà verify vẫn trượt | khối exec / solution / verify |
| `regress` | task đã đạt, bị lời giải task sau phá | lời giải chạm trạng thái của task khác |
| `missing-solution` / `no-action` | không có cách tự động làm bước/task | thêm `solution.sh` (§C2) |
| `exec-hang` | khối `{{exec}}` không tự kết thúc | dùng `{{copy}}` cho lệnh chạy mãi (§C3) |
| `slow` | verify > 20s trong pod (đã trừ ~1s chi phí exec) | §C1 |
| `no-criteria` | verify của lab không in dòng ✓/✗ | dùng `pass`/`fail`/`check` (§C1) |
| `setup-failed` | setup thoát ≠ 0 / background không xong | script setup |

Cảnh báo `shell-error` = zsh báo lỗi trong terminal (người học sẽ thấy dòng đó);
`exec-rc` = một khối exec thoát ≠ 0.

## Lưu ý

- Cụm một node: tối đa 2 pod smoke cùng lúc (file khoá trong `%TEMP%/dlp-content-smoke-slots`).
  Pod `--keep` KHÔNG giữ khe — xoá nó khi xong (`kubectl delete pod -n dlp-content-smoke <pod>`).
- Ctrl-C xoá pod. Harness chết cứng thì pod tự hết hạn sau 1 giờ (`activeDeadlineSeconds`).
- `solution.sh` chỉ harness đọc, từ đĩa. Loader không đọc, không route nào phục vụ.
- Fixture: `fixtures/labs/smoke-fixture-ok` (phải xanh), `fixtures/labs/smoke-fixture-broken`
  (phải đỏ 4 độ lệch). Chạy: `node scripts/content-smoke/smoke.mjs all --content-root scripts/content-smoke/fixtures`.
