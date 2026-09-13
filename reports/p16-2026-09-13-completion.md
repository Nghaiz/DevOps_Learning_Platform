# P16 — kết quả tích hợp

> **PHÂN ĐỊNH — phần landing của báo cáo này mô tả trạng thái TRƯỚC lượt 3D cùng ngày.**
> Build `HZG3aU7v-lBMcBxxAFsSE` mang landing không-3D của chỉ đạo 2026-09-12. Sau đó trong ngày
> 2026-09-13, chủ dự án đảo ngược **riêng phần 3D** và yêu cầu hành trình 3D cuộn toàn trang; bản
> đó triển khai ở `d5bf768`, nghiệm thu riêng **20/20** trên build `I7eYNXwmu3q9KzrnjDpAr`. Vì
> vậy câu "xoá toàn bộ cảnh vòng/3D" ở mục Phạm vi bên dưới chỉ đúng cho lượt này và **không còn
> mô tả trang chủ hiện tại**. Lệnh cấm vòng trắng vô nghĩa thì vẫn còn hiệu lực, nên dòng "yêu
> cầu bỏ vòng áp dụng landing" ở phần sau không bị rút. Mọi phần khác của báo cáo — copy, SMTP
> reset, a11y/CSP, bundle, thu hồi phiên — giữ nguyên hiệu lực, và không số đo nào ở đây bị sửa.
> Landing hiện hành: [2026-09-13-landing-3d-completion.md](2026-09-13-landing-3d-completion.md).

Trạng thái: hoàn tất phạm vi P16. Lượt cuối đạt **171/171 E2E, 0 lỗi, 0 skip, 0 retry**, 374.3 giây trên build production cục bộ `HZG3aU7v-lBMcBxxAFsSE`.

## Phạm vi đã thực hiện

- Dựng lại landing theo yêu cầu mới nhất: xoá toàn bộ cảnh vòng/3D và copy cũ, bố cục nội dung mở, terminal minh hoạ Linux/Docker/Kubernetes có chọn/chạy/đặt lại, bốn lộ trình thật, số liệu từ nội dung đã xuất bản. Ảnh OpenGraph cùng hướng dòng lệnh.
- Hoàn tất 466 chuỗi giao diện trong 31 file author/problem, 44 mục lỗi có cấu trúc, kiểu CopyRef tương quan key/params và nguồn nhãn games. Việc thêm seed 10 bài tập, dời CopyRef và dựng bundle gate đã có trong các commit đầu phiên; đã đọc lịch sử và tái sử dụng.
- Backend SMTP đặt lại mật khẩu, mã POST dùng một lần, hạn 15 phút, thu hồi phiên/cookie. SMTP chạy sau rate limit và kiểm tra đầu vào; lỗi nhận thư không tiết lộ tài khoản. Có Mailpit cục bộ và hướng dẫn SMTP Secret/egress cho triển khai.
- Khoá theo user cho refresh rotation/bootstrap/reset/logout, kiểm lại session sau khoá, thu hồi hết hậu duệ kể cả sau hơn 100 lần rotation. Review độc lập đã tìm và xác nhận sửa các lỗi này.
- Nâng primary tối để chữ đạt 4.5:1 trên cả background/card/muted. Đồng bộ token, hợp đồng và tài liệu.
- Sửa lỗi bộ kiểm preferences trên Windows dùng nhầm WSL bash; dùng Git Bash và dấu nhận diện thư mục HOME thử nghiệm trước khi chạy script.
- Sửa phần tử tìm kiếm vô hình vẫn nhận Tab; giữ focus đúng khi đóng. Cho thanh tab author xuống dòng ở 390 px. Không che tràn ngang bằng overflow-hidden.
- Sửa cấp tiêu đề trên 15 trang và đưa hai luật heading vào gate axe, có đối chứng âm chạy trên HTML thật. CardTitle/AlertTitle nhận cấp heading tuỳ chọn, giữ mặc định cũ.
- Cổng antipattern nhận diện riêng bốn dòng nối menu hành động Arena hợp lệ; vẫn chặn mọi mẫu chống gian lận cũ. Không sửa hành vi Arena.

## Bằng chứng đã có

