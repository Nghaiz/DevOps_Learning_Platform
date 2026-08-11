# B6-T4 + 1.D — bằng chứng trên cụm (2026-08-11)

**Phạm vi:** tầng reaper thứ 4 (`pool:free` ⇄ apiserver) + bốn khoảng trống pod-hardening (D-17′, D-19′, D-21′, D-22′).
**Cụm:** `debian-sandbox` (kubeadm 1-node, k8s v1.34.10, Sysbox). Release `platform`, revision 26.
**Ảnh chụp mã:** nhánh `feat/p1-b6t4-pod-hardening`, image `dlp-orchestrator:dev-b6t4` (side-load, chưa phải tag CI).

---

## 1. B6-T4 — tầng sweep thứ 4

### 1.1 Tái hiện lỗi trên bản CŨ (`sha-9776bda`, 3 tầng)

Lỗi gốc quan sát được là hệ quả của `RestartPolicy: Never` + node reboot. Tái hiện bằng cách giết **init PID của container từ HOST** — `kill -9 1` *từ trong pod* không dùng được vì kernel chặn SIGKILL gửi tới PID 1 của chính PID-namespace đó (đã thử, pod vẫn `Running`).

```
container=721edacbe97c…  init-pid-tren-host=67072   →  sudo kill -9 67072

k8s   phase     = Failed
k8s   exitCode  = 137
redis pool:free = [sandbox-8bb412626eca]
redis pod:hash  = state free updatedAt 1786440832
```

Đúng trạng thái đã quan sát ngày 2026-08-11 (bản gốc là `exitCode 255` do reboot; cùng lớp).

### 1.2 Bản cũ KHÔNG dọn — 2.5 chu kỳ sweep

`REAP_INTERVAL=60s`, theo dõi 150 giây:

| mốc | phase | pool:free | `pod:{name}.state` |
|---|---|---|---|
| T+30s | Failed | `[sandbox-8bb412626eca]` | free |
| T+60s | Failed | `[sandbox-8bb412626eca]` | free |
| T+90s | Failed | `[sandbox-8bb412626eca]` | free |
| T+120s | Failed | `[sandbox-8bb412626eca]` | free |
| T+150s | Failed | `[sandbox-8bb412626eca]` | free |

Hai số đo khép lại câu "sinh viên tiếp theo nhận đúng pod này":

```
LINDEX pool:free 0        = sandbox-8bb412626eca    ← pod mà LMOVE sẽ lấy
HGET pod:{name} state     = free                    ← điều kiện DUY NHẤT claim.lua kiểm
```

*Nói thẳng ranh giới của bằng chứng:* hai dòng trên là **trạng thái đo được** cộng với **điều kiện đọc từ `claim.lua`**; chặng này **không** chạy một lượt `CreateSession` thật để thấy pod chết được phát ra. Kết luận "sinh viên đầu tiên nhận pod chết" vì thế đúng ở mức *cấu tạo*, không ở mức *quan sát*.

### 1.3 Bản MỚI dọn trong 8 mili-giây kể từ khi reaper khởi động

`helm upgrade --reset-then-reuse-values --set orchestrator.image.tag=dev-b6t4` → revision 26.

```json
{"time":"2026-08-11T10:24:44.908Z","level":"INFO","msg":"reaper tầng 1: nghe keyspace expiry"}
{"time":"2026-08-11T10:24:44.916Z","level":"WARN","msg":"pod CHẾT nằm trong pool:free — đã rút trước khi ai đó claim phải nó","pod":"sandbox-8bb412626eca","phase":"Failed"}
```

Quét-ngay-lúc-khởi-động (`Run` gọi `sweepOnce` trước khi vào ticker) nên không phải chờ hết một chu kỳ.

**Metric — vế phân định, không chỉ vế khẳng định:**

```
dlp_reaper_dead_free_pods_total    1     ← tầng 4
dlp_reaper_orphan_pods_total       0
dlp_reaper_ghost_sessions_total    0
dlp_reaper_claimed_orphan_total    0
dlp_reaper_quarantine_reaped_total 0
dlp_reaper_sweep_failures_total    0
```

Bốn counter kia bằng **0** là thứ chứng minh **đúng tầng 4** dọn, chứ không phải một nhánh nào khác tình cờ chạm tới. Trạng thái sau đó: `pool:claimed` rỗng, `pool:quarantine` rỗng, `EXISTS pod:{name}` = 0.

