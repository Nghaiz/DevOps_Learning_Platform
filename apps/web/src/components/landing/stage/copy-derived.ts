/**
 * Nhãn của cảnh 3D suy ra từ CHÍNH chữ trong `packages/copy`, để một dòng lệnh đổi ở copy thì
 * nhãn trong cảnh đổi theo, không có bản chữ thứ hai nằm trong mã cảnh. Hàm thuần, không đụng
 * three, để test chạy ở môi trường node.
 */

/** Nhãn layer lấy từ output `docker build`, bỏ tiền tố "=> [n/4]"; dòng đặt tên image thành "TAG …". */
export function layerLabels(buildOutput: string): readonly string[] {
  const lines = buildOutput.split('\n').slice(1);
  return lines.map((line) =>
    line
      .replace(/^\s*=>\s*(\[\d+\/\d+\]\s*)?/, '')
      .replace(/^naming to docker\.io\/library\//, 'TAG ')
      .trim(),
  );
}

/** Tên stage lấy từ dòng lệnh của ga CI/CD: `stages: [build, test, scan, deploy]`. */
export function stageNames(command: string): readonly string[] {
  const inside = /\[(.*)\]/.exec(command)?.[1] ?? '';
  return inside
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}
