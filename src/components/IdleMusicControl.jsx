import { useEffect, useRef, useState } from "react";
import { Music, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useLocale } from "../contexts/LocaleContext";
import { IDLE_MUSIC_SONG_NAME } from "../utils/idleMusicSettings";
import { useIdleMusic } from "../hooks/useIdleMusic";

const Box = "d" + "iv";

export default function IdleMusicControl({ active }) {
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
        className={`p-2 rounded border text-gray-400 hover:text-white ${
          isPlaying
            ? "border-emerald-600 text-emerald-400 animate-pulse"
            : "border-gray-700 hover:border-emerald-600"
        }`}
        title={IDLE_MUSIC_SONG_NAME}
        aria-label={IDLE_MUSIC_SONG_NAME}
      >
        <Music size={18} />
      </button>

      {open && (
        <Box className="absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border border-gray-700 bg-[#141414] p-3 shadow-xl space-y-3">
          <p className="text-sm font-bold text-white">{IDLE_MUSIC_SONG_NAME}</p>

          <button
            type="button"
            onClick={togglePlayback}
            className="w-full flex items-center justify-center gap-2 border border-emerald-800 bg-emerald-950/40 text-emerald-300 py-2 rounded-lg text-xs font-bold uppercase hover:bg-emerald-950/60"
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            {isPlaying ? t("header.idleMusicPause") : t("header.idleMusicPlay")}
          </button>

          <Box className="space-y-1">
            <Box className="flex items-center justify-between text-xs text-gray-300">
              <span className="flex items-center gap-1">
                {volume > 0 ? <Volume2 size={14} /> : <VolumeX size={14} />}
                {t("header.idleMusicVolume")}
              </span>
              <span className="tabular-nums text-gray-500">{Math.round(volume * 100)}%</span>
            </Box>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(volume * 100)}
              onChange={(event) => setVolume(Number(event.target.value) / 100)}
              className="w-full accent-emerald-500"
            />
          </Box>
        </Box>
      )}
    </Box>
  );
}
