/**
 * Đường găng của MỘT lượt chạy (`RunRecord`), tính từ bản ghi xếp lịch.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ ĐỌC TRƯỚC KHI SỬA: ĐÂY KHÔNG PHẢI ĐƯỜNG DÀI NHẤT TRONG DAG
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Với một đường ống có **số máy chạy hữu hạn**, đường găng không phải đường dài
 * nhất theo cạnh `dependsOn`. Một stage có thể xong muộn vì nó **chờ MÁY**, chứ
 * không chờ một phụ thuộc nào — và thuật toán đường-dài-nhất-trên-DAG hoàn toàn
 * mù với chuyện đó.
 *
 * Cái sai đó nguy hiểm vì nó trông rất hợp lý. Nó trả về một đường có thật, đi
 * qua những cạnh có thật, và tổng thời lượng của nó là một con số cộng đúng. Chỉ
 * có điều con số đó **không giải thích được thời điểm lượt chạy kết thúc**, và
 * nó sai theo hướng tệ nhất: người chơi được chỉ vào đồ thị và đi cắt phụ thuộc,
 * trong khi thứ phải sửa là **số máy hoặc thứ tự chiếm máy**. Họ sẽ sửa, thấy
 * lead time không nhúc nhích, và kết luận là game hỏng.
 *
 * `critical-path.test.ts` ghim khác biệt đó bằng số, và ghim bằng một đối chứng
 * âm hiện thực đúng thuật toán sai ấy: đồ thị 3 cho đường-dài-nhất-DAG ra 40
 * tick trong khi lượt chạy kết thúc ở tick 45; đồ thị 4 ra 27 trong khi thật là
 * 47 và bỏ sót hẳn stage đang giữ máy.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THUẬT TOÁN — đi ngược theo `blockedBy`, không duyệt đồ thị
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. Lấy thực thể có `finishedTick` lớn nhất. Đó là thứ định nghĩa thời điểm
 *    lượt chạy xong, nên đường găng buộc phải kết thúc ở đó.
 * 2. Từ nó đi NGƯỢC theo `StageInstanceRecord.blockedBy`, mỗi bước một cạnh:
 *      `dependency` ⇒ một cạnh phụ thuộc thật (`resourceEdge: false`)
 *      `runner`     ⇒ một **cạnh tài nguyên** (`resourceEdge: true`)
 *      `none`       ⇒ tới gốc, dừng.
 * 3. Đảo lại cho thành thứ tự thời gian.
 *
 * Không có bước nào duyệt `WorkflowSpec`. Đó là chủ ý: bộ lập lịch (A.2) đã
 * biết đích xác *ai* giữ từng thực thể lại, và ghi nó lúc xếp lịch; tính lại
 * chuyện đó từ spec là để hai chỗ trong cùng một engine trả lời khác nhau cho
 * cùng một câu hỏi.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ CÁCH ĐỌC `blockedBy` MÀ FILE NÀY DỰA VÀO — LANE ENGINE PHẢI GHI ĐÚNG THẾ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `blockedBy` ở đây được hiểu là **ràng buộc quyết định `startedTick`** — thứ
 * cuối cùng phải xong trước khi thực thể này chạy được:
 *
 *   - Phải chờ máy (`startedTick > readyTick`) ⇒ `runner`, và `instance` là
 *     thực thể vừa nhả chỗ.
 *   - Chạy ngay lúc `readyTick` vì phụ thuộc cuối cùng vừa xong ⇒ `dependency`,
 *     và `instance` là phụ thuộc XONG MUỘN NHẤT (không phải phụ thuộc đầu tiên
 *     trong `dependsOn`).
 *   - Không phụ thuộc gì và có máy ngay ⇒ `none`.
 *
 * Chú thích của hợp đồng viết *"lý do nó không chạy ngay lúc `readyTick`"*, đọc
 * sát chữ thì chỉ còn mỗi nhánh `runner` là dùng được — và khi đó nhánh
 * `dependency` **không bao giờ xuất hiện**, chuỗi đứt ở mọi thực thể không phải
 * chờ máy, và câu *"A.7 đi ngược… theo chính chuỗi `blockedBy` này"* ở ngay bên
 * dưới trở thành bất khả thi. Nên cách đọc sát chữ không thể là ý định; cách đọc
 * trên là cách duy nhất làm cả hai nhánh có nghĩa và làm A.7 thực hiện được.
 *
 * ⛔ Test của file này dựng `StageInstanceRecord` BẰNG TAY, nên nó xanh dù lane
 * engine ghi `blockedBy` theo cách khác. Đó đúng là hình dạng
 * `rules/green-that-proves-nothing.md` cảnh báo: cổng đo phép đi ngược, không đo
 * thứ engine ghi ra. Chỗ bịt là một test tích hợp chạy engine thật rồi khẳng
 * định `criticalPath(...).truncated === false` — thuộc lane engine, không thuộc
 * đây, và nó ĐANG THIẾU.
 */

import { compareKeys } from '../git/deterministic.ts';
import type { BlockedBy, InstanceKey, StageId, StageInstanceRecord } from './contract.ts';

/** Một mắt xích trên đường găng. */
export interface CriticalPathNode {
  readonly instance: InstanceKey;
  /**
   * Stage của thực thể, chép thẳng từ bản ghi.
   *
   * Có mặt để không ai phải tách `InstanceKey` ở dấu `#`. Vị từ
   * `stageOnCriticalPath`/`stageOffCriticalPath` (A.9) hỏi theo `StageId`, và
   * một phép tách chuỗi viết lại ở mỗi chỗ dùng là một phép tách sẽ lệch nhau.
   */
  readonly stageId: StageId;
}

