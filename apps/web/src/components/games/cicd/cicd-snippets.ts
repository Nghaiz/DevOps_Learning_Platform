/**
 * Mẩu YAML chèn nhanh — 19.E.3.
 *
 * ## ⛔ VÌ SAO KHÔNG LẤY TỪ `level.teaching.cheatsheet`
 *
 * Đó là chỗ *đáng ra* phải lấy, và bản đầu định lấy từ đó. Nhưng bảng cheatsheet
 * của các level nói `stages:` / `dependsOn:` / `runnerClass:` — tức TÊN TRƯỜNG
 * CỦA HỢP ĐỒNG NỘI BỘ, không phải từ vựng mà bộ đọc YAML nhận. Bộ đọc
 * (`cicd/yaml-read.ts`) chỉ hiểu `jobs:` / `needs:` / `runs-on:` / `steps:` /
 * `continue-on-error:` / `strategy.matrix`, đúng từ vựng GitHub Actions.
 *
 * Nên một người chơi chép nguyên mẩu trong cheatsheet vào ô soạn sẽ nhận lỗi
 * quét — và sẽ tin là mình gõ sai, chứ không nghi bài học sai. Cheatsheet là dữ
 * liệu của `packages/games`, làn khác sở hữu; sửa nó không nằm trong tay file
 * này. Nên bảng dưới đây là bảng ĐỘC LẬP, viết bằng đúng từ vựng bộ đọc nhận, và
 * đây là ghi chú để lần sau không ai "thống nhất" hai bên bằng cách kéo bảng sai
 * đè lên bảng đúng.
 *
 * ## Vì sao chèn vào CUỐI văn bản chứ không tại con trỏ
 *
 * `YamlEditor` không lộ ref của `<textarea>` ra ngoài, và chọc vào đó chỉ để
 * biết `selectionStart` sẽ kéo theo việc đồng bộ lại vị trí con trỏ, lịch sử
 * hoàn tác của trình duyệt, và cả ba bất biến căn lề mà ô soạn đang giữ. Chèn ở
 * cuối là hành vi đoán trước được, và nhãn nút nói thẳng ra như vậy.
 */

export interface CicdSnippet {
  readonly id: string;
  readonly label: string;
  /** Câu giải thích ngắn, hiện dưới nhãn — mẩu YAML một mình không dạy được gì. */
  readonly explain: string;
  readonly yaml: string;
}

/**
 * Bảng mẩu, dựng theo hạng máy chạy CÓ THẬT của màn.
 *
 * Hạng máy là một hằng của từng level (`c01` cấp `linux`, các màn sau cấp hạng
 * khác), nên một chuỗi cứng ở đây sẽ đúng ở đúng một màn và làm workflow KHÔNG
 * CHẠY ĐƯỢC ở mọi màn còn lại — với lỗi `unschedulable`, thứ trông như lỗi của
 * người chơi. Truyền vào từ `level.workload.runners` thay vì đoán.
 */
export function cicdSnippets(runnerClassIds: readonly string[]): readonly CicdSnippet[] {
  const may = runnerClassIds[0] ?? 'linux';
  return [
  {
    id: 'job',
    label: 'Job mới',
    explain: 'Một job là một đơn vị chạy trên một máy. Tên job là thứ job khác nhắc tới trong "needs".',
      yaml: [
        '  build:',
        `    runs-on: ${may}`,
        '    steps:',
        '      - name: Biên dịch',
        '        run: make build',
      ].join('\n'),
  },
  {
    id: 'needs',
    label: 'Cạnh phụ thuộc',
    explain: 'Job này chỉ bắt đầu sau khi mọi job trong "needs" đã xong. Bỏ bớt một cạnh thừa là cách rẻ nhất để rút ngắn đường găng.',
    yaml: ['    needs:', '      - clone'].join('\n'),
  },
  {
    id: 'runs-on',
    label: 'Chọn hạng máy chạy',
    explain: 'Hạng máy quyết định job xếp hàng ở kho nào. Đòi một hạng không có trong kho thì workflow không chạy được.',
    yaml: `    runs-on: ${may}`,
  },
  {
    id: 'step',
    label: 'Bước mới trong job',
    explain: 'Các bước trong một job chạy tuần tự trên cùng một máy — muốn chúng chạy song song thì phải tách thành job riêng.',
    yaml: ['      - name: Kiểm thử đơn vị', '        run: make test'].join('\n'),
  },
  {
    id: 'continue-on-error',
    label: 'Việc không chặn',
    explain: 'Job hỏng mà không đánh trượt cả lượt. Dùng cho việc mang tin tức (lint, quét) chứ không dùng để giấu một lỗi thật.',
    yaml: '    continue-on-error: true',
  },
  {
    id: 'matrix',
    label: 'Quạt ra theo ma trận',
    explain: 'Một job nhân thành nhiều bản chạy song song, mỗi bản một tổ hợp giá trị. Nhanh hơn về thời gian, nhưng tốn runner-phút theo đúng số bản.',
      yaml: [
        '    strategy:',
        '      matrix:',
        '        os:',
        '          - linux',
        '          - macos',
      ].join('\n'),
    },
  ];
}

/**
 * Nối mẩu vào cuối văn bản, đảm bảo đúng MỘT dòng trống ngăn cách.
 *
 * Văn bản rỗng thì không thêm dòng trống dẫn đầu — một file YAML mở đầu bằng
 * dòng trống vẫn quét được, nhưng nó trông như một lỗi và người chơi sẽ đi sửa
 * nhầm chỗ.
 */
export function appendSnippet(current: string, snippet: string): string {
  const base = current.replace(/\s+$/u, '');
  return base.length === 0 ? snippet : `${base}\n${snippet}\n`;
}
