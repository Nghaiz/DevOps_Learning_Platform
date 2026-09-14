/**
 * Vẽ đường cho một cạnh cha → con. **Góc vuông theo làn, không bó cạnh.**
 *
 * ⛔ KHÔNG gom bó cạnh (edge bundling), và đây là ràng buộc sản phẩm chứ không
 * phải sở thích thẩm mỹ. Bó cạnh gộp nhiều đường đi chung một đoạn để nhìn đỡ
 * rối, cái giá là không còn lần theo được MỘT đường phụ thuộc từ đầu tới cuối —
 * mà lần theo một đường phụ thuộc chính là kỹ năng game này dạy. Rối mà lần được
 * còn hơn gọn mà không lần được.
 *
 * ⛔ Không đường cong, không Bézier. Góc vuông làm mắt bám được đoạn thẳng và
 * đọc ngay ra "đoạn này chạy trong làn nào" — với một đồ thị mà làn MANG NGHĨA
 * (làn = nhánh), đó là thông tin, không phải trang trí.
 *
 * Toạ độ là `[depth, lane]`, cùng hệ với `dag-layout.ts`.
 */

/** Một điểm trên lưới: `[depth, lane]`. */
export type LayoutPoint = readonly [number, number];

/**
 * Ba hình dạng, và chỗ đặt góc được chọn để góc KHÔNG đè lên một node khác.
 *
 * ```
 *  cùng làn                 rẽ nhánh (cha thứ nhất)      merge (cha thứ hai)
 *  P ────────── C           P ──┐                        P ──────────┐
 *                              └──────── C                           └── C
 *                           góc ở (cha.depth, con.lane)  góc ở (con.depth, cha.lane)
 * ```
 *
 * **Rẽ nhánh** — con không kế thừa được làn của cha, nên nó mở một chuỗi MỚI bắt
 * đầu từ chính nó. Ở độ sâu của cha, làn mới đó chưa có ai: chuỗi chưa tồn tại.
 * Nên đặt góc tại `(cha.depth, con.lane)` là đặt vào ô gần như chắc chắn trống.
 *
 * **Merge** — cạnh tới từ cha thứ hai, tức một nhánh vừa KẾT THÚC ở đó. Ở độ sâu
 * của commit merge, làn của cha đó đã không còn ai nối tiếp. Nên góc tại
 * `(con.depth, cha.lane)` cũng rơi vào ô trống.
 *
 * Hai lựa chọn đối xứng nhau, và chọn sai chiều thì góc rơi đúng vào một commit
 * đang hiển thị — đường vẽ chui qua một node, người đọc tưởng có cạnh không hề
 * tồn tại.
 */
export function routeEdge(
  fromDepth: number,
  fromLane: number,
  toDepth: number,
  toLane: number,
  isFirstParent: boolean,
): readonly LayoutPoint[] {
  const start: LayoutPoint = [fromDepth, fromLane];
  const end: LayoutPoint = [toDepth, toLane];

  if (fromLane === toLane) return [start, end];

  const corner: LayoutPoint = isFirstParent ? [fromDepth, toLane] : [toDepth, fromLane];
  return [start, corner, end];
}

/**
 * Đếm số đoạn **chéo** trong một đường. Luôn phải là 0.
 *
 * Có mặt để test khẳng định được tính chất "góc vuông" thay vì tin vào mô tả —
 * một hàm định tuyến viết sai vẫn trả về đủ số điểm và vẫn vẽ ra một đường trông
 * hợp lý, nên "3 điểm" không chứng minh được gì. Cái chứng minh được là: mỗi
 * đoạn chỉ đổi MỘT trong hai toạ độ.
 */
export function countDiagonalSegments(points: readonly LayoutPoint[]): number {
  let diagonal = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (a === undefined || b === undefined) continue;
    if (a[0] !== b[0] && a[1] !== b[1]) diagonal += 1;
  }
  return diagonal;
}
