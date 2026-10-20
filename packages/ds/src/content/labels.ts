/**
 * Chữ của khối nội dung bài học. Gói `ds` không chứa câu chữ: trang truyền vào từ
 * `@devops-platform/copy`.
 */
export interface ContentLabels {
  readonly run: string;
  readonly runInterrupt: string;
  readonly copy: string;
  readonly copied: string;
  readonly copyFailed: string;
  /** Tên vùng cuộn của khối mã, đọc cho trình đọc màn hình. */
  readonly codeRegion: (language: string) => string;
  readonly tableRegion: string;
  readonly zoomDiagram: string;
  readonly closeDiagram: string;
  readonly remoteImage: string;
  readonly openRemoteImage: (alt: string) => string;
  readonly brokenImage: (alt: string) => string;
  readonly opensInNewTab: string;
}
