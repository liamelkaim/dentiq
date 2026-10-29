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

/** Subtle dental detail used only in the wordmark: a minimal molar outline. */
export const ToothMark = (p: IconProps) => (
  <svg width="18" height="20" viewBox="0 0 18 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true" {...p}>
    <path d="M5.2 1.75C3 1.75 1.5 3.4 1.5 5.7c0 1.8.6 3 1.15 4.5.55 1.6.75 4.3 1.7 6.6.4.95 1.5.85 1.7-.15l.85-4.1c.2-.85.7-1.25 1.1-1.25h.0c.4 0 .9.4 1.1 1.25l.85 4.1c.2 1 1.3 1.1 1.7.15.95-2.3 1.15-5 1.7-6.6.55-1.5 1.15-2.7 1.15-4.5 0-2.3-1.5-3.95-3.7-3.95-1.2 0-1.95.55-2.8.55s-1.6-.55-2.8-.55Z" />
  </svg>
);
