# 1.E-2 — E6–E9: DinD thật trong pod Sysbox, allowlist dotfiles, đóng lane 1.E

**Ngày:** 2026-08-12 · **Chặng:** P1 / 1.E-2 · **Đóng:** E6, E7, E8, E9 + **AC "DinD offline" (D4)**
**Chạm:** `images/sandbox-base/Dockerfile`, `images/sandbox-base/entrypoint.sh` (mới), `.github/workflows/ci.yml`, `images/sandbox-base/README.md`, `plans/devops-learning-platform/phase-1.md`
**Không chạm:** không một dòng Go/TS nào. `env-check` vẫn 66 biến / 4 scope — chặng này không thêm env nào.

---

## 0. Trạng thái mở màn — món nợ tag lab đã đóng sẵn

Câu hỏi đầu chặng là "đóng nợ `dev-1c4b` trước hay sau". Đo trên cụm thì **nó đã đóng rồi**: release `platform` revision 32 (`10:40:47` cùng ngày) chạy `image.tag: sha-1530c13` cho **cả 5 image**, `orchestrator.env.sandboxImage` để rỗng (kế thừa đúng), warm-pool có 1 pod `sandbox-e885282d28f7` Running.

Ghi lại vì nó là ca thứ hai trong dự án mà **một món nợ được chép từ report sang report sau khi đã trả** — lần trước là dòng Timeline ghi "G12 đóng R25" trong khi G12 đóng R20. Report ghi nợ phải được đối chiếu với cụm trước khi tin, không đọc như trạng thái hiện tại.

---

## 1. AC "DinD offline" (D4) — ĐẠT, đo trên pod Sysbox thật

Đo trong pod `dind-probe` (namespace `dlp-sandbox`, `runtimeClassName: sysbox-runc`, `hostUsers: false`, không privileged, không hostPath — qua đủ 8 validation của VAP), **dưới NetworkPolicy `platform-sandbox-default-deny` đang sống**:

```
1) CHỨNG MINH OFFLINE
   curl https://registry-1.docker.io/v2/   → THẤT BẠI
   curl http://169.254.169.254/            → THẤT BẠI

2) docker info
   Client=29.7.2  Server=29.7.2  Driver=overlayfs  Runtime=runc

3) docker build FROM scratch  (COPY binary TĨNH oh-my-posh, ENTRYPOINT /app)
   → sha256:3595c69be477…

4) docker run cái vừa build
   → 30.6.4

5) docker image ls
   → dlp-scratch:probe          ← đúng một dòng, không gì bị pull
```

**Vế 1 là vế làm AC này có nghĩa.** Không có nó thì bốn vế còn lại chỉ chứng minh "lần chạy đó *tình cờ* không cần mạng", chứ không chứng minh "chạy được *khi không có* mạng" — mà đó mới là thứ D4 đổi AC để hỏi.

Vế 5 đóng câu hỏi mà tôi coi là rủi ro lớn nhất khi lập kế hoạch: **`docker build` có pull `moby/buildkit` không.** Không — builder mặc định là driver `docker`, dùng BuildKit **nhúng trong dockerd** (log: `Completed buildkit initialization`). Chỉ khi ai đó chạy `docker buildx create` mới sinh driver `docker-container`, và driver ĐÓ mới pull image, tức tự làm hỏng AC offline. Đã ghi vào README + plan để không ai "sửa" bằng cách tạo builder.

### Ba con số đi kèm

| Đo | Giá trị | Vì sao nó quan trọng |
|---|---|---|
| dockerd sẵn sàng | **3.6s** (`Starting up` 04:34:54.75 → `API listen on /var/run/docker.sock` 04:34:58.30) | Đường warm-pool không thấy độ trễ này (pod ấm hàng phút). Chỉ **cold-path** (pool rỗng) mới có thể gõ `docker` trong vài giây đầu — đánh đổi có chủ ý, entrypoint KHÔNG chờ socket. |
| `pids.current` | **30** / trần **4096** | Cảnh báo của plan — *"E7 dockerd sẽ đẻ rất nhiều con, ăn thẳng vào trần pids 4096 của D-19′"* — **không hiện thực hoá**. |
| `memory.current` | **153 MiB** / trần **1 GiB** | Còn xa trần LimitRange. `requests` KHÔNG đổi (512Mi/500m) ⇒ **trần 4 session đồng thời của D16 giữ nguyên**. |

