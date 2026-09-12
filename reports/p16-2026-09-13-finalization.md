# P16 — Trạng thái chốt pha

Ngày: 2026-09-13, Asia/Bangkok. Phiên triển khai bắt đầu 2026-09-12.

**Trạng thái: COMPLETE trong phạm vi P16 đã chốt.** Lượt nghiệm thu cuối **171/171 qua,
0 lỗi, 0 skip, 0 retry**, 6.2 phút trên production build `HZG3aU7v-lBMcBxxAFsSE`.
Hai lỗi locator terminal, hai lỗi focus SearchTabs ẩn, bốn lỗi author tràn 390px và 15 vấn đề
heading moderate đều đã sửa và kiểm lại. Dọn runtime riêng và hoàn tất commit do lead điều phối;
báo cáo này không nhận các tác vụ đó là đã xong trước khi có xác nhận.

## Phạm vi và quyết định hiện tại

- Làm nốt Phase 16 trên working tree `feat/p16-debt-closure`, đọc lịch sử trước khi sửa.
  HEAD nền lúc vào phiên là `cc28626`; các thay đổi seed, bundle và lần chuyển `CopyRef` đã
  tồn tại. Không triển khai lại hoặc nhận chúng là commit mới của phiên này.
- Chỉ đạo mới của người dùng thay toàn bộ landing: bỏ vòng trắng, ellipse, 3D và lưới thẻ.
  Trang thay thế gồm hero, terminal minh hoạ Linux/Docker/Kubernetes, số nội dung thật, bốn
  lộ trình và giải thích việc thực hành. Không nhận ảnh vòng cũ là bằng chứng nghiệm thu.
- Mở rộng phần đóng nợ sang copy author/problem, SMTP reset, thu hồi credential và contrast.
  P15 đã sửa trước đó; phiên này xác nhận lại bằng 50 regression thay vì sửa lại mã đã có.
- File plan đã đồng bộ trạng thái và đặt số đo 2026-09-10–11 trong khối lịch sử riêng.
  [Phase 16](../plans/devops-learning-platform/phase-16.md) là nơi theo dõi mốc hiện tại.

## Deliverable và chứng cứ

| Deliverable | Kết quả hiện có | Nguồn |
|---|---|---|
| Landing mới | Xoá nguồn loop/scene và copy cũ; demo thao tác thật, công bố kết quả mẫu; 8 unit test; 4 ca desktop/mobile sáng/tối và chuyển theme qua, ảnh đã nhìn | [Landing](p16-2026-09-12-landing.md), [runtime](p16-2026-09-12-runtime.md) |
| Copy còn dở | 466 chuỗi / 31 file, 44 lỗi có hướng xử lý; toàn bộ file sản phẩm của lane author/problem đã chuyển | [Copy](p16-2026-09-12-copy.md) |
| Hợp đồng copy | `CopyRef`/`renderCopy` ở copy, static/dynamic key kiểm đúng params; nhãn game giữ export và đọc surface `problem`; AST gate có đối chứng | [Review](p16-2026-09-12-review.md), [hợp đồng](../plans/devops-learning-platform/contracts/p16-copy.md) |
| Hai route thiếu dữ liệu | 10 bài published `K8S-0001`..`K8S-0010` có nguồn seed; **36 axe + 37 CSP trên đủ 32 màn qua**, gồm cả hai route và kiểm heading bổ sung | Commit `ad197a3`, merge `cc28626`, [runtime](p16-2026-09-12-runtime.md) |
| Reset password | SMTP thật, mã POST 15 phút dùng một lần, response riêng tư, xoá phiên/cookie/refresh; integration/form 21 ca qua; browser đọc thư Mailpit và đăng nhập bằng mật khẩu mới qua | [Backend](p16-2026-09-12-backend.md), [runtime](p16-2026-09-12-runtime.md) |
| Refresh cạnh tranh và chuỗi dài | Common users-row lock, kiểm session sau lock khi bootstrap; traversal hết frontier; 101 lần xoay token vẫn bị thu hồi khi replay root | [Review](p16-2026-09-12-review.md), [12 regression](p16-2026-09-12-refresh-tests.log) |
| P15 | Đã sửa ở `5d90ad1` + `6d8d2fc`; phiên này 50 regression qua, không tuyên bố đường cong tải mới | [Backend](p16-2026-09-12-backend.md), [đo P15](../plans/devops-learning-platform/reports/2026-09-10-verify-p15.md) |
| Contrast primary tối | Background 6.3056, card 5.7071, muted 4.8157; đưa vào cổng text 4.5 cùng màu cũ làm đối chứng âm | [Docs](p16-2026-09-12-docs.md), [hợp đồng token](../plans/devops-learning-platform/contracts/p16-tokens.md) |
| Bundle | Đúng 4/4 route terminal có xterm, 33 route khác không có; nền chung **1,047,523 B** dưới 1,150,000 B trên build cuối | [Log bundle cuối](p16-2026-09-12-bundle-final.log) |

