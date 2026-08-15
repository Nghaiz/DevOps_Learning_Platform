# 3.I mắt 2 — bài học Docker end-to-end trên mirror

**Ngày:** 2026-08-15, bổ sung 2026-08-16 (§7b) · **Chặng:** 3.I (mắt 2/5) ·
**Cụm:** lab 1-node 192.168.94.130 · **Deploy:** tag hiện tại `sha-0941471` **do
CI publish** (bản 2026-08-15 dùng `sha-94d1670` xây tay khi CI chết — xem §5, §7b).

## 0. Một câu

Bài `dlp-docker-basics` chạy được trọn vẹn trên phiên thật — **21/21**, mỗi step
chấm cả vế "chưa đạt" lẫn vế "đạt" — và phép đo đi kèm **bác bỏ tiền đề của mắt
4**: tải Docker thật đỉnh **433–532 MiB** qua 5 lượt, tức `requests: 512Mi` KHÔNG
"thổi phồng 10 lần" như số idle của 3.H gợi ý — nó nằm giữa dải, và lượt cao nhất
còn **vượt** qua nó (§7b).

## 1. Ba điều kiện biên đo TRƯỚC khi viết — chúng đổi hình dạng bài

| # | Đo được | Hệ quả với bài |
|---|---|---|
| 1 | Build trong sandbox **không ra được mạng**: `archive.ubuntu.com:80` timeout ở **cả 9 IP**, `security.ubuntu.com` cũng vậy | Bài **không có** bước cài gói (`pip`/`apt`/`npm`) |
| 2 | **`apt-get update` VẪN `exit 0`** khi mọi repo hỏng — chỉ in `W: Failed to fetch`, tốn **44.8s** để không làm gì | Cấm dùng `apt-get` làm bằng chứng cho **bất kỳ** ô AC nào |
| 3 | Một lượt chấm trần **30s** (`GATEWAY_EXEC_TIMEOUT`), vượt trả **502** chứ không trả "chưa đạt" | `verify.sh` chỉ `inspect`; việc nặng thuộc terminal người học |

### ⚠ Điều 2 suýt lọt — và đó là bài học của lượt này

Phép đo đầu tiên của tôi chạy `RUN apt-get update` rồi đọc `BUILD_RC=0` và **kết
luận nhầm rằng apt chạy được**. Chỉ khi chạy lại với `--no-cache
--progress=plain` mới thấy `Could not connect ... connection timed out` trên mọi
IP — build "thành công" với một lớp apt **rỗng**.

Đây đúng hạng lỗi mà AC-A1 (3.A) đã bác một lần: một phép kiểm cho **cùng kết quả
ở cả hai giả thuyết** thì nó không đo gì cả. Ở đây `exit 0` xuất hiện cả khi apt
tải được lẫn khi apt không tải được gì. Ghi thành luật ở
`docs/scenario-format.md` §6.2 và `content/scenarios/README.md` để lần sau không
ai dựng ô AC trên nó.

Bài biến chính cái bẫy này thành nội dung dạy (step 6): *"mã thoát 0 nghĩa là
lệnh chạy xong, không nghĩa là việc đã làm được"*.

## 2. Bài đã dựng

`dlp-docker-basics` — first-party (`source: null`), 6 step, tiếng Việt:

| Step | Dạy | Verify khẳng định |
|---|---|---|
| 1 | `docker pull` qua mirror | image có thật trên máy |
| 2 | `run -d`, `-p`, `docker ps` | container **chạy** VÀ cổng **thật sự thông** (hai vế, vì chúng hỏng độc lập) |
| 3 | `logs`, `exec`, hệ thống tệp tách biệt | mốc có **trong container** và **không** trên sandbox |
| 4 | Dockerfile, build context, `COPY`, `CMD` | image **chạy được**, không chỉ tồn tại |
| 5 | tag là **con trỏ**, layer dùng chung | hai tag cùng **một image ID** |
| 6 | vì sao `pip install` không chạy | pypi **chặn** VÀ mirror **thông** |

**Step 6 mang đối chứng dương NGAY TRONG verify.** Vế "pypi bị chặn" một mình là
phép đo mù — nó cũng "đạt" khi dockerd chết hoặc mạng pod hỏng hẳn. Vế thứ hai
(mirror phải trả 200) là thứ phân biệt *bị lọc có chọn lọc* với *mạng chết*.

## 3. Acceptance criteria — kết quả