> Hai số cgroup đọc **trên host** (`/sys/fs/cgroup/kubepods.slice/…-pod<uid>.slice`), không đọc trong pod. Sysbox ảo hoá `/sys/fs/cgroup` nên số nhìn từ trong pod là số giả — cùng bẫy đã ghi ở D-17′/D-19′.

---

## 2. E8 — allowlist dotfiles

Fixture 5 mục → chép **2**, từ chối **3**:

```
[WARN] từ chối (là symlink, không đi theo): .gitconfig
[WARN] từ chối (ngoài allowlist / traversal): evil.sh
[WARN] từ chối (ngoài allowlist / traversal): .ssh/authorized_keys
       dotfiles: chép 2 file (35 byte), từ chối 3
zshrc=DLP_FIXTURE_ZSHRC   nvim=DLP_FIXTURE_NVIM
evil=NO   authk=NO   gitcfg=NO
```

**`.gitconfig` là ca duy nhất có giá trị chứng minh.** Tên của nó nằm TRONG allowlist; nó bị chặn vì là **symlink trỏ `/etc/passwd`**. Bốn ca kia đều có thể xanh với một phép kiểm chỉ đọc tên file.

Cơ chế chặn là **một dòng**: `find … -type f` **không** có `-L`. Nó đóng cả hai vector thoát ra ngoài `$HOME` cùng lúc — file symlink hiện ra là `-type l` nên bị loại, và thư mục symlink thì `find` không đi xuống. Thêm `-L` "cho tiện" mở lại cả hai, trong khi mọi test tên-file vẫn xanh.

### Lỗi tự tìm ra giữa chặng: chặn đúng nhưng chặn IM LẶNG

Lượt đo đầu tiên in `từ chối 2` trong khi thực tế bỏ **3** file. Nguyên nhân: `-type f` loại symlink mà không bao giờ đưa nó vào vòng lặp, nên không có dòng log nào. Bảo mật thì đúng, nhưng người dùng có `.gitconfig` là symlink sẽ thấy cấu hình của mình **biến mất không dấu vết** và không có cách nào biết vì sao — đó là im lặng, không phải an toàn (`development-principles.md` § "Errors Over Silent Fallbacks"). Đã thêm lượt quét `-type l` riêng chỉ để NÓI ra, và một assertion trong CI bắt đúng dòng log đó.

### Hai cap

| Ca | Kết quả |
|---|---|
| 60 file (cap 50) | `dotfiles BỊ BỎ QUA TOÀN BỘ: 60 file > cap 50` → `$HOME/.config` rỗng |
| 300000 byte (cap 262144) | `dotfiles BỊ BỎ QUA TOÀN BỘ: 300000 byte > cap 262144` → `$HOME/.config` rỗng |

Cap kiểm **trước khi chép một byte nào**, và vỡ cap thì bỏ **toàn bộ** bundle. Chép tới đâu hay tới đó rồi dừng giữa chừng cho ra một `$HOME` nửa vời — trạng thái đó khó chẩn đoán hơn hẳn "không nạp gì cả, có lý do trong log".

### Guard `..` — vì sao phải gọi thẳng hàm

`find` trên một thư mục thật **không bao giờ** sinh segment `..`, và vector duy nhất khác là symlink thì đã bị chặn ở tầng trên. Nên nếu không gọi được hàm trực tiếp, guard `..` sẽ **vĩnh viễn không có ca kiểm nào**. Đó là lý do `entrypoint.sh` nhận cờ `--lib-only` (chỉ nạp hàm, không chạy gì) và CI `source` nó rồi bắn 5 ca xấu + 6 ca tốt vào `dlp_dotfile_allowed`.

