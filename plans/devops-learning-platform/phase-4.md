# Phase 4 — Labs ② + Games ③ (SKETCH) — ⛔ ĐÃ ĐƯỢC THAY THẾ

> **TRẠNG THÁI: THAY THẾ (2026-09-04). Không phải phase còn mở, không phải nợ.**
>
> P4 là một **sketch** viết ở giai đoạn còn chưa biết Labs và Games sẽ tách ra sao. Từ đó tới nay mỗi mảng của nó
> đã được một phase DETAILED nhận và làm, nên sáu ô AC bên dưới là bản nháp của những ô đã đóng ở chỗ khác — giữ
> chúng dưới dạng `- [ ]` chỉ khiến bảng tổng đọc ra thành *P4 còn 6 việc chưa làm*, điều không đúng.
>
> | Việc trong sketch P4 | Nay thuộc | Trạng thái |
> |---|---|---|
> | 4.1.1 Task scoring engine (lab đa task, chấm điểm, leaderboard) | **P8** 8.B/8.C | đóng — `labs.*`, `lab-score.ts`, xếp hạng mặc-định-tắt + test IDOR |
> | 4.1.2 K8s-trong-pod (`kind`/`vcluster` trong pod Sysbox) | **P7** 7.B–7.F | đóng — đo cả ba đường, **chọn k3s**; kind và vcluster bị loại BẰNG SỐ ĐO |
> | 4.1.3 Lab authoring format + UI playground | **P8** 8.A/8.E | đóng — `docs/lab-format.md`, `/labs`, `/playgrounds` |
> | 4.1.4 Tier-2 sandbox (gVisor/Kata) cho lab thù địch | **P11** | mở — và Kata đã bị loại khỏi phạm vi: VM không bật nested virt ⇒ không `/dev/kvm` |
> | 4.2.5 Games frontend-only | **P14** | mở |
> | 4.2.6 CTF tái dùng engine ② | **P11** 11.D + **P14** | mở |
> | 4.2.7 UI games gallery | **P14** | mở |
>
> Không xoá file: nó là bản ghi của một quyết định phân rã, và các phase con vẫn trỏ ngược về đây. Đọc nó như
> **lịch sử**, không như hàng đợi công việc.

**Mức chi tiết:** SKETCH · **Effort:** L · **Blocked by:** P1 (engine); Labs cũng dựa P2 (UI/validation)
> Sketch — tách thành detailed plan riêng khi bắt đầu. Games ③ là nhánh song song ít phụ thuộc engine.

## Objective

Mở rộng nền tảng sang 2 trụ cột còn lại, tái dùng tối đa engine P1 + UI/validation P2:
- **② Labs/Playground** (KodeKloud-style): môi trường thật (K8s/Docker/Linux) + **chấm điểm task** đa bước, có thể có K8s cluster trong pod.
- **③ Games**: game tương tác trình duyệt, **phần lớn frontend-only (0 backend)** + CTF tái dùng engine ②.

## Task list (sketch)

### 4.1 Labs ②
1. **Task scoring engine** — mở rộng validation P2: nhiều task/lab, chấm điểm tổng, tiêu chí pass, thời gian; lưu điểm + leaderboard (authz theo user).
2. **K8s-trong-pod** — cho lab cần cluster: `kind`/`vcluster` bên trong pod Sysbox (Sysbox hỗ trợ native docker/K8s-in-container). Test tài nguyên + isolation.
3. **Lab authoring format** — mở rộng scenario format cho lab đa task + môi trường phức tạp; UI playground (terminal + hướng dẫn + bảng task).
4. **Tier-2 sandbox cho lab hostile/CTF** — gVisor RuntimeClass (nhẹ) / Kata (mạnh) cho lab "phá hộp"; chọn tier theo scenario metadata (design §5). Provider vắng → warn+skip có log.