- Bảy package: 28/28 tác vụ build/lint/typecheck/test ép chạy, 0 cache. Tests: motion110, shared-types48, terminal133, copy63, scenario285, games402, UI876.
- Web: 153 bộ, 1747 ca qua, 0 skip. Sau đó regression refresh mới chạy 12/12, có chuỗi 101 lần rotation; SearchTabs 20/20 sau sửa focus. Các số này là các lượt riêng, không cộng chồng thành tổng ca duy nhất.
- Sau các thay đổi cuối: 371 kiểm thử UI và 30 kiểm thử web liên quan qua; build production, lint và typecheck đều qua. Bundle chung 1,047,523 B dưới trần 1,150,000 B; xterm chỉ ở 4 route terminal, không vào 33 route còn lại.
- Browser lượt đầu: 5/5 visual và SMTP/reset qua. Lượt core đầu 157/165 qua, 8 lỗi, 0 skip; 72 axe/CSP phủ 32 màn đều qua ngưỡng chặn. Các lỗi thật về focus/tràn ngang đã dẫn tới bản sửa; không xoá hay nới phép kiểm để đóng chúng.
- D10 riêng: 3/3 với sandbox thật, byte Escape tới PTY, Esc-Esc nhanh thoát focus, cặp chậm hơn 500 ms giữ focus. Phiên thử được kết thúc.
- P15 đã được sửa ở `5d90ad1` và `6d8d2fc`; 50/50 regression mới qua. Không có phép đo tải cluster mới được tự nhận.

## Lượt nghiệm thu cuối

| Bộ | Qua | Lỗi/skip |
|---|---:|---:|
| Axe, gồm đủ 32 màn và đối chứng | 36 | 0/0 |
| CSP, gồm đủ 32 màn và đối chứng | 37 | 0/0 |
| Bàn phím, kể cả sandbox thật | 44 | 0/0 |
| Responsive, kể cả bốn màn author tại 390 px | 41 | 0/0 |
| Landing sáng/tối, desktop/mobile | 4 | 0/0 |
| Motif/chuyển động dùng chung | 4 | 0/0 |
| Hiệu năng và đối chứng độ trễ | 4 | 0/0 |
| Đặt lại mật khẩu qua SMTP | 1 | 0/0 |
| **Tổng** | **171** | **0/0** |

32 báo cáo axe có `violations: []`. LCP cục bộ lượt cuối: landing 132 ms, lessons 584 ms, dưới ngân sách không đổi 2500 ms; tiêm trễ 2000 ms làm phép đo tăng 2348 ms. Lead đã nhìn ảnh desktop/mobile mới và terminal thật; ảnh mobile toàn trang đã sửa cách chụp để sticky header nằm đúng đầu trang.

## Điều kiện đo và giới hạn

Mọi E2E khai rõ `E2E_START_SERVER=1`, `E2E_BASE_URL=http://localhost:3000`, `E2E_ORIGIN=http://localhost:3000`, yêu cầu đủ role và sandbox. Web là bản dựng cục bộ; gateway/orchestrator thử nghiệm đi tới Sysbox thật trong namespace riêng. Không dùng build cũ trên cụm làm bằng chứng cho mã mới.

Axe để `color-contrast` ở trạng thái incomplete trên tám màn; không biến trạng thái đó thành đạt và không tuyên bố chứng nhận WCAG toàn diện. Kiểm tra token và kiểm tra hình ảnh là các bằng chứng bổ sung có phạm vi riêng.

Năm artifact được kiểm bằng validator của workflow-artifact-gate. Wrapper phát hiện marker tắt gate có sẵn trong repo, nên lead gọi trực tiếp validator để kiểm đầy đủ shape và policy; không sửa hay tắt hook.

SMTP được kiểm bằng sink Mailpit và socket SMTP thật. Không có credential nhà cung cấp production trong môi trường; không tuyên bố đã gửi email Internet hay triển khai production. Những thay đổi được giao là backend/config/tài liệu và nghiệm thu cục bộ.

Tab Editor cho Lab cần hợp đồng schema/nội dung riêng; Arena 3D và các ngoại lệ màu của Arena nằm ngoài phạm vi P16 frontend. Yêu cầu bỏ vòng áp dụng landing; không xoá tính năng Arena hay primitive tiến độ dùng ở các màn khác.

## Dọn môi trường nghiệm thu

Đã dừng tiến trình gateway/orchestrator thử riêng, xoá namespace `dlp-e2e-p16`, dọn Redis DB 13 đã dành riêng, tài khoản thử, thư Mailpit và file chứa credential/auth state. Không còn listener thử nghiệm; PostgreSQL, Redis và Mailpit hiện có được giữ lại ở trạng thái hoạt động. Biên nhận: [cleanup.json](harness/2026-09-12-p16-runtime/acceptance-all-green/cleanup.json).

## Báo cáo chi tiết

- [Landing](p16-2026-09-12-landing.md)
- [Copy](p16-2026-09-12-copy.md)
- [Backend](p16-2026-09-12-backend.md)
- [Runtime](p16-2026-09-12-runtime.md)
- [Review độc lập](p16-2026-09-12-review.md)
- [Tài liệu](p16-2026-09-12-docs.md)
- [Đối chiếu kế hoạch](p16-2026-09-13-finalization.md)

Các ảnh vòng cũ chỉ là lịch sử đã bị người dùng từ chối; ảnh nghiệm thu landing cuối nằm trong `harness/2026-09-12-p16-runtime/`.
