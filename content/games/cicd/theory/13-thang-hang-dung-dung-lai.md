---
id: 13-thang-hang-dung-dung-lai
title: Thăng hạng, đừng dựng lại
gameId: cicd
readMinutes: 2
usedByLevels:
  - cicd-c16-thang-hang-dung-dung-lai
---

Staging xanh, prod cũng xanh. Nghe như một lần phát hành tốt. Câu hỏi cần hỏi thêm: **prod đang chạy đúng thứ đã được thử ở staging không?**

Nếu đường ống dựng ảnh một lần cho staging rồi dựng lại một lần nữa cho prod, câu trả lời là "không chắc". Cùng commit, cùng Dockerfile, vẫn có thể ra hai ảnh khác nhau.

## Vì sao dựng lại không cho ra cùng một bản

- Phụ thuộc trôi: một gói không ghim chặt phiên bản đã có bản mới giữa hai lần dựng.
- Ảnh nền đổi: tag `node:22` hôm nay trỏ tới một digest khác hôm qua.
- Dấu thời gian và thứ tự file làm đổi nội dung nhị phân dù mã không đổi.

Build **tái lập được** (reproducible build) là một kỷ luật có thật: ghim mọi phụ thuộc, cố định dấu thời gian, dựng trong môi trường kín. Nó làm được, và nó tốn công. Phần lớn đường ống không đạt tới mức đó, nên kết quả kiểm thử ở staging chỉ chứng minh được điều gì đó cho **đúng bản đã chạy ở staging**.

## Thăng hạng

**Thăng hạng** (promotion) là đưa cùng một artifact qua các môi trường: dựng một lần, chạy ở staging, rồi chuyển chính digest đó sang prod. Không có bước dựng nào ở giữa.

```yaml
jobs:
  deploy-staging:
    needs: [dung]
    environment: staging
    runs-on: ubuntu-latest
    steps:
      - run: ./scripts/phat-hanh.sh "${{ needs.dung.outputs.digest }}"
  deploy-prod:
    needs: [dung, deploy-staging]
    environment: prod
    runs-on: ubuntu-latest
    steps:
      - run: ./scripts/phat-hanh.sh "${{ needs.dung.outputs.digest }}"
```

Một cổng kiểm tra vận hành (smoke test) có thể đứng giữa hai môi trường. Nó làm đường đi dài hơn nhưng không cần tạo ra ảnh nào mới.

Cùng tên ảnh không phải bằng chứng. Tên là nhãn. Chỉ danh tính mới phân biệt được hai lần dựng.

## Trong game này

- Game chọn cách đọc khắt khe nhất: **mỗi lần dựng luôn ra một danh tính khác**, kể cả cùng commit. Danh tính được băm từ commit, tên sản phẩm và thực thể đã dựng. Build tái lập được là kiến thức của bài này, không phải một công tắc trong engine.
- Khi nhiều stage phía trên cùng tạo ra một sản phẩm, stage phía sau nhận bản của stage **xong muộn nhất**. Dựng lại ngay trước bước phát hành thì bước phát hành nhận bản dựng lại, đúng như thứ nằm mới nhất trên đĩa ngoài đời.
- Mục tiêu giữ danh tính xét **mọi** commit phát hành vào môi trường đích. Mỗi lần như vậy phải có một lần phát hành vào môi trường nguồn xong trước nó, stage đích phải phụ thuộc (kể cả bắc cầu) vào stage nguồn, và hai nơi phải mang cùng danh tính sản phẩm. Lên đích mà chưa đi qua nguồn là **trượt**, không phải "không có gì để so". Không commit nào phát hành vào đích thì mục tiêu cũng **không đạt**: xoá bằng chứng không phải là thoả điều kiện.
- Level giới hạn loại stage bạn được thêm, và thời lượng các bước là dữ liệu cố định. Việc thêm một bước kiểm tra luôn cộng thêm thời gian vào lead time.
