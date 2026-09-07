# Đóng bốn ô AC bằng trình duyệt thật — 2026-09-08

Bốn ô `[~]` cùng một lý do: mã xong, test tầng dưới xong, **chưa ai bấm bằng trình duyệt**.
Lượt này lái Chrome thật (Playwright MCP) trên cụm đang chạy để đóng chúng.

## Bối cảnh phép đo

| Thứ | Giá trị |
|---|---|
| URL | `https://dlp.192.168.94.130.sslip.io:30443` (chứng chỉ tự ký, đã bỏ qua lỗi TLS) |
| Ảnh đang chạy | web `p13d` · gateway `p13e` · orchestrator `p13` · sandbox `p13ide` |
| Tài khoản | `AC613 Probe` — đã đăng nhập sẵn trong profile trình duyệt, **lịch sử RỖNG lúc bắt đầu** |
| Ngày | 2026-09-07/08 (giờ UTC trong ảnh chụp) |

⚠ **Vì sao tài khoản rỗng là điều kiện, không phải tình cờ.** `/me` của một tài khoản trống
hiện đúng "chưa có gì" và cái đó không chứng minh trang chạy. Bắt đầu từ RỖNG rồi tự tạo
lịch sử nghĩa là mọi con số trên `/me` ở cuối lượt đều truy được về một thao tác cụ thể
trong lượt này — không phải rác của lane khác.

Tham số cụm liên quan (đọc từ env của `platform-orchestrator`):
`SESSION_TTL=1h` · `HARD_CAP=2h` · `EXTEND_DEFAULT=300s` · `CAPACITY_HARD_LIMIT=23`.

---

## P10:85 — quy tắc chấm câu nhiều đáp án hiện TRƯỚC khi làm → **ĐẠT**

`plans/devops-learning-platform/phase-10.md:85`

Trang: `/quiz/dlp-quiz-tu-container-toi-cum` (6 câu: 5 `single`, 1 `multiple`).

### 1. Quy tắc đứng trước câu hỏi đầu tiên, khi chưa chọn gì

Ảnh: `p10-85-quiz-rule-before-answering.png` (full page, chụp trước cú bấm đầu tiên).

Thứ tự trong cây a11y — thẻ "Cách chấm" nằm TRƯỚC `list` chứa các câu hỏi:

```
generic  "Cách chấm"
generic  "Câu nhiều đáp án: phải chọn ĐÚNG và ĐỦ mọi đáp án đúng mới được tính điểm
          — không có điểm một phần."
generic  "Đạt từ 70% số câu. Làm lại bao nhiêu lần cũng được."
status   "Đã chọn đáp án cho 0/6 câu"      ← 0/6: chưa thao tác gì
list     [6 listitem câu hỏi]
```

`0/6 câu` là vế "TRƯỚC khi người học làm": ảnh chụp ở trạng thái chưa có lựa chọn nào.

### 2. Đối chứng per-question — cùng lượt, cùng trang

| Câu | Nhãn hiển thị | Vai trò a11y |
|---|---|---|
| 1, 2, 3, 4, 6 | `Chọn một đáp án` | `radiogroup` / `radio` |
| 5 | `Chọn nhiều đáp án` | nhóm `checkbox` |

Câu một-đáp-án KHÔNG mang câu chữ all-or-nothing; nó mang một câu chữ khác hẳn.
Vế "hiện khác" của ô AC được thoả bằng chính bảng này.

### 3. Câu chữ đến TỪ payload, không viết cứng ở FE

`quiz.get` trả `"multipleAnswerRule":"all-or-nothing"` và `"passThresholdPercent":70`
— hai giá trị đúng bằng hai câu đang hiển thị. Bản ghi: `quiz-get-response.json`.

### 4. Đáp án KHÔNG có trong payload trước khi nộp — kèm đối chứng dương cho phép grep

Đây là ô AC khác đang xanh (`phase-10.md:78`); lượt này kiểm để chắc không làm nó đỏ.

```
$ grep -o "isCorrect|explanation|correctChoiceIds" quiz-get-response.json    → 0 hit
$ grep -o "isCorrect|explanation|correctChoiceIds" quiz-submit-response.json → correctChoiceIds ×6
                                                                               explanation      ×6
```

⚠ Dòng thứ hai là **đối chứng dương cho chính phép grep**. "0 hit" một mình không phân biệt
được *vắng thật* với *pattern hỏng*; cùng pattern đó bắt được 12 hit trên response sau khi nộp,
nên "0 hit" trên `quiz.get` là vắng thật.

Đối chứng phụ: payload có `"kind":"single"` ×5 và `"kind":"multiple"` ×1 — khớp KHÍT với
`content/quizzes/dlp-quiz-tu-container-toi-cum.json`. Payload không bị cắt bớt.

### 5. Luật đang hiện CHÍNH LÀ luật đang được áp (kiểm chứng động)

Cố ý chọn **thiếu** ở câu 5: chọn 1 trong 2 đáp án đúng (`kubectl describe pod`, bỏ
`kubectl get events`). Nếu có điểm một phần thì câu đó phải được tính một phần.

Kết quả sau khi nộp (`p10-85-quiz-graded-all-or-nothing.png`):

```
5/6 câu — 83%   ·   Đạt (mốc 70%)   ·   Lần làm thứ 1
Câu 5 → "Chưa đúng"
```

`quiz.submit` trả `correctCount=5`, `questionCount=6`, `passed=true`, `attemptNumber=1`.
Chọn đúng-nhưng-thiếu ⇒ 0 điểm câu đó ⇒ **all-or-nothing**, đúng câu chữ đã hiện ở đầu trang
trước khi người học chạm vào bất cứ thứ gì.

**Kết luận P10:85 — ĐẠT.** Bấm thật bằng `browser_click` (7 cú: 6 lựa chọn + Nộp bài),
không dùng `evaluate` để giả lập.