## Kiểm tra mã và build

Các con số dưới đây đọc từ log đã thực thi; agent chốt plan không chạy lại build/test.

| Phép kiểm | Kết quả | Log |
|---|---|---|
| Bảy package, build/lint/typecheck/test ép chạy | **28/28 task, 0 cache**; UI 876, games 402, scenario 285, terminal 133, motion 110, copy 63, shared-types 48 | [Packages](p16-2026-09-12-packages-final.log) |
| Web suite đầy đủ trước sửa UI cuối | **153 suite / 1747 test, 0 thất bại, 0 skip**; đây là mốc nền trước sửa focus/overflow/heading | [Web tests](p16-2026-09-12-web-tests-final.log) |
| Web regression sau sửa traversal cuối | **2 suite / 12 test**, gồm concurrency và 101 lần rotation; phần lớn đã nằm trong suite trước, không cộng tổng | [Refresh](p16-2026-09-12-refresh-tests.log) |
| UI và web sau sửa semantics cuối | **371 UI + 30 web test**, 4 suite mỗi nhóm; đều qua. Có phần giao với các suite nền, không cộng tổng | [UI](p16-2026-09-13-ui-final.log), [web UI](p16-2026-09-13-web-ui-final.log) |
| Production build cuối | Thành công, BUILD_ID `HZG3aU7v-lBMcBxxAFsSE` theo lead | [Build](p16-2026-09-12-build-final.log) |
| Web lint và typecheck | Thành công; typecheck log không có lỗi | [Lint](p16-2026-09-12-web-lint-final.log), [types](p16-2026-09-12-web-types-final.log) |
| Token, env, antipattern | Token 560 file / 4 vùng, 4 miễn trừ ghi lý do; env 95 biến / 4 scope; antipattern **602 file** và đối chứng qua. Bốn phê duyệt chính xác cho statement menu Arena đã qua review, không miễn toàn file | [Tokens](p16-2026-09-12-tokens-final.log), [env](p16-2026-09-12-env-final.log), [antipattern](p16-2026-09-12-antipattern-final.log) |
| Review độc lập | **9/10, 0 P0–P2 còn mở**; ba P2 đã sửa cùng khe hở refresh/reset | [Review](p16-2026-09-12-review.md) |

Đã chạy đủ bốn loại kiểm tra cho mọi package, nhưng **không có một lượt monolithic turbo
32/32 mới** được nhận ở bảng này. Lịch cuối tách bảy package và web nhằm tránh ghi `.next`
khi E2E đang dùng, đồng thời tránh quá nhiều worker trên máy Windows. Không giảm test hay
ngưỡng để đổi lấy kết quả xanh.

Lượt rộng trước đó thất bại được giữ trong [checks](p16-2026-09-12-checks.log) và
[turbo](p16-2026-09-12-turbo.log). Lỗi fixture Bash trên Windows được sửa để gọi Git Bash và
kiểm đúng HOME tạm trước khi chạy script; 12 ca preferences đã qua. Các lỗi auth trong lúc
lane chưa ổn định được sửa rồi chạy lại như chứng cứ ở trên.

## Cổng nghiệm thu trình duyệt

Mọi lệnh E2E của phiên phải khai đủ:

```text
E2E_START_SERVER=1
E2E_BASE_URL=http://localhost:3000
E2E_ORIGIN=http://localhost:3000
E2E_REQUIRE_ROLES=1
E2E_REQUIRE_SESSION=1
```

