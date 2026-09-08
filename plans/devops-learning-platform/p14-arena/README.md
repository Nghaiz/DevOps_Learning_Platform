# P14-Arena — Xây lại toàn bộ giao diện game K8s + dựng hệ bài tập kiểu OJ

**Ngày mở:** 2026-09-08. **Nhánh:** `feat/p14-games`.

Mọi lane đọc file này TRƯỚC khi viết dòng code đầu tiên. Đây là nguồn chuẩn duy
nhất cho luật chung; brief riêng của từng lane chỉ nói phần việc, không lặp lại
những gì có ở đây.

---

## 0. Vì sao đập đi xây lại

Chủ dự án đánh giá giao diện game hiện tại là không dùng được, và khảo sát trực
tiếp xác nhận. Những thứ đo được, không phải cảm tính:

| Vấn đề | Bằng chứng |
|---|---|
| Bảng bên trái không tạo được tài nguyên | `resource-rail.tsx:28` chỉ liệt kê object đã có. Trong khi `levels/l01.ts:59` viết gợi ý *"Bảng tài nguyên bên trái cho bạn tạo pod mà không cần gõ YAML"* — gợi ý mô tả một tính năng không tồn tại |
| Không xoay/kéo/phóng được camera | 0 kết quả cho `OrbitControls`, 0 listener `wheel` trong toàn bộ mã |
| Click vào object không ra thông số | 0 kết quả cho `Raycaster`; canvas còn đặt `aria-hidden="true"` với chủ ý "chỉ là hình minh hoạ" |
| Terminal không bật được bằng phím | `command-bar.tsx` là một `<input>` luôn hiện giữa màn hình |
| Chữ quá nhiều | Mỗi level bắt đọc ~382 từ (brief 189 + primer 193) trước khi được gõ lệnh đầu tiên; file nặng nhất 1686 từ |
| 10 challenge là mã chết | `CHALLENGES` không được export ra `packages/games/src/index.ts`, không component nào import. Người dùng chưa từng thấy |

## 1. Bốn quyết định đã chốt (2026-09-08, chủ dự án)

1. **Giữ lõi, đập sạch giao diện.** `packages/games/src/k8s/*` (engine thuần) và
   `core/*` giữ nguyên. Toàn bộ `apps/web/src/components/games/**` bị thay.
2. **React Three Fiber + drei + postprocessing** thay cho three.js thuần.
3. **Hệ OJ lưu trong Postgres, có trang quản trị CRUD đầy đủ.**
4. **Mô tả level rút về một dòng nhiệm vụ**, kiến thức nền chuyển vào ngăn tra
   cứu mở theo yêu cầu.

## 2. Hai luật bố cục — vi phạm là làm sai yêu cầu

Chép nguyên văn từ `apps/web/src/components/k8s-arena/arena-contract.ts`, đọc
phần đầu file đó để có đủ ngữ cảnh:

1. **Canvas 3D chiếm trọn vùng dưới thanh trên cùng.** Không bố cục chia cột.
   Mọi bảng là lớp nổi bên trên canvas.
2. **Bảng thông số bên phải không thường trực.** Chỉ tồn tại khi có object đang
   chọn. Một bảng rỗng ghi "chưa chọn gì" là đã vi phạm — phải không render gì
   cả.

Bẫy phải tránh: canvas của k8sgames.com nuốt pointer-event của nút menu phía
trên (đo trực tiếp). Canvas của ta nằm dưới mọi lớp HUD; lớp không nhận tương
tác thì đặt `pointer-events: none`.

## 3. Hợp đồng — đọc, không sửa

| File | Nội dung | Ai được sửa |
|---|---|---|
| `apps/web/src/components/k8s-arena/arena-contract.ts` | Props scene, lệnh camera, phím tắt, thông số camera, palette | Chỉ lead |
| `packages/games/src/k8s/problem.ts` | Schema bài OJ, bộ lọc, khoá sắp xếp, nộp bài | Chỉ lead |
| `packages/games/src/k8s/contract.ts` | Hợp đồng engine sẵn có | Không ai (đang chạy) |

Cần đổi hợp đồng thì báo lead, đừng tự sửa — lane khác đang dựa vào đúng file đó.

## 4. Phân chia quyền sở hữu file

Mỗi lane chỉ ghi trong vùng của mình. Chạm ra ngoài là đè lên việc người khác:
cả bảy lane chạy song song trong **cùng một cây làm việc git**, nên ghi vào file
của lane khác sẽ ghi đè im lặng, không có dấu xung đột, không lỗi biên dịch.