| Ô | Kết quả | Bằng chứng |
|---|---|---|
| **AC-I9** bài parse được + hiện ra | ✅ | `lessons.list` thấy **6 bài**; `lessons.get` trả 6 step, md 1092/1011/1173/1286/1022/2375 ký tự |
| **AC-I10** `docker pull` trong phiên thật | ✅ | `sha256:dd29372629…`, 75.7s trên pod TƯƠI (chính lệnh chết ở 3.H) |
| **AC-I11** mỗi step chấm **cả hai vế** | ✅ | 5 step có hành động × 2 vế = 10 ô, xem §4 |
| **AC-I12** build THẬT chạy được | ✅ | `myapp:1` in `DLP docker lab: xin chao tu container / python=3.12.14` |
| **AC-I13** step "không cài được gói" | ✅ | pypi chặn + mirror thông, trong **cùng một lượt chấm** |
| **AC-I14** bài cũ hết dạy sai | ✅ | câu "`docker pull` sẽ thất bại" đã bỏ; `FROM scratch` build rc=0 và verify THẬT của step3 vẫn "Dat" |
| **AC-I15** không hồi quy | ✅ | e2e P2 **14/14** · netpol **22/22, 0 lệch** · reaper **14/14, 0 fail** |
| **AC-I16** tải của bài, đo ở cgroup host | ✅ | RAM đỉnh **433–532Mi**/1024Mi qua 5 lượt (§7b); CPU **87–195 CPU-giây** ⇒ TB **0.40–0.71 core** |
| **AC-H9** ghim tag, bỏ mọi `--set` | ✅ | 4 deployment + `SANDBOX_IMAGE` cùng một tag, khẳng định trên **đối tượng sống**. Nay là `sha-0941471` **do CI publish** — xem §5 + §7b |

**Chạy 3 lượt độc lập, mỗi lượt một pod tươi: 20/20, 20/20, 21/21** (lượt 3 thêm
ô CPU). Không lượt nào lệch.

## 4. AC-I11 — vì sao phải chấm cả hai vế

Chấm "đạt" sau khi làm bài, một mình, **không chứng minh được gì**: một verify
luôn-`exit 0` (đúng bẫy `prolug` đã ghi ở `content/scenarios/README.md`) cho cùng
kết quả ấy. Nên mỗi step có hành động được chấm TRƯỚC khi làm — và phải **trượt**
kèm đúng câu hướng dẫn:

```
step1 CHƯA ĐẠT: "Chua thay image python:3.12-slim. Hay chay: docker pull python:3.12-slim"
step2 CHƯA ĐẠT: "Chua thay container ten 'web' dang chay."
step3 CHƯA ĐẠT: "Chua thay /tmp/dlp-marker BEN TRONG container 'web'."
step4 CHƯA ĐẠT: "Chua thay image myapp:1."
step5 CHƯA ĐẠT: "Chua thay tag myapp:stable."
```

**Step 6 KHÔNG có vế trượt** — nó là step quan sát, không có gì để làm, nên nó
"đạt" ngay từ đầu. Khai thẳng ở đây thay vì để bảng 21/21 đọc như thể cả 6 step
đều có hai vế. Bù lại, đối chứng của nó nằm bên trong chính verify (§2).

## 5. AC-H9 — và cái bẫy thứ hai, lớn hơn, vừa lộ ra

Ô này treo suốt hai chặng. Lượt này đóng được **sau khi tìm ra vì sao nó không
đóng được**.

Đường mà mắt 1 §7.2 vạch ra là chờ CI publish `sha-<mainsha>`. Đường đó **chết**:
GitHub Actions bị chặn billing từ `e90ce8f` — mọi job trên main đỏ **trước khi
chạy bước nào** (`The job was not started because recent account payments have
failed`), không log, chỉ có annotation mới nói ra. Chủ dự án chốt: làm tiếp như
không có Actions.

Nhưng ghim tag trong git rồi deploy **vẫn không đổi được image**:

```
deploy xong, revision 75, rollout XANH, pod Running 1/1 — mà:
platform-gateway        …dlp-terminal-gateway:3h-drain2     ← không phải tag trong git
platform-orchestrator   …dlp-orchestrator:3i-m1             ← không phải tag trong git
platform-web            …dlp-web:sha-25cb824                ← không phải tag trong git
```

