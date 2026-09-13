/**
 * Băm nội dung object — nền của **tính tất định** (§17.J.1).
 *
 * Điều kiện: cùng object ⇒ cùng `Oid`, qua bao nhiêu lần dựng lại theo bao
 * nhiêu thứ tự chèn khác nhau cũng vậy, ở cả trình duyệt lẫn Node.
 *
 * VÌ SAO FNV-1a 64 BIT, KHÔNG PHẢI SHA-1
 * ---------------------------------------
 * SHA-1 thật bị loại vì hai lý do đo được, không phải vì lười:
 *
 *  1. `crypto.subtle.digest` của trình duyệt trả **Promise**. Engine game là
 *     đồng bộ từ đầu tới cuối — một lệnh vào, một trạng thái ra — và biến nó
 *     thành bất đồng bộ để băm sẽ nhiễm `async` lên toàn bộ `merge`, `rebase`,
 *     bộ chấm, và cả bên phát lại phía máy chủ. Đó là cái giá khổng lồ cho một
 *     thứ người chơi không bao giờ nhìn thấy.
 *  2. Một SHA-1 tự viết bằng JS thuần chậm hơn FNV-1a khoảng hai bậc, mà game
 *     **không trao đổi object với git thật** — không có `git push` ra ngoài,
 *     không có packfile để đọc. Cái Oid ở đây chỉ cần: tất định, phân tán đều,
 *     và đủ rộng để không đụng độ.
 *
 * VÌ SAO 64 BIT, KHÔNG PHẢI 32
 * -----------------------------
 * Một level đông có thể dựng vài nghìn object (mỗi commit sinh một tree, mỗi
 * lần sửa file sinh một blob). Ở 32 bit, xác suất đụng độ sinh nhật với n=3000
 * là khoảng n²/2^33 ≈ 0.1% — tức khoảng một lượt chơi trong một nghìn sẽ thấy
 * hai object khác nhau mang cùng một Oid, và triệu chứng của nó là một commit
 * bỗng "biến thành" commit khác. Đó là loại lỗi không ai chẩn đoán nổi. Ở 64
 * bit thì cùng phép tính ra ~10^-13, tức không bao giờ.
 *
 * Hiển thị 7 hex (28 bit) cho người chơi là chuyện KHÁC và an toàn: git thật
 * cũng rút gọn, và ta chỉ rút gọn ở tầng trình bày — `Oid` trong trạng thái
 * luôn là 16 hex đầy đủ.
 *
 * VÌ SAO `BigInt`
 * ---------------
 * Số nguyên 64 bit không biểu diễn được bằng `number` (chỉ an toàn tới 2^53), và
 * làm tay bằng hai nửa 32 bit thì phép nhân FNV cần 4 phép nhân 16 bit cộng
 * carry — nhiều dòng, dễ sai, và sai một bit là hỏng tất định trong im lặng.
 * `BigInt` có trong `ES2023` (target của repo), chạy giống hệt nhau ở mọi runtime,
 * và số object trong một lượt chơi quá nhỏ để tốc độ thành vấn đề. Đo lại nếu
 * một ngày nào đó test §17.J.1 (1000 lần dựng lại) chậm thấy được.
 */

import type { CommitObject, GitObject, Lines, Oid, TreeObject } from './contract.ts';
import { compareKeys } from './deterministic.ts';

/** Nền tảng FNV-1a 64 bit. Hằng số chuẩn, không phải số tự nghĩ ra. */
const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

/**
 * FNV-1a 64 bit trên các **đơn vị mã UTF-8** của chuỗi.
 *
 * ⚠ Băm theo UTF-8 chứ không theo `charCodeAt` (UTF-16), và đó là chủ ý: nội
 * dung bài học của nền tảng này là **tiếng Việt có dấu**, tức toàn ký tự ngoài
 * ASCII. Băm theo UTF-16 vẫn tất định, nhưng nó khiến Oid phụ thuộc vào cách JS
 * biểu diễn chuỗi thay vì vào nội dung — và ngày nào phía chấm được viết lại
 * bằng Go (đúng thứ `services/` của repo này đang dùng) thì hai bên sẽ ra hai
 * con số khác nhau. UTF-8 là biểu diễn mà mọi ngôn ngữ đều đồng ý.
 *
 * ⚠ Chuỗi phải được chuẩn hoá NFC trước khi vào đây — xem `canonical()`. Tiếng
 * Việt có hai cách gõ cùng một chữ ("ế" là một code point, hoặc "e" + hai dấu
 * tổ hợp), và hai cách đó cho ra hai chuỗi byte khác nhau.
 */
