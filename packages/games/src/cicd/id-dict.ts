/**
 * Từ điển khoá theo ĐỊNH DANH — không prototype.
 *
 * Định danh của game (`StageId`, `OutputId`, `InstanceKey`, `RunnerClassId`, ...)
 * chỉ bị ràng `[a-z0-9-]`, và `constructor` thoả ràng buộc đó. Một `{}` thường
 * thì `dict['constructor']` trả `Object.prototype.constructor` — một HÀM — nên:
 *
 * - `byId[id] ?? []` ném "not iterable" (đo 2026-09-17: một job tên `constructor`
 *   làm `evaluate`, `criticalPath`, mọi vị từ đồ thị và cả vòng đọc-ghi YAML ném);
 * - `seen[id] ?? {}` trả HÀM `Object`, và gán thuộc tính lên nó là ghi vào hàm
 *   dựng toàn cục — rò sang mọi lượt chấm sau trong cùng tiến trình;
 * - `overrides.retries?.[id]` trả một hàm, và `?? giá trị gốc` không bắn.
 *
 * Nên: từ điển do engine tự dựng ⇒ `idDict()`; object do bên ngoài dựng (có
 * prototype, ví dụ `CicdPlayerOverrides` từ giao diện) ⇒ đọc qua `ownValue`.
 */

export function idDict<V>(): Record<string, V> {
  return Object.create(null) as Record<string, V>;
}

/** Giá trị của một khoá RIÊNG; khoá thừa hưởng từ prototype coi như vắng. */
export function ownValue<V>(record: Readonly<Record<string, V>> | undefined, key: string): V | undefined {
  return record !== undefined && Object.hasOwn(record, key) ? record[key] : undefined;
}