**Nguyên nhân:** `12-helm-deploy.sh` trích "secret live" bằng `helm get values`
— nhưng nó lấy **TOÀN BỘ** values user-supplied của lần cài trước (110 dòng) rồi
áp **SAU** `values-selfhost.yaml`. Nghĩa là mọi `--set` từng gõ một lần **sống
mãi và đè lên git**. Overlay đó đang ghim đúng bốn khoá image, đến từ ba lượt đo
khác nhau.

Triệu chứng là loại tệ nhất: `helm upgrade` báo **thành công**, `rollout status`
**xanh**, pod **Running 1/1**, image y nguyên bản cũ, **không có gì đỏ lên**. Đây
chính là lớp lỗi mà `11-sideload-images.sh` và chính script này được dựng ra để
diệt — nó chỉ đổi chỗ nấp: từ *"chart cũ trên VM"* sang *"values cũ trong
release"*.

**Sửa:** lọc theo **danh sách CHO PHÉP**, không phải danh sách cấm. Luật:
*git sở hữu mọi thứ git khai; VM chỉ cấp thứ git **cố ý** không khai* — bí mật
(mật khẩu PG/Redis, betterAuthSecret) và giá trị phụ thuộc máy (`ingress.*`,
`networkPolicy.*`, `platform.*`, mấy leaf `web.env.*` do `08-tls-entrypoint.sh`
sinh). 19 khoá được mang sang, in ra **đường dẫn khoá** chứ không in giá trị.
Một `--set` lạ ai đó gõ sau này sẽ **bị bỏ** thay vì sống mãi.

Lọc bằng `helm get values -o json` + `python3` stdlib (VM không có `yq` lẫn
`pyyaml`; JSON là YAML hợp lệ nên `helm -f` nhận thẳng). Bí mật **không rời VM** —
giữ nguyên tính chất cũ. Có cổng chặn: thiếu một trong ba bí mật thì **DỪNG**,
không deploy tiếp, để khỏi regenerate mật khẩu trong khi Postgres/Redis vẫn giữ
mật khẩu cũ.

**Kết quả, khẳng định trên đối tượng sống, `helm upgrade` KHÔNG một `--set` image nào:**

```
platform-gateway        ghcr.io/nghaiz/dlp-terminal-gateway:sha-94d1670
platform-orchestrator   ghcr.io/nghaiz/dlp-orchestrator:sha-94d1670
platform-web            ghcr.io/nghaiz/dlp-web:sha-94d1670
SANDBOX_IMAGE           ghcr.io/nghaiz/dlp-sandbox-base:sha-94d1670
```

⚠ **Khai thẳng:** 5 image này **xây tay** tại commit `94d1670` rồi side-load, KHÔNG
phải CI publish. `sha-<short>` ở đây nghĩa là "xây tại đúng commit đó", không
nghĩa "đã qua cổng CI". Ghi cả vào `values-selfhost.yaml` để không ai đọc nhầm.

## 6. AC-I16 — số đo, và nó BÁC BỎ tiền đề của mắt 4

Đo ở **cgroup trên host** (không đo trong pod — Sysbox biên tập thứ `exec` thấy):

| Đại lượng | Đo được | Trần đang áp |
|---|---|---|
| RAM đỉnh (`memory.peak`, đỉnh THẬT do kernel giữ) | **451 MiB** (3 lượt: 437 / 451 / 470) | 1024 MiB limit — dùng **44%** |
| RAM nền lúc mở phiên | 76–78 MiB | |
| CPU tổng | **87.0 CPU-giây** trong 219s tường | `cpu.max=100000/100000` = 1 core |
| CPU trung bình | **0.40 core** | |

> **cgroup v2 KHÔNG có `cpu.peak`** — chỉ có `usage_usec` cộng dồn. Nên ở đây có
> TỔNG và TRUNG BÌNH, **không có** đỉnh CPU tức thời. Suy ra "đỉnh CPU = X" từ số
> cộng dồn là bịa; đỉnh tức thời cần lấy mẫu, và đó là việc của mắt 3.

### ⛔ Phát hiện chặn đường cho mắt 4

Mắt 1 §"Vì sao nó tồn tại" lập luận: `requests` 512Mi bị **thổi phồng ~10 lần**
vì sandbox chỉ dùng 43–75 Mi. Số đó đo lúc **idle**. Dưới **tải bài học Docker
thật**, đỉnh là **451 MiB** — tức `requests: 512Mi` hiện tại phủ đỉnh với dư địa
**13%**, gần như **đúng**, không thổi phồng.

Hệ quả trực tiếp, phải mang sang mắt 3/4/5:

