# Contract: ui-kit (tokens, primitives, page patterns)

Read with `../design-brief.md`. Names here are FINAL; lanes code against them.

## A. Token utilities (globals.css, owner: lead)

Colors (all `bg-* / text-* / border-* / ring-* / fill-* / stroke-*`):
`background foreground card card-foreground popover popover-foreground muted muted-foreground
ink ink-foreground primary primary-foreground brand signal signal-foreground
success success-foreground warning warning-foreground destructive destructive-foreground
border input ring` and lines `line-{linux,docker,k8s,git,cicd,net,obs,sec,iac}` with
`-foreground` (text on the fill) and `-ink` (text-safe on page background), e.g.
`bg-line-docker text-line-docker-foreground`, `text-line-git-ink`.

Legacy kept for games/arena only (do not use in new pages): `secondary accent difficulty-* status-* kind-*`.

Typography utilities (use these, not ad-hoc sizes for headings):
`type-poster` (Archivo 800 expanded, clamp 44→104px) · `type-display` (32→56) · `type-headline` (24→36)
· `type-title` (20px Archivo 700) · `type-lead` (18px body) · `type-label` (JetBrains Mono 11px upper, tracking .08em)
· `font-sans` body · `font-mono` code · `tabular-nums` for numbers.

Texture utilities: `bg-dots`, `bg-hatch`, `bg-rails` (all use `currentColor`; set `text-*` to tint).
Shadow: `shadow-hard` (floating layers only). Radius: everything is 0; do not add `rounded-*`.
Motion utilities: `animate-rise`, `animate-wipe`, `animate-reveal-down`, `animate-pulse-station`;
stagger with `style={{ '--i': n } as CSSProperties}` + class `stagger` (delay = min(i,12)*30ms).
`interactive-row` (hover wipe + arrow nudge; needs `--row-tint` set, default `var(--muted)`).

## B. packages/ui primitives (owner: ui lane). Same export names as today unless listed new.

Arena freeze rule: the k8s game (`.arena-root.dark`) renders Button, Badge, Tooltip, Tabs, Input,
Switch, Dialog. Primitives therefore take shape from vars, never hardcoded: corners via
`rounded-control` / `rounded-surface` (vars `--radius-control` / `--radius-surface`, 0 in the app,
legacy values inside the arena), floating shadow via `shadow-float` (hard offset in the app,
legacy elevation inside the arena). Keep control heights (`h-8/h-10/h-11`) and text sizes as today.

- `Button` variants: `primary | ink | outline | secondary | ghost | destructive | link`
  (secondary = muted fill), sizes `sm | md | lg | icon`; props `asChild, loading, iconLeft, iconRight`.
  `primary`/`ink` show a trailing nudge animation on hover when `iconRight` is given.
- `Badge` (square). Variants kept; new `variant="line"` with `line: LineId`.
- NEW `Chip` (toggle filter): `{ selected?: boolean; onClick; children; count?: number; size?: 'sm'|'md' }` → `aria-pressed`.
- NEW `TopicBadge`: `{ line: LineId; label?: string; size?: 'sm'|'md' }` renders colored square with code (LNX…) and optional name.
- NEW `LineMarker`: `{ line: LineId; state?: 'todo'|'current'|'done'|'locked' }` 12px square station glyph.
- NEW `Difficulty`: `{ level: 'basic'|'intermediate'|'advanced'|'expert'; showLabel?: boolean }` 4-bar glyph.
- NEW `StatusDot`: `{ tone: 'ok'|'warn'|'bad'|'idle'|'live' }` (live pulses).
- NEW `Meter`: `{ value: number; max: number; segments?: number; tone?: 'primary'|'success'|'warning'|'destructive'|LineId; label: string }`.
- NEW `Num`: inline number for sentences, `{ children; tone? }` (display weight, tabular).
- NEW `Sheet`: Radix Dialog as side/full panel `{ side: 'right'|'bottom'|'full' }` + `SheetContent/Title/Close`.
- NEW `Popover`, `PopoverTrigger`, `PopoverContent`.
- `Card` stays exported but restyled to a flat panel (no radius/shadow, hairline border). Prefer page patterns.
- `Tabs` = segmented, active ink fill. `Table` = ledger. `Dialog/Dropdown/Select/Tooltip/Toast` square + `shadow-hard`.
- `EmptyState` `{ title; description?; action?; glyph?: ReactNode }`, `ErrorState` `{ message; detail?; onRetry? }`.
- `LineId` type + `LINE_IDS` + `LINE_CODE` exported from `packages/ui/src/lines.ts`.

## C. App kit (apps/web/src/components/kit, owner: lead)

- `PageContainer` `{ children; width?: 'wide'|'read' }` (1440 / 68ch).
- `PosterHeader` `{ section: SectionId | { line: LineId }; kicker?: string; title: string; lead?: string; aside?: ReactNode; switcher?: ReactNode }` renders the h1.
- `SectionSwitcher` `{ section: SectionId }`: reads siblings from the nav registry, highlights the active route.
- `ToolHeader` `{ crumbs?: {href?;label}[]; title: string; status?: ReactNode; actions?: ReactNode }` renders the h1.
- `Board` `{ label: string; children }` (`<ol>`), `BoardRow` `{ href | onClick; index?: number; line?: LineId; title; sub?; meta?: ReactNode; state?: ReactNode; disabled? }`.
- `BoardSkeleton` `{ rows?: number }`.
- `RouteLine` `{ orientation: 'horizontal'|'vertical'; stations: { id; label; line: LineId; state: 'todo'|'current'|'done'|'locked'; href? }[] }`.
- `Split` `{ index?: string; title: string; aside?: ReactNode; children }` (sticky label column + content).
- `Section` `{ title?: string; kicker?: string; children; tone?: 'plain'|'ink'|'muted' }`.
- `lineForTopic(input: { tags?: readonly string[]; gameId?: string; topic?: string }): LineId | 'ink'` in `apps/web/src/lib/topic-line.ts`.
- `SectionId` = `'learn'|'practice'|'judge'|'games'|'studio'|'admin'` from `components/shell/nav.ts`.
