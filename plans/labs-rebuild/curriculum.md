# Giáo trình — labs rebuild (2026-10-03)

Đọc cùng [`docs/content-style.md`](../../docs/content-style.md) (cách viết),
[`contracts.md`](contracts.md) (định dạng, prelude, smoke, sơ đồ).

Quy ước cột: **img** = `backend.imageid` (`ubuntu`, `kubernetes-kubeadm-1node-rapid`,
`kubernetes-kubeadm-2nodes-rapid`), **ide** = `interface.layout: "ide"`, **min** =
`estimatedMinutes`. Mỗi bài học/lab giữ đúng id ở đây (id đi vào tiến độ đã lưu).
Bước/task dưới đây là khung: người viết được đổi chi tiết, không được đổi mục tiêu
và không được bớt điều kiện kiểm.

## Chủ đề linux — lộ trình `dlp-path-linux-cho-devops`

| id | tên | độ khó | min | img | ide |
|---|---|---|---|---|---|
| `dlp-sandbox-basics` | Ngày đầu với terminal | beginner | 20 | ubuntu | |
| `dlp-linux-files` | Đi lại trong hệ thống tệp | beginner | 25 | ubuntu | |
| `dlp-linux-text` | Lọc log bằng đường ống | beginner | 30 | ubuntu | |
| `dlp-linux-permissions` | Quyền, người dùng và nhóm | intermediate | 30 | ubuntu | |
| `dlp-linux-processes` | Tiến trình, tín hiệu và việc chạy nền | intermediate | 30 | ubuntu | |
| `dlp-net-basics` (topic `networking`) | Mạng nhìn từ bên trong một máy Linux | intermediate | 30 | ubuntu | |
| lab `dlp-linux-files-lab` | Bàn giao máy chủ | beginner | 35 | ubuntu | |
| lab `dlp-linux-triage` | Ca trực đêm | intermediate | 40 | ubuntu | |

