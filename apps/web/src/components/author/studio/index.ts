/**
 * Bộ khung chung của Xưởng soạn (`/author`, `/author/problems`).
 *
 * Ranh giới module: trình soạn bài học (`app/author/[id]`, `app/author/new`) và
 * trình soạn đề (`app/author/problems/**`) cùng dựng trên đây, nên hai trình
 * soạn có cùng đầu trang, cùng hàng tab chế độ, cùng cột kiểm bên phải và cùng
 * ô trạng thái lưu. Logic riêng của từng loại bài KHÔNG vào đây.
 */
export { StudioEditorFrame, StudioPanel } from './editor-frame';
export type { StudioCrumb, StudioMode } from './editor-frame';
export { InspectorRail, IssueList, RailSection } from './inspector';
export type { RailTone, StudioIssue } from './inspector';
export { SaveState } from './save-state';
export { mustSaveBeforePublish, saveStatusOf } from './save-status';
export type { SaveFacts, SaveStatus } from './save-status';
export { StateChip } from './state-chip';
export type { StudioContentState } from './state-chip';
export { FIELD_PATH_ATTRIBUTE, fieldPathProps, focusFieldByPath } from './field-anchor';
export { StudioListBody } from './list-body';
export { FormBlock } from './form-block';
export type { StudioFilter } from './list-body';
