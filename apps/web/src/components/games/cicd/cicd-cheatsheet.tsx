'use client';

import type { ReactElement } from 'react';
import { writeWorkflowYaml, type CicdCheatSheetEntry } from '@devops-platform/games';

/**
 * Bảng tra nhanh của một màn — `teaching.cheatsheet`.
 *
 * Trước đợt 3 không màn nào render trường này, và đó là lý do nó dạy sai cú pháp
 * suốt 14 level mà không ai thấy (`levels/cheatsheet.test.ts` giờ gác nội dung).
 *
 * Hai loại mục hiện KHÁC nhau có chủ ý: mục YAML là một khối mã chép được, mục
 * bảng điều khiển là tên núm để đi tìm. Vẽ chúng giống nhau sẽ mời người chơi dán
 * tên một núm vào ô soạn.
 *
 * Mục YAML chở một `WorkflowSpec` trung lập và được in bằng ĐÚNG bộ ghi mà ô soạn
 * dùng, nên thứ người chơi chép luôn là thứ bộ đọc nhận (xem `CicdCheatSheetEntry`).
 */
export function CicdCheatsheet({ entries }: { readonly entries: readonly CicdCheatSheetEntry[] }): ReactElement | null {
  if (entries.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col gap-2" aria-label="Tra nhanh">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Tra nhanh</h3>
      <ul className="flex flex-col gap-3">
        {entries.map((entry, index) => (
          <li key={index} className="flex flex-col gap-1">
            {entry.where === 'yaml' ? (
              <pre className="overflow-x-auto rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs text-foreground">
                <code>{writeWorkflowYaml(entry.example).yaml}</code>
              </pre>
            ) : (
              <p className="text-sm text-foreground">
                <span className="text-muted-foreground">Bảng điều khiển → </span>
                <strong className="font-semibold">{entry.label}</strong>
              </p>
            )}
            <p className="text-sm text-muted-foreground">{entry.explain}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