- **sandbox-basics**: máy này là của riêng bạn và sẽ biến mất; `whoami`/`hostname`/`/etc/os-release`; bấm lệnh khác gõ lệnh thế nào; Tab, mũi tên lên, Ctrl+C, Ctrl+L; tạo file đầu tiên và bấm Kiểm tra. Sơ đồ: phím bạn gõ đi qua trình duyệt → gateway → tmux → zsh trong pod.
- **linux-files**: cây thư mục chuẩn (`/etc`, `/var/log`, `/home`, `/root`, `/tmp`, `/usr/bin`, `/opt`); đường dẫn tuyệt đối/tương đối, `.`/`..`/`~`; `ls -lah`, file ẩn; `mkdir -p`, `cp -r`, `mv`, `rm -r` (cẩn thận), `touch`, `tree`; `cat`/`head`/`tail`; glob `*`, `?`, `{a,b}`. Tình huống: dọn một thư mục "bàn giao" bừa bộn theo yêu cầu. Sơ đồ: cây FHS có chú thích "ai để gì ở đây".
- **linux-text**: một access log nginx sinh ngẫu nhiên; `grep -i -n -c -v -E`; `cut`/`awk '{print $1}'`; `sort | uniq -c | sort -nr | head`; `wc -l`; `>`, `>>`, `2>`, `2>&1`, `/dev/null`, `tee`; `find -name -mtime -size -type` + `-exec`/`xargs`. Mục tiêu cuối: top IP, số lỗi 5xx, request chậm nhất. Sơ đồ: stdin/stdout/stderr chảy qua một pipeline.
- **linux-permissions**: giải phẫu `ls -l`; rwx cho u/g/o; số bát phân; `chmod` ký hiệu và số; `chown`/`chgrp`; `useradd -m -s`, `groups`, `usermod -aG`, `id`; thử quyền bằng `su - user -c`; bit `x` trên thư mục nghĩa là gì; `umask`; setgid trên thư mục dùng chung. Sơ đồ: `-rwxr-x---` tách thành ba nhóm bit → 750.
- **linux-processes**: `ps aux`, `ps -ef --forest`, `pgrep -a`; `top -b -n1`; một script bẫy tín hiệu để thấy TERM khác KILL khác HUP; `&`, `jobs`, `kill %1`; `nohup` + `disown`; `/proc/<pid>/{status,cmdline,environ}`; mã thoát `$?`. Sơ đồ: vòng đời tiến trình và tín hiệu.
- **net-basics**: `ip addr`, `ip route`; `ss -tlnp` (ai đang nghe cổng nào); `nc -l` mở cổng rồi `nc`/`curl` tới nó; `curl -v` đọc từng dòng; DNS: `/etc/resolv.conf`, `dig`, `getent hosts`, `/etc/hosts` ghi đè; vì sao sandbox phân giải được tên ngoài mà không kết nối được. Sơ đồ: đường đi của `curl http://app:8080` (hosts → DNS → TCP → tiến trình đang nghe).
- **lab dlp-linux-files-lab** (dữ liệu sinh ngẫu nhiên, verify tính lại): (1) cây `/srv/app/{releases,shared/logs,shared/config}` mode 755; (2) dời mọi `*.conf` từ `/tmp/handover` vào `shared/config`, giữ tên, không còn bản ở chỗ cũ; (3) số dòng chứa `ERROR` trong `/var/log/app/app.log` ghi vào `/root/answers/error-count.txt`; (4) 3 IP nhiều request nhất trong access log, mỗi dòng một IP, giảm dần, ghi `/root/answers/top-ips.txt`; (5) nén các `.log` cũ hơn 7 ngày trong `/var/log/app/old` vào `/root/backup/app-logs.tar.gz` rồi xoá bản gốc, log mới hơn giữ nguyên; (6) symlink `/srv/app/current` → `/srv/app/releases/v2`; (7) danh sách đường dẫn tuyệt đối các file >50M dưới `/data`, sắp xếp, ghi `/root/answers/big-files.txt`.
- **lab dlp-linux-triage** (viết lại hoàn toàn, không gợi ý): (1) một tiến trình ngốn CPU có "người giám sát" tự chạy lại nó, phải dừng cả hai; (2) `/opt/ops/healthcheck.sh` chạy trực tiếp được và in đúng `OK` (thiếu bit x VÀ xuống dòng CRLF); (3) user `deploy`: home `/home/deploy`, shell `/bin/bash`, nhóm chính `deploy`, nhóm phụ `docker`; (4) `/etc/app/secret.token` chủ `deploy:deploy`, mode 600; (5) `/srv/shared` thuộc nhóm `devs`, setgid, `alice`/`bob` (có sẵn) ghi được, người khác không vào được; (6) PID và tên chương trình đang nghe cổng 8081 ghi vào `/root/answers/port-8081.txt`; (7) `/var/log/app/huge.log` đang bị một tiến trình giữ: làm nó nhỏ hơn 1 MB mà tiến trình vẫn sống.

## Chủ đề bash — lộ trình `dlp-path-bash-script` (mới)

| id | tên | độ khó | min | img | ide |
|---|---|---|---|---|---|
| `dlp-ide-config-edit` | Sửa file bằng IDE, kiểm bằng terminal | beginner | 15 | ubuntu | ✓ |
| `dlp-bash-first-script` | Script đầu tiên | beginner | 25 | ubuntu | ✓ |
| `dlp-bash-control-flow` | Rẽ nhánh và vòng lặp | beginner | 30 | ubuntu | ✓ |
| `dlp-bash-robust` | Script không sập lúc 3 giờ sáng | intermediate | 30 | ubuntu | ✓ |
| lab `dlp-bash-lab` | Bộ công cụ trực ca | intermediate | 45 | ubuntu | ✓ |

