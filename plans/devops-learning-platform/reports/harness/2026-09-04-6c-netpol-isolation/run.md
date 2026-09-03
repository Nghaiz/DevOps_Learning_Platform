# 6.C — chứng minh NetworkPolicy đang gác thứ mà quyết định 0.0.0.0 giao cho nó

Bỏ `--hostname=127.0.0.1` nghĩa là chuyển toàn bộ phần "không ai ngoài gateway
chạm được IDE" sang NetworkPolicy. Tuyên bố đó phải ĐO, không được tin.

## Cách chạy

```bash
scp pods.yaml <VM>:/tmp/6c-netpol.yaml
ssh <VM> 'kubectl apply -f /tmp/6c-netpol.yaml && kubectl wait -n dlp-sandbox \
  --for=condition=Ready pod/netpol-ide pod/netpol-attacker --timeout=150s'
# rồi 3 phép đo ở §Kết quả
```

`netpol-fake-gateway` (ns `default`) mang ĐÚNG ba nhãn selector của gateway thật.
Phải dựng pod giả vì gateway thật là **distroless — không có shell**, nên
`kubectl exec ... curl` bất khả thi (bẫy đã ghi ở `ghcr-network-stall-blocks-sideload`).

## Kết quả (2026-09-04)

| đường đi | trước khi vá egress | sau khi vá |
|---|---|---|
| `netpol-ide` → podIP **của chính nó**:4000 | **200** | 200 |
| `netpol-fake-gateway` → `netpol-ide`:4000 | timeout (curl 28) | **200** |
| `netpol-attacker` (pod sandbox khác) → `netpol-ide`:4000 | timeout (curl 28) | **timeout (28)** |

## Hai lần đối chứng dương cứu khỏi kết luận sai

**Lần 1.** Lượt đầu chạy trên image `ide-probe` build TRƯỚC khi entrypoint đổi
sang `0.0.0.0`, nên Theia vẫn chỉ nghe loopback. Đối chứng âm vẫn "đẹp" (attacker
bị chặn) — nhưng đối chứng dương ĐỎ (chính pod đó gọi podIP của mình cũng exit 7).
Không có nó thì "NetworkPolicy đang gác" được ghi vào report, trong khi sự thật là
**chẳng có gì để chạm**. Đúng lớp lỗi `green-that-proves-nothing`.

**Lần 2.** Sau khi sửa image, pod mang nhãn gateway VẪN timeout. Đó không phải lỗi
phép đo mà là một **lỗi thật của chart**: `sandbox-allow-ingress-gateway` mở vế
INGRESS, nhưng `platform-allow-egress-gateway` chỉ cho gateway đi tới web:3000,
orchestrator:9090, redis:6379 — **không có** sandbox:4000. NetworkPolicy cần CẢ
HAI vế; mở một vế rồi tưởng xong là chế độ hỏng kinh điển, và nó im lặng. Route
IDE sẽ trả 503 trên cụm với triệu chứng đọc ra là "IDE hỏng".

Sửa: thêm rule egress vào `platform-networkpolicy.yaml` (+ `gateway.ide.port`
trong values). Bảng trên là before/after của đúng rule đó.

## Phân biệt DROP với refused

`curl` exit **28** (timeout) = gói bị **DROP** ở policy. exit **7** = refused,
tức tới được đích mà không ai nghe. Hai mã này nói hai chuyện khác nhau và lẫn
chúng là chẩn đoán sai — chính là thứ đã xảy ra ở lần 1.
