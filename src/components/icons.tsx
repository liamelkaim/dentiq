// Small inline icon set (1.6px strokes, 20px grid) so we don't need an icon dependency.
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const HomeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 8.5 10 3.5l6.5 5V16a1 1 0 0 1-1 1h-3.5v-4.5h-4V17H4.5a1 1 0 0 1-1-1Z" />
  </Icon>
);

export const BookIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H16v12H5.5A1.5 1.5 0 0 0 4 16.5Z" />
    <path d="M4 16.5A1.5 1.5 0 0 0 5.5 18H16v-3" />
  </Icon>
);

export const FolderIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.75 5.5A1.5 1.5 0 0 1 4.25 4h3.5l1.75 2h6.25a1.5 1.5 0 0 1 1.5 1.5v7.25a1.5 1.5 0 0 1-1.5 1.5H4.25a1.5 1.5 0 0 1-1.5-1.5Z" />
  </Icon>
);

export const FlagIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 17.5V3.5M4.5 4h9.75l-2 3.5 2 3.5H4.5" />
  </Icon>
);

export const DownloadIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 3.5v9M6 8.75l4 4 4-4M4 16.5h12" />
  </Icon>
);

export const FileIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M11.5 2.75H5.75a1.5 1.5 0 0 0-1.5 1.5v11.5a1.5 1.5 0 0 0 1.5 1.5h8.5a1.5 1.5 0 0 0 1.5-1.5V7Z" />
    <path d="M11.5 2.75V7h4.25" />
  </Icon>
);

export const SettingsIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 6h9M15 6h2M3 14h2M8 14h9" />
    <circle cx="13.5" cy="6" r="1.75" />
    <circle cx="6.5" cy="14" r="1.75" />
  </Icon>
);

export const ShieldIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 2.75 4 5v4.5c0 3.7 2.5 6.6 6 7.75 3.5-1.15 6-4.05 6-7.75V5Z" />
  </Icon>
);

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="9" r="5.25" />
    <path d="m13 13 4 4" />
  </Icon>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m8 5 5 5-5 5" />
  </Icon>
);

export const ChevronLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m12 5-5 5 5 5" />
  </Icon>
);

export const SunIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="3.25" />
    <path d="M10 2.5v1.5M10 16v1.5M2.5 10H4M16 10h1.5M4.7 4.7l1.06 1.06M14.24 14.24l1.06 1.06M4.7 15.3l1.06-1.06M14.24 5.76l1.06-1.06" />
  </Icon>
);

export const MoonIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M16.5 12.2A6.75 6.75 0 0 1 7.8 3.5a6.75 6.75 0 1 0 8.7 8.7Z" />
  </Icon>
);

export const MonitorIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.75" y="3.5" width="14.5" height="10" rx="1.5" />
    <path d="M7 17h6M10 13.5V17" />
  </Icon>
);

export const LogOutIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 17H4.5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1H8M13 14l4-4-4-4M17 10H8" />
  </Icon>
);

export const InfoIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="7.25" />
    <path d="M10 9v4.5M10 6.5v.01" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m4.5 10.5 3.5 3.5 7.5-8" />
  </Icon>
);

export const AlertIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 3.25 17.25 16H2.75Z" />
    <path d="M10 8.5v3M10 13.75v.01" />
  </Icon>
);

// ---------- Future features (shown disabled until they exist) ----------

export const PassesIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="2.75" width="12" height="14.5" rx="1.5" />
    <path d="M7 7h6M7 10h6M7 13h3.5" />
  </Icon>
);

export const CardsIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.75" y="5.5" width="11" height="11" rx="1.5" />
    <path d="M6.5 3.5h8.25a1.5 1.5 0 0 1 1.5 1.5v8.25" />
  </Icon>
);

export const MicIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="7.25" y="2.75" width="5.5" height="9" rx="2.75" />
    <path d="M4.75 9.5a5.25 5.25 0 0 0 10.5 0M10 14.75v2.5" />
  </Icon>
);

export const SparkleIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 3.25 11.6 8.4 16.75 10l-5.15 1.6L10 16.75 8.4 11.6 3.25 10 8.4 8.4Z" />
  </Icon>
);

export const ChartIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 16.5h13M6 13.5v-3M10 13.5v-7M14 13.5V9" />
  </Icon>
);

// ---------- Focus Study Mode ----------

export const FocusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 7V4.5a1 1 0 0 1 1-1H7M13 3.5h2.5a1 1 0 0 1 1 1V7M16.5 13v2.5a1 1 0 0 1-1 1H13M7 16.5H4.5a1 1 0 0 1-1-1V13" />
  </Icon>
);

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5 5 10 10M15 5 5 15" />
  </Icon>
);

export const SidebarIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.75" y="3.5" width="14.5" height="13" rx="1.5" />
    <path d="M7.5 3.5v13" />
  </Icon>
);

// ---------- Study tools ----------

export const ClockIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="7" />
    <path d="M10 6v4.25l2.75 1.75" />
  </Icon>
);

export const QuizIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.25" y="3.25" width="13.5" height="13.5" rx="2" />
    <path d="m6.75 8.25 1.5 1.5 2.5-2.75M6.75 13.25h6.5" />
  </Icon>
);

export const CalendarIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.25" y="4.5" width="13.5" height="12.25" rx="2" />
    <path d="M3.25 8.25h13.5M7 3v3M13 3v3" />
  </Icon>
);

export const TagIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 3.5h5.8l7.2 7.2a1.4 1.4 0 0 1 0 2l-3.8 3.8a1.4 1.4 0 0 1-2 0L3.5 9.3z" />
    <circle cx="7" cy="7" r="1" />
  </Icon>
);

export const NotesIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 2.8h7l3.5 3.5V16a1.2 1.2 0 0 1-1.2 1.2H5A1.2 1.2 0 0 1 3.8 16V4A1.2 1.2 0 0 1 5 2.8Z" />
    <path d="M12 2.8v3.5h3.5M6.6 9.5h6.8M6.6 12.2h6.8M6.6 14.8h4" />
  </Icon>
);

export const ChevronDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5 8 5 5 5-5" />
  </Icon>
);

export const BellIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 8a5 5 0 0 1 10 0c0 4.5 1.8 5.6 1.8 5.6H3.2S5 12.5 5 8ZM8.3 16.3a1.9 1.9 0 0 0 3.4 0" />
  </Icon>
);
