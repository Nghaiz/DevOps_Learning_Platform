'use client';
import { useEffect, useRef, type ReactElement } from 'react';
import type { Suggestion } from './terminal-suggest-vocab';
export interface TerminalSuggestionListProps {
  readonly id: string;
  readonly suggestions: readonly Suggestion[];
  readonly highlight: number;
  readonly onPick: (value: string) => void;
}
export function TerminalSuggestionList({
  id,
  suggestions,
  highlight,
  onPick,
}: TerminalSuggestionListProps): ReactElement {
  const ref = useRef<HTMLUListElement>(null);
  const index = Math.min(highlight, suggestions.length - 1);
  useEffect(() => {
    const list = ref.current,
      item = list?.children[index];
    if (list && item instanceof HTMLElement) {
      if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop;
      else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight)
        list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight;
    }
  }, [index]);
  return (
    <ul
      ref={ref}
      id={id}
      role="listbox"
      aria-label="Hoàn thành lệnh"
      className="arena-terminal-suggestions"
    >
      {suggestions.map((item, i) => (
        <li
          key={item.value}
          id={`${id}-${i}`}
          role="option"
          aria-selected={i === index}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(item.value)}
        >
          <code>{item.value}</code>
          <span>{item.hint}</span>
        </li>
      ))}
    </ul>
  );
}