Ca `.config/nvim..bak/init.lua` là ca chống-quá-chặt: nó chứa `..` nhưng không segment nào **là** `..`, nên phải ĐƯỢC PHÉP. Viết guard bằng `*..*` thay vì `*/../*` sẽ chặn nó — và ca này là thứ duy nhất phân biệt hai cách viết đó.

### Giới hạn phải đọc đúng

`/mnt/dotfiles` **chưa có ai mount**: `podspec.go` đặt `Volumes: nil`, CEL #8 cấm `hostPath`, và P1 chưa có tính năng nào cấp nội dung dotfiles. Nhánh này được kiểm ở **tầng image**, chưa từng chạy qua đường người dùng thật. Quyết định có chủ ý — mở rộng sang `podspec.go` là dựng một đường ống rỗng phải bảo trì trong file SSOT của lane khác.

---

## 3. E9 — tmux, và một gotcha thật lôi ra được

Cổng cũ tôi định viết là `tmux ls | wc -l == 1`. Nó **sai ở hai tầng**:

1. Nó xanh cả trong ca *"lượt hai giết session cũ rồi tạo session mới"* — mà ca đó chính là **mất bài của sinh viên**, tức đúng thứ D3 sinh ra để chặn. Cổng đúng là so `session_id`: `$0` → `$0`.
2. Lượt hai của `tmux new-session -A` trả về **mã 1** kèm `open terminal failed: not a terminal` khi không có TTY. Một cổng khẳng định mã trả về sẽ đỏ ở đây.

Vế 2 không phải lỗi: với `-A` và session đã tồn tại, tmux chuyển sang ngữ nghĩa **attach**, mà `-d` chỉ gác đường TẠO chứ không gác đường attach (đo trên tmux 3.4). **Đường thật an toàn** — `podexec/bridge.go:350` đặt `Tty: true`. Nhưng bất kỳ health-probe hay script dọn dẹp nào gọi `tmux new-session -A` không qua PTY sẽ nhận mã 1 và rất dễ bị đọc nhầm thành "tmux hỏng".

Kèm theo, một hiện vật của phép đo (không phải của sản phẩm): `tmux send-keys` gửi sau 6s rơi vào khoảng trống vì zsh + oh-my-posh chưa init xong; sau 3s + chờ 12s thì `docker run` trong tmux trả `30.6.4` / `RC=0`.

---

## 4. Ba cổng xanh vì chúng không kiểm gì

Đây là chủ đề của cả chặng, cùng họ với ba check hỏng của `04-verify-sysbox.sh` mà chính plan phê phán.

**(a) `trivy --exit-code 1` trả 0 sau khi FATAL.** Lượt quét đầu chết vì không tải được DB lỗ hổng (`context deadline exceeded`). Lượt sau tôi chạy với `>/dev/null 2>&1` và đọc `exit=0` là "0 CRITICAL". Sai — nó chưa quét được gì. Chạy lại có `--timeout 15m` và đọc bảng **Report Summary** mới là số thật. Một cổng bảo mật nuốt stderr là một cổng luôn xanh.

**(b) Verify command của D4 trong chính plan không chạy được.** Bản cũ: `printf "FROM scratch\n" > /tmp/D && docker build -q -t t /tmp && docker images t`. Ba lỗi chồng nhau — buildx tìm file tên `Dockerfile` chứ không `D`; dừng ở `docker images` nên chỉ chứng minh BUILD trong khi AC viết rõ *"rồi `docker run` nó"*; và `FROM scratch` rỗng thì **không có gì để run**. Nó chưa bao giờ chạy được, nhưng vì chưa ai chạy nên chưa ai biết. Đã thay bằng bản đã đo.