- **ide-config-edit** (bài mẫu cho cặp IDE + terminal): mở file trong Theia, sửa, lưu; `cat` trong terminal thấy ngay; tạo file trong terminal, IDE thấy ngay. Đây cũng là phép thử "đồng bộ" mà chủ dự án đòi. Bước cần sửa file trong IDE có `stepN/solution.sh` cho smoke.
- **bash-first-script**: shebang; `chmod +x`; `./script.sh` khác `bash script.sh` thế nào; biến, nháy đơn/kép, vì sao luôn `"$var"`; `$(...)`; `$1 $# $@`; mã thoát và `$?`; `printf` thay `echo -e`. Sơ đồ: kernel đọc `#!` → gọi trình thông dịch.
- **bash-control-flow**: `[[ ]]`, `-f -d -x -z -n`, so sánh chuỗi/số; `if/elif/else`; `case`; `for` qua danh sách và glob; `while read -r line`; `$(( ))`; hàm đơn giản.
- **bash-robust**: từng cờ của `set -euo pipefail` qua ví dụ hỏng thật; `trap … EXIT` + `mktemp` để dọn dẹp; `local`; log ra stderr; `getopts`; kiểm script bằng `docker run --rm -v "$PWD:/mnt" koalaman/shellcheck:stable`. Sơ đồ: luồng `set -e` + trap khi một lệnh lỗi.
- **lab dlp-bash-lab** (verify chạy script của người học với dữ liệu thử, kiểu black-box): (1) `/opt/tools/disk-alert.sh <ngưỡng%> <đường-dẫn>` in `OK <n>%` exit 0 dưới ngưỡng, `ALERT <n>%` exit 2 từ ngưỡng trở lên, sai tham số in usage ra stderr exit 64; (2) `/opt/tools/rotate.sh <thư-mục> <giữ>` giữ N file `.log` mới nhất, không đụng file khác, chịu được tên có dấu cách; (3) `/opt/tools/summarize.sh <access.log>` in `<mã> <số lần>` mỗi dòng, sắp theo mã; (4) cả ba có shebang bash, `set -euo pipefail`, chạy trực tiếp được; (5) `/opt/tools/backup.sh` chạy hai lần không nhân đôi bản sao (idempotent) và dọn file tạm kể cả khi lỗi giữa chừng.

## Chủ đề git — lộ trình `dlp-path-git-thuc-hanh` (mới)

Setup mọi bài: `git config --global user.name/email` cho root, nhánh mặc định `main`.

| id | tên | độ khó | min | img | ide |
|---|---|---|---|---|---|
| `dlp-git-basics` | Ba vùng của Git và commit đầu tiên | beginner | 25 | ubuntu | |
| `dlp-git-branching` | Nhánh, merge và xung đột | beginner | 30 | ubuntu | ✓ |
| `dlp-git-remote` | Làm việc với remote | intermediate | 30 | ubuntu | |
| `dlp-git-undo` | Lùi lại mà không mất việc | intermediate | 30 | ubuntu | |
| lab `dlp-git-lab` | Dọn một repo rối | intermediate | 45 | ubuntu | ✓ |

- **git-basics**: `init`, `status`, `add`, `commit`, `log --oneline`, `diff` khác `diff --staged`, `.gitignore`, `show`. Sơ đồ: working tree → staging → repository, mũi tên `add`/`commit`/`restore`.
- **git-branching**: `branch`, `switch -c`, merge fast-forward, merge ba chiều, đọc dấu xung đột, sửa trong IDE, `log --graph --oneline --all`. Sơ đồ: đồ thị commit trước/sau hai kiểu merge.
- **git-remote**: bare repo `/srv/git/shop.git` làm origin; `clone`, `push -u`, `fetch` khác `pull`, nhánh theo dõi; một "đồng nghiệp" (clone thứ hai) đẩy trước khiến push bị từ chối; `pull --rebase`; đẩy tag. Sơ đồ: nhánh local, nhánh remote-tracking, remote.
- **git-undo**: `restore`, `restore --staged`, `commit --amend`, `revert`, `reset --soft/--mixed/--hard`, cứu commit "đã mất" bằng `reflog`, `stash`. Sơ đồ: ba kiểu reset dời HEAD/index/working tree đến đâu.
- **lab dlp-git-lab** (repo dựng sẵn ở `/srv/repos/shop`, origin `/srv/git/shop.git`): (1) nhánh `hotfix/price-rounding` từ tag `v1.2.0`, một commit sửa `src/price.sh` đúng nội dung cho trước, message bắt đầu `fix:`; (2) merge `feature/discount` vào `main`, file `src/config.ini` sau giải xung đột đúng nội dung cho trước; (3) commit lộ khoá trên `main` được đảo bằng một commit revert, không viết lại lịch sử, `creds.txt` không còn trong cây; (4) nhánh `experiment/cache` bị xoá nhầm được khôi phục đúng commit cũ; (5) `build/` bị bỏ qua và không còn được theo dõi, file trên đĩa giữ nguyên; (6) `main` và tag annotated `v1.2.1` (message cho trước) có trên origin.

