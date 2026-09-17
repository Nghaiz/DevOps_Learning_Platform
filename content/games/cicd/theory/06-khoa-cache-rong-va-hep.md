---
id: 06-khoa-cache-rong-va-hep
title: Khoá cache quá rộng và quá hẹp
gameId: cicd
readMinutes: 3
usedByLevels:
  - cicd-c07-khoa-cache-qua-rong
  - cicd-c08-khoa-cache-qua-hep
---

Mỗi cache có hai danh sách, và người ta thường chỉ viết ra một.

- **Khoá** là thứ bạn chọn: những đầu vào được băm thành một chuỗi để tra cứu. Khoá trùng một mục đã lưu thì **trúng**.
- **Thứ nội dung phụ thuộc** là sự thật về cái đang được lưu. Những đầu vào đó còn nguyên thì nội dung **còn dùng được**.

Hai danh sách khớp nhau thì cache làm đúng việc. Lệch theo hai hướng thì hỏng theo hai kiểu rất khác nhau.

## Khoá quá rộng: không bao giờ trúng

Khoá chỉ trùng khi **mọi** thành phần của nó giữ nguyên. Chỉ cần một thành phần đổi ở mọi commit, như mã của chính commit đó, là khoá không bao giờ lặp lại.

```yaml
# Khoá này đổi ở mọi commit, nên cache không bao giờ trúng
key: goi-${{ github.sha }}-${{ hashFiles('package-lock.json') }}
```

Lỗi này **im lặng**. Không có gì đỏ, không có cảnh báo. Đường ống chạy đúng, chỉ là chạy đúng bằng tốc độ lúc chưa có cache. Nhồi thêm thành phần vào khoá nghe như phòng thủ, nhưng nó đổi một rủi ro (dùng nhầm bản cũ) lấy một điều chắc chắn (không bao giờ dùng được cache).

Cách kiểm nhanh: hỏi từng thành phần của khoá *"cái này đổi mấy lần một tuần?"* Khoá rộng hơn không tự động tệ hơn. Nó chỉ tệ khi phần rộng thêm là thứ đổi thường xuyên.

## Khoá quá hẹp: trúng một bản đã ôi

Chiều ngược lại khó thấy hơn nhiều. Khoá **thiếu** một đầu vào mà nội dung thật sự phụ thuộc, chẳng hạn phiên bản hệ điều hành của runner. Đầu vào đó đổi, khoá vẫn trùng, và đường ống lấy về một bản đúng khoá mà sai nội dung.

Triệu chứng không giống một lỗi cache chút nào: một bước đỏ ở chỗ chẳng ai vừa sửa, rồi tự hết khi ai đó tình cờ đổi đúng đầu vào nằm trong khoá. Nó trông như lỗi ngẫu nhiên, nên nó sống lâu.

Tệ hơn, bảng thống kê lại **khen** nó: khoá hẹp trúng nhiều hơn khoá đúng. Tỷ lệ trúng cao có thể là triệu chứng, không phải chiến thắng. Và bỏ hẳn cache là một lời giải hợp lệ: chậm mà đúng vẫn hơn nhanh mà sai.

## Trong game này

- Luật tra cache viết thành bốn dòng. **Trúng** khi mọi đầu vào trong khoá có cùng phiên bản với lúc lưu. **Đúng** khi mọi đầu vào nội dung phụ thuộc có cùng phiên bản với lúc lưu. Trúng và đúng thì bước bớt tick. Trúng mà ôi thì bước **đỏ thật** với nguyên nhân `stale-cache`, không bớt tick nào.
- Bạn chọn được khoá. Danh sách nội dung phụ thuộc là dữ liệu level, bạn không sửa được và không thấy trực tiếp; chỉ bảng nhịp đổi của đầu vào gợi ý cho bạn.
- Chuỗi khoá ghép tên đầu vào kèm số lần nó đã đổi, **theo thứ tự khai**. Hai thứ tự khác nhau là hai khoá khác nhau, như mọi hệ cache thật.
- Bản ghi đếm lần trúng **khoá**, kể cả lần trúng bản ôi. Một lần như vậy hiện cả "trúng" lẫn nguyên nhân đỏ, vì đó là hai sự thật khác nhau.
- Trúng bản ôi không ghi đè mục cache (chỉ bước xanh sau một lần trượt mới ghi), nên mục ôi còn nằm đó tới khi khoá đổi. Thử lại stage vẫn tra đúng mục đó và vẫn đỏ.
