# 6.A — đo hai ứng viên IDE và chốt

**Ngày:** 2026-09-03 · **Lab:** 1 node / 8 vCPU / 11.6Gi, Sysbox, k8s v1.34.10
**Harness:** [`harness/2026-09-03-6a-ide-measure/`](harness/2026-09-03-6a-ide-measure/)
**SSOT quyết định:** [`docs/ide-choice.md`](../../../docs/ide-choice.md)

## 0. Kết luận một dòng

**Chọn Theia** — nó thua code-server ở kích thước image và ở "RAM lúc rảnh" theo
nghĩa hẹp, nhưng thắng **~310Mi mỗi pod** ở trạng thái duy nhất quyết định trần
đồng thời: một người học đang mở IDE. Bảng số đầy đủ, cả cột của cái BỊ LOẠI, nằm
trong `docs/ide-choice.md`; đây là báo cáo cách đo và những gì phép đo không nói.

## 1. Cách đo, và vì sao đo như vậy

Ba pod dựng **cùng lúc trên cùng node**, cùng `runtimeClassName: sysbox-runc`,
cùng `hostUsers: false`, cùng LimitRange 250m/256Mi–2/1Gi như pod sandbox thật:

| pod | image |
|---|---|
| `ide-measure-control` | `dlp-sandbox-base:sha-2b79fd3` **y nguyên** |
| `ide-measure-codeserver` | base **+** code-server 4.135.0 |
| `ide-measure-theia` | base **+** Theia 1.74.100 (build từ nguồn) |

Ba quyết định đo, mỗi cái đóng một đường nói dối:

1. **Xếp IDE lên ĐÚNG tag base đang chạy**, không dựng lại từ `ubuntu:24.04`. Thứ
   6.A hỏi là *phần cộng thêm*; dựng lại từ đầu thì mọi khác biệt trong layer apt
   cũng rơi vào cột "IDE tốn bao nhiêu".
2. **Có pod đối chứng, chạy đồng thời** (6.A task 3). Không có nó thì mọi số là
   TỔNG, và câu hỏi là PHẦN THÊM. Nó cũng cho biết **sàn nhiễu**: ba pod cùng tải
   lúc rảnh lệch nhau 47.4–53.3Mi, tức **~6Mi**. Mọi chênh lệch dưới ngưỡng đó
   không đọc được.
3. **Đo ở cgroup TRÊN HOST**, và đo **workingSet = `memory.current` −
   `inactive_file`**, không đo `memory.current` trần. Sysbox biên tập thứ
   `kubectl exec` nhìn thấy nên số trong pod không phải số kernel đang áp; và
   `memory.current` gộp page cache nên đặt `requests` theo nó là giữ chỗ cho thứ
   sắp bốc hơi.

**Client là trình duyệt thật** (Playwright qua `kubectl port-forward`), không phải
`curl`. Đây là điểm quyết định cả bài đo: với `curl` thì IDE mới chỉ *đang nghe*,
và số đọc ra là **128Mi/253Mi**. Với một trình duyệt thật mở workspace, cùng hai
pod ấy đọc ra **572Mi/451Mi** — gấp 4.5× và 1.8×, **và đảo luôn người thắng**.
Một phép đo chỉ dùng `curl` sẽ chốt nhầm ứng viên mà vẫn xanh trọn vẹn.

## 2. Số

Bảng đầy đủ: `docs/ide-choice.md` §1. Ba dòng quyết định:

| workingSet (MiB) | đối chứng | code-server | Theia |
|---|---:|---:|---:|
| IDE bật, **chưa có client** | 55.1 | **128.0** | 253.3 |
| **1 client đang mở** workspace 50 file | 55.1 | 571.6 | **451.4** |
| sau vài lượt tải lại (mức thường trực) | 55.1 | 719–753 | **446–447** |

code-server **không nhả RAM** khi tab đóng (571.6 → 530.7, chỉ nhả 41Mi) rồi cộng
~180Mi cho phiên kế, chững lại quanh 750Mi. Theia đứng yên ở 446–451 qua mọi lượt
tải lại. Đây **không phải leak** — nó chững thật — nhưng mức thường trực phải đọc
là 750Mi chứ không 571Mi, vì người học có tải lại trang.

## 3. Thứ suýt làm chốt sai

Phase-6 xếp tiêu chí số một là *"RAM lúc rảnh"*. Cụm từ đó có hai nghĩa và
**hai nghĩa cho hai người thắng ngược nhau** (§2, hai dòng đầu). Nghĩa "IDE bật,
chưa ai mở" mô tả một trạng thái **không tồn tại trong sản phẩm** — pod sandbox chỉ
sống khi có người claim nó, và nếu bài có `layout: ide` thì người ấy đang mở IDE.