## Chủ đề docker — lộ trình `dlp-path-docker-tu-so-0`

| id | tên | độ khó | min | img | ide |
|---|---|---|---|---|---|
| `dlp-docker-basics` | Image và container | beginner | 25 | ubuntu | |
| `dlp-docker-dockerfile` | Viết Dockerfile và hiểu cache | beginner | 30 | ubuntu | ✓ |
| `dlp-docker-data` | Dữ liệu sống sót qua container | intermediate | 25 | ubuntu | |
| `dlp-docker-network` | Mạng giữa các container | intermediate | 30 | ubuntu | |
| `dlp-docker-compose` | Nhiều container, một file Compose | intermediate | 30 | ubuntu | ✓ |
| `dlp-docker-multistage` | Image nhỏ bằng multi-stage | intermediate | 30 | ubuntu | ✓ |
| lab `dlp-docker-run-lab` | Vận hành container theo yêu cầu | beginner | 35 | ubuntu | |
| lab `dlp-docker-build-lab` | Đóng gói một dịch vụ | intermediate | 45 | ubuntu | ✓ |
| lab `dlp-docker-compose-lab` | Một stack, một lệnh | intermediate | 45 | ubuntu | ✓ |

- **docker-basics**: `pull` qua mirror, `run -d -p --name`, `ps`/`ps -a`, `logs`, `exec`, `stop/start/rm`, image khác container. Sơ đồ: lớp image chỉ đọc + lớp ghi của container; ánh xạ cổng host:container.
- **docker-dockerfile**: `FROM/WORKDIR/COPY/RUN/ENV/EXPOSE/CMD`, `build -t`, `history`, thứ tự lớp quyết định cache trúng/trượt, `.dockerignore`, `CMD` khác `ENTRYPOINT`. Nhắc giới hạn: `RUN apt-get install` không chạy được ở đây. Sơ đồ: đổi một file làm vỡ cache từ lớp nào trở đi.
- **docker-data**: lớp ghi mất khi `rm`; named volume; bind mount; `volume inspect`; sao lưu volume bằng một container phụ chạy `tar`; mount chỉ đọc. Sơ đồ: ba kiểu lưu trữ.
- **docker-network**: bridge mặc định không có DNS theo tên; bridge tự tạo có; `network create/connect/inspect`; publish khác không publish; trùng cổng. Sơ đồ: hai mạng, các container, cổng host.
- **docker-compose**: `compose.yaml` cho web (nginx) + app (`traefik/whoami`) + cache (redis); `services/ports/volumes/networks/depends_on` có healthcheck, `env_file`; `up -d/ps/logs/exec/down -v`; scale app. Sơ đồ: stack và hai mạng.
- **docker-multistage**: app Go chỉ dùng thư viện chuẩn, build bằng `golang:1.23-alpine` (`CGO_ENABLED=0`, `GOTOOLCHAIN=local`, `GOFLAGS=-mod=mod` không cần mạng vì không có dependency), runtime `alpine:3.20` hoặc `scratch`; so kích thước; `USER` số; `HEALTHCHECK`. Sơ đồ: stage build → artifact → stage chạy.
- **lab dlp-docker-run-lab**: (1) `web` từ `nginx:1.27-alpine`, cổng host 8080→80, restart `unless-stopped`, label `team=platform`; (2) `cache` từ `redis:7-alpine` với volume `redis-data` ở `/data`, bật `--appendonly yes`; (3) mạng `backend`, `api` (`traefik/whoami:v1.10`) và `cache` cùng mạng, `api` phân giải được `cache`; (4) `limited` (`alpine:3.20`, `sleep infinity`) giới hạn 64 MiB RAM và 0.5 CPU, env `APP_ENV=staging`; (5) xoá mọi container đã dừng tên bắt đầu `old-`, giữ container đang chạy; (6) `site` phục vụ `/srv/site` qua nginx cổng 8081, mount chỉ đọc, trả về đúng token có trong `index.html`.
- **lab dlp-docker-build-lab** (mã nguồn Go dựng sẵn ở `/root/shop-api`): (1) image `shop-api:1.0` dựng từ `/root/shop-api/Dockerfile`; (2) chạy bằng UID 10001; (3) `EXPOSE 8080`, container `shop-api` chạy, cổng host 8088, `GET /healthz` → 200 `ok`; (4) image dưới 25 MB; (5) `.dockerignore` loại `*.md`, `.git`, `tmp/` (image không chứa `README.md`); (6) có `HEALTHCHECK` và container ở trạng thái healthy.
- **lab dlp-docker-compose-lab** (`/root/stack`): (1) `web` (`nginx:1.27-alpine`) cổng 8090→80, cấu hình `./nginx/default.conf` cho trước proxy `/api` tới `app`; (2) `app` (`traefik/whoami:v1.10`) không publish ra host; (3) `cache` (`redis:7-alpine`) volume `cache-data` ở `/data`; (4) mạng `front` (web) và `back` (web, app, cache), app và cache không ở `front`; (5) healthcheck cho cache, `web` chờ cache healthy; (6) `curl localhost:8090/api` trả output của whoami; (7) `APP_ENV=lab` đến từ file `.env`.

