---
id: 14-cong-duyet-moi-truong
title: Cổng duyệt phải nằm trên đường vào môi trường
gameId: cicd
readMinutes: 2
usedByLevels:
  - cicd-c17-cong-duyet-prod
---

Nhiều đội có quy định "phát hành prod phải có người duyệt". Quy định đó chỉ có hiệu lực khi **mọi đường vào prod** đều đi qua cổng duyệt. Một cổng đứng cạnh đường phát hành, trên một nhánh riêng, trông rất yên tâm trên sơ đồ và không chặn được gì.

## Cổng là một điều kiện trong đồ thị

GitHub Actions gắn người duyệt vào **môi trường**: mọi job khai `environment: prod` phải chờ người duyệt đồng ý trước khi chạy.

```yaml
jobs:
  deploy-prod:
    needs: [dung, deploy-staging]
    runs-on: ubuntu-latest
    environment: prod
    steps:
      - run: ./scripts/phat-hanh.sh "${{ needs.dung.outputs.digest }}"
```

Quy tắc duyệt được cấu hình ở phần cài đặt môi trường của kho, không nằm trong YAML. Nếu cổng được dựng thành một job riêng thay vì gắn vào môi trường, thì job phát hành phải **phụ thuộc** vào job cổng. Không có cạnh đó, job phát hành chạy song song với việc duyệt, và bản bị từ chối vẫn có thể lên prod trước khi người duyệt kịp nói.

## Duyệt ở đâu trên đường đi

Người duyệt cần thông tin gì? Nếu chỉ cần xem artifact và yêu cầu phát hành, việc duyệt có thể diễn ra **song song** với staging, còn prod đợi cả hai. Nếu quy trình đòi người duyệt xem kết quả staging, cổng phải đứng **sau** staging. Hai cách đều chặn được bản bị từ chối; chúng khác nhau ở thời gian chờ và ở lượng thông tin trong tay người quyết.

## Từ chối là cổng làm đúng việc

Một commit bị từ chối làm lượt chạy đỏ. Đó là kết quả mong muốn. Ép mọi lượt phải xanh sẽ đẩy người ta tới chỗ gỡ cổng hoặc cho cổng "không chặn", và lúc đó phê duyệt chỉ còn là nghi thức.

Thời gian chờ con người cũng là thời gian. Nó không chiếm máy nào nhưng nằm trên đường găng, và thường là mắt xích khó đoán nhất.

## Trong game này

- Cổng duyệt là một stage loại `approval`, khai số người duyệt và thường **giữ không chỗ máy nào**. Thời lượng chờ là tổng thời lượng các bước của nó.
- Việc một commit bị từ chối là **dữ liệu của level**, không phải thứ bạn thuyết phục được. Commit bị từ chối vẫn chờ **hết** thời gian của cổng rồi mới đỏ với nguyên nhân `approval-rejected`. Thử lại vẫn đỏ: người duyệt không đổi ý vì bấm lại.
- Cổng đã đỏ vì lý do khác thì chưa tới tay người duyệt, và nguyên nhân ghi là lý do đó.
- Mục tiêu canh môi trường kiểm rằng **mọi** stage phát hành vào môi trường đó có một cổng duyệt đủ số người nằm phía trên, kể cả bắc cầu. Không stage nào phát hành vào môi trường đó thì mục tiêu không đạt.
- Cổng phải **chặn thật**: bản thân cổng và mọi stage nằm giữa cổng với stage phát hành đều phải là stage chặn. Một cổng được phép đỏ mà không dừng đường ống thì đỏ xong bản vẫn đi tiếp.
- Mục tiêu còn đọc bản ghi, không chỉ đọc đồ thị: chỉ cần một lần phát hành vào môi trường đó xảy ra trong một commit mà cổng canh nó đã đỏ, mục tiêu trượt.
- Level có commit bị từ chối có chủ ý đặt ngưỡng tỷ lệ xanh bằng 0, vì mỗi lượt đều chứa một commit đỏ đúng như thiết kế.