**(c) `FROM scratch` cần binary TĨNH.** Trong image này chỉ `oh-my-posh` là tĩnh (`ldd` → "not a dynamic executable"); `tini` và `docker-proxy` đều **động**. Chọn nhầm thì image build xong nhưng `docker run` chết ở loader — và triệu chứng đó nhìn giống hệt "DinD hỏng", tức dẫn người debug đi sai hướng hoàn toàn.

---

## 5. E6 — pwsh: nhánh có, đã chạy thật, vẫn mặc định 0

Build `INCLUDE_PWSH=1 INCLUDE_DOCKER=0` xanh, và **chạy thật**: `pwsh` → `7.6.4`, `Terminal-Icons` → `0.11.0`. Không ship một nhánh chưa từng build — đó đúng là "lời hứa suông" mà chính Dockerfile phê phán ở khối `ARG`.

Hai đính chính so với plan/README cũ:

- **README cũ ghi "Microsoft chưa publish gói cho 24.04" như lý do E6 chưa làm.** Đường `.deb` universal từ GitHub release hoạt động bình thường trên Noble — thứ thiếu là kênh `packages-microsoft-prod`, mà plan E6 vốn đã cố ý không dùng.
- **Plan E6 ghi "Terminal-Icons + PSReadLine từ PSGallery".** Chỉ cài `Terminal-Icons`: PSReadLine **đi kèm** pwsh 7, cài thêm một bản từ PSGallery chỉ tạo hai version cùng tên trong `$PSModulePath` và bản nào thắng phụ thuộc thứ tự nạp.

Mặc định vẫn `0` vì nó cộng **~330 MB** (706 MB so với 379 MB nền). Bật cả pwsh lẫn Docker là image ~1.1 GB phải side-load mỗi lần bump `image.tag`.

`sha256` lấy từ `hashes.sha256` của chính release — **chữ ký nhà phát hành**, mạnh hơn hẳn trust-on-first-use của `fastfetch`. File đó mã hoá **UTF-16LE có BOM**, nên `grep` trên nó im lặng trả rỗng và `sha256sum -c` ăn thẳng sẽ vỡ; phải `iconv` trước. Đã đối chiếu: hash tự tải về tính lại khớp hash nhà phát hành.

---

## 6. Kích thước, và cái giá thật của nó

| | `sha-1530c13` (bản đang chạy lab) | 1.E-2 |
|---|---|---|
| image | 379 MB | **809 MB** (+430) |
| tarball | 86 MB | **194 MB** |
| side-load host→VM | — | **3.3s** (~58 MB/s) |
| `ctr import` | — | **10.5s** |

> **Mốc so sánh phải nói rõ:** 379 MB là tag `sha-1530c13` đang chạy lab. Con số **369 MB** trong `phase-1.md` §1.E là bản 1.E-1 **gốc**, trước khi `sudo` được thêm ngày 2026-08-11 (`dev-sudo` 373 → 379). Cả hai đều đúng cho build của mình — nhưng `809 − 369 = 440` thì không nói về gì cả.

> **Đính chính một con số bị hiểu sai qua nhiều report:** "~52 KiB/s" là tốc độ VM ra **Internet**, không phải host→VM. Đường side-load đi qua mạng host-only và đo được ~58 MB/s. Lẫn hai thứ này sẽ dẫn tới quyết định sai về kiến trúc giao image.

---

## 7. Cổng local

```
actionlint   .github/workflows/ci.yml            0 issue
shellcheck   images/sandbox-base/entrypoint.sh   0 issue (SC2317 đã disable kèm lý do)
helm lint    infra/helm/platform                 0 chart failed
env-check    66 biến / 4 scope                   khớp code ↔ .env.example ↔ Helm ↔ CI
go vet       orchestrator · terminal-gateway · shared   sạch cả 3 module
go test      359 PASS / 0 FAIL / 0 SKIP (Redis + Postgres THẬT)
             — orchestrator 187 · gateway 120 · shared 52
trivy        CRITICAL 0  ·  HIGH 14 (oh-my-posh) + 3 (docker-buildx)
```

