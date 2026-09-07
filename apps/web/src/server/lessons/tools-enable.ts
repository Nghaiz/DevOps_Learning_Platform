import { SANDBOX_TOOLS, type SandboxTool } from '@devops-platform/shared-types/scenario';

/**
 * Sinh script bật bộ công cụ theo bài trong pod sandbox (hợp đồng C4).
 *
 * ## Vì sao bật lúc SETUP PHIÊN chứ không truyền env lúc tạo pod
 *
 * Pod đến từ **warm pool** — nó được dựng TRƯỚC khi ai biết người học sắp mở
 * bài nào. Nên không có thời điểm "tạo pod" nào để đính `TOOLSET=btop,yq` vào:
 * lúc pod sinh ra, bài chưa tồn tại trong câu chuyện. Chỗ sớm nhất biết được
 * cả hai vế (pod nào + bài nào) là `lessons.runSetup`, và đó là lý do hàm này
 * đi cùng đường với `buildAssetPushScript` thay vì cùng đường với `createSession`.
 *
 * ## Vì sao lọc lại theo `SANDBOX_TOOLS` dù input đã qua Zod
 *
 * `authoring.contentDraftInput` đã ép `z.enum(SANDBOX_TOOLS)`, nên đường GHI
 * hôm nay không đẻ ra được tên lạ. Nhưng giá trị tới đây đọc từ **cột `text`
 * của DB**, và cột đó nhận bất cứ chuỗi nào một lượt seed, một lượt migrate,
 * hay một bản vá SQL tay ghi vào. Chuỗi đó rồi được **nội suy thẳng vào một
 * dòng lệnh shell** chạy trong pod. Tin vào lượt kiểm ở tầng trên nghĩa là để
 * khoảng cách giữa hai tầng thành chỗ tiêm lệnh.
 *
 * Nên phép lọc dưới đây LÀ hàng rào, không phải một lượt kiểm thừa: sau nó,
 * mọi phần tử là một phần tử của một hằng biên dịch được, tức không thể chứa
 * khoảng trắng, `;`, `$` hay `` ` ``. Đó là điều làm chuỗi ghép ở cuối an toàn —
 * không phải việc ta có trích dẫn nó hay không.
 *
 * Tên lạ bị BỎ QUA IM LẶNG chứ không ném, và đây là chỗ cố ý lệch khỏi
 * "errors over silent fallbacks": người học không sửa được dữ liệu trong DB,
 * nên ném ở đây là chặn cả bài học vì một field phụ. Cái giá phải trả (một
 * công cụ không được bật) hiện ra ngay trong pod khi gõ lệnh, còn cái giá của
 * việc ném là "bài không mở được" — không tương xứng.
 */

/** Giữ thứ tự người soạn đã lưu, bỏ trùng, bỏ tên không có trong danh mục. */
function knownToolsOf(toolset: readonly string[]): readonly SandboxTool[] {
  const seen = new Set<string>();
  const out: SandboxTool[] = [];
  for (const raw of toolset) {
    if (seen.has(raw)) {
      continue;
    }
    seen.add(raw);
    // `find` trên hằng (không phải `includes` + `as`): kiểu hẹp lại nhờ chính
    // phép so sánh, nên không có câu khẳng định nào phải tin.
    const known = SANDBOX_TOOLS.find((tool) => tool === raw);
    if (known !== undefined) {
      out.push(known);
    }
  }
  return out;
}

/**
 * `null` = KHÔNG có gì để bật ⇒ call-site không được tốn một lượt exec.
 *
 * Trả `null` chứ không trả một script rỗng: một script rỗng vẫn là một vòng
 * `POST /exec/session/{id}` đầy đủ (chín bước authz, một lượt `kubectl exec`)
 * cho đúng không việc gì. Phần lớn bài sẽ không khai `toolset`, nên đây là
 * đường đi thường xuyên nhất của hàm này, không phải một ca biên.
 */
export function buildToolsEnableScript(toolset: readonly string[]): string | null {
  const tools = knownToolsOf(toolset);
  if (tools.length === 0) {
    return null;
  }

  // `set -eu` cùng lý do như `buildAssetPushScript`: thiếu nó, `dlp-tools` hỏng
  // giữa chừng vẫn để script thoát 0, `runSetup` báo thành công, và bài chết ở
  // step sau với triệu chứng không liên quan tới dòng này.
  //
  // MỘT lời gọi cho cả bộ, không phải một lời gọi mỗi công cụ: `dlp-tools
  // enable` nhận nhiều tên, và mỗi lời gọi thừa là một vòng exec thừa.
  return `set -eu\ndlp-tools enable ${tools.join(' ')}\n`;
}
