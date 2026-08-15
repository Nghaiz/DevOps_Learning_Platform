# 3.I mắt 1 — Registry mirror docker.io + mở đường học Docker

**Ngày:** 2026-08-15 · **Chặng:** 3.I (mắt 1/5) · **Cụm:** lab 1-node
192.168.94.130 · **Deploy:** helm revision 72, tag đo `3i-m1` (xây tay, xem §7).

## 0. Một câu

Sandbox giờ `docker pull`/`docker build` được **qua mirror trong cụm**, mà luật 10
vẫn 10/10: IMDS, apiserver, và **mọi host internet ngoài mirror** vẫn bị chặn —
đo có đối chứng dương. Trụ cột "học Docker" từ **không có đường chạy** thành
**chạy được**.

## 1. Chuỗi 5 mắt — lượt này làm mắt 1

Mắt 1 = mở đường (mirror + egress + chấm lại luật 10 + chứng minh docker chạy).
Mắt 2–5 (viết bài Docker → đo tải thật → đặt `requests` → nới quota → đo lại trần)
**hoãn**: chúng cần tải bài học thật để đo, mà tải đó chỉ tồn tại SAU khi mắt 1
mở được đường pull. Xem plan §3.I.

## 2. Kiến trúc đã dựng

| Thành phần | Chốt |
|---|---|
| Mirror | `registry:2` chế độ proxy/pull-through, upstream **CHỈ** `registry-1.docker.io` |
| Vị trí | ns **mới `dlp-registry`** (ngoài `dlp-sandbox` — mirror có state + egress internet) |
| Inject | env `DLP_REGISTRY_MIRROR` → entrypoint ghi `/etc/docker/daemon.json` TRƯỚC `start_dockerd`; env rỗng = hành vi cũ |
| TLS | HTTP trong cụm; daemon.json có cả `registry-mirrors` LẪN `insecure-registries` (dockerd từ chối mirror http nếu host không insecure) |
| Egress sandbox | thêm ĐÚNG một chiều: sandbox → pod mirror:5000. default-deny giữ nguyên |

⚠ **Phạm vi CHỈ docker.io** (khai thẳng, không hạ chuẩn im lặng): dockerd
`registry-mirrors` chỉ mirror TRONG SUỐT được Docker Hub. ghcr/quay/gcr KHÔNG đi
qua mirror và **vẫn bị egress sandbox chặn** — luật 10 không nới về hướng đó.

## 3. Acceptance criteria — kết quả

| Ô | Kết quả | Bằng chứng |
|---|---|---|
| **AC-I1** mirror proxy docker.io | ✅ | `/v2/` → 200; log mirror phục vụ blob `library/python` từ upstream |
| **AC-I2** `docker pull python:3.12-slim` trong sandbox | ✅ | `Status: Downloaded` — chính lệnh "chết sau 63s" ở 3.H |
| **AC-I3** `docker build FROM ubuntu:24.04` | ✅ | build rc=0 trong sandbox thật |
| **AC-I4** luật 10 vẫn 10/10, có đối chứng dương | ✅ | xem §4 |
| **AC-I5** mirror THỰC SỰ được dùng | ✅ | daemon.json ghi đúng; `docker info` liệt kê mirror; log mirror có dòng phục vụ |
| **AC-I6** env rỗng = hành vi cũ (không hồi quy) | ✅ | image mới + env rỗng → **không** ghi daemon.json; unit `TestRegistryMirrorEnv` |
| **AC-I7** không hồi quy | ✅ | netpol-verify **22/22**, e2e P2 **14/14**, reaper (§5) |
| **AC-I8** helm render sạch, tắt cờ = hệ cũ | ✅ | `helm template`+`kubeconform` **42/42**; tắt `registryMirror.enabled` ⇒ **0** artifact mirror |
| **AC-H9** nợ gateway tag | 🟡 | đóng trên lượt CI publish của mắt này — xem §7 |
| **AC-H7** idleTimeout Traefik giết WS im lặng? | ✅ | KHÔNG — xem §6 |

## 4. AC-I4 — luật 10 chấm lại, với đối chứng dương

Đo từ TRONG sandbox thật (image `3i-m1`, có env mirror):

| Chiều | Kỳ vọng | Đo được |
|---|---|---|
| → `169.254.169.254` (IMDS) | CHẶN | `curl rc=28` (timeout) ✅ |
| → apiserver `10.96.0.1:443` | CHẶN | `rc=28` ✅ |
| → internet `1.1.1.1:443` | CHẶN | `rc=28` ✅ ← **ô mới** |
| → internet `github.com:443` | CHẶN | `rc=28` ✅ ← **ô mới** |
| → **mirror:5000** | THÔNG | `rc=0 http=200` ✅ **đối chứng dương** |

Đối chứng dương (mirror thông) chứng minh mấy chiều "chặn" ở trên là **netpol
enforce**, không phải mạng chết: cùng một đường egress, chỉ mirror được mở. E2E
14/14 chạy lại cùng khẳng định qua đường session đầy đủ: `169.254` chặn, internet
chung `exit=28` — mirror KHÔNG làm yếu cách ly.

