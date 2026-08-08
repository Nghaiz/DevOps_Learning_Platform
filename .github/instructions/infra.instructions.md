---
applyTo: 'infra/**,.github/workflows/**,docker-compose.yml,**/Dockerfile'
---

# Hạ tầng và CI/CD

## Cô lập sandbox (`infra/helm/platform/templates/sandbox-*`)

Đây là ranh giới giữa một sinh viên có root trong pod và phần còn lại của
cluster. Nới lỏng bất kỳ thứ gì ở đây phải có lý do viết ra thành chữ:

- `egressExcept` **luôn phải** chứa `169.254.0.0/16` (link-local / endpoint
  metadata của cloud). Bỏ dòng đó là biếu không credential của node.
- `runtimeClassName: sysbox-runc` là bắt buộc, ép qua ValidatingAdmissionPolicy.
- Quota + LimitRange đi thành cặp: quota không có LimitRange thì pod không khai
  resources sẽ lách qua quota.
- `SANDBOX_NAMESPACE` của orchestrator phải khớp `sandbox.namespace` trong values.
  Lệch nhau là vỡ cô lập trong im lặng — pod sinh vào namespace không có
  NetworkPolicy.

## Workflow (`.github/workflows/`)

- Mọi action **ghim theo SHA**, kèm chú thích version. Tag `@v4` là tag di động.
- Mỗi job phải có `timeout-minutes`.
- `permissions:` khai ở mức hẹp nhất chạy được. Khai `permissions:` ở job là đè
  TOÀN BỘ mặc định — nhớ khai lại cả `contents: read` nếu job cần checkout.
- **Cổng giả** là lỗi nghiêm trọng ở đây: `if: always()` mà không kiểm
  `needs.*.result`, `|| true`, `continue-on-error` trên một cổng bảo mật, hoặc
  vòng lặp chờ rơi xuyên qua mà không `exit 1`.
- Baseline `buf breaking` chọn theo **vị trí** (đang ở trên main hay không), không
  theo loại event. So main với main là cổng luôn xanh.

## Docker / compose

- Service có state (postgres, redis) **phải** dùng named volume khai ở
  `volumes:` cấp trên. Anonymous volume trông y hệt rác prune được.
- Compose dev bind `127.0.0.1`, không phải `0.0.0.0`.
- Base image ghim tag cụ thể; version Go trong `go.work` phải khớp tag của base
  image Go — lệch nhau nghĩa là CI kiểm bằng một toolchain khác toolchain build
  ra image.
