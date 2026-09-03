# Phase 6 — Theia IDE lane (ngang KodeKloud về trải nghiệm học)

**Mức chi tiết:** DETAILED · **Effort:** L · **Blocks:** P9 (soạn bài trên UI dùng lại editor), P13 (FE layout) · **Blocked by:** P5 (deploy lặp lại được)

> Ràng buộc dài hạn của chủ dự án (chốt 2026-08-13): **ngang KillerCoda *và* KodeKloud về TRẢI NGHIỆM HỌC**, và "có IDE như KodeKloud" là một trong bốn mục. Móc đã có sẵn từ 2.A: `Scenario.interfaceLayout` (từ `interface.layout: "ide"` của Killercoda) và `capabilities` đã chảy tới FE qua `lessons.get`. **Lane này là phần chưa dựng.**

## Objective

Người học mở một bài có `interface.layout: "ide"` thì thấy **editor thật** cạnh terminal và nội dung bài: mở file trong pod của chính mình, sửa, lưu, và `docker build`/`kubectl apply` trong terminal nhìn thấy ngay thay đổi đó — cùng một filesystem, không phải hai bản sao.

## Quyết định phải chốt TRONG phase (đo trước, chọn sau)

⛔ **Đừng chốt Theia hay code-server ở bàn giấy.** Hai ứng viên, ba tiêu chí đo được:

| | Eclipse Theia | code-server (VS Code OSS) |
|---|---|---|
| License | EPL-2.0 (bản Theia) | MIT (code-server) + MS marketplace **KHÔNG** dùng được → Open VSX |
| RAM lúc rảnh | **phải đo** | **phải đo** |
| Kích thước layer thêm vào image | **phải đo** | **phải đo** |

Tiêu chí quyết định, theo thứ tự: (1) **RAM lúc rảnh** — mỗi 100Mi thêm vào pod sandbox là một khe quota mất đi ở trần 21 pod; (2) **license cho phép self-host giáo dục**; (3) kích thước image (mỗi lần bump tag là một lượt `docker save`+`scp` qua đường side-load).

**Cách chốt:** dựng cả hai trong một pod Sysbox trên cụm, đo `memory.current`/workingSet ở cgroup **trên host** (không đo trong pod — xem `measure-from-outside-the-system`), ghi bảng, rồi chọn. Ghi cả con số của cái BỊ LOẠI vào report.

## Task list

### 6.A — Đo và chốt IDE

1. Pod thử nghiệm mỗi ứng viên, đo: workingSet lúc rảnh · workingSet khi mở một repo ~50 file · CPU lúc khởi động · thời gian tới lúc phục vụ được HTTP · kích thước layer.
2. Ghi `docs/ide-choice.md` (SSOT): bảng số, quyết định, và **điều kiện đảo quyết định** (vd. "nếu RAM chênh < 50Mi thì chọn theo license").
3. Đối chứng: pod sandbox **không** có IDE, cùng lúc, cùng cách đo — để biết phần thêm vào là bao nhiêu chứ không phải tổng là bao nhiêu.

### 6.B — Image: IDE là layer opt-in

4. `INCLUDE_IDE` (mặc định **0**), cùng khuôn với `INCLUDE_DOCKER`/`INCLUDE_PWSH` đã có. Bài không cần IDE **không** trả tiền cho nó.
5. **Nguồn Theia: image upstream ghim DIGEST, không build từ nguồn** (chốt 2026-09-04 sau đính chính 6.A — `docs/ide-choice.md` §5):
   `FROM ghcr.io/eclipse-theia/theia-ide/theia-ide@sha256:595d34047d91223b5d55fd5b611bb10981154c4b28de9271b2578f996f323751 AS theia`
   rồi `COPY --from=theia /home/theia /opt/theia` — đúng khuôn `harness/2026-09-03-6a-ide-measure/Dockerfile.theia` đã chạy được.
   Ghim digest thay cho `sha256sum -c`; đó là **cùng một mức bảo đảm**, chỉ khác cơ chế, nên khuôn của fastfetch/oh-my-posh/pwsh không bị phá.
   Giữ `ARG THEIA_IMAGE` (harness đã có) làm cửa lùi sang build-từ-nguồn nếu digest biến mất khỏi registry.
   ⛔ **Việc ĐẦU TIÊN của 6.B:** pull image đó, side-load, chạy thử trong pod Sysbox — "manifest trả 200" chưa bằng "chạy được", và bố cục `/home/theia` bản upstream chưa đối chiếu với bản 6.A tự build.