## 5. AC-I7 — không hồi quy

- **netpol-verify: 22/22, 0 lệch.** Mọi chiều thông vẫn thông, mọi chiều chặn vẫn
  chặn (gồm `web → internet 1.1.1.1` BLOCK, `POD LẠ → *` BLOCK). Netpol nền tảng
  không bị mirror đụng.
- **e2e P2 harness: 14/14 PASS.** Đăng ký → session → AC pass/fail → asset-push →
  isolation → sessionId lạ NÉM lỗi. Chạy qua Traefik `:30443`, image sandbox mới.
- **reaper-verify: 14/14, 0 fail** (run sạch, quota trống). Một run trước đó cho
  13/14 với ô AC-C3 vế 1a đỏ — chứng minh được là **nhiễu môi trường**: e2e harness
  chạy song song claim thêm pod làm lệch delta đếm `pool:claimed`; run cô lập (không
  test nào khác chạm cụm) cho 14/14. Reaper/pool KHÔNG bị 3.I đụng (chỉ thêm egress
  netpol + env orchestrator + entrypoint).

## 6. AC-H7 — idleTimeout Traefik KHÔNG giết WS im lặng

Report 3.H (§7 nợ #3) mới **suy luận** "ping 20s < idle 180s nên sống". Ô này biến
nó thành **phép đo**, qua chính Traefik (`wss://…:30443`, không qua ClusterIP):

```
ca hold · giữ 1 WS IM LẶNG 3m20s, phải sống qua mốc idle Traefik 3m0s
sống được: 3m20s · trạng thái: còn sống · expiring: 0
PASS AC-H7: WS im lặng sống 3m20s > mốc idle Traefik v3 3m0s
```

- Traefik chạy KHÔNG arg idle-timeout ⇒ mặc định v3 = 180s.
- WS giữ **hoàn toàn im lặng** (không stdin/stdout) 200s, chỉ còn ping 20s của
  gateway trên kết nối. `expiring=0` xác nhận KHÔNG có lượt gia hạn ứng dụng nào
  can thiệp — phiên sống thuần nhờ kết nối không bị đóng.
- Kết: **Traefik KHÔNG áp idleTimeout lên kết nối WebSocket đã upgrade.** Một WS
  đứt-KHÔNG-lời (1006-like) quanh mốc 180s sẽ là ĐỎ; thấy "còn sống" ⇒ biên để yên.

Công cụ: thêm ca `hold` + cờ `-insecure` vào `session-probe` (cert lab tự ký; ca
hold BẮT BUỘC đi qua Traefik nên phải bỏ verify TLS). Logic ô này phân biệt
"sống tới hết hold" (conSong) với "đứt-không-lời quanh mốc idle" (closeCode=-1) —
hai thứ dễ lẫn nếu chỉ đọc `err`.

## 7. Nợ 3.H gộp lượt này

1. **~/dlp-deploy lệch repo — ĐÃ SỬA.** Bẫy: `~/dlp-deploy` là **bản chép tay**
   chart (đồng bộ ở commit 595e20b, thiếu template 3.C/3.F/3.H), KHÔNG phải git
   repo, nên `helm upgrade` từ đó lặng lẽ gỡ mọi thay đổi template sau lần chép.
   Sửa: script mới `infra/host/12-helm-deploy.sh` LUÔN ship chart TƯƠI từ repo
   (tar-over-ssh) lên thư mục mới rồi upgrade từ đó; bí mật đọc `helm get values`
   NGAY TRÊN VM (không rời VM, không vào git). Deploy lượt này chạy qua chính
   script đó (rev 72). Script cũng vô hiệu hoá `~/dlp-deploy` (thay bằng biển
   DEPRECATED) để không ai upgrade nhầm từ bản cũ nữa.
2. **AC-H9 gateway tag — đóng trên lượt CI kế.** Phát hiện: `sha-a8510e9` (commit
   3.H) **chưa từng** được publish lên ghcr — image drain chỉ tồn tại dưới tag tay
   `3h-drain2`. Nên AC-H9 không đóng được chỉ bằng "ghim tag": cần một sha đã
   publish có mã drain. Đường đóng sạch: mắt 1 này merge → CI publish
   `sha-<mainsha>` cho CẢ 5 image (gồm gateway rebuild có drain + orchestrator +
   sandbox-base mới) → bump `image.tag` trong `values-selfhost.yaml` sang sha đó
   (gateway kế thừa `image.tag`, `gateway.image.tag` để rỗng) → sideload → upgrade
   KHÔNG `--set` nào. Lúc đó AC-H9 đóng trọn (khẳng định trên đối tượng sống). Đây
   là **bước sau merge**, một dòng values.
3. **AC-H7** — xem §6.

## 8. Nợ còn lại

- **Tag đo `3i-m1` là tag tay**, không phải sha CI — vì đo TRƯỚC merge. Bản pinned
  sạch = bump `image.tag` sang `sha-<mainsha>` sau CI (chung bước với AC-H9 §7.2).
  Lượt này KHÔNG đụng `image.tag` gốc (`sha-25cb824`); chỉ override
  `orchestrator.image.tag`/`sandboxImage` qua overlay đo, không nằm trong git.
- **Mắt 2–5** (bài Docker → đo tải → `requests` → nới quota → đo trần) — chưa làm.

## 9b. Siết bảo mật từ code review (8.5/10, không lỗi chặn)

Review đối kháng xác nhận đường không-hồi-quy, tính toàn vẹn default-deny, và URL
mirror suy từ SSOT đều đúng. Ba mục phòng-thủ-chiều-sâu đã vá TRƯỚC merge:

1. **Siết pod mirror** — nó là workload phơi-internet nhất. Thêm
   `runAsNonRoot:1000` + `fsGroup:1000` + `readOnlyRootFilesystem` + `drop:[ALL]` +
   seccomp `RuntimeDefault` + `automountServiceAccountToken:false`, và nhãn PSA
   `enforce: restricted` trên ns `dlp-registry` để admission ÉP chứ không chỉ khai.
   Đã kiểm trên cụm: pod lên `Running 0 restart`, `/v2/` 200, `docker pull` chạy.
2. **Bỏ verb DELETE cho tenant** — `REGISTRY_STORAGE_DELETE_ENABLED` gỡ bỏ. Trước
   đó mọi sandbox `DELETE /v2/.../manifests/...` được (ingress mở cho cả ns
   sandbox, không auth) → một học viên xoá manifest trong cache dùng chung, người
   khác miss cache. Dọn cache là việc OFFLINE, không cần verb qua mạng.
3. **DRY tập CIDR chống-pivot** — `sandbox.egressExcept` và
   `registryMirror.egressExcept` gộp về một YAML anchor `&internalPivotCidrs`.
   Hai bản rời sẽ trôi khi CIDR cụm đổi và mở lại đúng đường vòng cả hai đóng.

### ⚠ Bẫy chuyển tiếp: siết non-root trên PVC đã có dữ liệu do root ghi

Siết `runAsNonRoot` LÀM VỠ mirror ở lượt deploy chuyển tiếp, và triệu chứng đánh
lạc hướng: `/v2/` (readiness) vẫn **200** nên pod `Ready`, nhưng `docker pull` trả
**500** với `mkdir …/repositories/library/…: permission denied`. Nguyên nhân:
cache 72M ở PVC do lượt deploy TRƯỚC (chạy root) ghi, thư mục con thuộc `root:root`;
UID 1000 không `mkdir` vào được. `fsGroup` chowns đỉnh PVC nhưng KHÔNG chữa cây
con root-owned có sẵn. **Bản cài SẠCH không dính** (PVC rỗng, fsGroup ghi từ đầu).
Chữa cụm này: scale 0 → xoá PVC (cache tái tạo được, không phải dữ liệu) → helm
upgrade dựng PVC mới → pod non-root ghi được. `readOnlyRootFilesystem` KHÔNG phải
thủ phạm (registry proxy chỉ ghi PVC, không ghi rootfs — đã kiểm `touch` PVC OK).

## 9. Trình tự tái lập

```bash
# xây + sideload 2 image đổi (orchestrator có env, sandbox-base có entrypoint)
docker build -f services/orchestrator/Dockerfile -t ghcr.io/nghaiz/dlp-orchestrator:3i-m1 .
docker buildx build --platform=linux/amd64 -f images/sandbox-base/Dockerfile \
  -t ghcr.io/nghaiz/dlp-sandbox-base:3i-m1 --load images/sandbox-base
# (docker save → scp → sudo ctr -n k8s.io images import  cho mỗi image; registry:2 cũng sideload)

# deploy qua script chart-tươi (mirror bật ở values-selfhost, overlay đo ghim tag)
bash infra/host/12-helm-deploy.sh -f <scratchpad>/deploy-3i-m1.yaml

# chứng minh docker + chấm luật 10 (trong sandbox thật)
POD=$(kubectl -n dlp-sandbox get pods -l app=sandbox -o name | head -1)
kubectl -n dlp-sandbox exec $POD -c sandbox -- bash -lc 'docker pull python:3.12-slim'

# hồi quy
NS=default bash infra/k8s/netpol-verify.sh          # 22/22
bash infra/k8s/reaper-verify.sh --case all
O=https://dlp.192.168.94.130.sslip.io:30443
cd plans/.../harness/2026-08-13-2d-lessons-e2e && \
  BASE_URL=$O ORIGIN=$O NODE_TLS_REJECT_UNAUTHORIZED=0 node e2e-lessons.mjs   # 14/14

# AC-H7 (qua Traefik, cert tự ký)
/tmp/session-probe -case hold -budget 200s -insecure -web $O -gateway wss://dlp.192.168.94.130.sslip.io:30443 -origin $O
```
