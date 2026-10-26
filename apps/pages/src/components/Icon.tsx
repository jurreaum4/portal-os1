const paths: Record<string, string> = {
  dashboard: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  portfolio: "M3 7h18v14H3z M8 7V3h8v4 M3 12h18 M10 12v3h4v-3",
  products: "m12 3 9 5v9l-9 5-9-5V8z M3 8l9 5 9-5 M12 13v9 M7 5l10 6",
  pipeline: "M4 5h16 M4 12h16 M4 19h16 M7 2v6 M16 9v6 M9 16v6",
  approvals: "M8 3H5v18h14V3h-3 M8 2h8v4H8z m0 11 3 3 5-6",
  analytics: "M3 3v18h19 M7 16v-5 M12 16V6 M17 16v-8",
  forecasting: "M3 21V3 M3 21h18 M6 16l5-7 4 3 6-8 M17 4h4v4",
  departments:
    "M3 3h8v8H3z M15 3h6v6h-6z M3 15h6v6H3z M15 15h6v6h-6z M15 12v3 M9 18h6",
  governance: "m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6z m-4 10 3 3 5-6",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2",
  arrow: "M5 12h14 m-5-5 5 5-5 5",
  chevron: "m9 5 7 7-7 7",
  down: "m6 9 6 6 6-6",
  search: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 m5 12 6 6",
  bell: "M6 8a6 6 0 0 1 12 0v6l3 3H3l3-3z M9 21h6",
  globe:
    "M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0 M3 12h18 M12 3c5 5 5 13 0 18-5-5-5-13 0-18",
  health: "M3 12h4l3-8 4 16 3-8h4",
  clock: "M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0 M12 7v5l3 2",
  download: "M12 3v12 m-4-4 4 4 4-4 M4 16v5h16v-5",
  plus: "M12 5v14 M5 12h14",
  spark: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z",
  code: "m8 7-5 5 5 5 m8-10 5 5-5 5 M14 4l-4 16",
  check: "m5 12 4 4L19 6",
  help: "M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0 M9 9a3 3 0 1 1 5 2l-2 2 M12 17v.1",
  external: "M14 3h7v7 M21 3 10 14 M10 3H3v18h18v-7",
};
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] ?? paths.products} />
    </svg>
  );
}
