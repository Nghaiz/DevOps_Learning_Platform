# Phase 7 — K8s trong pod: mở năng lực `kubernetes`

**Mức chi tiết:** DETAILED · **Effort:** L · **Blocks:** P8 (lab K8s), P11 (CTF K8s) · **Blocked by:** P5

> **Đây là khoảng trống lớn nhất giữa "nền tảng học DevOps" và thứ đang chạy.** Đo được hôm nay: `RUNTIME_SUPPORTED_CAPABILITIES = ['docker']` (`apps/web/src/server/lessons/catalog.ts:48`), và `kubectl` **không có** trong `images/sandbox-base/Dockerfile`. Bài `ckad-configmap-as-files` — chính bài mà plan P2 chỉ định làm bằng chứng pass/fail — mở lên là một dải cảnh báo vàng *"nền tảng chưa chạy được năng lực này"*. Một nền tảng học Kubernetes chưa chạy được Kubernetes.

## Objective

Người học mở một bài có `capabilities: ["kubernetes"]`, gõ `kubectl get nodes`, và **nhận về một cluster thật của riêng mình** — tạo được Deployment, ConfigMap, Service; verify script chấm đúng; và cô lập không tụt so với luật 10.

## Ba đường, đo rồi chọn — KHÔNG chốt trước

| Đường | RAM ước | Cô lập | Ghi chú phải kiểm |
|---|---|---|---|
| **kind** trong Sysbox | ~1.5–2Gi | pod Sysbox, cluster riêng hoàn toàn | `kindest/node` nằm trên **docker.io** ⇒ mirror hiện có phủ được (xem dưới) |
| **k3s** trong Sysbox | ~0.5–1Gi | như trên, nhẹ hơn | image `rancher/k3s` cũng trên docker.io |
| **vcluster** trỏ về cụm thật | ~0.2Gi | **KÉM NHẤT** — API ảo nhưng workload chạy trên cụm chủ | phải chứng minh không thoát sang namespace khác trước khi cân nhắc |

⛔ **Ràng buộc mirror phải đọc trước khi ước lượng:** mirror trong cụm (3.I mắt 1) chốt **CHỈ `docker.io`** — `registry.k8s.io` KHÔNG được phủ. `kindest/node` và `rancher/k3s` bundle sẵn image hệ thống bên trong nên có thể không cần `registry.k8s.io` lúc chạy; **đó là giả thuyết, không phải sự thật** — 7.B phải chạy thật rồi mới kết luận.

⛔ **RAM là ràng buộc quyết định, không phải CPU.** Node có 11.6Gi. Nếu một bài K8s tốn 2Gi thì trần đồng thời của LOẠI bài đó là ~5, không phải 18. Con số ấy phải được nói thẳng ra chứ không giấu trong một `requests` chung.

## Task list

### 7.A — kubectl vào image (rẻ, làm trước, không phụ thuộc gì)

1. `kubectl` ghim version khớp cụm (v1.34.x), `sha256sum -c` như mọi binary khác. Cân nhắc `INCLUDE_KUBECTL` riêng hay gộp vào `INCLUDE_K8S`.
2. Chỉ có `kubectl` **chưa** mở được `capabilities: kubernetes` — nó cần một cluster để trỏ tới. Đừng cập nhật `RUNTIME_SUPPORTED_CAPABILITIES` ở bước này (sẽ thành một lời hứa sai).

### 7.B — Đo ba đường, trên cụm thật

3. Mỗi đường: dựng trong một pod Sysbox, đo trên host bằng cgroup — **thời gian tới `kubectl get nodes` trả Ready** · workingSet đỉnh · CPU-giây · dung lượng đĩa tạm · **có phải kéo `registry.k8s.io` không** (bắt bằng NetworkPolicy đang deny-all: nếu nó cần, nó sẽ TREO, và đó là câu trả lời).
4. Đối chứng: cùng pod, không dựng cluster — để biết phần thêm.
5. `docs/k8s-in-pod.md`: bảng số ba đường, đường được chọn, **và số của hai đường bị loại**.

### 7.C — Đường được chọn thành một profile sandbox

6. Profile `k8s` với `requests`/`limits` riêng, đặt theo **đỉnh đo được**, không theo trung vị (bài học từ `sandbox-quota-is-misconfigured-not-hardware`: đặt theo trung vị là thiết kế cho một nửa số lượt).
7. Trần đồng thời của profile này tính lại theo **min của năm ràng buộc** và ghi phép tính vào values — như bộ số 21-pod hiện tại đã làm.
8. **Quyết định phải nêu rõ:** một pool ấm riêng cho bài K8s (claim nhanh, tốn RAM thường trực) hay cold-path (rẻ, chờ 1–3 phút). Đo thời gian dựng ở 7.B rồi quyết; nếu > 60s thì cold-path là không dùng được và pool riêng là bắt buộc.

### 7.D — Mở năng lực, có cổng

9. Chỉ khi 7.B + 7.C xong: thêm `'kubernetes'` vào `RUNTIME_SUPPORTED_CAPABILITIES`. Comment ở đó (`catalog.ts:65`) đã ghi sẵn đây là đường đóng — giữ đúng lời hứa ấy.
10. `multi-node` **vẫn ở lại danh sách chưa hỗ trợ** trừ khi kind multi-node được đo và vừa RAM. Đừng mở kèm.

### 7.E — Bài CKAD chạy end-to-end

