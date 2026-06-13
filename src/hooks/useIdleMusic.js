import { useCallback, useEffect, useRef, useState } from "react";
import {
  IDLE_MUSIC_CHANGED_EVENT,
  IDLE_MUSIC_URL,
  readIdleMusicSettings,
  writeIdleMusicSettings,
} from "../utils/idleMusicSettings";

const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "click"];

export function useIdleMusic(active) {
  const audioRef = useRef(null);
  const idleTimerRef = useRef(null);
  const isPlayingRef = useRef(false);
  const activeRef = useRef(active);
  const [settings, setSettings] = useState(readIdleMusicSettings);
  const [isPlaying, setIsPlaying] = useState(false);

  const { enabled, volume, idleMinutes } = settings;

  activeRef.current = active;

  const setPlaying = useCallback((value) => {
    isPlayingRef.current = value;
    setIsPlaying(value);
  }, []);

  const reloadSettings = useCallback(() => {
    setSettings(readIdleMusicSettings());
  }, []);

  const setEnabled = useCallback(
    (value) => {
      writeIdleMusicSettings({ enabled: value });
      if (!value && audioRef.current) {
        audioRef.current.pause();
        setPlaying(false);
      }
    },
    [setPlaying]
  );

  const setVolume = useCallback((value) => {
    const next = Math.min(1, Math.max(0, Number(value)));
    writeIdleMusicSettings({ volume: next });
    if (audioRef.current) {
      audioRef.current.volume = next;
    }
    setSettings((prev) => ({ ...prev, volume: next }));
  }, []);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const ensureAudio = useCallback(() => {
    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio(IDLE_MUSIC_URL);
      audio.loop = true;
      audioRef.current = audio;
      audio.addEventListener("ended", () => setPlaying(false));
      audio.addEventListener("play", () => setPlaying(true));
    }
    audio.volume = readIdleMusicSettings().volume;
    return audio;
  }, [setPlaying]);

  const stopMusic = useCallback(
    ({ resetPosition = false } = {}) => {
      if (audioRef.current) {
        audioRef.current.pause();
        if (resetPosition) {
          audioRef.current.currentTime = 0;
        }
      }
      setPlaying(false);
    },
    [setPlaying]
  );

  const playMusic = useCallback(async () => {
    clearIdleTimer();
    const audio = ensureAudio();
    try {
      await audio.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }, [clearIdleTimer, ensureAudio, setPlaying]);

  const scheduleIdlePlay = useCallback(() => {
    clearIdleTimer();
    const { enabled: isEnabled, idleMinutes: minutes } = readIdleMusicSettings();
    if (!activeRef.current || !isEnabled || isPlayingRef.current) return;

    const delayMs = minutes * 60 * 1000;
    idleTimerRef.current = setTimeout(async () => {
      const latest = readIdleMusicSettings();
      if (!latest.enabled || !activeRef.current || isPlayingRef.current) return;
      await playMusic();
    }, delayMs);
  }, [clearIdleTimer, playMusic]);

  const pausePlayback = useCallback(() => {
    stopMusic();
    if (activeRef.current && readIdleMusicSettings().enabled) {
      scheduleIdlePlay();
    }
  }, [scheduleIdlePlay, stopMusic]);

  const playPlayback = useCallback(() => {
    void playMusic();
  }, [playMusic]);

  const togglePlayback = useCallback(() => {
    if (isPlayingRef.current) {
      pausePlayback();
      return;
    }
    void playPlayback();
  }, [pausePlayback, playPlayback]);

  const handleActivity = useCallback(() => {
    if (!activeRef.current || isPlayingRef.current) return;
    scheduleIdlePlay();
  }, [scheduleIdlePlay]);

  useEffect(() => {
    reloadSettings();
    window.addEventListener(IDLE_MUSIC_CHANGED_EVENT, reloadSettings);
    return () => window.removeEventListener(IDLE_MUSIC_CHANGED_EVENT, reloadSettings);
  }, [reloadSettings]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    if (!active) {
      clearIdleTimer();
      stopMusic({ resetPosition: true });
      audioRef.current = null;
      return undefined;
    }

    scheduleIdlePlay();
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, handleActivity, { passive: true });
    }

    return () => {
      clearIdleTimer();
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, handleActivity);
      }
      stopMusic({ resetPosition: true });
      audioRef.current = null;
    };
    // Only tear down audio when active toggles — not when volume/schedule callbacks change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    if (!active) return;
    if (!enabled) {
      clearIdleTimer();
      stopMusic();
      return;
    }
    if (!isPlayingRef.current) {
      scheduleIdlePlay();
    }
  }, [active, enabled, idleMinutes, clearIdleTimer, scheduleIdlePlay, stopMusic]);

  return {
    enabled,
    setEnabled,
    volume,
    setVolume,
    idleMinutes,
    isPlaying,
    playPlayback,
    pausePlayback,
    togglePlayback,
  };
}
