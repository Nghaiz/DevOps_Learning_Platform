# Trần version — Sysbox ghim cụm, và hệ quả lên client-go

Tài liệu này tồn tại vì một ràng buộc **dây chuyền** mà trước đây chỉ sống trong comment của một
PR Dependabot — và comment đó biến mất khi Dependabot đóng PR để thay bằng PR khác. Ngày
2026-09-18 đúng chuyện đó xảy ra và một cú bump đi qua cổng mà không ai đo (§4).

## 1. Chuỗi ràng buộc

```
Sysbox 0.7.0  ──đỡ──▶  k8s 1.32 / 1.33 / 1.34   ──▶  cụm ghim ở v1.34.10
                                                       │
                                        client-go bump ▼ nới rộng khoảng lệch
```

- **Sysbox là nền của trụ sandbox** (RuntimeClass `sysbox-runc`) và của cổng P0.F. Tài liệu
  `install-k8s.md` của Sysbox khai hỗ trợ **v1.32.\* / v1.33.\* / v1.34.\***.
- Cụm đang ở **v1.34.10 — đúng mức trần**. Nâng k8s lên 1.35+ là đẩy cụm ra ngoài vùng Sysbox đỡ.
- Sysbox 0.7.1 (bản vá lỗi `mount through procfd` với containerd 2.x) **chưa có đường nâng trên
  k8s**: manifest ở cả tag `v0.7.1` lẫn `master` vẫn ghim `sysbox-deploy-k8s:v0.7.0-0`.
  Kiểm lại rẻ, một lệnh:

  ```bash
  curl -sS https://raw.githubusercontent.com/nestybox/sysbox/master/sysbox-k8s-manifests/sysbox-install.yaml | grep image:
  ```

  Thấy tag khác `v0.7.0-0` nghĩa là đã có đường nâng.

**Hệ quả:** trần k8s của cụm này **không phải một con số tạm thời chờ nâng**. Nó bị khoá bởi một
thành phần ở tầng dưới, và sẽ còn khoá cho tới khi Nestybox phát hành.

## 2. Vì sao điều đó chạm tới `k8s.io/client-go`

`k8s.io/client-go v0.X.Y` nhắm Kubernetes `v1.X.Y` (quy ước version của upstream). Nên:

| client-go | nhắm k8s | cụm | lệch |
|---|---|---|---|
| `v0.36.3` | 1.36 | 1.34.10 | 2 minor |
| `v0.37.0` (hiện tại) | 1.37 | 1.34.10 | **3 minor** |

Vì cụm **không nâng được**, mỗi lượt bump client-go nới khoảng lệch thêm một nấc và không bao giờ
thu lại. Đây là lý do **cấu trúc** để bảo thủ với riêng nhóm `k8s.io/*`, khác hẳn các dependency
thường (pgx, go-jose, golang.org/x) vốn không có ràng buộc tương ứng ở tầng dưới.

## 3. Cổng bắt buộc cho mọi bump `k8s.io/*`

Nhóm `k8s.io/api` · `k8s.io/apimachinery` · `k8s.io/client-go` chạm **đúng tầng mà reaper và
warm pool đứng trên**. Cổng CI Go (build + vet + test + lint + vuln) bắt được **lỗi biên dịch**,
nhưng **đổi hành vi** của client-go — watch, informer, retry, hình dạng lỗi trả về — thì nó
**không** bắt được. Một lượt CI xanh KHÔNG đủ để gộp.

**Trước khi gộp, phải đo trên cụm và ghi lại số:**

1. `dlp_reaper_*` — đặc biệt `sweep_failures_total` (phải 0), `keyspace_events_total` (tầng 1 còn
   bắn), `claimed_orphan_total` (tầng 2 còn quét).
2. **Vòng đời hết hạn end-to-end** — session hết hạn ⇒ pod **bị xoá thật** ⇒ có dòng
   `sessions_audit.event='expired'`. Dòng log mang `actor` chỉ thuộc đường reap tường minh, nên
   **đừng tìm bằng chứng hết-hạn ở đó** (xem `docs/` lịch sử + memory `reaper-expiry-evidence`).
