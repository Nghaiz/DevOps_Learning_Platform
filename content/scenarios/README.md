# `content/scenarios`

Nội dung bài học vendor từ upstream, **nguyên văn**, tại đúng commit ghim trong
`<id>/dlp.json`. Chặng **P2 / 2.E**.

```
<id>/
  dlp.json           ← file DUY NHẤT của ta (id, difficulty, xuất xứ, license)
  LICENSE.upstream   ← bản sao LICENSE của repo nguồn, tại commit đã ghim
  index.json         ← nguyên văn upstream
  step1.md …         ← nguyên văn upstream
```

Không sửa tay file upstream. `dlp.json` là SSOT — script vendor đọc nó để biết
kéo gì, không có danh sách repo nào cứng trong mã.

```bash
node scripts/vendor-scenarios.mjs --check           # so byte với commit đã ghim
node scripts/vendor-scenarios.mjs --fetch --only <id>
```

## Bộ mẫu hiện tại

Bốn bài được chọn vì **khác nhau về hình dạng**, không vì nhiều — mỗi bài là một
đối chứng cho một biến thể format mà parser phải chịu được
(`packages/scenario/src/content-scenarios.test.ts` khẳng định từng cái).

| id | license | biến thể nó mang |
|---|---|---|
| `ckad-configmap-as-files` | MIT | verify thật (kubectl) theo từng step; mang `courseData` — field Killercoda không định nghĩa; imageid 2-node |
| `prolug-linux-system-checking` | MIT | step nằm trong thư mục con; intro dùng `background` |
| `loki-quickstart` | Apache-2.0 | step **không** có title; **không** phase nào có verify |
| `loxilb-tcp-load-balancing` | Apache-2.0 | có `assets` + `chmod`; intro có đủ foreground/background/verify; chứa biến `{{TRAFFIC_*}}` |

## Bài first-party (`source: null`)

Soạn tại repo này, không nhập từ đâu. Chúng tồn tại vì bộ vendor ở trên **không
bài nào** sinh được cặp pass/fail thật trên cụm hiện tại (xem hai bẫy dưới).

| id | vì sao có mặt |
|---|---|
| `dlp-sandbox-basics` | bài pass/fail thật đầu tiên; chỉ dùng năng lực P1 đã đo (bash, jq, DinD); mang 1 asset; có bước khẳng định chính sự cô lập mạng |
| `dlp-docker-basics` | trụ cột "học Docker", mở được sau khi P3/3.I mắt 1 dựng registry mirror; **cũng là đồ đo tải cho mắt 3** (đỉnh RAM/CPU khi build) |

### ⚠ `dlp-docker-basics` — hai ràng buộc của môi trường

- **Chỉ `docker.io` đi qua được mirror.** Mọi bước cài gói qua mạng
  (`pip install`, `apt-get install`, `npm install`) **không chạy** trong sandbox —
  ghcr/quay/PyPI/kho Debian đều bị NetworkPolicy chặn. Bài dạy thẳng giới hạn này
  ở step 6 thay vì giấu nó; đừng "sửa" bằng cách thêm bước cài gói.
- **`apt-get update` vẫn `exit 0` khi mọi repo hỏng** (đo 2026-08-15: 44.8s, chỉ
  in `W: Failed to fetch`). ⇒ **Không dùng `apt-get` làm bằng chứng cho bất kỳ ô
  AC nào** — nó là lệnh luôn-thành-công ở đây, tức một phép đo mù.

### ⚠ Hai bẫy đã biết

- **`prolug` có verify no-op.** Cả ba `verify.sh` là `/bin/true` → luôn exit 0.
  Đừng dùng bài này làm bằng chứng cho ô AC pass/fail của 2.C: vế "fail" là bất
  khả. Dùng `ckad` (kubectl thật) hoặc `loxilb` (`stat /var/run/netns/loxilb`).
- **`ckad` cần cụm Kubernetes trong sandbox** (`capabilities: kubernetes,
  multi-node`). P1 đã chứng minh DinD trong pod Sysbox; kubeadm-trong-pod thì
  **chưa**. Nhãn đó là cảnh báo, không phải lời hứa chạy được.

## Trước khi thêm bài mới: kiểm license

Không có file `LICENSE` ở repo nguồn nghĩa là **all rights reserved** — không
vendor được, kể cả khi repo công khai. Ca thật: `killercoda/scenario-examples`
(kho ví dụ chính chủ, 136 sao) **không có LICENSE**, nên nó chỉ được đọc để hiểu
format, không có file nào của nó nằm trong thư mục này.

Quy trình đầy đủ: `docs/scenario-format.md` §6.
