import type { SVGProps } from "react";

export type IconName =
  | "alert"
  | "bell"
  | "calendar"
  | "chart"
  | "chevron"
  | "inventory"
  | "imports"
  | "menu"
  | "orders"
  | "overview"
  | "reservations"
  | "sales"
  | "settings"
  | "sparkles"
  | "suppliers";

const paths: Record<IconName, React.ReactNode> = {
  alert: <path d="M12 9v4m0 4h.01M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z" />,
  bell: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" />,
  calendar: <path d="M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z" />,
  chart: <path d="M4 19V9m6 10V5m6 14v-7m4 7H2" />,
  chevron: <path d="m9 18 6-6-6-6" />,
  inventory: <path d="m21 8-9 5-9-5m9 5v9M5 6.8 12 3l7 3.8v10.4L12 21l-7-3.8V6.8Z" />,
  imports: <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v3h16v-3M5 4h4m6 0h4" />,
  menu: <path d="M4 5h16M4 12h16M4 19h10" />,
  orders: <path d="M6 3h12l1 18H5L6 3Zm3 4a3 3 0 0 0 6 0" />,
  overview: <path d="M3 13h8V3H3v10Zm0 8h8v-4H3v4Zm12 0h6V11h-6v10Zm0-14h6V3h-6v4Z" />,
  reservations: <path d="M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Zm4 9 2 2 4-4" />,
  sales: <path d="M4 19V9m6 10V5m6 14v-7m4 7H2" />,
  settings: <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-3.5a7.8 7.8 0 0 0-.1-1l2-1.6-2-3.4-2.5 1a7.7 7.7 0 0 0-1.7-1L14.7 3h-4l-.4 3a7.7 7.7 0 0 0-1.7 1L6.1 6 4 9.4 6 11a7.8 7.8 0 0 0 0 2l-2 1.6L6.1 18l2.5-1a7.7 7.7 0 0 0 1.7 1l.4 3h4l.4-3a7.7 7.7 0 0 0 1.7-1l2.5 1 2-3.4-2-1.6a7.8 7.8 0 0 0 .1-1Z" />,
  sparkles: <path d="m12 3 1.1 3.3L16.5 7l-3.4 1.1L12 11.5l-1.1-3.4L7.5 7l3.4-.7L12 3Zm6 9 1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2ZM6 13l1.2 2.8L10 17l-2.8 1.2L6 21l-1.2-2.8L2 17l2.8-1.2L6 13Z" />,
  suppliers: <path d="M3 7h11v10H3V7Zm11 3h4l3 3v4h-7v-7ZM7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />,
};

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {paths[name]}
    </svg>
  );
}
