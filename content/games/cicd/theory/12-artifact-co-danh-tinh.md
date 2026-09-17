---
id: 12-artifact-co-danh-tinh
title: Artifact có danh tính
gameId: cicd
readMinutes: 2
usedByLevels:
  - cicd-c15-artifact-co-danh-tinh
---

Chương CD bắt đầu từ một câu hỏi tưởng như hiển nhiên: **môi trường này đang chạy bản nào?**

Artifact là sản phẩm của một lần dựng: ảnh container, gói nhị phân, thư mục đã biên dịch. Nó có hai thứ dễ nhầm với nhau. **Tên** như `image` hay `api-tim-kiem:latest` nói nó dùng để làm gì. **Danh tính** nói chính xác bản nào. Với ảnh container, danh tính là digest dạng `sha256:...`, băm từ nội dung. Tag có thể bị gắn lại sang ảnh khác; digest thì không.

## Sản phẩm không tự đi sang máy khác

Mỗi job chạy trên một runner riêng, đĩa riêng. Ảnh vừa dựng xong ở một máy **chưa có mặt** ở máy nào khác. Muốn job phát hành dùng nó, đường ống phải giao nó đi, và job phát hành phải đợi việc dựng xong.

```yaml
jobs:
  dung:
    runs-on: ubuntu-latest
    outputs:
      digest: ${{ steps.day.outputs.digest }}
    steps:
      - uses: actions/checkout@v4
      - id: day
        run: ./scripts/dung-va-day-anh.sh
  deploy-dev:
    needs: [dung]
    runs-on: ubuntu-latest
    environment: dev
    steps:
      - run: ./scripts/phat-hanh.sh "${{ needs.dung.outputs.digest }}"
```

Job phát hành nhận **digest** từ job dựng qua cạnh `needs`, không tự đi tìm "ảnh mới nhất". Tìm theo tag là mời một ảnh của commit khác chen vào.

## Chạy xong trước không có nghĩa là đã giao

Một cám dỗ khi đọc bảng thời gian: bước dựng nằm phía trên, đã xong từ lâu, nên chắc bước phát hành có ảnh rồi. Vị trí trên màn hình không phải một cạnh. Và thử lại bước phát hành không tạo ra đường giao nào: nó thiếu ảnh ở lần thử thứ nhất thì cũng thiếu ở lần thứ tư.

Ngoài đời, đây cũng là lý do người ta truyền digest qua từng job thay vì để mỗi job tự dựng lại hay tự đi tìm ảnh. Bài kế tiếp đi vào cái giá của việc dựng lại.

## Trong game này

- Danh tính artifact là một mã băm ngắn dạng `art-` kèm tám chữ số hex, tính từ **commit, tên sản phẩm và thực thể đã dựng nó**. Hai lần so chỉ có một câu hỏi: giống hệt hay không.
- Bước phát hành chỉ thấy sản phẩm của các stage mà nó phụ thuộc, kể cả bắc cầu, trong **cùng commit**. Thiếu cạnh thì đỏ `missing-output`.
- Khi xếp lịch, engine **ghi lại** thực thể nào đã cấp từng sản phẩm cho từng stage. Danh tính artifact được suy từ bản ghi đó, không đoán lại sau.
- Một stage có khai môi trường (dev, staging, prod) và lần thử cuối xanh được tính là **một lần phát hành** vào môi trường đó. Lần phát hành đỏ không đổi thứ môi trường đang chạy.
- Ở level chỉ dạy bằng workflow, ba commit chạy trên cùng dàn máy như chương CI, và ba trục điểm vẫn được tính như cũ.