- **Đặt `requests` theo số idle (~64Mi) sẽ gây OOM/evict đúng lúc người học đang
  build** — chính cái §I0.2 cảnh báo, giờ có số để chứng minh, không còn là lo xa.
- **Mục tiêu "20–30 phiên đồng thời" cần xem lại bằng số học RAM.** 25 phiên ×
  ~451Mi ≈ **11 GiB**, đúng bằng toàn bộ RAM của VM (chưa trừ platform ~1.4Gi,
  observability, kubelet). Trần đồng thời của cụm này bị chặn bởi **RAM thật**,
  không bởi quota đặt sai — trái với giả định vào chặng.
- Đỉnh này là **transient** (lúc pull + build). Khoảng cách giữa `requests`
  (steady state) và `limits` (đỉnh) là chỗ còn dư địa duy nhất, và khai thác nó
  là đánh cược overcommit — mắt 4 phải quyết có nhận cược đó không, **bằng số**.

Đây là lý do chuỗi 5 mắt bắt buộc theo thứ tự: đặt `requests` trước khi có bài để
đo (mắt 4 trước mắt 2/3) thì con số đặt ra sẽ sai gấp bảy lần theo hướng nguy
hiểm nhất.

## 7. Cổng kiểm — chạy TẠI CHỖ vì CI chết

Actions bị chặn billing ⇒ mọi cổng chạy ở máy dev/cụm:

| Cổng | Kết quả |
|---|---|
| `packages/scenario` | **84/84** (đã chạy, không phải skip) |
| `turbo lint typecheck build test` | **20/20 task** |
| web suite (có Postgres thật) | **183/183** |
| Go build+vet (`GOOS=linux`) + test (native) | sạch, mọi module `ok` |
| `helm lint` + `kubeconform -strict` ×3 bộ values | **24 / 42 / 24**, 0 invalid |
| shellcheck 8 script của bài (qua container) | **0 phát hiện** ở `warning` |

⚠ **`183/183` chỉ có được sau khi dựng Postgres cục bộ.** Không có DB, 42 test
đỏ và **đọc ra như lỗi của thay đổi này**. Đối chứng: cùng lúc đó, `main` sạch đỏ
**57** test — nhiều hơn, và `lessons-authz` đỏ **22/22 ở cả hai bên**. Tức phần đỏ
là môi trường, không phải hồi quy. (`docker compose up -d postgres redis` +
`db:migrate` là bước bắt buộc trước khi tin suite web ở local.)

⚠ **shellcheck có đối chứng âm.** "0 phát hiện" trên 8 file tự nó có thể là "không
kiểm file nào". Thêm một file lỗi cố ý vào cùng lệnh ⇒ nó bắt SC2034 + SC2154 và
trả rc=1. Vậy con số 0 là thật.

## 7b. Bổ sung 2026-08-16 — CI sống lại, và số đo RAM mạnh hơn

Repo được chuyển **PUBLIC** ⇒ Actions chạy lại (public repo không tính phí). Ba
thứ đổi theo, đo lại toàn bộ trên cụm:

1. **PR #65 xanh toàn bộ trên CI thật**, merge thành `0941471`.
2. **Cụm đã bỏ image xây tay.** CI publish đủ 5 image `sha-0941471`; side-load +
   `helm upgrade` KHÔNG `--set` ⇒ 4 deployment + `SANDBOX_IMAGE` đều
   `sha-0941471`. **AC-H9 giờ đóng đúng hình dạng gốc** mà mắt 1 §7.2 vạch ra
   (sha DO CI PUBLISH), không còn là đường lùi xây tay.
3. **Hồi quy chạy lại trên image CI:** bài Docker **21/21 ×2 lượt** · e2e P2
   **14/14** · netpol **22/22, 0 lệch**.

### ⚠ Số đo RAM: một lượt VƯỢT `requests`

Gộp 5 lượt (3 trên image xây tay + 2 trên image CI):

| Lượt | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Đỉnh RAM | 437Mi | 451Mi | 470Mi | **532Mi** | 433Mi |
| Nền lúc mở phiên | 78Mi | 76Mi | ~77Mi | **138Mi** | 69Mi |

Lượt 4 đạt **532 MiB — VƯỢT `requests: 512Mi`**, và nó đi kèm một cái nền cao
bất thường (138Mi thay vì ~75Mi), tức pod xuất phát đã nặng sẵn.