Chặng này **không chạm một dòng Go/TS nào**, nên suite Go chạy ở đây là bảo hiểm hồi quy chứ không phải bằng chứng về thay đổi — và **359 khớp chính xác con số của 1.C-4**, đúng như kỳ vọng.

> ⚠ **Hai lần suýt báo số sai, cả hai đều là bẫy đã biết:**
> 1. Lượt chạy đầu cho `PASS=162 SKIP=108` vì tôi quên nạp `.env` — đúng cái "suite xanh có thể là suite skip sạch". `SKIP` phải đọc **cùng** `PASS`, không bao giờ đọc `PASS` một mình. (Gateway còn cần `REDIS_URL` mượn từ `.env` của orchestrator — `.env` của chính nó **không có** biến đó.)
> 2. Lượt sau cho 270 và nhìn như hồi quy so với 359 của chặng trước. Không phải — `grep '^--- PASS'` **bỏ sót subtest** (chúng thụt đầu dòng). Đếm cả subtest thì đúng 359. Một cách đếm khác nhau giữa hai report trông y hệt một hồi quy.

Cổng mới thêm vào job `sandbox-image` (chạy ở **mọi PR**, không có `paths:`): binary docker/dockerd/buildx · E9 so `session_id` · allowlist dotfiles 5 assertion + assertion "phải NÓI RA khi bỏ symlink" · guard `..` gọi thẳng hàm · hai cap.

**AC D4 cố ý KHÔNG có cổng CI.** Runner GitHub không có Sysbox; một lượt `docker run --privileged` ở đó đo một môi trường KHÁC với nơi tính năng thật sự chạy — xanh không nói được gì chắc chắn, đỏ có thể là đỏ giả. Cổng không phân biệt được hai thứ đó là cổng gây nhiễu. Bằng chứng của D4 nằm trên cụm và trong report này.

---

## 8. Review đối kháng đổi gì (13 phát hiện, 12 đã vá)

Reviewer chạy `entrypoint.sh` thật trên 3 kịch bản và bắn 25 ca vào `dlp_dotfile_allowed`. Không tìm được đường thoát nào qua **tên file** (`-print0`/`read -r -d ''` xử lý đúng newline; `case` không glob-expand nên `$(id)`, backtick, backslash đều là dữ liệu trơ) và xác nhận `*` của `case` khớp cả `/` nên `.config/*` phủ đúng ý định. Nhưng tìm ra hai lỗi CAO mà tôi đã bỏ sót:

**(1) CAO — nhánh dotfiles sẽ chép 0 file nếu `/mnt/dotfiles` là ConfigMap/Secret/projected.** Kubelet dựng layout atomic-writer, nên `find -type f` chỉ thấy file dưới `..2026_…/` (lọt guard `..`, chết ở allowlist) còn mọi tên người dùng thấy là symlink (bị lượt `-type l` gạt). Log sẽ trỏ vào "allowlist" — dẫn người debug đi sai hướng hoàn toàn. **Đã vá:** đi theo `..data` khi nó tồn tại (chỗ DUY NHẤT trong file cố ý theo symlink; nó do kubelet dựng, không phải người dùng), kèm một ca CI dựng đúng layout đó. Đây là quyết định phải chốt **trước** khi có producer, không phải bug sửa sau.

**(2) CAO — `exec "$@"` với `$#` = 0 làm PID 1 thoát 0 trong im lặng.** `set -u` không bắt `"$@"` rỗng (bash miễn trừ `$@`/`$*`). Đo: `docker run --entrypoint /usr/local/bin/dlp-entrypoint.sh IMG` → `rc=0`. Ca này xảy ra thật nếu ai đó đặt `containers[].command` trong `podspec.go`. Bất biến "PID 1 phải sống" đang được giữ bởi một file **khác** mà script không nhìn thấy và **không cổng nào khẳng định** — cổng PID-1 cũ dùng `docker run -d` (có CMD) nên không phủ. **Đã vá:** `[ "$#" -gt 0 ] || set -- sleep infinity` + một cổng CI gọi entrypoint trực tiếp.

