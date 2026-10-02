# Design brief: "Bảng tuyến" (transit wayfinding), PTIT DevOps Lab

Single source of truth for the frontend rebuild (branch `feat/fe-ptit-rebuild`). Every lane
builds against THIS file plus `contracts/ui-kit.md`. If something here is unclear, ask the lead
(session 00); never invent a parallel pattern.

## 0. Hard rules from the project owner (non-negotiable)

1. **No rounded cards.** Radius is 0 on every surface, control, chip, badge, avatar, dialog.
   The only round things allowed: status dots that are literally dots (8px), spinners, the
   avatar fallback circle is ALSO square. No `rounded-*` utilities in new code except
   `rounded-none`. No "card" look (white box + border + shadow floating on grey).
2. **No left sidebar** for app navigation or actions. Navigation = top header with parent
   sections + mega menu, and an in-page section switcher. Right-side inspector panels inside
   a tool page are allowed; a left column holding the main content is allowed; a left column
   that NAVIGATES (TOC, link list, nav tree) is NOT.
3. **No left-border active indicators** (`border-l-4 border-primary` on the active item) anywhere.
   Active = filled block (inverted colors) or a moving filled highlight.
4. **No stat-card rows** ("4 boxes with a big number each") on hub pages, dashboards, admin.
   Numbers live inside sentences, ledgers, gauges, or the departure board.
5. **Colorful**: every topic has its own vivid line color; every top-level section has its own
   signature color. Pale, washed-out greys-only screens are a failure.
6. **Motion on interaction**: hover, press, open/close, page entrance. Honors reduced motion.
7. **Human Vietnamese copy** (section 8). No AI slop.
8. **Do not touch `apps/web/src/components/k8s-arena/**`** (the k8s game). Its look is frozen by
   a scoped token snapshot in `globals.css` (`.arena-root.dark { ... }`). Do not edit it either.

## 1. Concept

The platform is a transit network. Each **topic is a line** with a color and a 3-letter code.
Lessons, labs, quizzes are **stations**. A learning path is a **route** that may change lines.
Games are **express lines**. Exams are **checkpoints** (PTIT red). The UI borrows from
metro wayfinding (line badges, station dots, route diagrams, departure boards, platform signs)
and Swiss editorial layout (strict grid, very large type, asymmetric splits, hairline rules,
numbered sections). PTIT red is the signal color ("you are here", primary action).

The one thing people should remember: **headings that look like platform signs, and lists that
look like departure boards with colored line markers.**

## 2. Tokens (defined in `apps/web/src/app/globals.css`, Tailwind v4 `@theme inline`)

Never write hex, `rgb()`, palette utilities (`bg-blue-500`, `text-zinc-400`) or `bg-white` /
`text-black` in TSX or component CSS. Use the semantic classes below. `pnpm tokens:check`
enforces hex/palette; reviewers enforce the rest.

### 2.1 Surfaces and ink

| Class | Light | Dark | Use |
|---|---|---|---|
| `bg-background` | paper `#F6F5F1` | night `#0A0D14` | page |
| `bg-card` / `bg-surface` | `#FFFFFF` | `#111624` | reading surfaces, tool panes, inputs |
| `bg-muted` | `#ECEAE3` | `#181E2E` | subtle fills, table header, chips |
| `bg-ink` / `text-ink-foreground` | `#121829` / paper | `#ECEAE3` / night | inverted blocks: header, footer, active tab, tooltips |
| `text-foreground` | `#121829` | `#ECEAE3` | body |
| `text-muted-foreground` | `#545B6E` | `#9AA1B2` | secondary text |
| `border-border` | `#D8D5CC` | `#262D3D` | hairline rules (1px) |
| `border-strong` (`border-ink`) | ink | ink | poster frames, focused rows |

### 2.2 Brand and status

| Token | Value | Notes |
|---|---|---|
| `primary` | PTIT red `#DE221A` (dark: fill `#E3261D`) | primary buttons, checkpoint/exam, "you are here" |
| `primary-foreground` | white | on primary |
| `brand` (text-brand) | light `#C21A13`, dark `#FF6A5E` | red TEXT/links on background (text-safe) |
| `signal` | PTIT star yellow `#EFF003` | highlighter behind ink text, "đang làm", achievements. Always with `text-signal-foreground` (ink). Never as text color on paper. |
| `success` | `#12813D` / dark `#3DD27E` | passed, AC |
| `warning` | `#A85A00` / dark `#FFB547` | warnings |
| `destructive` | `#B4231A` / dark `#FF7A70` | destructive text; destructive buttons are tinted (`bg-destructive/10 text-destructive`) with an icon |
| `ring` | `#3550FF` / dark `#8EA0FF` | focus outline only |