**Điều này làm kết luận §6 MẠNH HƠN, không yếu đi.** §6 nói "512Mi phủ đỉnh với
dư địa 13%" dựa trên đỉnh 451Mi. Với dải thật **433–532Mi**, `requests: 512Mi`
**không nằm trên đỉnh mà nằm GIỮA dải** — có lượt pod tiêu quá phần nó giữ chỗ,
tức trở thành ứng viên bị evict khi node chịu áp lực, đúng lúc người học đang
build.

⇒ Số bàn giao cho mắt 3/4 phải là **dải kèm giá trị lớn nhất (532Mi)**, không
phải trung vị. Đặt `requests` theo trung vị là thiết kế cho một nửa số lượt.

## 8. Nợ còn lại

- ~~**CI vẫn chết** (billing)~~ — **ĐÃ XONG 2026-08-16**: repo chuyển PUBLIC,
  Actions chạy lại. Xem §7b.
- ~~**`content/scenarios/**/*.sh` nằm NGOÀI cổng shellcheck của CI**~~ — **ĐÃ
  XONG 2026-08-16**: thêm bước `shellcheck (content/scenarios/dlp-*)`. Chỉ soi
  bài FIRST-PARTY vì script vendor upstream **không sạch** (đo được 5 lỗi mức
  `error`: SC2148 ở loxilb/prolug, SC2218 ở loxilb/common.sh) và không được sửa
  (license + `vendor --check` so byte). Lọc bằng glob `dlp-*` nên bài first-party
  sau tự được gác; có guard ĐỎ khi glob khớp 0 file, để cổng không xanh rỗng.
- **Mắt 3–5** chưa làm; mang theo phát hiện §6 (số 451Mi và số học RAM).
- Không có `lessons.endSession` — phiên chỉ kết thúc bằng TTL 1h rồi reaper dọn.
  Ba lượt e2e để lại 3 phiên, đã dọn tay sau khi đo.

## 9. Trình tự tái lập

```bash
# 1. cổng local (CẦN Postgres, nếu không 42 test web đỏ vì môi trường)
docker compose up -d postgres redis && pnpm --filter @devops-platform/web db:migrate
pnpm turbo run lint typecheck build test

# 2. xây 5 image tại đúng commit rồi side-load (tag đọc TỪ values, không từ dòng lệnh)
T=sha-$(git rev-parse --short=7 HEAD)
docker build -f apps/web/Dockerfile                  -t ghcr.io/nghaiz/dlp-web:$T .
docker build -f apps/web/Dockerfile --target migrator -t ghcr.io/nghaiz/dlp-migrator:$T .
docker build -f services/orchestrator/Dockerfile     -t ghcr.io/nghaiz/dlp-orchestrator:$T .
docker build -f services/terminal-gateway/Dockerfile -t ghcr.io/nghaiz/dlp-terminal-gateway:$T .
docker buildx build --platform=linux/amd64 -f images/sandbox-base/Dockerfile \
  -t ghcr.io/nghaiz/dlp-sandbox-base:$T --load images/sandbox-base
# sửa image.tag trong values-selfhost.yaml sang $T TRƯỚC khi chạy hai script dưới
bash infra/host/11-sideload-images.sh
bash infra/host/12-helm-deploy.sh          # KHÔNG --set nào

# 3. khẳng định file bài học CÓ trong image (đừng kiểm thư mục — .dockerignore bóc markdown)
docker run --rm --entrypoint sh ghcr.io/nghaiz/dlp-web:$T \
  -c 'find /repo/content/scenarios/dlp-docker-basics -type f | wc -l'   # 19

# 4. chạy bài end-to-end trên phiên thật
O=https://dlp.192.168.94.130.sslip.io:30443
cd plans/devops-learning-platform/reports/harness/2026-08-15-3i-m2-docker-lesson && \
  BASE_URL=$O ORIGIN=$O NODE_TLS_REJECT_UNAUTHORIZED=0 node e2e-docker-lesson.mjs   # 21/21

# 5. hồi quy (reaper chạy CÔ LẬP — harness song song làm lệch delta pool:claimed)
NS=default bash infra/k8s/netpol-verify.sh                                  # 22/22
cd plans/.../harness/2026-08-13-2d-lessons-e2e && BASE_URL=$O ORIGIN=$O \
  NODE_TLS_REJECT_UNAUTHORIZED=0 node e2e-lessons.mjs                       # 14/14
bash infra/k8s/reaper-verify.sh --case all                                  # 14/14
```
