/**
 * Hiển thị nội dung bài học. Subpath riêng (`@devops-platform/ds/content`) vì nó kéo
 * react-markdown + micromark: chỉ những trang thật sự hiện nội dung mới trả cái giá đó.
 */
export { ContentView, stripLeadingTitle, type ContentViewProps } from './content-view.tsx';
export { Markdown, type MarkdownProps } from './markdown.tsx';
export { CodeBlock, type CodeBlockProps } from './code-block.tsx';
export type { ContentLabels } from './labels.ts';
export { embeddedHeadingLevel, smallestHeadingLevel, type HeadingLevel } from './heading-level.ts';