### 2.3 Topic lines (`--line-*`), the color system

Each line has: `bg-line-<id>` (vivid fill), `text-line-<id>-foreground` (text ON the fill),
`text-line-<id>-ink` (text-safe ink on page background). Use `TopicBadge` / `LineMarker`
(ui-kit) instead of hand-assembling.

| id | Code | Name | Fill | On-fill text |
|---|---|---|---|---|
| `linux` | LNX | Linux & shell | amber `#F4B400` | ink |
| `docker` | DKR | Docker & container | blue `#1D63ED` | white |
| `k8s` | K8S | Kubernetes | indigo `#3949D6` | white |
| `git` | GIT | Git | orange `#F05032` | ink |
| `cicd` | CI | CI/CD | green `#12A150` | ink |
| `net` | NET | Mạng | teal `#00A3B4` | ink |
| `obs` | OBS | Giám sát (monitoring, logging) | lime `#94C11F` | ink |
| `sec` | SEC | Bảo mật | magenta `#D6246E` | white |
| `iac` | IAC | Cloud & IaC | violet `#7A3FE4` | white |

Mapping content to a line: `lineForTopic(tags | gameId | kind)` in `apps/web/src/lib/topic-line.ts`
(ui-kit). Unknown topic → `linux`? NO: unknown → neutral `ink` line, logged once in dev.

### 2.4 Section signature colors (header + hub posters)

| Section | Color | Children |
|---|---|---|
| Học | `primary` (PTIT red) | Lộ trình `/paths`, Bài học `/lessons`, Trắc nghiệm `/quiz` |
| Thực hành | `line-docker` blue | Lab `/labs`, Sân chơi `/playgrounds` |
| Luyện đề | `line-iac` violet | Bài tập `/problems`, Kỳ thi `/exams` |
| Trò chơi | `signal` yellow (ink text) | `/games` hub → K8s, Git, CI/CD |
| Xưởng soạn (author+) | `line-cicd` green | Bài học & lab `/author`, Đề bài `/author/problems`, Dựng màn chơi `/games/git?mode=builder` |
| Quản trị (admin) | `ink` (inverted) | Tổng quan, Người dùng, Lớp, Kỳ thi, Phiên, Nội dung, Nhật ký |
| Account (avatar menu) | — | Bàn học `/me`, Cài đặt `/settings`, Đăng xuất |

### 2.5 Type

| Role | Font | Spec |
|---|---|---|
| Display (`font-display`) | Archivo (var, wdth axis) | weight 800, `font-stretch: 112%` (class `font-display`), tracking -0.02em, line-height 1.02–1.1 (Vietnamese stacked marks need ≥1.02) |
| Body (`font-sans`) | Be Vietnam Pro | 400/500/600/700, 15–16px, line-height 1.6 |
| Mono / labels (`font-mono`) | JetBrains Mono | 400/500; labels: 11–12px, uppercase, tracking 0.08em |

Scale (tokens in `@theme`): `text-poster` clamp(44px→104px), `text-display` clamp(32→56),
`text-headline` clamp(24→36), `text-title` 20px, `text-lead` 18px, `text-base` 16px,
`text-sm` 14px, `text-xs` 12px, `text-label` 11px mono. Use `text-wrap: balance` on headings.

### 2.6 Space and grid

Container: `max-w-[1440px] mx-auto px-5 md:px-8`. 12-col grid, gap 24px desktop.
Vertical rhythm: sections `py-12 md:py-16`; rows 14–18px vertical padding.
Controls: `h-10` (md), `h-9` (sm), `h-12` (lg, auth forms). Input font-size ≥16px on mobile.

### 2.7 Texture

Allowed decoration (CSS utilities in globals, ui-kit): `bg-dots` (dot grid), `bg-hatch`
(diagonal hatch in current color at 8% alpha), `bg-rails` (thin parallel lines), the
**route line** SVG motif, giant outlined index numbers. No gradients-as-aesthetic, no glow,
no glassmorphism, no purple-blue blends, no blurry blobs.

## 3. Information architecture