export function fnv1a64(text: string): bigint {
  let hash = FNV_OFFSET_BASIS;
  const bytes = utf8Bytes(text);
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash;
}

/**
 * Mã hoá UTF-8 tự viết.
 *
 * `TextEncoder` có ở cả trình duyệt lẫn Node hiện đại, nhưng nó là một API của
 * môi trường (`lib.dom` / `node`), và `tsconfig` của package này cố ý bỏ
 * `types: ["node"]` để chặn mã lạc vào bundle. Dựa vào một global môi trường ở
 * đúng chỗ tính tất định là mời một khác biệt runtime vào nơi không được có.
 * 25 dòng dưới đây không phụ thuộc gì cả.
 */
function utf8Bytes(text: string): readonly number[] {
  const out: number[] = [];
  for (const char of text) {
    // `for...of` trên chuỗi lặp theo CODE POINT, nên cặp thế thân (surrogate
    // pair) tới đây đã ghép lại — không cần xử tay.
    const cp = char.codePointAt(0);
    if (cp === undefined) continue;
    if (cp < 0x80) {
      out.push(cp);
    } else if (cp < 0x800) {
      out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  return out;
}

/** `bigint` → 16 chữ số hex thường, có đệm 0. Đây là hình dạng của mọi `Oid`. */
function toOid(hash: bigint): Oid {
  return hash.toString(16).padStart(16, '0');
}

/**
 * Dạng người chơi nhìn thấy: 7 ký tự đầu, đúng thói quen git thật.
 *
 * ⛔ CHỈ dùng ở tầng trình bày và ở thông báo lệnh. Không bao giờ dùng làm khoá
 * tra `ObjectStore` — 7 hex là 28 bit và đụng độ ở đó là chuyện thật.
 */
export function shortOid(oid: Oid): string {
  return oid.slice(0, 7);
}

/**
 * Chuẩn hoá một chuỗi trước khi băm.
 *
 * NFC vì tiếng Việt: "Tiế" gõ bằng bàn phím Telex ra một chuỗi code point khác
 * với "Tiế" copy từ một trang web, dù trông y hệt và so bằng mắt thì bằng nhau.
 * Không chuẩn hoá thì hai người chơi gõ cùng một commit message được hai Oid
 * khác nhau, và bài chấm theo `refPointsAtMessage` sẽ trượt một cách bí ẩn.
 */
function canonical(text: string): string {
  return text.normalize('NFC');
}

/**
 * Serialize CHUẨN TẮC một object thành chuỗi để băm.
 *
 * "Chuẩn tắc" nghĩa là: cùng nội dung ⇒ cùng chuỗi, bất kể object được dựng
 * theo đường nào. Ba thứ bảo đảm điều đó:
 *
 *  1. `TreeObject.entries` **luôn sắp theo `path`** — `objects.ts` sắp lúc tạo,
 *     và hàm này sắp lại một lần nữa ở đây. Sắp hai lần là thừa một lần, và đó
 *     là sự thừa cố ý: chỗ này là chỗ cuối cùng trước khi con số ra đời, nên nó
 *     không được tin ai.
 *  2. Độ dài đi trước nội dung ở mọi trường có thể chứa dấu phân cách. Không có
 *     nó thì một commit message chứa chữ `\ntree ` băm ra trùng với một object
 *     khác — đúng loại tấn công mà `RunLog` chống gian lận phải chịu được, vì
 *     commit message do NGƯỜI CHƠI gõ.
 *  3. NFC ở mọi chuỗi.
 */
export function serializeObject(object: GitObject): string {
  switch (object.kind) {
    case 'blob':
      return serializeLines('blob', object.lines);
    case 'tree':
      return serializeTree(object);
    case 'commit':
      return serializeCommit(object);
  }
}

function serializeLines(tag: string, lines: Lines): string {
  const parts: string[] = [`${tag} ${lines.length}`];
  for (const line of lines) {
    const normalized = canonical(line);
    // Độ dài theo CODE POINT, không theo `.length` (đơn vị UTF-16). Với emoji
    // hay chữ ngoài BMP hai con số đó khác nhau, và ta muốn con số không phụ
    // thuộc biểu diễn.
    parts.push(`${countCodePoints(normalized)}:${normalized}`);
  }
  return parts.join('\n');
}

function countCodePoints(text: string): number {
  let n = 0;
  for (const _ of text) n++;
  return n;
}

function serializeTree(tree: TreeObject): string {
  const entries = [...tree.entries].sort((a, b) => compareKeys(a.path, b.path));
  const parts: string[] = [`tree ${entries.length}`];
  for (const entry of entries) {
    const path = canonical(entry.path);
    parts.push(`${countCodePoints(path)}:${path} ${entry.oid}`);
  }
  return parts.join('\n');
}

function serializeCommit(commit: CommitObject): string {
  const message = canonical(commit.message);
  const author = canonical(commit.author);
  return [
    'commit',
    `tree ${commit.tree}`,
    // Cha giữ NGUYÊN THỨ TỰ, không sắp. Ở commit merge, cha thứ nhất là nhánh
    // ta đang đứng và cha thứ hai là nhánh trộn vào — đảo hai cái là đổi nghĩa,
    // và `HEAD~1` sẽ trỏ sang nhánh khác.
    `parents ${commit.parents.length}`,
    ...commit.parents,
    `author ${countCodePoints(author)}:${author}`,
    `time ${commit.logicalTime}`,
    `message ${countCodePoints(message)}:${message}`,
  ].join('\n');
}

/** `Oid` của một object. Thuần: cùng đầu vào, cùng đầu ra, mãi mãi. */
export function hashObject(object: GitObject): Oid {
  return toOid(fnv1a64(serializeObject(object)));
}

/**
 * Băm **toàn bộ trạng thái** một repo, để so hai trạng thái bằng một con số.
 *
 * Dùng ở ba chỗ: §17.J.3 (dựng cùng repo bằng nhiều thứ tự chèn ⇒ hash bằng
 * nhau) · AC-Q (xuất rồi nhập lại một cây ⇒ hash không đổi) · và bộ chấm khi so
 * trạng thái đích.
 *
 * ⚠ Hàm này CỐ Ý **không** băm `ObjectStore`. Store chứa cả object mồ côi, và
 * hai đường đi tới cùng một trạng thái *nhìn thấy được* hoàn toàn có thể để lại
 * lượng rác khác nhau — người chơi thử ba lần rồi `reset` sẽ có store to hơn
 * người chơi đúng ngay lần đầu, dù repo của họ giống hệt nhau. Băm cả store sẽ
 * biến "đã thử sai rồi sửa" thành một trạng thái KHÁC, và mọi bài chấm theo hash
 * sẽ trượt oan. Chương 3 cần đọc store thì đọc qua vị từ `commitInStore`, không
 * qua hash này.
 */
export function hashRepoState(input: {
  readonly refs: Readonly<Record<string, Oid>>;
  readonly head: { readonly type: 'ref'; readonly ref: string } | { readonly type: 'detached'; readonly oid: Oid };
  readonly index: Readonly<Record<string, Oid>>;
  readonly worktree: Readonly<Record<string, Lines>>;
}): string {
  const parts: string[] = ['state'];

  const refNames = Object.keys(input.refs).sort(compareKeys);
  parts.push(`refs ${refNames.length}`);
  for (const name of refNames) parts.push(`${name} ${input.refs[name] ?? ''}`);

  parts.push(
    input.head.type === 'ref' ? `head ref ${input.head.ref}` : `head detached ${input.head.oid}`,
  );

  const indexPaths = Object.keys(input.index).sort(compareKeys);
  parts.push(`index ${indexPaths.length}`);
  for (const path of indexPaths) parts.push(`${path} ${input.index[path] ?? ''}`);

  const wtPaths = Object.keys(input.worktree).sort(compareKeys);
  parts.push(`worktree ${wtPaths.length}`);
  for (const path of wtPaths) {
    const lines = input.worktree[path] ?? [];
    parts.push(`${path} ${toOid(fnv1a64(serializeLines('blob', lines)))}`);
  }

  return toOid(fnv1a64(parts.join('\n')));
}