Bốn TRUNG, đều đã vá:

- **`log "dockerd đã khởi động nền"` in vô điều kiện.** `&` luôn thành công dưới góc nhìn shell cha. Nay `kill -0` sau một nhịp; nhánh hỏng đổ 20 dòng cuối của log ra **stderr** để `kubectl logs` có lý do — trước đó log nằm trong file bên trong pod nên triệu chứng là "pod Running, dashboard xanh, tính năng chết".
- **Cổng Trivy trong CI chưa áp dụng chính bài học của §4.** Nay ghi ra file + `timeout: 15m` + một bước khẳng định lượt quét ĐÃ chạy.
- **Tuyên bố RAM trong Dockerfile/README sai sau E7** — "~7.5 MB lúc rảnh" đúng với `INCLUDE_DOCKER=0`, nhưng mặc định là `=1` và dockerd chạy từ lúc pod start, tức **153 MiB**. Chênh ~20×, và ai tính sức chứa node sẽ đọc đúng dòng cảnh báo viết ra để chống hiểu sai rồi hiểu sai theo hướng ngược lại.
- **Cổng E9 không thể đỏ.** `2>/dev/null || true` nuốt mọi chế độ hỏng, và `id1 = id2` cũng đúng khi lượt hai **không làm gì**. Bản sửa reviewer đề xuất (`docker run -t`) **không dùng được** — đo được: có TTY thì lượt hai attach thật và chiếm terminal tới khi timeout. Thiết kế thay thế: lượt hai chạy **nền có TTY** (giống G4), rồi khẳng định từ ngoài bằng `list-clients` **0 → 1** — vế đó đỏ được khi `-A` ngừng attach.

Sáu THẤP đã vá: `find` nuốt stderr · dòng log tự mâu thuẫn (`chép 0 file (5 byte)` → nay tách "byte ghi ra / byte ứng viên") · `sed` nhận `$` không kèm số (biến mất cùng bản E9 mới) · hai cap thiếu đối chứng dương tại biên (thêm ca **đúng 50 file → phải chép 50**, ca duy nhất phân biệt `-gt` với `-ge`) · `PWSH_SHA256` nằm ngoài tầm mọi cổng (thêm bước tải `.deb` + kiểm checksum, không build cả nhánh) · sơ đồ header `ci.yml` lệch từ lâu.

**Một phát hiện KHÔNG vá, có lý do:** `$HOME` chứa symlink thì `mkdir -p`/`cp` ghi xuyên qua thành phần **cha**. Tôi không sửa bằng cách bỏ `cp` mà bằng cách **từ chối toàn bộ bundle** khi `find "$home" -maxdepth 3 -type l` có kết quả — rẻ hơn, và biến một bất biến của file khác thành thứ đo được tại chỗ. Đã đo: `$HOME/.config → /etc` cho ra `dotfiles BỊ BỎ QUA TOÀN BỘ`.

**Reviewer cũng đúng về một giới hạn tôi đã ghi:** `ARG DOCKER_GPG_SHA256`/`PWSH_SHA256` đè được bằng `--build-arg`. Đó là tính chất cố hữu của `ARG` (giống `OMP_SHA256` từ 1.E-1), không phải hồi quy của chặng này — người có quyền build vốn đã thắng. Ghi ra để đừng đọc comment ghim-checksum mạnh hơn thực tế.

---

## 9. Sau merge — hai món nợ đã đóng thật (2026-08-12, cùng ngày)

PR #41 merge vào `main` (`d09db86`), CI đóng `sha-d09db86` cho cả 5 image, và cả hai vế treo được đóng trong **một lượt**:

