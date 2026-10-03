/**
 * Tuyến chủ đề (design-brief §2.3): mỗi chủ đề là một "tuyến" có màu riêng và
 * một mã ba chữ in trên biển (LNX, DKR, …).
 *
 * Bảng class ở dưới phải là CHUỖI LITERAL đầy đủ. Tailwind chỉ sinh luật CSS
 * cho class nó đọc thấy nguyên văn trong mã nguồn, nên `'bg-line-' + line` ra
 * một class không có luật nào khớp: thành phần vẫn render, chỉ là không có
 * màu, và không công cụ nào báo. Mọi primitive cần màu tuyến đọc từ
 * `LINE_CLASSES`, không tự ghép chuỗi.
 */

export const LINE_IDS = ['linux', 'docker', 'k8s', 'git', 'cicd', 'net', 'obs', 'sec', 'iac'] as const;

export type LineId = (typeof LINE_IDS)[number];

/** Mã in trên biển tuyến. Không dịch: đây là ký hiệu, như số hiệu tuyến tàu. */
export const LINE_CODE: Readonly<Record<LineId, string>> = {
  linux: 'LNX',
  docker: 'DKR',
  k8s: 'K8S',
  git: 'GIT',
  cicd: 'CI',
  net: 'NET',
  obs: 'OBS',
  sec: 'SEC',
  iac: 'IAC',
};

export interface LineClassSet {
  /** Nền tô đặc kèm màu chữ đặt TRÊN nền đó (cặp đã qua cổng tương phản). */
  readonly fill: string;
  /** Chỉ nền tô đặc, khi phần tử không chứa chữ (vạch, ô ga, đoạn thước đo). */
  readonly bg: string;
  /** Viền cùng màu tuyến (ô ga rỗng). */
  readonly border: string;
  /** Mực chữ an toàn trên nền trang (chữ màu tuyến đứng trên `--background`). */
  readonly ink: string;
}

export const LINE_CLASSES: Readonly<Record<LineId, LineClassSet>> = {
  linux: {
    fill: 'bg-line-linux text-line-linux-foreground',
    bg: 'bg-line-linux',
    border: 'border-line-linux',
    ink: 'text-line-linux-ink',
  },
  docker: {
    fill: 'bg-line-docker text-line-docker-foreground',
    bg: 'bg-line-docker',
    border: 'border-line-docker',
    ink: 'text-line-docker-ink',
  },
  k8s: {
    fill: 'bg-line-k8s text-line-k8s-foreground',
    bg: 'bg-line-k8s',
    border: 'border-line-k8s',
    ink: 'text-line-k8s-ink',
  },
  git: {
    fill: 'bg-line-git text-line-git-foreground',
    bg: 'bg-line-git',
    border: 'border-line-git',
    ink: 'text-line-git-ink',
  },
  cicd: {
    fill: 'bg-line-cicd text-line-cicd-foreground',
    bg: 'bg-line-cicd',
    border: 'border-line-cicd',
    ink: 'text-line-cicd-ink',
  },
  net: {
    fill: 'bg-line-net text-line-net-foreground',
    bg: 'bg-line-net',
    border: 'border-line-net',
    ink: 'text-line-net-ink',
  },
  obs: {
    fill: 'bg-line-obs text-line-obs-foreground',
    bg: 'bg-line-obs',
    border: 'border-line-obs',
    ink: 'text-line-obs-ink',
  },
  sec: {
    fill: 'bg-line-sec text-line-sec-foreground',
    bg: 'bg-line-sec',
    border: 'border-line-sec',
    ink: 'text-line-sec-ink',
  },
  iac: {
    fill: 'bg-line-iac text-line-iac-foreground',
    bg: 'bg-line-iac',
    border: 'border-line-iac',
    ink: 'text-line-iac-ink',
  },
};