## Chủ đề kubernetes — lộ trình `dlp-path-kubernetes-can-ban`

img mặc định `kubernetes-kubeadm-1node-rapid`; ★ = `kubernetes-kubeadm-2nodes-rapid`.
Không bài k8s nào dùng IDE (tổ hợp IDE + k8s chưa đo tài nguyên).

| id | tên | độ khó | min |
|---|---|---|---|
| `dlp-k8s-basics` | Cụm đầu tiên: node, Pod và kubectl | beginner | 25 |
| `dlp-k8s-deployments` | Deployment: nhân bản, cập nhật, quay lui | beginner | 30 |
| `dlp-k8s-services` | Service: gọi Pod bằng tên | intermediate | 30 |
| `dlp-k8s-config` | ConfigMap và Secret | intermediate | 30 |
| `dlp-k8s-health` | Probe và giới hạn tài nguyên | intermediate | 30 |
| `dlp-k8s-storage` | Lưu trữ: từ emptyDir tới PVC | intermediate | 30 |
| `dlp-k8s-multinode-scheduling` ★ | Lập lịch Pod trên nhiều node | advanced | 35 |
| `dlp-k8s-rbac` | Namespace, ServiceAccount và RBAC | advanced | 30 |
| `dlp-k8s-jobs` | Job và CronJob | intermediate | 25 |
| lab `dlp-k8s-workloads-lab` | Đưa dịch vụ lên cụm | intermediate | 45 |
| lab `dlp-k8s-broken-deploy` | Gỡ rối một cụm hỏng | intermediate | 45 |
| lab `dlp-k8s-config-access-lab` | Cấu hình, dữ liệu và quyền | advanced | 45 |
| lab `dlp-k8s-scheduling-lab` ★ | Điều phối trên hai node | advanced | 45 |