| Lane | Sở hữu |
|---|---|
| A — Scene 3D | `apps/web/src/components/k8s-arena/scene/**` |
| B — Khung HUD | `apps/web/src/components/k8s-arena/hud/{palette,mission,codex,terminal,top-bar}*` |
| C — Bảng theo lựa chọn | `apps/web/src/components/k8s-arena/hud/{inspector,metrics,incidents,minimap,event-log,context-menu}*` |
| D — OJ phía máy chủ | `apps/web/src/server/db/schema.ts`, `apps/web/drizzle/**`, `apps/web/src/server/problems/**`, `apps/web/src/server/trpc/routers/problems.ts` |
| E — OJ trang người học | `apps/web/src/app/(session)/problems/**` |
| F — OJ trang soạn bài | `apps/web/src/app/author/problems/**` |
| G — Nội dung | `packages/games/src/k8s/levels/**`, `packages/games/src/k8s/problems-seed/**` |
| Lead | `arena-contract.ts`, `problem.ts`, `arena-root.tsx`, `index.ts` barrel, `app/games/k8s/page.tsx`, mọi `package.json` |

## 5. Luật chung cho mọi lane

- **KHÔNG chạy git.** Không `add`, không `commit`, không `checkout`. Lead gom và
  commit tập trung. Bảy lane cùng chạm chỉ mục git là hỏng.
- **KHÔNG cài thêm gói.** Cần gói mới thì báo lead. `@react-three/fiber@9`,
  `@react-three/drei@10`, `@react-three/postprocessing@3` đã cài sẵn.
- **KHÔNG sửa file của lane khác**, kể cả khi thấy lỗi ở đó. Báo lead.
- **Tiếng Việt** cho mọi chuỗi hiển thị và mọi bình luận trong mã. Repo này viết
  bình luận giải thích LÝ DO, không phải mô tả lại việc mã đang làm — đọc vài
  file sẵn có để bắt đúng giọng.
- **Không lưu trường suy ra được.** Tính được từ cột khác thì tính lúc dùng.
  Bẫy này đã cắn dự án bốn lần.
- **File ≤ 200 dòng.** Quá thì tách theo trách nhiệm.
- **Không có dữ liệu giả.** Không `TODO`, không hàm rỗng trả giá trị bịa. Chưa
  làm được thì báo lead, đừng lấp bằng chỗ giữ chỗ trông như đã xong.

## 6. Cách kiểm tra việc mình làm

```bash
cd apps/web && pnpm typecheck          # hai lượt tsc, cả e2e
cd apps/web && pnpm lint
cd apps/web && pnpm test               # vitest
```

Lượt kiểm cuối do lead chạy trên toàn bộ. Trong lane, chạy typecheck sau khi
viết xong cả cụm file chứ đừng chạy sau từng file — vòng biên dịch chậm hơn
việc sửa nhiều file liền một lúc.

`pnpm --filter` chỉ nhận đúng một script; hai script trong một lệnh thì script
thứ hai bị nuốt trong im lặng. Chạy tách lệnh.

## 7. Những gì học được từ bản của họ

Báo cáo đầy đủ 946 dòng:
`plans/devops-learning-platform/reports/harness/2026-09-08-p14-redesign/upstream-k8sgames-source.md`

Giấy phép Apache-2.0. **Không chép một dòng nào** — lý do là kỹ thuật: họ viết
ES6 thuần không có bước build, không ghép được vào Next.js + TypeScript. Học ý
tưởng, tự viết mã.

Đáng học:
- Công thức camera mượt: damping 0.08, chặn góc cực ở π/2.1, kẹp khoảng cách
  5..80, tone mapping ACES exposure 1.2, sương mù cùng màu nền.
- Kiến trúc dùng lại bộ dựng cảnh cho cả chế độ vẽ sơ đồ.

Chỗ họ sai, ta phải làm đúng:
- `kubectl apply -f` của họ không phân tích YAML, chỉ đoán Kind từ tên file.
  Người học của họ không bao giờ viết một dòng YAML.
- Điều kiện qua màn của họ là `switch` 35 nhánh viết cứng, nên họ không thể có
  trình soạn bài. Của ta là bảng vị từ tra theo tên — đó là thứ làm hệ OJ khả thi.
- `rollout status` của họ trả chuỗi cứng "successfully rolled out".
- Nhãn của họ chồng lên nhau vì tắt kiểm tra chiều sâu mà không có bước giãn nhãn.
- Họ bắn tia dò trúng đích mỗi khung hình, không tiết chế.