Ingress cục bộ ở cổng 3000 trỏ Next production ở 3001 và gateway thật ở 8082; giữ Origin và
cookie. Namespace sandbox riêng `dlp-e2e-p16`, Redis DB13 đã được kiểm rỗng trước khi dùng.
Không công bố JSON cấu hình runtime vì chứa credential.

| Lượt | Build | Kết quả được nhận |
|---|---|---|
| Landing mới + reset Mailpit | `cFSkRzlLKu1rcRGDwnUlh` | **5/5 qua**, 4 visual/interactions + 1 reset; 18.7 giây |
| Core đầu: a11y, CSP, responsive, keyboard, motif, LCP, reset | `hVxgvKqAtSvzBnAe2XIOu` | **157 qua / 8 lỗi / 0 skip**. Toàn bộ **72 axe+CSP / 32 màn** và perf qua. Chưa nhận lượt này là đạt toàn chặng. |
| D10 sau sửa locator READY | Cùng production build, harness sửa đúng control READY | **3/3 qua** với PTY thật: Escape bytes, thoát focus, cặp thao tác chậm đều kiểm chứng. |
| Toàn bộ tám spec sau sửa nguồn cuối | `HZG3aU7v-lBMcBxxAFsSE` | **171/171 qua, 0 lỗi, 0 skip, 0 retry**, 6.2 phút; [log cuối](p16-2026-09-12-e2e-all-final.log) và [artefact](harness/2026-09-12-p16-runtime/acceptance-all-green/) |

Lượt cuối đo lại cả tám spec trên cùng build sau sửa refresh, focus, responsive, heading và
social preview: **36 axe, 37 CSP, 44 keyboard, 41 responsive, 4 motif, 4 perf, 1 SMTP, 4 visual**.
Axe và CSP phủ đủ 32 route; keyboard dùng PTY thật với D10; responsive gồm bốn màn author
390px từng lỗi. Reset Mailpit và toàn bộ ảnh/thao tác landing đều được chạy lại, không dùng
ảnh ở build trước để thay nghiệm thu cuối.

Trước thiết kế thay thế, lượt scene headless có hai lỗi SwiftShader, lượt headed có bốn ca
qua trên GPU thật; tất cả là **lịch sử đã bị yêu cầu landing mới thay thế**. Lượt core đầu chạy
0 test do BUILD_ID mất sau build bị ngắt cũng không được nhận là bằng chứng. Runtime report
giữ các sự kiện này để tránh dùng nhầm artefact cũ.

## Bàn giao cuối phiên

1. **Đã đóng cổng 16.I** bằng 171 ca cùng build; plan chuyển COMPLETE theo kết quả thực thi.
2. Lead quản lý artefact cook/review và việc dọn runtime riêng; không xoá Redis DB14/15 hoặc
   account admin có sẵn. Runtime đang cập nhật báo cáo dọn tài nguyên, chưa nhận hoàn tất ở đây.
3. Git manager quét secret và commit pathspec các thay đổi của phiên; không đưa credential,
   runtime config hoặc ba ảnh người dùng có sẵn vào commit. Báo cáo này chưa ghi commit mới.

## Giới hạn được ghi rõ

- Lab vẫn chưa có tab Editor: schema `Lab` không có `interfaceLayout`; dời `IdePane` không
  tự tạo tính năng đó. Phần này nằm ngoài phạm vi schema/nội dung của việc dựng lại frontend.
- Arena không được dựng lại; miễn màu theo phạm vi vẫn có tên. Chỉ phần nhãn problem trong
  games được mở vào phạm vi copy.
- Backend SMTP hoạt động bằng SMTP thật/Mailpit cục bộ. Chưa có credential provider
  production; không gửi thư cho người dùng thật. `Next after()` không là hàng đợi bền vững
  qua sự cố tiến trình, và UI không hứa đã giao thư.
- Không đo lại curve tải P15, không nhận kiểm gRPC loopback dev là kiểm mTLS triển khai cụm.

Không có quyết định cần hỏi lại người dùng hoặc cổng nghiệm thu P16 còn đỏ. Giới hạn ngoài
phạm vi vẫn được giữ rõ; dọn tài nguyên và commit thuộc bước kết thúc phiên của lead.
