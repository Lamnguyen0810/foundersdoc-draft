/* The icons of Rachel's design (overview v23), as drawn there. */

const P = {
  overview: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  esop: <><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></>,
  rules: <><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 21V5" /><path d="M9 8h6M9 12h5" /></>,
  resolutions: <><path d="M9 4h6v4H9z" /><path d="M7 6H5v15h14V6h-2" /><path d="m9 14 2 2 4-4" /></>,
  letters: <><path d="M6 3h9l4 4v8" /><path d="M6 3v18h7" /><path d="M14 3v5h5" /><circle cx="17.5" cy="17.5" r="2.5" /><path d="m16 20-.5 2.5 2-1 2 1-.5-2.5" /></>,
  certs: <><rect x="3" y="4" width="18" height="13" rx="1.5" /><path d="M7 9h6M7 12h4" /><circle cx="16.5" cy="11" r="2" /><path d="m15.5 13-.7 4 1.7-1 1.7 1-.7-4" /></>,
  folder: <path d="M3 6h7l2 2h9v12H3z" />,
  sign: <><path d="M3 17c3-1 4-8 6-8s1 7 3 7 2-4 4-4 2 3 5 3" /><path d="M3 21h18" /></>,
  ai: <path d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></>,
  check: <path d="m5 12 5 5 9-10" />,
  download: <><path d="M12 4v11" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" /></>,
  upload: <><path d="M12 20V9" /><path d="m7 14 5-5 5 5" /><path d="M5 4h14" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  comfy: <path d="M4 6h16M4 12h16M4 18h16" />,
  compact: <path d="M4 5h16M4 9.5h16M4 14h16M4 18.5h16" />,
  chev: <path d="m9 6 6 6-6 6" />,
  back: <path d="m15 6-6 6 6 6" />,
  up: <path d="m6 15 6-6 6 6" />,
  down: <path d="m6 9 6 6 6-6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  mail: <><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="M4 7l8 6 8-6" /></>,
} as const;

export type IconName = keyof typeof P;

export function Ic({ n, s = 15, w = 1.8 }: { n: IconName; s?: number; w?: number }) {
  return (
    <svg aria-hidden="true" width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">
      {P[n]}
    </svg>
  );
}