6. Extension: chỉ Open VSX, danh sách ngắn và ghim version. **Không** marketplace của Microsoft (điều khoản không cho phép ngoài sản phẩm MS).
7. Cổng CI: nếu `INCLUDE_IDE=1` thì smoke "binary tồn tại + PID 1 sống + HTTP trả 200 sau ≤ Ns" — cùng khuôn E6–E9 đã có.

### 6.C — Đường mạng: IDE nói chuyện với trình duyệt qua gateway, KHÔNG mở cổng ra ngoài

8. IDE nghe **127.0.0.1 trong pod**, không nghe `0.0.0.0`. NetworkPolicy deny-all đang chặn pod↔pod, nhưng "không nghe ra ngoài" là lớp thứ hai và nó rẻ.
9. `terminal-gateway` thêm route reverse-proxy `/(ide)/session/{id}/*` — **dùng lại nguyên chuỗi authz a→h/a→i của `/ws` và `/exec`**, không viết chuỗi thứ ba. Cookie `dlp_sandbox` như cũ; **không token trong URL** (luật 8).
10. WebSocket của IDE đi cùng đường (IDE dùng WS cho nhiều thứ). Trần `GATEWAY_MAX_WS_PER_SESSION` hiện là 1 cho terminal — IDE **không được** ăn vào khe đó; tách trần riêng, ghi rõ vì sao trong code.
11. Cắt cỡ và rate-limit: IDE tải file lớn hơn terminal vài bậc. Đặt trần riêng, đo trước khi đặt.

### 6.D — FE: layout `ide` — ⏸ HOÃN SANG P13 (chốt 2026-09-04)

> Chủ dự án chốt: bỏ qua 6.D, đi tiếp backend. Lý do: plan của P13 ghi thẳng
> **"FE hiện tại là giàn giáo của kỹ sư backend… không đủ để ai đó ngồi học ba
> tiếng"** và P13 dựng lại toàn bộ — nên một layout 3 vùng viết bây giờ là viết
> để bị đè. P13 task 12 đã có sẵn ô "thêm layout `ide` của P6".
>
> ⚠ **Giá phải trả, ghi rõ:** ô AC *"sửa file trong editor, `cat` trong terminal
> thấy nội dung mới"* KHÔNG đóng được cho tới P13, vì vế "editor CÓ thấy file
> này" là bước THỦ CÔNG cần mở IDE bằng trình duyệt. Đường ghi đã chứng minh
> (exec ghi `$HOME/a.txt`, đọc lại được); vế đọc-bằng-mắt thì chưa. Đừng đọc P6
> là "đã đóng" khi chưa có ai nhìn thấy editor.

12. `interfaceLayout === 'ide'` ⇒ bố cục 3 vùng (nội dung | editor | terminal), kéo giãn được, nhớ tỉ lệ trong `localStorage`. Bài không có cờ ⇒ giữ nguyên split-pane 2 vùng của 2.D.
    ⛔ **Không custom bản dựng Theia** (chốt 2026-09-04): IDE là editor mặc định trong `<iframe>`. Mọi UI của nền tảng — nút chấm bài, tiến độ, điều hướng bước — nằm ở pane NGOÀI iframe. Bố cục shell / gỡ menu / widget riêng / branding đều là Theia extension **biên dịch vào bản dựng**, hoãn tới khi chủ dự án yêu cầu.
13. IDE nhúng bằng `<iframe>` trỏ route 6.C. CSP hiện tại phải được nới **đúng một origin** — và nới CSP là việc phải chạy lại đối chứng của 3.E (xem `zero-violation-needs-negative-control`).
14. Trạng thái "IDE đang khởi động" phải hiện ra. Một iframe trắng trong 20s đọc y hệt một trang hỏng.

> ⚠ **Số mới cần 6.E đối chiếu (đo 2026-09-04, pod `ide-verify`):** workingSet ở
> cgroup trên host = **428Mi** sau đúng MỘT lượt `curl` loopback. 6.A đo bản
> tự-build ở trạng thái "chưa có client" là **253Mi**. Chênh 175Mi, và có ít nhất
> hai cách giải thích chưa phân định được: (a) một lượt HTTP đã đủ dựng state
> backend nên đây KHÔNG phải "chưa có client"; (b) image upstream khác bản
> tự-build. **Đừng dùng 428Mi để tính trần** cho tới khi 6.E đo bằng đúng harness
> của 6.A (Playwright qua port-forward), vì `curl` chỉ chứng minh "đang nghe"
> chứ không chứng minh "đang phục vụ" — đúng bẫy `curl-probe-measures-listening-not-usage`.