- **Header** (`SiteHeader`, 64px, sticky, `bg-ink` in BOTH themes): PTIT mark + wordmark
  "PTIT DevOps Lab" → sections (role-filtered) → right cluster: search (⌘K), capacity pill
  (signed in), theme toggle, avatar menu or "Đăng nhập" + "Đăng ký".
- **Active section** = block filled with the section color, full header height, label in the
  section's on-fill color, plus a 10px downward notch (wayfinding arrow). Moves with a
  shared-layout animation between items.
- **Mega menu**: hover (150ms intent delay) / click / keyboard opens a full-width panel under
  the header: section color band on top (4px), children as large items (icon in a colored
  square, name in display 20px, one-line description), plus a right column "Tiếp tục" (last
  activity) when available. Reveal: clip-path from top, 220ms; items stagger 30ms.
- **Section switcher** (`SectionSwitcher`): on every child page of a section with >1 child, the
  poster header shows the siblings as big tabs; active = filled block. This replaces sub-navs.
  Depth never exceeds 2 (section → page). No "explore/[group]" hub pages.
- **Command palette** (⌘K / Ctrl+K, and the search button): jump to any page, any lesson/lab/
  quiz/path/problem by title (client filter over lists already fetched, plus static pages).
- **Mobile (<1024px)**: header = mark + search + menu button. Menu = full-screen ink sheet,
  sections in display 36px with children listed under each. Staggered entrance.
- **Footer** (`SiteFooter`, not on immersive pages): ink band, giant wordmark, link columns per
  section, one line of PTIT institutional text.
- **Immersive pages** (`/lessons/[id]`, `/labs/[id]`, `/playgrounds/[id]`, `/session/*`,
  `/games/k8s*`, `/games/cicd/[id]`): no site header/footer; they render their own compact bar.
- **`/`** belongs to session 5a (landing). AppShell renders only providers + bare `<main>` there.

## 4. Page patterns (all in ui-kit; compose, do not redraw)

1. **PosterHeader**: full-bleed band in the section color (or topic line color on detail pages),
   `bg-hatch` texture at low alpha, kicker in mono label ("HỌC · 9 BÀI · CẬP NHẬT 03/10"), title in
   `text-poster`, one-sentence lead, optional right slot (action or route diagram), then the
   `SectionSwitcher` docked at the bottom edge of the band.
2. **ToolHeader**: for detail/editor/admin pages. 72px band on `bg-background` with a bottom
   hairline: breadcrumb (mono), title (`text-headline`), status chip, actions on the right.
3. **DepartureBoard** (`Board`, `BoardRow`): the default list. Each row is ONE link/button:
   `[№ mono] [LineMarker] [title display 18–20px + one-line sub] [meta mono chips] [state] [→]`.
   Rows separated by hairlines; hover = line color wipes in from the left at 12% alpha (scaleX
   transition) + arrow slides 4px; focus-visible = 2px ring inset. Entrance: rise + stagger.
4. **Ledger** (`Table` restyled): admin/data tables. Sticky header on `bg-muted`, mono numbers,
   tabular-nums, hairline rows, row hover tint, no zebra, no outer box.
5. **RouteMap** (`RouteLine`): horizontal (catalog) or vertical (detail) path diagram, stations
   = squares on a 4px line in the topic color; done = filled, current = signal-yellow ring +
   pulse, locked = hollow.
6. **Split** (`Split`): Swiss 4/8 or 5/7 asymmetric two-column section: sticky label column left
   (number + title), content right.
7. **Gauge** (`Meter`): horizontal segmented bar for capacity, progress, score.
8. **Inline stats**: numbers inside a sentence with `Num` (display weight, tabular) — e.g.
   "Đang chạy **12** phiên, còn **18/30** chỗ." This replaces stat cards.
9. **Empty / Error / Loading**: `EmptyState` (big outlined glyph + one sentence + one action),
   `ErrorState` (what happened + what to do + retry), skeleton rows shaped like BoardRow.

## 5. Components (packages/ui, restyled; see contracts/ui-kit.md for APIs)

- **Button**: square. `primary` (red fill, white text; hover darkens + `→`/icon nudges),
  `ink` (ink fill), `outline` (1px ink border, hover fills muted), `ghost`, `destructive`
  (tinted red + icon), `link` (underline draws on hover). Press: translateY(1px).
