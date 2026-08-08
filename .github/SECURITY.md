# Chính sách bảo mật

## Báo lỗ hổng

Repo hiện **private**, nên "Private vulnerability reporting" của GitHub không
dùng được — tính năng đó chỉ tồn tại trên repo public. Gửi email cho maintainer
(địa chỉ trên hồ sơ GitHub [@Nghaiz](https://github.com/Nghaiz)) kèm mô tả và
cách tái hiện.

Khi repo chuyển sang public, bật đường báo riêng của GitHub bằng:

```bash
gh api -X PUT repos/Nghaiz/DevOps_Learning_Platform/private-vulnerability-reporting
```

rồi đổi mục này sang link
`https://github.com/Nghaiz/DevOps_Learning_Platform/security/advisories/new`.

Dù báo bằng đường nào: **đừng mở issue công khai** cho lỗ hổng.

Xin kèm: đường đi tấn công, cách tái hiện, và tác động bạn cho là có. Một PoC
chạy được đáng giá hơn nhiều so với suy đoán.

## Phạm vi

Đây là nền tảng học DevOps: **sinh viên có quyền root BÊN TRONG pod sandbox của
chính họ, và được thiết kế với giả định họ là tác nhân cố ý đối kháng.** Ranh
giới bảo mật là:

| Trong phạm vi (là lỗ hổng) | Ngoài phạm vi (là thiết kế) |
|---|---|
| Thoát khỏi sandbox ra node hoặc ra pod khác | Có root bên trong pod sandbox của chính mình |
| Đọc/ghi được session của user khác (IDOR) | Toàn quyền với filesystem trong sandbox của mình |
| Từ pod sandbox chạm tới API k8s hoặc endpoint metadata cloud | Cài package, chạy tiến trình tuỳ ý trong sandbox |
| Vượt authz ở tRPC / WebSocket gateway | Làm hỏng sandbox của chính mình |
| Rò rỉ token, secret, hoặc dữ liệu user khác | Dùng hết quota của chính mình |
| Làm cạn tài nguyên node vượt quota đã áp | |

## 10 luật bảo mật

Dự án kiểm mình theo 10 luật cụ thể (design §6), là **tiêu chí nghiệm thu có thể
test được**, không phải khuyến nghị:

1. Object-level authz mọi resource (kiểm ownerId/role phía server)
2. CORS allowlist theo origin — không reflect, không `Allow-Credentials: *`
3. Zod validate/cast mọi input, từ chối field lạ
4. Cap cứng pagination (max 100) phía server
5. Giới hạn body-size + rate limit ở gateway
6. JWT có `aud` riêng từng service, key ký riêng, TTL ngắn + refresh rotation
7. Refresh token tách khỏi access token, có rotation + revocation list
8. Token chỉ ở httpOnly cookie / POST body — không bao giờ ở URL hay query
9. Security headers: HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer, Permissions
10. Cô lập sandbox: Sysbox unprivileged, drop ALL caps, seccomp + AppArmor, NetworkPolicy deny-all + chặn metadata endpoint, không docker.sock, quota, authz WS theo từng session

Luật 1–9 có test tự động trong `apps/web/src/security/`. Luật 10 được nghiệm thu
ở P1 và tự pentest lại đầy đủ ở P3.

## Phiên bản được hỗ trợ

Dự án đang trong giai đoạn phát triển ban đầu (P0/P1). Chỉ `main` được hỗ trợ;
chưa có bản release nào được đánh dấu là dùng cho production.

## Việc chúng tôi tự làm

- `gitleaks` quét mọi commit và mọi PR — **cổng chặn merge**
- `govulncheck` đối chiếu dependency Go với reachability trên mọi PR — **cổng chặn merge**
- `helm template` + `kubeconform` + `shellcheck` + `actionlint` trên mọi PR — **cổng chặn merge**
- Dependabot alerts + PR nâng version hằng tuần (github-actions, npm, gomod, docker)
- Trivy quét CVE mọi image container (in ra log của job, chưa chặn)
- SBOM + provenance SLSA đính kèm mọi image đã publish

**Chưa có, và vì sao:** CodeQL và dependency review cần **GitHub Advanced Security**,
thứ không có trên repo private. Chúng đã được thử và gỡ đi thay vì để lại một
workflow luôn đỏ. Thêm lại khi repo thành public hoặc khi có GHAS. Lớp phòng thủ
thực sự chặn được thứ gì thì đều nằm trong danh sách trên và đều chạy được miễn phí.
