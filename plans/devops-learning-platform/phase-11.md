# Phase 11 — Tier-2 gVisor và môi trường thù địch (CTF)

**Mức chi tiết:** DETAILED · **Effort:** M · **Blocks:** P14 (CTF trong nhánh game) · **Blocked by:** P5; P7 nếu CTF cần K8s

> ⛔ **Kata Containers ra khỏi phạm vi trên hạ tầng này.** Chủ dự án chốt 2026-09-02: **VM VMware không bật nested virtualization** ⇒ không có `/dev/kvm` ⇒ Kata không chạy được, và không có cách lách. Thiết kế §5 viết "gVisor|Kata" như hai lựa chọn ngang nhau; trên lab này chỉ **một** tồn tại. Mọi câu chữ trong phase này nói **gVisor (platform `systrap`)**; Kata chỉ được nhắc như "chỉ khi node có KVM, provider vắng ⇒ warn + skip".

## Objective

Một scenario khai `tier: gvisor` chạy trên RuntimeClass gVisor thay vì Sysbox, cô lập chặt hơn ở tầng syscall, dùng cho bài **thù địch** (CTF, "phá hộp", chạy mã không tin cậy). Provider vắng ⇒ **warn + skip có log**, không crash, không âm thầm hạ tier.

## Ba sự thật phải kiểm TRƯỚC khi hứa gì

1. **`systrap` không cần KVM** — đó là lý do gVisor sống sót trên VM này, và cũng là thứ **phải chứng minh bằng `runsc` chạy thật**, không bằng đọc tài liệu. (`ls /dev/kvm` phải rỗng; chọn platform tường minh `--platform=systrap`, đừng để mặc định tự chọn.)
2. **gVisor và Docker-trong-pod thường loại trừ nhau.** Sandbox hiện tại bật `INCLUDE_DOCKER=1` và dockerd chạy trong pod Sysbox. Dưới gVisor, khả năng đó **giả định là mất**. Nếu mất thật thì `tier: gvisor` ⇒ `capabilities` không được chứa `docker`, và loader phải **từ chối lúc parse**, không để lỗi nổ ra trong terminal của người học.
3. **Sysbox và gVisor cùng tồn tại trên một node** dưới hai RuntimeClass khác nhau. Cài gVisor **không được** làm hỏng Sysbox — đó là cổng đầu tiên, và nếu nó đỏ thì dừng lại chứ đừng sửa tiếp.

## Task list

### 11.A — Cài gVisor, và chứng minh Sysbox không hỏng

1. `infra/host/13-gvisor-install.sh` theo khuôn `03-sysbox-install.sh`: ghim version, `sha256sum -c`, idempotent, chạy lại được.
2. RuntimeClass `gvisor` + cấu hình containerd handler `runsc` (`fix-containerd-handler.sh` đã có tiền lệ cho việc này — đọc nó trước).
3. **Cổng chặn:** sau khi cài, chạy lại `04-verify-sysbox.sh` **8/8**. Đỏ một ô ⇒ gỡ gVisor, dừng phase, báo cáo. Một nền tảng đang phục vụ Sysbox không được đánh đổi lấy một tier chưa ai dùng.
4. Pod thử: `runtimeClassName: gvisor`, `dmesg | grep -i gvisor` hoặc `cat /proc/version` trong pod cho thấy đúng kernel giả lập của gVisor — **khẳng định trên pod sống**, không trên file YAML.

### 11.B — Đo cái giá

5. Cùng một bài, hai tier: đo **thời gian khởi động pod** · workingSet · CPU-giây · độ trễ syscall-nặng (một `find /` hoặc build nhỏ). gVisor đánh đổi hiệu năng lấy cô lập — con số ấy phải nằm trong `docs/sandbox-tiers.md`, không nằm trong trí nhớ ai đó.
6. Kiểm sự thật #2 ở trên: `docker info` trong pod gVisor. Kết quả là gì thì ghi đúng như vậy.

### 11.C — Chọn tier theo nội dung, và từ chối cấu hình mâu thuẫn

7. Orchestrator đã nhận `tier` qua proto (`SANDBOX_TIER_GVISOR` có sẵn trong enum) và `podspec.go` đặt `runtimeClassName`. Kiểm đường đó **chạy thật**, không chỉ compile.
8. Loader (`packages/scenario`) **từ chối lúc parse** một bài khai `tier: gvisor` + `capabilities: [docker]` nếu 11.B chứng minh hai thứ loại trừ nhau. Lỗi phải nêu cả hai field.
9. Provider vắng (RuntimeClass chưa cài) ⇒ **warn + skip có log** và bài hiện cảnh báo như `unsupportedCapabilities` đang làm. ⛔ **Tuyệt đối không âm thầm hạ về Sysbox** — một bài CTF chạy nhầm trên tier yếu hơn là đúng thứ tier-2 sinh ra để ngăn.

### 11.D — CTF: nội dung thù địch

10. Một CTF first-party: người chơi có quyền root trong sandbox và mục tiêu là tìm cờ, **không phải** thoát hộp.
11. Chấm bằng chính đường `/exec` đã có: submit cờ so với giá trị server giữ. ⛔ Cờ **không bao giờ** nằm trong DTO gửi client — cùng kỷ luật hai-type như đáp án quiz ở P10.
12. Cờ **sinh riêng cho mỗi phiên**, không phải hằng số trong repo. Một cờ cố định trong git là một cờ đã lộ.

