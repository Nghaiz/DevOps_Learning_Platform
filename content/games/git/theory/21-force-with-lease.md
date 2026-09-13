---
id: 21-force-with-lease
title: '`--force-with-lease`'
gameId: git
readMinutes: 2
usedByLevels:
  - git-21-force-with-lease
---

Cùng một ý định với bài trước, khác một phép kiểm.

- `git push --force` nói: **dịch ref đi, đừng hỏi gì cả.**
- `git push --force-with-lease` nói: **dịch ref đi, nếu origin vẫn đang ở đúng chỗ tôi biết lần cuối.**

"Chỗ tôi biết lần cuối" là ref theo dõi `origin/main` của bạn. Nó chính là thứ bài G13 nói tới: bản ghi nhớ của local về origin, cập nhật ở lần fetch gần nhất.

## Nó chặn được gì

Kịch bản điển hình: bạn fetch, rebase nhánh của mình, chuẩn bị đẩy lên. Trong khoảng thời gian đó, một người khác push thêm một commit.

Với `--force`, commit đó biến mất và không ai báo gì.

Với `--force-with-lease`, origin bây giờ đứng ở chỗ khác với `origin/main` mà bạn đang giữ, phép kiểm không qua, và lệnh bị từ chối với lỗi `stale-lease`. Bạn mất ba giây và giữ được việc của người ta.

Nói ngắn: `--force` bỏ mọi phép kiểm, `--force-with-lease` đổi phép kiểm "con cháu" lấy phép kiểm "không đổi từ lần tôi nhìn".

## Lỗ hổng phải biết

Cái "lần tôi nhìn" đó tự làm mới. Bất kỳ thứ gì cập nhật ref theo dõi cũng cấp cho bạn một tờ thuê mới:

```
git fetch
git push --force-with-lease     # khong an toan hon --force la bao nhieu
```

Vì `fetch` vừa kéo commit của người kia về, `origin/main` của bạn đã khớp với origin, phép kiểm qua trơn tru, và commit đó vẫn bị đè.

Chỗ này đáng cảnh giác hơn vẻ ngoài, vì nhiều IDE và công cụ tự chạy `git fetch` ngầm theo chu kỳ. Bạn không gõ lệnh nào mà tờ thuê vẫn được gia hạn.

Cách dùng đúng tinh thần của nó: fetch, **đọc** xem có gì mới không, rồi mới push. Nếu bạn fetch chỉ để lệnh sau đó chạy được thì bạn đã quay lại `--force` với nhiều bước hơn.

## Thói quen nên có

Đặt `--force-with-lease` làm mặc định trong đầu, và chỉ gõ `--force` khi bạn nói ra được vì sao phép kiểm kia sai trong trường hợp này. Đa số lần, bạn sẽ không nói ra được.