### 1.4 Nhánh `NotFound` cũng chạy thật

Xoá hai pod ấm bằng tay (`kubectl delete pod -l app=sandbox`) trong lúc tên chúng còn trong `pool:free`: `dlp_reaper_dead_free_pods_total` **1 → 3**, `pool:free` hội tụ về đúng một pod ấm mới. Đây là nhánh "tên còn trong pool mà apiserver trả NotFound" — cùng đường code, khác nhánh.

### 1.5 Kiểm đột biến (local, `-race`, Redis thật)

| đột biến | test đỏ |
|---|---|
| gỡ `sweepDeadFreePods` khỏi `sweep` | 4 ca của tầng 4 |
| bỏ guard `removed == 0` | **chỉ** `TestTang4LREMLaPhepGianhQuyen` |
| coi mọi lỗi `Get` là "pod đã chết" | **chỉ** `TestTang4KhongRutPodKhiApiserverLoi` |
| bỏ `IsTerminal` | **chỉ** `TestTang4KhongDungPodAmConSong` |

Cửa sổ đua của luật `LREM`-trước chỉ dựng được nhờ hook `onGet` trong test double — không có nó thì luật đó **không có cách nào đỏ**.

**Suite:** 248 PASS / **0 SKIP** toàn repo dưới `-race` với Redis + Postgres thật; `go vet`, `gofmt`, `node scripts/env-check.mjs` (52 biến / 4 scope) đều xanh.

---

## 2. D-19′ — trần PID, và một AC đo sai chỗ

[`06-kubelet-pids-limit.sh`](../../../infra/host/06-kubelet-pids-limit.sh) chạy trọn chuỗi an toàn: cron vá token tồn tại → ép chạy job vá ngay → `rollout status calico-node` → **canary TRƯỚC xanh** → ghi config + đồng bộ ConfigMap → restart kubelet → node `Ready` → **canary SAU xanh**.

### 2.1 ⛔ Phát hiện chính: `kubectl exec` KHÔNG phải điểm quan sát trung lập

Cùng một pod, cùng một thời điểm:

```
trong pod  (kubectl exec -- cat /sys/fs/cgroup/pids.max)  : max
trên host  (cgroup slice của pod)                          : 4096
kubelet    (Container Manager config)                      : "PodPidsLimit":4096
```

Sysbox **ảo hoá `/sys/fs/cgroup`**: pod thấy cgroup-namespace root của chính nó — một cgroup con được uỷ quyền, chưa đặt trần — chứ không thấy slice mà kubelet ép. Trần của tổ tiên vẫn có hiệu lực nhưng **vô hình với mọi phép đo từ bên trong**.

Hệ quả nếu không biết: người tiếp theo đọc `max`, kết luận D-19′ hỏng, rồi đi "sửa" một cấu hình vốn đã đúng — hoặc hạ AC xuống cho dễ đạt. Đây là **lần thứ hai** trong §1.D một AC đọc sai điểm thực thi vì Sysbox chen vào giữa (lần đầu: `drop:[ALL]`, D-17′).

### 2.2 Phép đo hành vi — thứ duy nhất trả lời "trần có thật sự chặn không"

Không dùng fork-bomb thật (nếu trần không có hiệu lực thì bomb hạ node; phép đếm thì không): đẻ tiến trình trong pod tới khi `fork` hỏng.

```
bash: fork: retry: Resource temporarily unavailable
bash: fork: Resource temporarily unavailable

cgroup host:  pids.max = 4096 ;  pids.events = max 5
node:         debian-sandbox   Ready
5 pod nền tảng: 0 restart
```

`pids.events: max 5` là **lời khai của kernel** rằng nó đã chặn 5 lần — không suy luận.

### 2.3 Idempotent

Chạy lại script: dừng ở bước 0, **không restart kubelet lần nữa**, đọc cgroup host của pod ấm mới (`sandbox-7632e728e153`) → `pids.max = 4096`, `pids.events = max 0`.

Hai cách đo sai đã thử và loại, ghi trong script để không ai quay lại: `kubectl run --image=busybox` (cụm side-load, không pull được ⇒ probe timeout trông y hệt "bản vá thất bại") và `kubectl exec -- cat …pids.max` (§2.1).

---