### 11.E — Escape test là cổng, không phải bài tập

13. Bộ kiểm thoát hộp chạy trong pod gVisor: chạm apiserver · `169.254.169.254` · mount host path · `/proc/sys` ghi · load kernel module · `nsenter` sang PID host. **Tất cả phải trượt.**
14. **Đối chứng dương bắt buộc:** cùng bộ kiểm chạy ở nơi nó PHẢI đỏ (vd. một pod cố ý cấp thêm quyền trong namespace thử) — thiếu vế đó thì "0 lỗ hổng" không phân biệt được với "script không chạy" (`zero-violation-needs-negative-control`).
15. Chạy lại `netpol-verify.sh` 22/22 với pod gVisor: NetworkPolicy không quan tâm runtime, nhưng khẳng định đó phải được kiểm chứ không được giả định.

## File / dir ownership

`infra/host/13-gvisor-install.sh` · `infra/k8s/runtimeclass-gvisor.yaml`, `infra/k8s/escape-verify.sh` · `services/orchestrator/internal/k8s/podspec.go` · `packages/scenario/src/{loader.ts,backend.ts}` · `apps/web/src/server/lessons/catalog.ts` · `content/ctf/**` · `docs/sandbox-tiers.md`

## Dependencies

- **Blocked by:** P5. P7 chỉ khi CTF cần K8s bên trong.
- **Blocks:** P14 (CTF nằm trong nhánh game/thử thách).
- **Ràng buộc cứng:** không nested virt ⇒ Kata không thuộc phase này.

## Acceptance criteria

- [ ] `runsc` chạy platform **systrap**, khẳng định trên pod sống; `/dev/kvm` vắng được ghi lại như bối cảnh.
- [ ] Sau khi cài gVisor: `04-verify-sysbox.sh` **8/8** (Sysbox không suy giảm).
- [ ] `docs/sandbox-tiers.md` có bảng đo hai tier: khởi động, RAM, CPU, độ trễ syscall-nặng.
- [ ] Câu hỏi "gVisor có chạy được dockerd không" trả lời bằng **quan sát**, và kết quả (dù là "không") được mã hoá thành luật của loader.
- [ ] Bài `tier: gvisor` chạy đúng RuntimeClass (kiểm bằng `kubectl get pod -o jsonpath`).
- [ ] RuntimeClass vắng ⇒ warn + skip có log; **không** tự hạ về Sysbox (test có ca này).
- [ ] Cờ CTF sinh theo phiên, **không** trong repo, **không** trong DTO gửi client.
- [ ] `escape-verify.sh`: 6/6 hướng thoát đều trượt trên gVisor, **và** bộ đối chứng dương đỏ đúng nơi phải đỏ.
- [ ] `netpol-verify.sh` 22/22 với pod gVisor.
- [ ] Kata: ghi rõ trong `docs/sandbox-tiers.md` là ngoài phạm vi vì thiếu nested virt, kèm điều kiện mở lại.

## Verify commands

```bash
kubectl get runtimeclass                       # sysbox-runc + gvisor
kubectl get pod $CTF_POD -o jsonpath='{.spec.runtimeClassName}'
kubectl exec $CTF_POD -- cat /proc/version     # kernel giả lập của gVisor
bash infra/host/04-verify-sysbox.sh            # 8/8 sau khi cài gVisor
bash infra/k8s/escape-verify.sh                # 6/6 trượt + đối chứng dương
```

## Risk Assessment (P11)

| Rủi ro | L | I | Score | Mitigation |
|---|---|---|---|---|
| Cài gVisor làm hỏng containerd/Sysbox đang phục vụ | 3 | 5 | **15** | 11.A cổng `04-verify-sysbox.sh` 8/8; script idempotent + có đường gỡ; làm ngoài giờ học. |
| gVisor không chạy dockerd ⇒ tier-2 mất năng lực `docker` | 4 | 3 | 12 | Đo ở 11.B; mã hoá thành luật loader; nói thẳng trong `docs/sandbox-tiers.md` thay vì để lộ ra ở runtime. |
| Âm thầm hạ tier khi provider vắng | 2 | 5 | 10 | Cấm trong AC; test riêng cho ca provider vắng. |
| "0 lỗ hổng" vì script không chạy | 3 | 5 | **15** | Đối chứng dương bắt buộc trong AC — cùng khuôn 3.E đã làm (10/10 đối chứng ĐỎ). |
| Hiệu năng gVisor làm bài CTF khó chịu | 3 | 2 | 6 | Đo ở 11.B; chỉ dùng tier-2 cho bài thật sự cần; trần `execTimeout` nới riêng nếu số đo đòi. |

## Timeline (P11)

| Task | Effort |
|---|---|
| 11.A cài + cổng Sysbox | M |
| 11.B đo giá | S |
| 11.C chọn tier + từ chối mâu thuẫn | M |
| 11.D CTF first-party | M |
| 11.E escape test + đối chứng | M |
| **Total** | **M** |