### 6.E — Trần đồng thời sau khi có IDE

15. Đo lại `requests`/`limits` cho biến thể có IDE: pod sandbox hiện dùng workingSet đỉnh **163Mi** (bài Docker); IDE cộng thêm bao nhiêu là con số của 6.A.
16. Tính lại trần theo **min của năm ràng buộc** (`quota-ceiling-is-min-of-five`) và ghi con số mới vào `values-selfhost.yaml` kèm phép tính, như bộ số hiện tại đã làm.
17. Nếu trần tụt quá nửa: đề xuất **tách profile** (bài-có-IDE dùng `requests` riêng) thay vì nâng đều cho mọi bài — và nói rõ đó là đánh đổi gì.

## File / dir ownership

`images/sandbox-base/Dockerfile` (+ `entrypoint.sh`) · `services/terminal-gateway/internal/{ideroute,authz,config}` · `infra/helm/platform/{values.yaml,values-selfhost.yaml,templates/gateway-deployment.yaml}` · `apps/web/src/app/lessons/[id]/*` · `packages/ui/src/lesson/*` · `apps/web/src/security/*` (CSP) · `docs/ide-choice.md`

## Dependencies

- **Blocked by:** P5 (deploy + trần đo lại).
- **Blocks:** P9 (soạn bài trên UI tái dùng editor này), P13 (FE dựng layout thật).
- Không phụ thuộc P7 — IDE và K8s-in-pod độc lập.

## Acceptance criteria

- [x] `docs/ide-choice.md` có bảng số của **cả hai** ứng viên + đối chứng pod-không-IDE, và điều kiện đảo quyết định. → chốt **Theia**; [report 6.A](reports/2026-09-03-verify-6a-ide-measure.md)
- [x] `INCLUDE_IDE=0` mặc định; image không IDE **không tăng kích thước**. → đối chứng dựng Dockerfile TRƯỚC khi sửa trên cùng máy/cùng cache: RootFS layer **giống hệt từng cái**. IDE=1 = 2.19GB (+1.38GB, khớp +1.37GB của 6.A).
- [~] Cùng filesystem — chứng minh MỘT CHIỀU (2026-09-04): ghi `$HOME/lab/hello.txt` bằng `kubectl exec`, mở Theia bằng trình duyệt thật (Playwright) ⇒ Explorer hiện `/root/lab/hello.txt`, click vào thì tiêu đề đổi thành `hello.txt - root - Theia IDE`. **Chiều ngược lại — sửa TRONG editor rồi `cat` ở terminal — CHƯA làm**, và nó là chiều quan trọng hơn (nó chứng minh đường GHI của editor, không chỉ đường ĐỌC). Đóng nốt ở P13 khi có layout thật.
- [ ] ~~IDE **không** nghe `0.0.0.0` trong pod~~ — **ĐẢO 2026-09-04**, ô này không còn đúng. Ghim loopback buộc mọi byte IDE đi qua `portforward` của apiserver (hai pod = hai netns), mà apiserver cụm này đã restart 41 lần. Chốt: IDE nghe podIP, gateway nối thẳng. Ô AC thay thế:
- [x] Chỉ pod **gateway** chạm được `sandbox:4000`; pod sandbox KHÁC bị từ chối. → [harness 6.C](reports/harness/2026-09-04-6c-netpol-isolation/run.md): before/after của rule egress mới, đối chứng dương 200 và đối chứng âm giữ nguyên timeout. **Phát hiện kèm theo:** chart THIẾU rule egress gateway→sandbox:4000 — ingress mở mà egress không, route IDE sẽ 503 im lặng trên cụm.
- [x] `sandbox-default-deny` ĐANG enforce — khẳng định bằng đối chứng dương chứ không bằng `kubectl get`: cùng một dịch vụ trả **200** cho pod gọi chính nó và **timeout (DROP, curl 28)** cho pod sandbox khác. Lượt đo đầu tiên đã bị chính đối chứng dương này bác bỏ (image cũ còn nghe loopback nên không có gì để chạm).
- [x] Truy cập route IDE của phiên NGƯỜI KHÁC ⇒ từ chối, **cùng mã** vì cùng một bản chuỗi (`internal/sessionauth`). → `TestIDERejectsForeignSession` (403 FORBIDDEN, **0 lượt chạm Redis** — chết trước bước f như `/ws`) + `TestIDERejectsSessionOfAnotherUser`. ⚠ Mức UNIT, chưa chạy trên cụm qua Traefik.
- [x] Không token trong URL/query: cấu trúc route là `/ide/session/{id}/…`, id KHÔNG phải bí mật (chuỗi authz đọc token từ cookie). Thêm một vế mạnh hơn AC đòi: token **không rò xuống pod** — `TestIDEDoesNotForwardSessionCookieToPod` khẳng định upstream nhận `Cookie` rỗng. ⚠ Vế devtools-network là việc của 6.D/P13.
- [x] Mở IDE không chiếm khe WS của terminal — bảo đảm bằng **cấu trúc**: `ideroute` không import `sessionstore`, và `sessionauth.SessionReader` không khai `AcquireWS`. → `TestIDENeverTouchesTerminalWSSlot` có bẫy type-assertion với chữ ký khớp nguyên văn `sessionstore.Store.AcquireWS` (0 lượt gọi qua 3 request). ⚠ Mức UNIT.
- [x] Trần đồng thời tính lại theo min-của-năm, phép tính ghi vào `values.yaml` → `sandbox.limitRange.ideProfile`. → **7 pod** (ước lượng cũ 10 sai 18%); [report 6.E](reports/2026-09-04-verify-6e-ide-ceiling.md). ⚠ `ideProfile` chưa được orchestrator đọc — là con số, chưa phải hành vi.
- [ ] CSP nới đúng một origin; chạy lại đối chứng CSP của 3.E, 0 vi phạm mới.