| | |
|---|---|
| Release | revision **33**, cả 5 thành phần chạy `sha-d09db86`, `sandboxImage` kế thừa đúng ⇒ **nợ tag ĐÓNG** (lần thứ 7 của cùng món nợ, và là lần đầu đóng ngay trong ngày merge) |
| Warm-pool | rút pod cũ theo đúng thứ tự `LREM` (**trả về 1**) → `DEL` → `delete`; orchestrator dựng lại `sandbox-951beede9195` từ **image CI đóng** |
| AC D4 qua **đường giao hàng thật** | trong pod warm-pool đó: `curl` ra registry và ra `169.254.169.254` đều **hỏng**; `docker info` `Client=Server=29.7.2`; `docker build FROM scratch` + `docker run` → **30.6.4**; `docker image ls` chỉ có image vừa build |
| tmux (lệnh G4 exec vào) | `session_id` `$0` → `$0`, `tmux ls` = 1, và `docker run` **bên trong tmux** trả `30.6.4` |

Nghĩa là AC D4 nay có **hai** mức bằng chứng: pod probe dựng tay (artifact đúng) và pod do orchestrator tạo từ image CI (đường giao hàng đúng). Vế thứ hai là vế mà chặng chính cố ý hoãn — nó đã đóng, không còn là nợ.

### Ba thứ học được ở bước sau-merge

1. **`docker pull` của Docker Desktop đứng ở 0 B/s trong ~40 phút** với image 809 MB, trong khi chính VM — guest trên cùng máy, cùng một link internet — `ctr pull` được ở 239 KiB/s rồi 3.4 MiB/s. Nghẽn nằm ở đường pull của Docker Desktop, không phải ở mạng. Ghi chú dự án đã có sẵn đường `ctr pull` với token `gh` mà không được đọc trước khi bắt đầu.
2. **`ctr` tiếp tục từ phần dở dang.** Lượt đầu đứt ở 45 MB (`connection reset by peer`); lượt cuối chỉ cần tải thêm **106 MB** là xong 809 MB. Đừng khởi động lại từ đầu khi một lượt pull đứt giữa chừng.
3. **`~/dlp-deploy` trên VM lệch khỏi repo và thiếu hẳn `mtls-secret.yaml`** — tức nó cũ hơn cả chặng 1.C-4, dù revision 32 rõ ràng đã deploy mTLS. `helm upgrade` từ thư mục đó sẽ **xoá Secret mTLS** và làm cổng gRPC chết. Đã đồng bộ lại từ repo trước khi upgrade, và thay hẳn thư mục cũ. Bài học chung: **thư mục deploy trên máy đích không phải nguồn sự thật** — đối chiếu với repo trước mỗi lượt upgrade.

---

## 10. Nợ còn lại
- **`/mnt/dotfiles` chưa có producer** (§2). Chưa task nào sở hữu vế mount.
- **Không có ai rollout warm-pool theo image.** Món nợ cũ từ 1.E-1 vẫn nguyên: đổi `SANDBOX_IMAGE` KHÔNG thay pod đang ấm, phải rút tay theo thứ tự `LREM` → `DEL` → `delete`. Với image 809 MB thì mỗi lần bump `image.tag` còn phải nhớ side-load thêm tarball 194 MB, nếu không warm-pool `ImagePullBackOff`.
- **Không có phép đo nào cho cold-path claim sau khi image béo lên.** AC hiện chỉ hỏi p95 claim từ pool ẤM (0.092s, không chạm image). Câu *"người thứ hai bấm Start ngay sau người thứ nhất chờ bao lâu"* vẫn chưa AC nào hỏi — và giờ nó có thêm 3.6s dockerd trong đó.
- **`docker buildx create` là một chân tự bắn.** Không có gì chặn sinh viên chạy nó và biến `docker build` thành driver `docker-container` cần pull. Không phải lỗ hổng bảo mật (NetworkPolicy vẫn chặn), nhưng là một cách để "Docker tự nhiên hỏng" mà không ai đoán ra nguyên nhân.
