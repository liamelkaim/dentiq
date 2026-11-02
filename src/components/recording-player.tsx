"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { PLAYBACK_SPEEDS } from "@/server/recordings/constants";
import { cx } from "./ui";

/** Audio or video player with a speed control. The file comes from /api/recordings/<id> (owner only, Range supported). */
export function RecordingPlayer({ id, kind, label }: { id: string; kind: "audio" | "video"; label: string }) {
  const t = useTranslations("recordings.player");
  const ref = useRef<HTMLMediaElement>(null);
  const [speed, setSpeed] = useState<number>(1);
  const set = (s: number) => {
    setSpeed(s);
    if (ref.current) ref.current.playbackRate = s;
  };
  const applySpeed = () => {
    if (ref.current) ref.current.playbackRate = speed;
  };
  return (
    <div className="flex flex-col gap-3">
      {kind === "video" ? (
        <video ref={ref as React.RefObject<HTMLVideoElement>} controls preload="metadata" src={`/api/recordings/${id}`} data-recording-player="" aria-label={label} onLoadedMetadata={applySpeed} className="max-h-[60vh] w-full rounded-[10px] bg-surface-muted" playsInline />
      ) : (
        <audio ref={ref as React.RefObject<HTMLAudioElement>} controls preload="metadata" src={`/api/recordings/${id}`} data-recording-player="" aria-label={label} onLoadedMetadata={applySpeed} className="w-full rounded-[10px] bg-surface-muted" />
      )}
      <div role="group" aria-label={t("speed")} className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-text-muted">{t("speed")}</span>
        {PLAYBACK_SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => set(s)}
            aria-pressed={speed === s}
            className={cx("inline-flex h-11 min-w-11 items-center justify-center rounded-[10px] border px-3 text-[14px] font-medium sm:h-9", speed === s ? "border-accent bg-accent-soft text-accent" : "border-border text-text-muted hover:bg-surface-hover")}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
}