## Verify commands

```bash
# IDE chỉ nghe loopback trong pod — dòng nào lọt qua grep là một cổng mở ra ngoài.
#
# ⚠ CHỐT 2026-09-04: sandbox-base KHÔNG có `ss` lẫn `netstat` (đo 2026-09-03), nên
# `ss -ltn` đỏ vì THIẾU BINARY chứ không vì có cổng mở — đỏ trên một hệ lành.
# Dùng /proc/net/tcp (0100007F = 127.0.0.1, 00000000 = 0.0.0.0), như harness
# `listen.sh` đã chạy được. KHÔNG thêm iproute2 chỉ để phục vụ một lệnh verify.
kubectl exec $POD -- sh -c 'cat /proc/net/tcp /proc/net/tcp6'   | awk '$4=="0A"{print $2}' | grep -v '^0100007F:' | grep -v '^00000000000000000000000001000000:'

# Route IDE của phiên NGƯỜI KHÁC phải bị từ chối (luật 1)
curl -s -o /dev/null -w '%{http_code}\n' https://$HOST/ide/session/$OTHER_SESSION/   # 403/404

# Cùng filesystem: ghi bằng exec, rồi đọc lại bằng exec để khẳng định đường ghi
# hoạt động. Vế 'editor CÓ thấy file này' là bước THỦ CÔNG — mở IDE và nhìn;
# không có lệnh nào kiểm hộ, và giả vờ có là tự lừa mình.
kubectl exec $POD -- sh -c 'echo dlp-ide-probe > /root/a.txt'
kubectl exec $POD -- cat /root/a.txt          # phải in dlp-ide-probe

# Binary IDE có thật trong image biến thể
docker run --rm dlp-sandbox-base:ide sh -c 'test -x <ide-binary>'
```

## Risk Assessment (P6)

| Rủi ro | L | I | Score | Mitigation |
|---|---|---|---|---|
| IDE ăn RAM làm trần đồng thời sụp | 4 | 4 | **16** | 6.A đo TRƯỚC khi dựng; 6.E tách profile nếu cần; `INCLUDE_IDE=0` mặc định. |
| Reverse-proxy IDE mở một đường authz thứ ba, lệch với `/ws` | 3 | 5 | **15** | Dùng LẠI chuỗi a→h, không viết mới; test IDOR cho route IDE bắt buộc, kèm đối chứng dương. |
| Extension marketplace vi phạm điều khoản | 2 | 4 | 8 | Chỉ Open VSX, ghim version, ghi license trong `docs/ide-choice.md`. |
| CSP nới quá tay, mất một lớp của luật 9 | 3 | 4 | 12 | Nới đúng một origin; chạy lại đối chứng 3.E; review diff CSP riêng. |
| iframe trắng đọc như trang hỏng | 3 | 2 | 6 | Trạng thái "đang khởi động" + timeout có thông báo tiếng Việt. |

## Timeline (P6)

| Task | Effort |
|---|---|
| 6.A đo + chốt | M |
| 6.B image layer | M |
| 6.C route + authz | L |
| 6.D FE layout | M |
| 6.E trần + values | S |
| **Total** | **L** |
