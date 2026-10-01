const paths = {
  layers: 'm12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5',
  folder: 'M3 7V5h6l2 2h10v13H3V7Z',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  ad: 'M3 4h18v16H3zM3 9h18M7 13h5M7 16h9',
  search: 'M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  plus: 'M12 5v14M5 12h14',
  'arrow-left': 'M20 12H4m7-7-7 7 7 7',
  'chevron-right': 'm9 5 7 7-7 7',
  check: 'm5 12 4 4L19 6',
  info: 'M12 10v7m0-10h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6',
  image: 'M3 3h18v18H3zM3 17l5-6 4 4 4-5 5 7M7 7h.01',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5',
  chart: 'M4 20V10m6 10V4m6 16v-8m5 8H2',
  close: 'm6 6 12 12M6 18 18 6',
  sun: 'M12 3v2m0 14v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M3 12h2m14 0h2M4.2 19.8l1.4-1.4m12.8-12.8 1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  moon: 'M20 14.5A7.5 7.5 0 1 1 9.5 4 6 6 0 0 0 20 14.5Z',
  display: 'M4 5h16v12H4zM8 21h8M12 17v4',
  'panel-left': 'M4 5h16v14H4zM9 5v14',
  'panel-right': 'M4 5h16v14H4zM15 5v14',
} as const;

export function Icon({ name, size = 18 }: { name: keyof typeof paths; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}
