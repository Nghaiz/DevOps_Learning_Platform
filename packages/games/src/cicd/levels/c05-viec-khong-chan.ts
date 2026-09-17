import { cheatsheetExample } from '../cheatsheet-example.ts';
import type { CicdLevel } from '../contract.ts';

/**
 * C05 — việc không chặn.
 *
 * `kiem-tra-tich-hop` gọi một dịch vụ bên ngoài đang hỏng, nên nó đỏ ở MỌI lượt
 * (`flake.rate: 1`). Đó là chủ ý: người chơi không được phép "chạy lại cho may".
 * Một xác suất 0,3 sẽ biến level thành một trò tung xúc xắc và che mất bài học.
 *
 * ## Hai lời giải khác nhau THẬT — hai TẦNG khác nhau
 *
 * - **A — stage không chặn** (`StageSpec.blocking: false`). Stage vẫn ĐỎ, và
 *   bản ghi vẫn ghi nó đỏ; chỉ là cả lượt chạy không đỏ theo, và stage phía sau
 *   không nhận `upstream-failed`. Đây là "cho phép job này hỏng".
 * - **B — bước không chặn** (`StepSpec.blocking: false`). Bước đỏ, nhưng stage
 *   đi tiếp và KẾT THÚC XANH. Đây là "cho phép lệnh này trả mã lỗi".
 *
 * Khác biệt không phải thẩm mỹ: ở A bảng tổng kết còn một stage đỏ để người ta
 * nhìn thấy và đi sửa; ở B nó biến mất khỏi tầm mắt. Hai cách cùng AC, và mục
 * THƯỞNG `stageNonBlocking` trao cho A vì đó là cách giữ lại tín hiệu.
 *
 * ⚠ Chú ý nghĩa ĐẢO: `blocking: false` là "đỏ thì đi tiếp", không phải "chặn".
 * Hợp đồng chọn tên này thay vì khoá quen thuộc của một nhà cung cấp, và cái giá
 * là đúng chỗ dễ đọc ngược này.
 *
 * ## Vì sao `editable` chỉ có `blocking`
 *
 * Mở thêm `edges` là mở một lời giải thứ ba — gỡ cạnh `dong-goi → tich-hop` —
 * mà lời giải đó KHÔNG qua được (`greenRateAtLeast` vẫn đỏ vì stage tích hợp
 * vẫn là stage chặn). Một đường đi trông hợp lý mà không bao giờ về đích là một
 * cái bẫy, không phải một bài học.
 */
