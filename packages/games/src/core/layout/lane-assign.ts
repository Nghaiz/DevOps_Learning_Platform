/**
 * Gán **làn** cho từng node. Làn mang danh tính nhánh, không phải một con số tối
 * ưu lại mỗi lượt vẽ.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO LÀ "CHUỖI", KHÔNG PHẢI "TỐI ƯU TOẠ ĐỘ"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Thuật toán Sugiyama tổng quát coi vị trí ngang là một bài toán tối ưu: cho
 * trước đồ thị, tìm bộ toạ độ ít cắt cạnh nhất. Đó là câu trả lời đúng cho một
 * đồ thị TĨNH và là câu trả lời sai ở đây, vì đồ thị của ta đổi sau **mỗi lệnh
 * git**. Một lời giải tối ưu cho đồ thị sau có thể khác hẳn lời giải tối ưu cho
 * đồ thị trước, và người chơi nhìn thấy cả lịch sử nhảy chỗ chỉ vì họ gõ
 * `git branch`. Đo được trên `d3-dag@1.2.2`: thêm một nhánh làm 4 trên 6 commit
 * cũ đổi làn (bảng đo đầy đủ ở `dag-layout.ts`).
 *
 * Nên làn ở đây gắn vào **chuỗi** (chain) — một dãy commit nối nhau qua cha thứ
 * nhất, tức đúng cái mà người dùng git gọi là "một nhánh". Thêm commit vào cuối
 * một chuỗi không tạo chuỗi mới, nên không làn nào phải đánh số lại. Đó là điều
 * kiện "làn cố định" của design §3.5.
 *
 * Việc tối ưu vẫn còn, nhưng nó chuyển chỗ: ta không tối ưu vị trí TỪNG NODE, ta
 * chỉ chọn **thứ tự các làn** (xem `MEDIAN_PASSES` bên dưới). Đó là chỗ duy nhất
 * còn giảm được cắt cạnh mà không phá tính ổn định.
 */

/*
 * Không import `compareKeys` ở đây, và đó không phải thiếu sót: file này KHÔNG
 * sắp xếp gì theo chuỗi cả. Nó nhận mảng đã ở thứ tự chuẩn tắc từ
 * `dag-layout.ts` và chỉ còn sắp theo SỐ (trung vị, chỉ số làn). Thêm một phép
 * so chuỗi vào đây là thêm một chỗ nữa có thể lệch khỏi thứ tự mà bên gọi đã chốt.
 */

export interface LaneNode {
  readonly id: string;
  /** Đã lọc: mọi phần tử chắc chắn là id của một node có mặt. */
  readonly parents: readonly string[];
  readonly laneHint?: string;
}

export interface LaneAssignment {
  readonly laneOf: Readonly<Record<string, number>>;
  readonly laneCount: number;
  /** Id node mở đầu mỗi chuỗi, đánh chỉ số theo làn. Dùng cho test và gỡ rối. */
  readonly chainHeads: readonly string[];
}

/**
 * Số lượt tinh chỉnh trung vị.
 *
 * Bốn là con số quy ước của Sugiyama và nó đủ: mỗi lượt chỉ hoán vị các làn kề
 * nhau, và với vài chục nhánh thì thứ tự đứng yên sau hai tới ba lượt. Cố định
 * số lượt (thay vì lặp tới khi hội tụ) là có chủ ý — một vòng lặp "tới khi hết
 * đổi" có thể dao động giữa hai cấu hình cùng điểm và không bao giờ dừng.
 */
const MEDIAN_PASSES = 4;

/** Trung vị của một dãy số. Dãy rỗng trả `null`. */
function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const lo = sorted[mid - 1];
  const hi = sorted[mid];
  if (lo === undefined || hi === undefined) return null;
  return (lo + hi) / 2;
}

/**
 * Gán làn cho các node đã sắp theo thứ tự chuẩn tắc `(depth, id)`.
 *
 * ⚠ `nodesInOrder` PHẢI đã ở thứ tự đó, và hàm này KHÔNG tự sắp lại.
 *
 * Không nhận `depthOf` là có chủ ý, dù bên gọi vừa tính xong: thứ tự của mảng đã
 * mang trọn thông tin tầng, nên nhận thêm nó chỉ tạo ra một nguồn sự thật thứ hai
 * cho cùng một dữ kiện — và hai nguồn thì sẽ lệch. Sắp sai thứ tự là lỗi của bên
 * gọi và `dag-layout.ts` là bên gọi duy nhất.
 */