- **Inputs**: 1px border, `bg-card`, h-10, square; focus = border becomes ink + 2px ring offset 0.
  Labels above in 13px/600. Errors under the field with icon, red text, `aria-describedby`.
- **Chip / FilterChip**: square, 32px, mono 12px; selected = ink fill.
- **Tabs**: segmented; active = ink fill with sliding highlight (shared layout).
- **Badge / TopicBadge / Difficulty / StatusChip**: square. Difficulty = 1–4 bars glyph + label,
  no hue (hue is reserved for topics).
- **Dialog / Sheet / Popover / Dropdown / Tooltip**: square, 1px ink border, hard shadow
  `shadow-[6px_6px_0_0_var(--shadow-hard)]` for floating layers only. Enter: 180ms rise+fade.
- **Toast** (sonner): square, ink background, left icon, no colored side stripe.

## 6. Motion

Durations: fast 140ms, base 220ms, slow 360ms; easing `cubic-bezier(0.2, 0.8, 0.2, 1)` for
enter, `cubic-bezier(0.4, 0, 1, 1)` for exit. CSS first (`animate-rise`, `animate-wipe`,
`animate-reveal-down`, stagger via `style={{ '--i': index }}` capped at 12). framer-motion
(`@devops-platform/motion/react`) only for shared-layout highlights (header block, tabs) and
presence (mega menu, sheet). Every animation is disabled by the global reduced-motion block.
No perpetual animation except the "current station" pulse and live status dots.

## 7. Practice workspace (lessons/labs/playgrounds), the most important screens

- Immersive. Compact top bar (48px, `bg-ink`): back, title, progress meter, session controls.
- Left: instructions on `bg-card` paper (reading width 68ch), steps as a vertical route;
  right: the workspace (terminal and IDE) ALWAYS dark (night), regardless of theme.
- Terminal and IDE are both mounted for the whole session; switching tabs hides with the
  `hidden` attribute (no display utility on that element). Optional side-by-side mode for IDE labs.
- Never unmount panes on resize; layout switches via CSS. Narrow screens stack panes vertically.
- Per-phase overlay over the terminal (connecting / reconnecting / exited / expired / error)
  with the reason and ONE action (Nối lại / Mở phiên mới); input disabled when not ready.
- Check results attach to the step/task + attempt they were run for.

## 8. Copy voice (Vietnamese)

Write like a good TA at PTIT talking to a student at the lab bench: short, concrete, direct.

- Lead with the fact or the action. Sentence case. No exclamation marks. No emoji.
- Specific beats grand: "9 bài, mỗi bài 20–40 phút, chạy trên máy ảo thật" not "hành trình
  khám phá thế giới DevOps".
- Keep standard English tech terms when that is what people say: pod, container, commit,
  pipeline, deploy, terminal, namespace. Do not translate them awkwardly.
- Buttons are verbs: "Mở lab", "Chạy lệnh", "Kiểm tra", "Nộp bài", "Nối lại".
- Empty state = what is missing + what to do: "Chưa có lab nào khớp bộ lọc. Bỏ bớt điều kiện xem."
- Error = what happened + what to do: "Không mở được phiên. Hết chỗ trên máy chủ, thử lại sau ít phút."
- Banned (also enforced in `packages/copy` contract): khám phá, hành trình, trải nghiệm (as fluff),
  nâng tầm, làm chủ, bứt phá, đột phá, chinh phục, tiềm năng, liền mạch, vượt trội, đỉnh cao,
  toàn diện, mạnh mẽ, tuyệt vời, hoàn hảo, dễ dàng, nhanh chóng, "chào mừng", "hãy cùng",
  "không chỉ … mà còn", "bạn đã sẵn sàng", "chúc bạn", "hy vọng", "tóm lại", em/en dashes.
- No rule-of-three lists by reflex. Vary sentence length. Two items or four are fine.
- All UI strings go through `packages/copy` (`t('…')`). No Vietnamese literals in TSX.

## 9. Accessibility and quality floor

- One `<main>` (AppShell owns it), one `h1` per page, heading order intact, landmarks unique.
- Visible focus (ring) on every interactive element. Hit target ≥ 32px (≥ 40px for primary).
- Text contrast ≥ 4.5:1, UI contrast ≥ 3:1 in both themes (the token contract test checks).
- No horizontal scroll at 375px. Test 375 / 768 / 1024 / 1440.
- Every list/data view has loading, empty, error and one-page states.