export const c05: CicdLevel = {
  id: 'cicd-c05-viec-khong-chan',
  chapter: 'ci',
  title: 'Việc không chặn',
  mission: 'Một bộ kiểm thử tích hợp hỏng vì dịch vụ ngoài. Đừng để nó chặn cả đường ống.',
  brief: `Bộ kiểm thử tích hợp của đội gọi sang một dịch vụ nội bộ, và dịch vụ đó đang
hỏng — không phải lỗi của mã nguồn. Kết quả: mọi commit đều đỏ, và stage
\`dong-goi\` thậm chí không được chạy lần nào.

Đường ống của bạn cần phân biệt hai loại việc. Có việc mà **hỏng là phải dừng
lại**: build đỏ thì không có gì để đóng gói. Và có việc mà **hỏng thì ghi nhận
rồi đi tiếp**: một bộ kiểm thử đang phụ thuộc hạ tầng hỏng, một lần soi mã chỉ
mang tính cảnh báo.

Ở level này bạn chỉ sửa được một thứ: việc nào chặn và việc nào không. Có hai
tầng để đặt cái công tắc đó, và chúng cho ra hai bản ghi rất khác nhau. Đừng xoá
bộ kiểm thử tích hợp — nó vẫn phải chạy và vẫn phải báo cáo.`,
  difficulty: 'intermediate',
  initialWorkflow: {
    name: 'Mọi việc đều chặn',
    stages: [
      {
        id: 'clone', kind: 'clone', name: 'Tải mã nguồn', dependsOn: [],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'tai-ma', name: 'Tải mã nguồn', durationTicks: 2, blocking: true, produces: ['ma-nguon'] }],
      },
      {
        id: 'dung', kind: 'build', name: 'Build', dependsOn: ['clone'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{
          id: 'bien-dich', name: 'Biên dịch mã nguồn', durationTicks: 6, blocking: true,
          requires: ['ma-nguon'], produces: ['ban-dung'],
        }],
      },
      {
        id: 'kiem-tra', kind: 'unit-test', name: 'Kiểm thử đơn vị', dependsOn: ['dung'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{
          id: 'chay-test', name: 'Chạy test đơn vị', durationTicks: 5, blocking: true,
          requires: ['ban-dung'], produces: ['bao-cao-test'],
        }],
      },
      {
        id: 'kiem-tra-tich-hop', kind: 'integration-test', name: 'Kiểm thử tích hợp', dependsOn: ['dung'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{
          id: 'goi-dich-vu', name: 'Gọi dịch vụ nội bộ rồi kiểm kết quả', durationTicks: 6, blocking: true,
          requires: ['ban-dung'],
          // rate 1 = hỏng ở MỌI lần thử. Dịch vụ ngoài đang chết, không phải
          // chập chờn — nên "chạy lại cho may" không phải một đường đi.
          flake: { rate: 1, nature: 'infra' },
        }],
      },
      {
        id: 'lint', kind: 'lint', name: 'Soi mã', dependsOn: ['dung'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'soi-ma', name: 'Soi quy ước mã nguồn', durationTicks: 3, blocking: true, requires: ['ban-dung'] }],
      },
      {
        id: 'dong-goi', kind: 'package', name: 'Đóng gói',
        dependsOn: ['kiem-tra', 'kiem-tra-tich-hop', 'lint'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{
          id: 'dong-goi-ban', name: 'Đóng gói bản phát hành', durationTicks: 3, blocking: true,
          requires: ['ban-dung', 'bao-cao-test'],
        }],
      },
    ],
  },
  workload: {
    runners: [{ id: 'linux', label: 'Máy Linux', count: 3 }],
    inputs: [{ id: 'ma-nguon', label: 'Mã nguồn', changesEvery: 1 }],
    commits: [
      { id: 'c1', tick: 0 },
      { id: 'c2', tick: 35 },
      { id: 'c3', tick: 70 },
    ],
  },
  evaluation: { baseSeed: 1905, passes: 4 },
  editable: ['blocking'],
  allowedKinds: null,
  objectives: [
    {
      id: 'moi-lut-deu-xanh',
      label: 'Mọi lượt chạy đều xanh',
      check: 'greenRateAtLeast',
      args: { rate: 1 },
      required: true,
    },
    {
      id: 'khong-bi-chan-nguoc',
      label: 'Không stage nào bị chặn chỉ vì một stage trước nó đỏ',
      check: 'noFailureCause',
      args: { cause: 'upstream-failed' },
      required: true,
    },
    {
      id: 'con-tich-hop',
      label: 'Bộ kiểm thử tích hợp vẫn còn chạy trong đường ống',
      check: 'stageExists',
      args: { stage: 'kiem-tra-tich-hop' },
      required: true,
    },
    {
      id: 'du-nhanh',
      label: 'Một commit đi hết đường ống trong dưới 200 giây',
      check: 'leadTimeUnder',
      args: { seconds: 200 },
      required: true,
    },
    {
      id: 'giu-tin-hieu-do',
      label: 'Thưởng: để chính stage tích hợp mang dấu không-chặn, nên nó vẫn hiện đỏ trong bảng',
      check: 'stageNonBlocking',
      args: { stage: 'kiem-tra-tich-hop' },
      required: false,
    },
  ],
  thresholds: {
    parLeadSeconds: 170,
    budgetLeadSeconds: 200,
    parThroughputPerHour: 12,
    minThroughputPerHour: 10,
    parRunnerMinutes: 12.5,
    budgetRunnerMinutes: 14,
    minGreenRate: 1,
  },
  hints: [
    'Đọc bản ghi của `dong-goi`. Nó không chạy lần nào, và nguyên nhân đỏ của nó không nằm ở chính nó — nó bị một stage trước chặn lại.',
    'Mỗi stage có một dấu "đỏ thì cả lượt đỏ theo", và mỗi bước bên trong stage cũng có một dấu như vậy. Hai dấu ở hai tầng khác nhau.',
    'Tắt dấu đó ở stage `kiem-tra-tich-hop` thì stage vẫn hiện đỏ mà lượt chạy xanh. Tắt ở bước `goi-dich-vu` thì stage cũng xanh luôn. Cả hai đều qua — chọn cái bạn muốn nhìn thấy trong bảng tổng kết.',
  ],
  teaching: {
    primer: `Không phải đỏ nào cũng đáng chặn.

Build đỏ thì không có gì để đóng gói — chặn là đúng. Nhưng một bộ kiểm thử tích
hợp đang phụ thuộc hạ tầng hỏng, hay một lần soi mã chỉ mang tính khuyến nghị,
thì chặn cả đường ống là đánh đổi sai: bạn dừng mọi commit của cả đội vì một thứ
không nói gì về mã nguồn của họ.

Có hai tầng đặt công tắc, và chúng khác nhau ở thứ **còn nhìn thấy được**:

- **Ở tầng stage** — stage vẫn ĐỎ trong bảng, nhưng lượt chạy không đỏ theo và
  các stage sau vẫn chạy. Tín hiệu còn nguyên, ai đó vẫn phải đi sửa.
- **Ở tầng bước** — bước đỏ nhưng stage kết thúc XANH. Gọn mắt hơn, và chính vì
  gọn mắt mà nó nguy hiểm hơn: sáu tháng sau không ai nhớ bộ kiểm thử đó đã ngừng
  kiểm cái gì.

Cả hai đều hợp lệ. Quy tắc thực dụng: dùng tầng bước cho việc mà đỏ là *bình
thường* (một lệnh dọn dẹp có thể không có gì để dọn), dùng tầng stage cho việc
mà đỏ là *bất thường nhưng không được chặn ai*.

Và dù chọn tầng nào, hãy đặt một hạn cho nó. Một việc "tạm không chặn" sống ba
năm là một việc đã ngừng kiểm tra từ ba năm trước.`,
    cheatsheet: [
      {
        where: 'yaml',
        example: cheatsheetExample('linux', [
          { id: 'kiem-tra-tich-hop', nonBlocking: true, steps: ['goi-dich-vu'] },
        ]),
        explain: 'Đặt ở stage: stage vẫn ĐỎ trong bảng nhưng lượt chạy không đỏ theo và stage sau vẫn chạy. Chú ý nghĩa: `true` là đi tiếp; vắng khoá hoặc `false` là chặn.',
      },
      {
        where: 'yaml',
        example: cheatsheetExample('linux', [
          { id: 'kiem-tra-tich-hop', steps: [{ id: 'goi-dich-vu', nonBlocking: true }] },
        ]),
        explain: 'Đặt ở bước: bước đỏ nhưng stage đi tiếp và kết thúc XANH. Gọn mắt hơn, nên cũng dễ quên hơn rằng phép kiểm đó đã ngừng kiểm.',
      },
      {
        where: 'yaml',
        example: cheatsheetExample('linux', [
          { id: 'kiem-tra-tich-hop', nonBlocking: true, steps: ['goi-dich-vu'] },
          { id: 'dong-goi', dependsOn: ['kiem-tra-tich-hop'], steps: ['dong-goi-ban'] },
        ]),
        explain: '`dong-goi` vẫn đợi `kiem-tra-tich-hop` chạy XONG. Không chặn nghĩa là xong mà đỏ cũng mở khoá được stage sau, chứ không phải bỏ luôn việc chờ.',
      },
    ],
    takeaways: [
      'Stage sau đợi stage trước XONG chứ không đợi nó XANH; dấu chặn mới là thứ quyết định đỏ có lan ra không.',
      'Đặt dấu không-chặn ở tầng stage thì tín hiệu đỏ còn nguyên; đặt ở tầng bước thì stage xanh và tín hiệu biến mất.',
      'Một việc "tạm không chặn" không có hạn sử dụng là một việc đã ngừng kiểm tra.',
    ],
    pitfalls: [
      'Bấm chạy lại vì nghĩ đỏ này là đỏ giả. Nó đúng là đỏ do hạ tầng, nhưng dịch vụ đang chết hẳn — mỗi lần chạy lại chỉ cộng thêm runner-phút mà không đổi kết quả.',
      'Xoá bộ kiểm thử tích hợp cho gọn. Đường ống sẽ xanh ngay, và đội mất luôn phép kiểm duy nhất chạm tới dịch vụ đó.',
      'Đặt dấu không-chặn cho mọi stage "cho chắc". Lúc đó lượt chạy không bao giờ đỏ nữa, và một đường ống không bao giờ đỏ thì không kiểm tra gì cả.',
    ],
  },
  theoryId: '04-viec-khong-chan',
  solutionWorkflow: {
    name: 'Stage tích hợp không chặn — vẫn hiện đỏ trong bảng',
    stages: [
      {
        id: 'clone', kind: 'clone', name: 'Tải mã nguồn', dependsOn: [],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'tai-ma', name: 'Tải mã nguồn', durationTicks: 2, blocking: true, produces: ['ma-nguon'] }],
      },
      {
        id: 'dung', kind: 'build', name: 'Build', dependsOn: ['clone'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{
          id: 'bien-dich', name: 'Biên dịch mã nguồn', durationTicks: 6, blocking: true,
          requires: ['ma-nguon'], produces: ['ban-dung'],
        }],
      },
      {
        id: 'kiem-tra', kind: 'unit-test', name: 'Kiểm thử đơn vị', dependsOn: ['dung'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{
          id: 'chay-test', name: 'Chạy test đơn vị', durationTicks: 5, blocking: true,
          requires: ['ban-dung'], produces: ['bao-cao-test'],
        }],
      },
      {
        id: 'kiem-tra-tich-hop', kind: 'integration-test', name: 'Kiểm thử tích hợp', dependsOn: ['dung'],
        blocking: false,
        retries: 0, runnerClass: 'linux',
        steps: [{
          id: 'goi-dich-vu', name: 'Gọi dịch vụ nội bộ rồi kiểm kết quả', durationTicks: 6, blocking: true,
          requires: ['ban-dung'],
          flake: { rate: 1, nature: 'infra' },
        }],
      },
      {
        id: 'lint', kind: 'lint', name: 'Soi mã', dependsOn: ['dung'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'soi-ma', name: 'Soi quy ước mã nguồn', durationTicks: 3, blocking: true, requires: ['ban-dung'] }],
      },
      {
        id: 'dong-goi', kind: 'package', name: 'Đóng gói',
        dependsOn: ['kiem-tra', 'kiem-tra-tich-hop', 'lint'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{
          id: 'dong-goi-ban', name: 'Đóng gói bản phát hành', durationTicks: 3, blocking: true,
          requires: ['ban-dung', 'bao-cao-test'],
        }],
      },
    ],
  },
  altSolutionWorkflow: {
    name: 'Bước gọi dịch vụ không chặn — stage kết thúc xanh',
    stages: [
      {
        id: 'clone', kind: 'clone', name: 'Tải mã nguồn', dependsOn: [],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'tai-ma', name: 'Tải mã nguồn', durationTicks: 2, blocking: true, produces: ['ma-nguon'] }],
      },
      {
        id: 'dung', kind: 'build', name: 'Build', dependsOn: ['clone'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{
          id: 'bien-dich', name: 'Biên dịch mã nguồn', durationTicks: 6, blocking: true,
          requires: ['ma-nguon'], produces: ['ban-dung'],
        }],
      },
      {
        id: 'kiem-tra', kind: 'unit-test', name: 'Kiểm thử đơn vị', dependsOn: ['dung'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{
          id: 'chay-test', name: 'Chạy test đơn vị', durationTicks: 5, blocking: true,
          requires: ['ban-dung'], produces: ['bao-cao-test'],
        }],
      },
      {
        id: 'kiem-tra-tich-hop', kind: 'integration-test', name: 'Kiểm thử tích hợp', dependsOn: ['dung'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{
          id: 'goi-dich-vu', name: 'Gọi dịch vụ nội bộ rồi kiểm kết quả', durationTicks: 6,
          blocking: false,
          requires: ['ban-dung'],
          flake: { rate: 1, nature: 'infra' },
        }],
      },
      {
        id: 'lint', kind: 'lint', name: 'Soi mã', dependsOn: ['dung'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'soi-ma', name: 'Soi quy ước mã nguồn', durationTicks: 3, blocking: true, requires: ['ban-dung'] }],
      },
      {
        id: 'dong-goi', kind: 'package', name: 'Đóng gói',
        dependsOn: ['kiem-tra', 'kiem-tra-tich-hop', 'lint'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{
          id: 'dong-goi-ban', name: 'Đóng gói bản phát hành', durationTicks: 3, blocking: true,
          requires: ['ban-dung', 'bao-cao-test'],
        }],
      },
    ],
  },
};