export function assignLanes(nodesInOrder: readonly LaneNode[]): LaneAssignment {
  // ── Bước 1: gom node thành chuỗi ──────────────────────────────────────────
  const chainOf: Record<string, number> = {};
  const chainHeads: string[] = [];
  const hintChain: Record<string, number> = {};
  /**
   * Chuỗi này đã bị một `laneHint` nhận làm của riêng chưa, và của hint nào.
   *
   * ⚠ Đây là thứ làm cho câu "danh tính nhánh thắng hình dạng" thành sự thật
   * thay vì một lời hứa trong chú thích. Thiếu nó thì quy tắc kế thừa theo cha
   * thứ nhất âm thầm thắng ngược, theo đúng hai đường mà test đã bắt được:
   *
   *   - một node KHÔNG hint là con của `main` chiếm mất làn của `main`, đẩy
   *     chính `main` sang làn khác;
   *   - một node hint `feature` rẽ ra từ `main` kế thừa luôn làn `main`, nên hai
   *     nhánh khác tên dùng chung một làn.
   *
   * Luật: **một chuỗi đã có chủ chỉ được nối tiếp bởi node mang đúng hint đó.**
   */
  const chainHint: (string | null)[] = [];
  /** Cha đã nhường chuỗi của mình cho một con rồi — mỗi cha chỉ nhường một lần. */
  const passedOn: Record<string, true> = {};

  for (const node of nodesInOrder) {
    const hint = node.laneHint;
    let chain: number | null = null;

    // 1. Đã biết hint này ở đâu ⇒ về đúng chỗ đó, không bàn thêm.
    if (hint !== undefined) {
      const known = hintChain[hint];
      if (known !== undefined) chain = known;
    }

    // 2. Kế thừa chuỗi của cha thứ nhất — chỉ khi cha chưa nhường cho con nào
    //    khác, VÀ chuỗi đó chưa có chủ mang tên khác.
    if (chain === null) {
      const firstParent = node.parents[0];
      if (firstParent !== undefined && !Object.hasOwn(passedOn, firstParent)) {
        const parentChain = chainOf[firstParent];
        if (parentChain !== undefined && (chainHint[parentChain] ?? null) === null) {
          chain = parentChain;
          passedOn[firstParent] = true;
        }
      }
    }

    // 3. Không kế thừa được ⇒ mở chuỗi mới. Commit gốc, chỗ rẽ nhánh, hoặc một
    //    nhánh có tên đang tách khỏi một nhánh có tên khác.
    if (chain === null) {
      chain = chainHeads.length;
      chainHeads.push(node.id);
      chainHint.push(null);
    }

    chainOf[node.id] = chain;
    if (hint !== undefined && hintChain[hint] === undefined) {
      hintChain[hint] = chain;
      chainHint[chain] = hint;
    }
  }

  const chainCount = chainHeads.length;
  if (chainCount === 0) return { laneOf: {}, laneCount: 0, chainHeads: [] };

  // ── Bước 2: chuỗi nào kề chuỗi nào ────────────────────────────────────────
  /*
   * Chỉ tính cạnh VƯỢT chuỗi. Cạnh trong cùng một chuỗi không nói gì về việc nên
   * xếp chuỗi đó cạnh chuỗi nào, và đưa nó vào chỉ kéo trung vị về chính nó.
   */
  const neighbours: number[][] = chainHeads.map(() => []);
  for (const node of nodesInOrder) {
    const here = chainOf[node.id];
    if (here === undefined) continue;
    for (const parent of node.parents) {
      const there = chainOf[parent];
      if (there === undefined || there === here) continue;
      neighbours[here]?.push(there);
      neighbours[there]?.push(here);
    }
  }

  // ── Bước 3: chọn THỨ TỰ các làn bằng trung vị vị trí hàng xóm ─────────────
  /*
   * Thứ tự khởi đầu là thứ tự chuỗi được tạo ra, tức `(depth, id)` của node mở
   * đầu — đã tất định. Mỗi lượt sau đó kéo một chuỗi về gần trung vị của các
   * chuỗi nối với nó, đúng heuristic trung vị của Sugiyama. Giảm cắt cạnh là mục
   * tiêu đo được: nghiên cứu GD 2025 đo PECC thấp cho độ chính xác đọc đồ thị
   * ~74%, PECC cao ~65%.
   *
   * ⛔ KHÔNG gom bó cạnh (edge bundling). Bó cạnh làm mất khả năng lần theo MỘT
   * đường phụ thuộc, mà đó chính là thứ game này dạy.
   */
  let order: number[] = chainHeads.map((_, i) => i);
  for (let pass = 0; pass < MEDIAN_PASSES; pass += 1) {
    const laneOfChain: number[] = new Array<number>(chainCount).fill(0);
    order.forEach((chain, lane) => {
      laneOfChain[chain] = lane;
    });

    const key: number[] = new Array<number>(chainCount).fill(0);
    for (let chain = 0; chain < chainCount; chain += 1) {
      const lanes = (neighbours[chain] ?? []).map((n) => laneOfChain[n] ?? 0);
      key[chain] = median(lanes) ?? laneOfChain[chain] ?? 0;
    }

    // `Array.prototype.sort` ổn định từ ES2019; phá hoà bằng làn hiện tại nên
    // không còn chỗ nào cho thứ tự chèn chen vào.
    order = [...order].sort((a, b) => {
      const ka = key[a] ?? 0;
      const kb = key[b] ?? 0;
      if (ka !== kb) return ka - kb;
      return (laneOfChain[a] ?? 0) - (laneOfChain[b] ?? 0);
    });
  }

  const finalLaneOfChain: number[] = new Array<number>(chainCount).fill(0);
  order.forEach((chain, lane) => {
    finalLaneOfChain[chain] = lane;
  });

  const laneOf: Record<string, number> = {};
  for (const node of nodesInOrder) {
    const chain = chainOf[node.id];
    laneOf[node.id] = chain === undefined ? 0 : (finalLaneOfChain[chain] ?? 0);
  }

  const headsByLane: string[] = new Array<string>(chainCount).fill('');
  for (let chain = 0; chain < chainCount; chain += 1) {
    const lane = finalLaneOfChain[chain] ?? 0;
    headsByLane[lane] = chainHeads[chain] ?? '';
  }

  return { laneOf, laneCount: chainCount, chainHeads: headsByLane };
}
