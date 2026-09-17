---
id: 19-tu-sua-va-quyen-so-huu
title: Tự sửa và quyền sở hữu từng trường
gameId: cicd
readMinutes: 2
usedByLevels:
  - cicd-c25-tu-sua-va-quyen-so-huu
---

Tự sửa nghe như một chiến thắng trọn vẹn: mọi chỉnh tay đều bị kéo về trạng thái trong Git. Rồi một ngày đội bật nó lên và thấy số bản sao của dịch vụ nhảy qua nhảy lại mỗi vài giây.

## Hai bộ điều khiển, một trường

Trong Kubernetes, `replicas` của một Deployment thường không do con người quyết. Bộ co giãn tự động (HorizontalPodAutoscaler) đọc tải và đặt số bản sao. Git thì khai `replicas: 2`.

Tải tăng, bộ co giãn đặt 4. Bộ đối soát tới nhịp, thấy sống khác khai, tự sửa về 2. Vài giây sau bộ co giãn thấy thiếu, đặt lại 4. Vòng đó không bao giờ dừng. Mỗi lần giành nhau là một lần dịch vụ bị thu hẹp giữa lúc đang cần mở rộng.

Vấn đề không nằm ở tự sửa, cũng không nằm ở bộ co giãn. Nó nằm ở chỗ **một trường có hai chủ**.

## Danh sách loại trừ là ranh giới sở hữu

Công cụ GitOps cho khai những trường **không đối soát**. Argo CD gọi là `ignoreDifferences`:

```yaml
spec:
  ignoreDifferences:
    - group: apps
      kind: Deployment
      jsonPointers:
        - /spec/replicas
```

Nhưng loại trừ không chỉ tắt tự sửa. Trường bị loại trừ cũng **không được phát hiện lệch** và **không nhận commit mới**. Loại trừ cả tài nguyên chỉ để dập cảnh báo là tự bịt mắt: một chỉnh tay sai trên trường đó sẽ nằm lại mãi mà không ai biết.

Nên loại trừ đúng những trường có chủ khác, và giữ đối soát cho phần còn lại.

## Quan sát trước khi cấp quyền

Khi chưa chắc ranh giới sở hữu, một cách triển khai thận trọng là bật phát hiện và **tắt** tự sửa. Đội nhìn xem những trường nào liên tục lệch vì một hệ khác đang quản, rồi mới cấp quyền ghi đè tự động. Commit mới vẫn được đồng bộ; chỉ có chỉnh tay là sống lâu hơn.

## Trong game này

- Kịch bản có thể chứa một **bộ điều khiển** trên một trường. Mỗi lần giá trị của nó bị đè, bởi đối soát, bởi người hay bởi đồng bộ commit, nó đặt lại giá trị của mình sau một số giây cố định và mở một đoạn drift **mới**. Mỗi trường có nhiều nhất một bộ điều khiển.
- Số lần **giành nhau** là số đoạn drift do bộ điều khiển mở mà bị đối soát đóng.
- Trường trong danh sách loại trừ: không phát hiện, không tự sửa, không đồng bộ commit. Đoạn drift trên đó **vẫn được ghi**, với mốc phát hiện để trống, vì lệch vẫn có thật.
- Tắt tự sửa thì không còn giành nhau, nhưng chỉnh tay trên các trường khác cũng nằm lại tới khi một commit được đồng bộ, hoặc tới hết kịch bản.
- Mục tiêu "không giành nhau" đạt được bằng cách tắt hẳn tự sửa, nên level luôn ghép nó với một giới hạn drift trên một trường **không** do bộ điều khiển quản. Bỏ mặc toàn bộ cấu hình không phải lời giải.
