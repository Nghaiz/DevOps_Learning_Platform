import { useId } from 'react';

/** Vector scenery shared by the campaign map and live playfield. */
export function GitWorldArt({ chapter = 1 }: { readonly chapter?: 1 | 2 | 3 }) {
  const id = useId();
  return (
    <svg
      className="git-world-art"
      data-chapter={chapter}
      viewBox="0 0 720 400"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id + '-rock'} x2="0.5" y2="1">
          <stop stopColor="var(--git-land)" />
          <stop offset="1" stopColor="var(--git-abyss)" />
        </linearGradient>
        <radialGradient id={id + '-halo'}>
          <stop stopColor="var(--git-zone)" stopOpacity=".25" />
          <stop offset="1" stopColor="var(--git-zone)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="370" cy="260" rx="310" ry="140" fill={'url(#' + id + '-halo)'} />
      <g className="git-art-stars" fill="var(--git-star)">
        {Array.from({ length: 28 }, (_, i) => (
          <circle
            key={i}
            cx={25 + ((i * 113) % 680)}
            cy={25 + ((i * 67) % 310)}
            r={i % 4 === 0 ? 2 : 1}
          />
        ))}
      </g>
      <path
        className="git-art-route"
        d="M125 259 C210 330 230 134 346 205 S496 304 586 157"
        stroke="var(--git-zone)"
        strokeWidth="3"
        strokeDasharray="5 9"
      />
      {[
        { x: 115, y: 225, s: 0.7 },
        { x: 345, y: 183, s: 1.25 },
        { x: 585, y: 133, s: 0.8 },
      ].map((island, i) => (
        <g
          key={i}
          transform={'translate(' + island.x + ' ' + island.y + ') scale(' + island.s + ')'}
        >
          <g className="git-floating-island" style={{ animationDelay: i * -1.7 + 's' }}>
            <ellipse cy="104" rx="65" ry="13" fill="var(--git-abyss)" opacity=".35" />
            <path d="M-88 0 L0 -40 L88 0 L58 55 L12 91 L-48 62 Z" fill={'url(#' + id + '-rock)'} />
            <path
              d="M-88 0 L0 40 L88 0 L0 -40 Z"
              fill="var(--git-land)"
              stroke="var(--git-zone)"
              strokeWidth="1.5"
            />
            <path
              d="M0 40 L12 91 M-48 19 L-48 62 M50 18 L58 55"
              stroke="var(--git-zone)"
              opacity=".2"
            />
            <ellipse cy="-3" rx="43" ry="20" stroke="var(--git-zone)" strokeWidth="2" />
            <ellipse
              className="git-art-orbit"
              cy="-3"
              rx="53"
              ry="26"
              stroke="var(--git-zone)"
              strokeDasharray="4 8"
              opacity=".7"
            />
            <path
              d="M-19 -12 L0 -23 L19 -12 L19 -58 L0 -69 L-19 -58 Z"
              fill="var(--git-tower)"
              stroke="var(--git-zone)"
            />
            <path d="M-19 -58 L0 -47 L19 -58 M0 -47 L0 -23" stroke="var(--git-zone)" />
            <circle cy="-81" r="8" fill="var(--git-zone)" className="git-beacon" />
            <path d="M-47 -15 l-9 -28 l-9 28 Z M40 5 l9 -30 l9 30 Z" fill="var(--git-flora)" />
            <path d="M-56 -13 v-16 M49 5 v-17" stroke="var(--git-zone)" />
            <text
              y="22"
              textAnchor="middle"
              fill="var(--git-star)"
              fontSize="10"
              fontFamily="monospace"
            >
              {i === 1
                ? chapter === 1
                  ? 'HEAD'
                  : chapter === 2
                    ? 'origin'
                    : 'reflog'
                : i === 0
                  ? 'main'
                  : 'feature'}
            </text>
          </g>
        </g>
      ))}
      <g className="git-art-satellite" transform="translate(475 65)">
        <path d="M-10 0 L0 -10 L10 0 L0 10 Z" fill="var(--git-gold)" />
        <path d="M-24 0 H-15 M15 0 H24 M0 -24 V-15 M0 15 V24" stroke="var(--git-gold)" />
      </g>
    </svg>
  );
}