Bảng số không sai. Chọn sai population thì đọc ra người thắng ngược lại.

## 4. Hệ quả lên trần — và vì sao nó CHƯA phải phép đo

Với `requests` phủ mức thường trực: Theia ⇒ trần **10**, code-server ⇒ trần **7**
(hiện tại không IDE: **21**). Cả hai **tụt quá nửa**, nên điều kiện 6.E task 17
đã kích hoạt: phải **tách profile**, không nâng đều.

⛔ Con số 10/7 là **ước lượng**: nó lấy pod chạy IDE **và không chạy gì khác**.
Người học thật chạy IDE **cộng** bài học (đỉnh bài Docker: 163Mi). Cộng thẳng hai
số là giả định chúng không chồng lấn — chưa ai đo. **Phép đo còn thiếu: một pod
chạy đồng thời bài Docker và IDE.** Đó là việc của 6.E, và nó có thể đổi cả hai
con số.

## 5. Phát hiện phụ — một ô AC của 6.C sẽ đỏ oan

`ss` và `netstat` **không có** trong `sandbox-base` (cả ba pod: MISSING). Lệnh
verify mà phase-6 ghi cho AC "IDE không nghe 0.0.0.0" —

```bash
kubectl exec $POD -- ss -ltn | grep -v 127.0.0.1
```

— sẽ đỏ **vì thiếu binary**, trên một hệ hoàn toàn lành. 6.B/6.C phải chọn: thêm
`iproute2`, hoặc đổi verify sang `/proc/net/tcp` (harness `listen.sh` đã chạy được).

Đo bằng đường thứ hai: **cả hai IDE chỉ nghe loopback**, đúng một socket mỗi pod
(`0100007F:0FA1` = 127.0.0.1:4001, `0100007F:0FA2` = 127.0.0.1:4002), không socket
nào trên `0.0.0.0`; pod đối chứng không có socket LISTEN nào — đối chứng âm cho
chính phép kiểm ấy.

## 6. Món nợ mà lựa chọn này mang theo

Theia **không còn bản dựng sẵn nào cho browser** (kiểm 2026-09-03: `theiaide/theia`
404, `ghcr.io/eclipse-theia/theia-ide` 404, release chỉ có Electron). 6.B do đó
**không** dùng được khuôn `curl + sha256sum -c` của `fastfetch`/`oh-my-posh`/`pwsh`;
phải build từ nguồn (bước build đo được 356.5s, tổng ~8 phút; 97 plugin tải từ Open VSX) và chỉ ghim được **tag
nguồn**, không ghim được digest artifact. Đây là bảo đảm **yếu hơn** hai đường kia
và phải ghi rõ trong image thay vì để nó trông giống nhau. Chi tiết + đường xử:
`docs/ide-choice.md` §5.

## 7. Ô AC của 6.A

- [x] `docs/ide-choice.md` có bảng số **cả hai** ứng viên + đối chứng pod-không-IDE.
- [x] Điều kiện đảo quyết định — 4 điều kiện, mỗi điều kiện có ngưỡng số
      (`docs/ide-choice.md` §4).
- [x] Số của cái BỊ LOẠI ghi đầy đủ, kể cả hai tiêu chí nó thắng.

Ba ô AC còn lại của phase-6 (`INCLUDE_IDE`, cùng-filesystem, authz route) thuộc
6.B–6.E, chưa đụng tới trong lượt này.

## 8. Dọn dẹp

Namespace `dlp-ide-measure` đã xoá. Hai image đo (`dlp-ide-measure-codeserver`,
`dlp-ide-measure-theia`, ~1.0GB trên node) **giữ lại có chủ ý** cho phép đo
"IDE + bài học" của 6.E; xoá chúng thì phải side-load lại 960 MiB. Lệnh xoá khi
6.E xong:

```bash
sudo ctr -n k8s.io images rm \
  ghcr.io/nghaiz/dlp-ide-measure-codeserver:sha-2b79fd3 \
  ghcr.io/nghaiz/dlp-ide-measure-theia:sha-2b79fd3
```

⚠ Xoá tag **không** giải phóng đĩa ngay: record `sha256` mồ côi + lease của
containerd chặn GC (`containerd-orphan-records-block-gc`). Kiểm `df -h /` sau khi
xoá, đừng giả định.