/**
 * Một đoạn của đường găng. `from` xong trước, `to` chạy sau.
 *
 * `resourceEdge` ánh xạ thẳng sang `DagEdgeView.resourceEdge`: `true` nghĩa là
 * đoạn này **không có trong `dependsOn`** — thứ giữ `to` lại là máy chạy. Tầng
 * 3D vẽ hai loại khác nhau, vì tô một đoạn chờ-máy như thể nó là phụ thuộc là
 * dạy sai (xem đầu file).
 */
export interface CriticalPathEdge {
  readonly from: InstanceKey;
  readonly to: InstanceKey;
  readonly resourceEdge: boolean;
}

export interface CriticalPath {
  /** Theo thứ tự THỜI GIAN: gốc trước, thực thể kết thúc muộn nhất ở cuối. */
  readonly nodes: readonly CriticalPathNode[];
  /** Cùng thứ tự với `nodes`. Luôn có `nodes.length - 1` phần tử. */
  readonly edges: readonly CriticalPathEdge[];
  /** `finishedTick` của thực thể cuối — cũng là lúc lượt chạy xong. */
  readonly finishedTick: number;
  /**
   * `true` = chuỗi `blockedBy` ĐỨT giữa chừng, đường trả về chỉ là phần đuôi.
   *
   * Hai nguyên nhân, cả hai đều là bản ghi hỏng chứ không phải dữ liệu người
   * chơi: `blockedBy.instance` trỏ tới một khoá không có trong mảng đưa vào,
   * hoặc chuỗi quay vòng lại một thực thể đã đi qua.
   *
   * ⛔ Không ném và không im lặng. Ném thì một lỗi của engine làm sập phiên chơi
   * của người dùng; im lặng thì đường găng ngắn đi mà trông vẫn hợp lệ, và cả
   * hai tầng trên đều tin. Đây là chỗ `development-principles.md` gọi là "fallback
   * được ghi rõ và đưa lên cho người gọi thấy" — tầng gọi tự quyết tô hay báo.
   *
   * Trường hợp CHỜ ĐỢI ĐƯỢC mà vẫn bật `true`: một `PassRecord` nhiều commit.
   * `InstanceKey` không mang `commitId` (hợp đồng §1), nên một thực thể của
   * commit sau chờ máy do commit trước giữ sẽ trỏ tới một khoá nằm ngoài
   * `RunRecord.instances` của chính nó. Xem báo cáo lane — đây là một lỗ của hợp
   * đồng, không phải của file này.
   */
  readonly truncated: boolean;
}

/**
 * Đường găng của một lượt chạy. `null` khi không có thực thể nào.
 *
 * Nhận thẳng mảng thực thể (`run.instances`) chứ không nhận `RunRecord`: hàm chỉ
 * cần đúng chừng này, và test dựng được đầu vào bằng tay mà không phải bịa ra
 * `arrivalTick` với `changedInputs` chẳng liên quan gì tới phép tính.
 *
 * **Hoà `finishedTick`** thì lấy `InstanceKey` nhỏ nhất theo mã đơn vị. Hai thực
 * thể cùng kết thúc muộn nhất thì đường qua cái nào cũng là đường găng hợp lệ —
 * cái phải giữ ở đây là chọn GIỐNG NHAU ở mọi môi trường, không phải chọn "đúng".
 */
export function criticalPath(instances: readonly StageInstanceRecord[]): CriticalPath | null {
  if (instances.length === 0) return null;

  const byKey: Record<InstanceKey, StageInstanceRecord> = {};
  for (const record of instances) byKey[record.instance] = record;

  const first = instances[0];
  if (first === undefined) return null;
  let sink: StageInstanceRecord = first;
  for (const record of instances) {
    if (record.finishedTick > sink.finishedTick) {
      sink = record;
      continue;
    }
    if (record.finishedTick === sink.finishedTick && compareKeys(record.instance, sink.instance) < 0) {
      sink = record;
    }
  }

  /* Dựng ngược từ đuôi, rồi đảo. Cạnh `i` nối `nodes[i]` với `nodes[i + 1]`. */
  const reversedNodes: CriticalPathNode[] = [];
  const reversedEdges: CriticalPathEdge[] = [];
  const walked: Record<InstanceKey, true> = {};

  let cursor: StageInstanceRecord | undefined = sink;
  let truncated = false;

  while (cursor !== undefined) {
    reversedNodes.push({ instance: cursor.instance, stageId: cursor.stageId });
    walked[cursor.instance] = true;

    /*
     * Chú kiểu tường minh cho HAI biến này, không phải thừa: thiếu nó thì TS
     * thu hẹp kiểu của `cursor` qua chính phép gán ở cuối vòng lặp, và phép
     * suy diễn quay vòng lại chính nó (TS7022 — đã đo, không đoán).
     */
    const blocked: BlockedBy = cursor.blockedBy;
    if (blocked.kind === 'none') break;

    const previous: StageInstanceRecord | undefined = byKey[blocked.instance];
    if (previous === undefined || Object.hasOwn(walked, blocked.instance)) {
      truncated = true;
      break;
    }

    reversedEdges.push({
      from: blocked.instance,
      to: cursor.instance,
      resourceEdge: blocked.kind === 'runner',
    });
    cursor = previous;
  }

  reversedNodes.reverse();
  reversedEdges.reverse();

  return {
    nodes: reversedNodes,
    edges: reversedEdges,
    finishedTick: sink.finishedTick,
    truncated,
  };
}