- **k8s-basics**: `cluster-info`, `get nodes -o wide`, `run`, `get/describe/logs/exec`, `delete`; sinh YAML bằng `--dry-run=client -o yaml` rồi `apply -f`; namespace. Sơ đồ: kiến trúc cụm (control plane, node, pod) và cách cụm k3s nằm gọn trong sandbox của bạn.
- **k8s-deployments**: tạo, scale, xoá pod để thấy tự hồi phục, `set image` + `rollout status/history`, image hỏng → `rollout undo`, `maxSurge`/`maxUnavailable`, nhãn nối Deployment–ReplicaSet–Pod. Sơ đồ: rolling update giữa hai ReplicaSet.
- **k8s-services**: IP pod thay đổi; ClusterIP; selector → EndpointSlice; tên DNS; `port` khác `targetPort`; NodePort; thử bằng `kubectl run tmp --rm -i --restart=Never --image=busybox:1.36 -- wget -qO- …`. Sơ đồ: Service định tuyến qua nhãn.
- **k8s-config**: ConfigMap từ literal/file; `env`/`envFrom`; mount thành file (cập nhật được) khác env (không); Secret, base64 không phải mã hoá; mount secret mode 0400. Sơ đồ: hai đường ConfigMap vào Pod.
- **k8s-health**: liveness/readiness/startup; readiness hỏng ⇒ pod rời endpoints; liveness hỏng ⇒ restart; requests/limits; OOMKilled thật với limit 32Mi. Sơ đồ: dòng thời gian probe.
- **k8s-storage**: emptyDir dùng chung giữa hai container; PVC với StorageClass `local-path` của k3s; dữ liệu sống qua xoá pod; StatefulSet + volumeClaimTemplates ở mức giới thiệu. Sơ đồ: Pod → PVC → PV → đĩa node.
- **k8s-multinode-scheduling** ★: nhãn node, `nodeSelector`, affinity bắt buộc/ưu tiên, taint/toleration, `cordon`/`drain`. Sơ đồ: hai node, taint, pod rơi vào đâu.
- **k8s-rbac**: namespace; ServiceAccount; Role/RoleBinding; `kubectl auth can-i --as=system:serviceaccount:…`; ClusterRole khác Role. Sơ đồ: subject → binding → role → tài nguyên.
- **k8s-jobs**: Job `completions`/`parallelism`/`backoffLimit`; CronJob, `create job --from=cronjob/…`, `suspend`, giới hạn lịch sử.
- **lab dlp-k8s-workloads-lab**: namespace `shop`; Deployment `web` (`nginx:1.27-alpine`, 3 bản, nhãn `app=web,tier=frontend`, requests 50m/32Mi, limit 64Mi, readiness HTTP `/`); ConfigMap `web-content` với `index.html` cho trước mount vào `/usr/share/nginx/html`; Service `web` ClusterIP cổng 80 trả đúng nội dung đó; Deployment `api` (`traefik/whoami:v1.10`, 2 bản) + Service `api` cổng 8080→80; scale `web` lên 4; rollout `web` sang `nginx:1.27.3-alpine` thành công.
- **lab dlp-k8s-broken-deploy** (viết lại không gợi ý, mỗi lỗi một Deployment/Service riêng): tag image sai; ConfigMap thiếu; selector Service lệch nhãn; readiness sai đường dẫn; `targetPort` sai; liveness giết container liên tục; env tham chiếu Secret/key không tồn tại. Tiêu chí mỗi task: Deployment đủ bản sẵn sàng và Service (nếu có) trả lời đúng qua một kết nối thật.
- **lab dlp-k8s-config-access-lab**: ConfigMap `app-config` từ file cho trước; Secret `db-cred` (`user`, `password` cho trước); Deployment `app` đọc `DB_USER`/`DB_PASSWORD` từ Secret và mount `app-config` vào `/etc/app`; PVC `data` 100Mi `local-path` được bound và pod `writer` ghi `/data/ok`; ServiceAccount `ci-bot` ở namespace `ci` chỉ `get/list/watch` pods trong `shop`, không gì khác (kiểm bằng `auth can-i`).
- **lab dlp-k8s-scheduling-lab** ★: nhãn `disk=ssd` trên node thứ hai và Deployment `db` chỉ chạy ở đó; taint node đầu `dedicated=infra:NoSchedule`, chỉ Deployment `monitor` có toleration chạy được ở đó; DaemonSet `log-agent` chạy trên mọi node kể cả node có taint; drain node thứ hai mà `web` (có PodDisruptionBudget minAvailable 1) không lúc nào về 0 bản sẵn sàng; uncordon lại.

## Lộ trình chéo `dlp-path-tu-container-toi-cum`

docker-basics → docker-dockerfile → docker-compose → k8s-basics → k8s-deployments →
k8s-services → lab docker-run-lab → lab k8s-workloads-lab → quiz `dlp-quiz-tu-container-toi-cum`.

## Quiz (mỗi chủ đề 10–14 câu, có giải thích)

`dlp-quiz-linux-cho-devops`, `dlp-quiz-bash-script` (mới), `dlp-quiz-git-thuc-hanh` (mới),
`dlp-quiz-docker-co-ban`, `dlp-quiz-kubernetes-co-ban`, `dlp-quiz-tu-container-toi-cum`.
Câu hỏi về tình huống ("lệnh nào cho biết vì sao pod Pending?"), không hỏi định nghĩa suông.

## Playground

`dlp-linux-playground`, `dlp-docker-playground` (giữ), `dlp-k8s-playground` (mới, img k8s, 30 phút).

## Bài nhập từ Killercoda

`ckad-configmap-as-files`, `loki-quickstart`, `loxilb-tcp-load-balancing`,
`prolug-linux-system-checking` giữ nguyên văn upstream (byte-exact, có license), chỉ
sidecar `dlp.json` của ta mang `topic`. Không đưa vào lộ trình.
