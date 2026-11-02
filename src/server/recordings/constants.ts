export const RECORDINGS_SETTINGS_KEY = "recordings";
export const MB = 1024 * 1024;
export const DEFAULT_MAX_FILE_BYTES = 200 * MB;
export const MAX_FILE_BYTES_BOUNDS = [1 * MB, 500 * MB] as const;
export const DEFAULT_QUOTA_BYTES = 1024 * MB;
export const QUOTA_BYTES_BOUNDS = [1 * MB, 5 * 1024 * MB] as const;
export const TITLE_MAX = 200;
export const NOTE_MAX = 2000;
export const NOTES_PER_RECORDING_MAX = 200;
export const RECORDINGS_PER_USER_MAX = 100;
export const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

/** "16 KB", "1.5 MB", "2.4 GB" (decimal point is shown by the browser's locale elsewhere; units stay the same in both languages). */
export function formatSize(bytes: number): string {
  if (bytes < MB) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * MB) return `${Math.round((bytes / MB) * 10) / 10} MB`;
  return `${Math.round((bytes / (1024 * MB)) * 10) / 10} GB`;
}