## 3. D-17′ / D-22′ — ba check hỏng của `04-verify-sysbox.sh`

| check | hỏng thế nào | thay bằng |
|---|---|---|
| #4 `capabilities.drop == ALL` | **tautology** — đọc lại đúng field mà chính script vừa ghi trong `$MANIFEST` 60 dòng trên. Không thể đỏ. | trần PID đọc ở **cgroup host**; sự thật `CapEff` in ra như *quan sát*, không phải cổng |
| #3 `test -e /var/run/docker.sock` | **đo một cuộc đua** — socket đó là của dockerd *bên trong* pod, xuất hiện khi dockerd lên. Xanh chỉ vì check chạy ở bước 3, còn bước 7 mới chờ dockerd tới 90s. Đảo thứ tự hai bước là cổng đỏ mà **không có gì đổi về bảo mật**. | `.spec.volumes[*].hostPath.path` rỗng — không phụ thuộc thời điểm, và đúng thứ luật 10 cấm |
| #8 metadata endpoint | **PASS vì lý do sai** — `kexec curl …` trả khác 0 cả khi *bị chặn* lẫn khi *image không có curl*, hai ca rơi chung một nhánh `ok`. | tách `command -v curl` trước; thiếu curl → **BỎ QUA có thông báo**, không phải PASS |

Vế `docker run hello-world` cũng đã bỏ theo D4: nó **phải** kéo image từ Docker Hub, tức phép thử ép ta nới chính NetworkPolicy nó đang gác. Thay bằng `docker build FROM scratch` + `docker run` với tiêu chí đảo ngược — thứ phải đỏ là **dấu vết ra mạng** (`unable to find image` / `dial tcp` / `i/o timeout`), không phải việc container có chạy được hay không. *(`FROM scratch` không có binary nên `docker run` luôn báo `no command specified`; chính lỗi đó chứng minh docker phân giải image cục bộ.)*

**Chưa chạy `04-verify-sysbox.sh` đầu-cuối ở chặng này** — nó tạo pod `nestybox/ubuntu-noble-systemd-docker`, một image **chưa side-load** trên cụm (mạng VM không kéo nổi). Ba check đã sửa được xác minh bằng cùng phép đo trên pod sandbox thật (hostPath rỗng, cgroup host `pids.max=4096`, `uid_map` offset ≠ 0); vế DinD của #7 phải chờ **E7** — image của ta chưa có docker.

---

## 4. Phát hiện phụ — warm-pool bơm quá trần ở mỗi rollout

Sau `helm upgrade`: `dlp_pool_free_size = 2` với `POOL_TARGET=1`.

```
orchestrator MỚI khởi động : 10:24:43Z
orchestrator CŨ  bị xoá    : 10:24:56Z      →  13 giây hai manager cùng sống
```

`strategy.rollingUpdate.maxSurge: 25%` ⇒ mỗi bên độc lập thấy pool thiếu và mỗi bên dựng một pod. Warm-pool chỉ *bơm cho đủ*, **không rút phần thừa**, nên con số 2 ở lại — trần session đồng thời tụt từ 3 xuống 2 (D16) mà không lỗi nào nói vì sao. Với `replicaCount: 2` mặc định của chart thì đây là trạng thái **thường trực**.

Cùng họ với tầng 2c và tầng 4: *một thứ không nhánh nào chạm tới*. `POOL_TARGET` đang được đọc là **sàn**; chưa chỗ nào coi nó là **trần**. Đã ghi vào §"Còn để ngỏ" — **chưa task nào sở hữu**.

---

## 5. Nợ mở ra từ chặng này

- **Release lab đang chạy `dlp-orchestrator:dev-b6t4`** (dựng từ nhánh, side-load bằng tay), không phải tag `sha-*` do CI đóng. Đóng ngay sau khi PR merge — **side-load TRƯỚC, `helm upgrade` SAU**. *(Lần thứ năm của cùng một món nợ.)*
- `platform-web` vẫn ở **`dev-1f2`** và `SANDBOX_IMAGE` ở **`dev-sudo`** — nợ tồn từ 1.F, chặng này không chạm nhưng ghi lại vì §1.F tuyên bố đã đóng về `sha-9776bda`.
- Vế `docker run` offline (D4) và AC DinD chờ **E7**.
- `04-verify-sysbox.sh` chưa chạy đầu-cuối (image nestybox chưa side-load).