### 4.2 Games ③
5. **Nhánh frontend-only** — game kiểu k8sgames (Apache-2.0 tham khảo): logic chạy hoàn toàn trên browser, **0 backend** → rẻ, scale vô hạn (design §7.5).
6. **CTF tái dùng engine ②** — CTF cần môi trường thật → dùng lại engine P1 + tier-2 isolation (gVisor/Kata) cho môi trường thù địch.
7. UI games gallery; điểm/hoàn thành (game frontend-only lưu local hoặc progress tối thiểu).

## File / dir ownership (sketch)

`apps/web/src/app/labs/**`, `apps/web/src/app/games/**`, `apps/web/src/server/trpc/routers/{labs,games}.ts`, `packages/scenario/lab.ts` (format lab), `infra/k8s/runtimeclass-{gvisor,kata}.yaml`, `content/labs/**`, `content/games/**` (hoặc repo game riêng frontend-only).

## Dependencies

- **Blocked by:** P1 (engine — bắt buộc cho Labs + CTF). Labs cũng tái dùng P2 (validation/UI).
- **Games frontend-only** gần như không phụ thuộc backend → có thể làm song song sớm.
- Tier-2 (gVisor/Kata) cần cài RuntimeClass lên node pool (tương tự Sysbox P0).

## Acceptance criteria (sketch) — ĐÃ CHUYỂN, không tick ở đây

> Sáu dòng dưới đây giữ **nguyên văn** bản sketch để truy nguyên. Chúng cố ý **không** còn là ô tick: ô thật nằm ở
> phase đã nhận việc, và một ô tick ở hai chỗ là hai chỗ để lệch nhau.

| Ô AC sketch | Ô thật nằm ở |
|---|---|
| Lab đa task chấm điểm đúng; leaderboard chỉ hiện theo authz (luật 1) | **P8** — đóng |
| `kind`/`vcluster` chạy trong pod Sysbox cho lab K8s; isolation giữ nguyên (luật 10) | **P7** — đóng (chọn **k3s**; `netpol-verify` 22/22, `p7-escape-verify` 9/9) |
| Lab CTF/hostile chạy trên tier-2 (gVisor/Kata); escape test không thoát được | **P11** 11.E — mở |
| Game frontend-only chạy 0 backend; scale không tốn sandbox | **P14** — mở |
| Chọn tier sandbox theo scenario metadata; provider tier-2 vắng → warn+skip | **P11** 11.C — mở |
| 10 luật §6 vẫn giữ cho route mới | **P8** — đóng |

## Verify commands (sketch)

```bash
kubectl get runtimeclass                                   # sysbox-runc, gvisor, kata
kubectl exec $CTF_POD -- <escape-attempt> ; echo $?        # không thoát
pnpm --filter web test -- labs games                       # authz + scoring
```

## Risk Assessment (P4)

| Rủi ro | Likelihood | Impact | Score | Mitigation |
|---|---|---|---|---|
| K8s-in-pod (kind/vcluster) tốn tài nguyên/không ổn định | 3 | 4 | 12 | Quota rộng hơn cho lab pool; test tải; giới hạn concurrency lab nặng. |
| Tier-2 (Kata) yêu cầu KVM/nested-virt trên node | 3 | 4 | 12 | gVisor (user-space, nhẹ) làm mặc định tier-2; Kata chỉ khi node hỗ trợ; chọn theo metadata. |
| CTF escape ra host | 2 | 5 | 10 | Tier-2 isolation + NetworkPolicy + review; escape test bắt buộc. |
| Scope creep 3 trụ cột cùng lúc | 3 | 3 | 9 | Labs trước, Games frontend-only nhánh riêng; ưu tiên tái dùng engine. |

## Timeline (P4)

| Task | Effort | Notes |
|---|---|---|
| Labs scoring + K8s-in-pod + tier-2 | L | Tái dùng P1/P2 |
| Games frontend-only + CTF | M | Frontend-only song song sớm |
| **Total P4** | **L** | Sau khi engine (P1) ổn + P3 hardening |