11. `ckad-configmap-as-files` chạy trọn: setup → thao tác → `verify.sh` **pass thật**, và một lượt cố tình làm sai **fail thật**.
12. ⚠ Nhớ bẫy `execShell`: `sh` là dash, không có `pipefail`; chart đã chốt `execShell: bash`. Verify script của bài này dùng `[[ ]]` và `set -euo pipefail` — nếu vẫn hỏng thì đọc `output`, đừng đọc `passed:false` (xem `shell-error-masquerades-as-wrong-answer`).
13. Thêm một bài first-party `dlp-k8s-basics` không phụ thuộc license upstream, dùng làm bài chuẩn cho phép đo về sau.

### 7.F — Cô lập không tụt

14. Chạy lại **toàn bộ** `netpol-verify.sh` (22/22) với pod có cluster bên trong — một cluster con có CNI riêng là một đường mạng mới, và nó phải không chọc thủng deny-all của pod ngoài.
15. Escape test: từ trong cluster con, thử chạm apiserver của cụm CHỦ và `169.254.169.254`. Cả hai phải trượt.
16. `dlp-cni-canary` (CronJob đang chạy) không được nhiễu vì profile mới.

## File / dir ownership

`images/sandbox-base/Dockerfile` · `infra/helm/platform/{values.yaml,values-selfhost.yaml}` · `infra/k8s/{netpol-*,*.sh}` · `services/orchestrator/internal/k8s/podspec.go` (profile) · `apps/web/src/server/lessons/catalog.ts` · `packages/scenario/src/backend.ts` · `content/scenarios/dlp-k8s-basics/**` · `docs/k8s-in-pod.md`

## Dependencies

- **Blocked by:** P5.
- **Blocks:** P8 (lab K8s đa bước), P11 (CTF trên K8s).
- Độc lập với P6 (IDE) — hai lane có thể chạy song song, nhưng **cộng RAM thì không song song**: nếu cả hai cùng bật trong một bài, trần tụt theo tổng. 7.C phải tính cả ca đó.

## Acceptance criteria

- [ ] `docs/k8s-in-pod.md` có số đo của **cả ba** đường + đối chứng pod-không-cluster.
- [ ] Trong pod: `kubectl get nodes` → Ready, tạo được Deployment + ConfigMap + Service.
- [ ] Câu hỏi "có cần `registry.k8s.io` không" được trả lời bằng **quan sát** (treo hay không treo dưới deny-all), không bằng suy luận.
- [ ] `requests`/`limits` profile K8s đặt theo **đỉnh** đo được; phép tính trần ghi trong values.
- [ ] Trần đồng thời của bài K8s ghi rõ con số và **thấp hơn 18 bao nhiêu**.
- [ ] `RUNTIME_SUPPORTED_CAPABILITIES` có `'kubernetes'`; `multi-node` vẫn chưa (trừ khi đo được).
- [ ] `ckad-configmap-as-files`: verify **pass thật** ở bài đúng, **fail thật** ở bài sai (hai vế, không chỉ một).
- [ ] `netpol-verify.sh` 22/22 với pod có cluster con; escape test tới apiserver chủ + metadata đều trượt.
- [ ] Bài `dlp-k8s-basics` (first-party) chạy end-to-end và qua cổng shellcheck `dlp-*` của CI.

## Verify commands

```bash
kubectl exec $POD -- kubectl get nodes
kubectl exec $POD -- kubectl create deploy web --image=nginx && kubectl exec $POD -- kubectl get po
kubectl exec $POD -- curl -m3 169.254.169.254 ; echo $?     # phải trượt
kubectl exec $POD -- curl -m3 -k https://10.96.0.1:443 ; echo $?   # apiserver CHỦ, phải trượt
bash infra/k8s/netpol-verify.sh
```

## Risk Assessment (P7)

| Rủi ro | L | I | Score | Mitigation |
|---|---|---|---|---|
| Cluster-in-pod tốn 2Gi ⇒ trần bài K8s còn ~5 | 4 | 4 | **16** | Đo ba đường; ưu tiên đường nhẹ nhất còn đủ cô lập; nói thẳng trần mới thay vì trung bình hoá. |
| `registry.k8s.io` không có mirror ⇒ cluster con không lên nổi | 3 | 5 | **15** | 7.B phát hiện bằng quan sát (treo dưới deny-all); đường lùi: mở rộng mirror như 3.I mắt 1 đã làm cho docker.io. |
| Dựng cluster > 60s ⇒ cold-path không dùng được | 3 | 4 | 12 | Pool ấm riêng cho profile K8s, chấp nhận RAM thường trực; hoặc dựng nền trước khi người học tới step cần nó. |
| CNI của cluster con chọc thủng deny-all | 2 | 5 | 10 | 7.F chạy lại trọn netpol-verify + escape test; không mở năng lực khi còn đỏ. |
| Đĩa tạm của cluster con làm đầy node (bẫy `containerd-orphan-records-block-gc` đã dẫm) | 3 | 4 | 12 | Đo dung lượng ở 7.B; `emptyDir` có `sizeLimit`; **CẤM `crictl rmi --prune`** như luật cũ. |

## Timeline (P7)

| Task | Effort |
|---|---|
| 7.A kubectl | S |
| 7.B đo ba đường | L |
| 7.C profile + trần | M |
| 7.D mở năng lực | S |
| 7.E bài CKAD + first-party | M |
| 7.F cô lập | M |
| **Total** | **L** |
