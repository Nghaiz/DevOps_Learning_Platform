---
id: 20-che-bi-mat-trong-log
title: Bộ che log chỉ biết chuỗi đã đăng ký
gameId: cicd
readMinutes: 3
usedByLevels:
  - cicd-c26-che-chuoi-da-dang-ky
---

Hệ CI che bí mật trong log bằng một cơ chế rất đơn giản: nó giữ một danh sách **chuỗi đã đăng ký**, và thay mọi lần xuất hiện của từng chuỗi trong mỗi dòng log bằng `***`. Secret khai trong kho được đăng ký sẵn. Giá trị sinh ra lúc chạy thì phải tự đăng ký:

```yaml
steps:
  - run: |
      TOKEN="$(./scripts/lay-token-tam.sh)"
      echo "::add-mask::$TOKEN"
      echo "TOKEN=$TOKEN" >> "$GITHUB_ENV"
```

Bộ che không hiểu một giá trị là bí mật theo nghĩa nào. Nó không giải mã, không nhìn sang dòng bên cạnh. Mọi chỗ rò kinh điển đều bắt nguồn từ đó.

## Biến đổi tạo ra một chuỗi khác

Base64, mã hoá URL, đảo ngược đều cho ra một chuỗi **khác** chuỗi gốc, và bộ che không biết gì về nó. Giá trị `abcd` đi qua base64 thành `YWJjZA==`, một chuỗi không chứa `abcd`. Header xác thực kiểu Basic là base64; tham số truy vấn là mã hoá URL. Một lệnh debug in ra header hay URL đầy đủ là đủ để bí mật lọt nguyên vẹn, dù bảng log có một dòng khác đã hiện `***` rất yên tâm.

Không phép biến đổi nào trong số đó là mã hoá bảo mật. Ai đọc được log đều khôi phục được giá trị gốc trong vài giây.

## In theo mảnh

Một bí mật bị cắt đôi qua hai dòng không nằm trọn trong dòng nào, nên bộ che theo từng dòng không thấy. Chỗ rò này **không sửa được** bằng cách đăng ký thêm: đăng ký nguyên giá trị vẫn chỉ khớp nguyên giá trị. Cách sửa duy nhất là đừng in nó ra.

## Chuỗi con

Hai bí mật lồng nhau, cái ngắn nằm trong cái dài. Che cái ngắn trước thì cái dài còn thừa một đoạn lộ ra. Bộ che thật vì thế ưu tiên chuỗi dài.

Che log là lớp bảo vệ **bổ sung**. Lớp chính là nguồn sinh log không ghi bí mật ngay từ đầu.

## Trong game này

- Kịch bản log là **dữ liệu cố định** của level, gồm các dòng mẫu chèn bí mật ở một trong bốn dạng: thô, base64, URL, đảo ngược. Đổi cạnh hay xếp lịch lại workflow không xoá hay che hộ dòng nào.
- Bạn đăng ký từng cặp **bí mật × dạng**. Bộ che thay mọi lần xuất hiện của chuỗi đã biến đổi bằng `***`, chuỗi dài che trước.
- Base64 dùng bảng chữ chuẩn có đệm `=`. Mã hoá URL chỉ giữ nguyên chữ, số và bốn ký tự `-._~`, còn lại thành `%XX` chữ hoa. Khớp là khớp chuỗi chính xác, không có "gần đúng".
- Sau khi che, engine dò lại **mọi bí mật ở mọi dạng** trên từng dòng. Mỗi cặp dòng × bí mật × dạng còn chứa chuỗi là **một mục rò**. Một giá trị không có ký tự cần mã hoá thì dạng URL trùng dạng thô, nên một chỗ lộ đếm thành hai mục.
- Chuỗi chỉ hiện ra khi ghép một dòng với dòng kế tiếp cũng được đếm là rò, gắn vào dòng đầu.