3. **Lượt claim pod thật** — `dlp_claim_duration_seconds{path="warm"}` có tăng, `dlp_claim_dead_pod_total`
   giữ 0.
4. **Bù pool** — `dlp_pool_replenish_failures_total` giữ 0 và pool quay lại `POOL_TARGET`.

Metrics nằm ở cổng **`http` = 8081** của orchestrator (`9090` là **gRPC**, `curl` vào đó trả rỗng):

```bash
kubectl port-forward -n default deploy/platform-orchestrator 18081:8081
curl -s http://127.0.0.1:18081/metrics | grep -E '^dlp_(reaper|pool|claim|cold)'
```

## 4. Lượt đo đã chạy cho `v0.37.0` — ĐẠT (2026-09-18)

Bump `0.36.3 → 0.37.0` vào `main` ở PR #127 (squash `64cb6f3`), deploy lên cụm trong RC
`sha-f6d2922`. Cổng §3 được chạy **sau** khi gộp — đúng ra phải chạy **trước**, xem §5.

| Phép đo | Kết quả |
|---|---|
| `dlp_reaper_sweep_failures_total` | **0** |
| `dlp_reaper_keyspace_events_total` | 6 (tầng 1 còn bắn) |
| `dlp_reaper_claimed_orphan_total` | 2 (tầng 2 quét và bắt được) |
| Hết hạn end-to-end | 2 dòng `sessions_audit.event='expired'` lúc `02:32:14Z`; **cả hai pod xác nhận đã bị xoá** |
| Bù pool | pool trở lại `free_size 3` bằng 2 pod MỚI; `replenish_failures_total` **0**, `quota_blocked` **0** |
| Claim | `warm` count=2, sum `0.0555s` ⇒ **~27,7 ms/lượt**; `dead_pod_total` **0**; `cold_path_total` 0 |
| Log orchestrator | **2 dòng / 25 phút**, không lỗi watch/informer/retry |
| Chạy liên tục | **~2 giờ** trạng thái ổn định, 0 lỗi ở mọi counter |
| Tự-pentest 10 luật | **10/10 an toàn, 10/10 đối chứng dương đỏ** trên chính build này |

**Kết luận:** `v0.37.0` chạy đúng trên cụm 1.34.10. Chủ dự án chốt **giữ 0.37** (2026-09-18).

⚠ Phép đo này phủ các đường **đã chạy trong ~2 giờ tải nhẹ**. Nó KHÔNG phủ: apiserver restart giữa
chừng (watch reconnect), các resource version hiếm, hay hành vi lỗi ở biên. Khoảng lệch 3 minor
vẫn là một khoản rủi ro đang mở, không phải một câu hỏi đã đóng.

## 5. Bẫy đã trả giá: gate nằm ở PR bị Dependabot THAY THẾ

Cổng §3 ban đầu được ghi làm **comment trên PR #105**. Dependabot **đóng #105** ("updatable in
another way") và mở **#127** gom rộng hơn — mang đúng cú bump `k8s.io/*` đó nhưng **không thừa kế
comment**. Người gộp #127 đọc thấy CI xanh và gộp, không biết có cổng.

**Luật rút ra:** trước khi gộp bất kỳ PR Dependabot nào, đọc comment trên **chính PR đó** VÀ trên
các **PR tiền nhiệm đã bị đóng-thay-thế** cho cùng nhóm dependency. Và đó là lý do ràng buộc này
nay nằm ở đây, trong `docs/` của repo, chứ không chỉ trong comment của một PR có thể biến mất.

## Liên quan

- `infra/host/README.md` — dựng node Sysbox, cổng `04-verify-sysbox.sh` (P0.F).
- `docs/k8s-in-pod.md` — cluster con trong pod, một tầng version khác hẳn tầng này.
