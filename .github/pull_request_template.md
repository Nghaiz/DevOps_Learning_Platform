<!--
Checklist này KHÔNG phải nghi thức. Mỗi dòng tương ứng với một lỗi đã thật sự
xảy ra trong repo này. Bỏ trống ô nào thì viết một câu vì sao — đừng tích bừa.
-->

## Thay đổi gì

<!-- 1–3 câu. Cái GÌ đổi và VÌ SAO. "Vì sao" quan trọng hơn "cái gì" — diff đã
nói cái gì rồi. -->

**Phase / task:** <!-- vd P0 task 28, hoặc "ngoài plan: sửa gấp" -->

## Kiểm chứng thế nào

<!-- Lệnh bạn ĐÃ CHẠY và kết quả. Không phải "chắc chạy được".
     Ví dụ: `make test-ci` → 47 passed; `helm template ... | kubeconform` → OK -->

```
```

## Checklist

- [ ] Test đã chạy và **xanh ở máy tôi**, không chỉ trông có vẻ đúng
- [ ] Đổi biến môi trường → đã cập nhật `.env.example` **và** Helm values **và** `.github/ci.env` (`pnpm env:check` xanh)
- [ ] Đổi `proto/` → đã chạy `make proto` và commit code sinh ra (drift gate sẽ bắt nếu quên)
- [ ] Không có secret thật trong diff (gitleaks quét, nhưng nó không bắt được mọi hình dạng)
- [ ] Đổi thứ chạm tới **10 luật bảo mật** (auth, CORS, rate limit, token, header, cô lập sandbox) → đã ghi rõ luật nào ở phần "Thay đổi gì"
- [ ] Đổi `infra/helm` → đã `helm template` với **cả ba** bộ values, không chỉ bộ mình dùng

## Rủi ro / thứ tôi chưa chắc

<!-- Phần có giá trị nhất của PR này. "Không có" là một câu trả lời hợp lệ,
     nhưng hiếm khi đúng. Nêu cả thứ bạn CỐ Ý bỏ qua và vì sao. -->
