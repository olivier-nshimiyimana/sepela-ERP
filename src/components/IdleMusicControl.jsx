import { useEffect, useRef, useState } from "react";
import { Music, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useLocale } from "../contexts/LocaleContext";
import { IDLE_MUSIC_SONG_NAME } from "../utils/idleMusicSettings";
import { useIdleMusic } from "../hooks/useIdleMusic";

const Box = "d" + "iv";

export default function IdleMusicControl({ active, lightToolbar = false }) {
  const { t } = useLocale();
  const { volume, setVolume, isPlaying, togglePlayback } = useIdleMusic(active);
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  return (
    <Box ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={
          lightToolbar
            ? `sepela-header-btn ${isPlaying ? "border-emerald-500 text-emerald-700 animate-pulse" : ""}`
            : `sepela-toolbar-btn ${isPlaying ? "text-sepela-accent animate-pulse" : ""}`
        }
        title={IDLE_MUSIC_SONG_NAME}
        aria-label={IDLE_MUSIC_SONG_NAME}
      >
        <Music size={18} />
      </button>

      {open && (
        <Box className="sepela-popover space-y-3">
          <p className="sepela-popover__title">{IDLE_MUSIC_SONG_NAME}</p>

          <button
            type="button"
            onClick={togglePlayback}
            className="sepela-btn-primary flex items-center justify-center gap-2 text-xs"
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            {isPlaying ? t("header.idleMusicPause") : t("header.idleMusicPlay")}
          </button>

          <Box className="space-y-1">
            <Box className="flex items-center justify-between text-xs text-sepela-muted font-semibold">
              <span className="flex items-center gap-1">
                {volume > 0 ? <Volume2 size={14} /> : <VolumeX size={14} />}
                {t("header.idleMusicVolume")}
              </span>
              <span className="sepela-money">{Math.round(volume * 100)}%</span>
            </Box>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(volume * 100)}
              onChange={(event) => setVolume(Number(event.target.value) / 100)}
              onPointerDown={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              className="sepela-range"
            />
          </Box>
        </Box>
      )}
    </Box>
  );
}
