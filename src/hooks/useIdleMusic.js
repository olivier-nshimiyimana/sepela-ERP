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
  const scheduleIdlePlayRef = useRef(() => {});
  const [settings, setSettings] = useState(readIdleMusicSettings);
  const [isPlaying, setIsPlaying] = useState(false);

  const { enabled, volume, idleMinutes } = settings;

  const setPlaying = useCallback((value) => {
    isPlayingRef.current = value;
    setIsPlaying(value);
  }, []);

  const reloadSettings = useCallback(() => {
    setSettings(readIdleMusicSettings());
  }, []);

  const setEnabled = useCallback((value) => {
    writeIdleMusicSettings({ enabled: value });
    if (!value && audioRef.current) {
      audioRef.current.pause();
      setPlaying(false);
    }
  }, [setPlaying]);

  const setVolume = useCallback((value) => {
    writeIdleMusicSettings({ volume: value });
    if (audioRef.current) {
      audioRef.current.volume = Math.min(1, Math.max(0, Number(value)));
    }
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
      audio.addEventListener("pause", () => {
        if (audio.paused) setPlaying(false);
      });
      audio.addEventListener("play", () => setPlaying(true));
    }
    audio.volume = volume;
    return audio;
  }, [setPlaying, volume]);

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
    if (!active || !enabled || isPlayingRef.current) return;

    const delayMs = idleMinutes * 60 * 1000;
    idleTimerRef.current = setTimeout(async () => {
      if (!enabled || !active || isPlayingRef.current) return;
      await playMusic();
    }, delayMs);
  }, [active, clearIdleTimer, enabled, idleMinutes, playMusic]);

  scheduleIdlePlayRef.current = scheduleIdlePlay;

  const pausePlayback = useCallback(() => {
    stopMusic();
    if (active && enabled) {
      scheduleIdlePlayRef.current();
    }
  }, [active, enabled, stopMusic]);

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
    if (!active || isPlayingRef.current) return;
    scheduleIdlePlay();
  }, [active, scheduleIdlePlay]);

  useEffect(() => {
    reloadSettings();
    window.addEventListener(IDLE_MUSIC_CHANGED_EVENT, reloadSettings);
    return () => window.removeEventListener(IDLE_MUSIC_CHANGED_EVENT, reloadSettings);
  }, [reloadSettings]);

  useEffect(() => {
    if (!active) {
      clearIdleTimer();
      stopMusic({ resetPosition: true });
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
      if (audioRef.current) {
        audioRef.current = null;
      }
    };
  }, [active, clearIdleTimer, handleActivity, scheduleIdlePlay, stopMusic]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    if (!enabled) {
      clearIdleTimer();
      stopMusic();
      return;
    }
    if (active && !isPlayingRef.current) {
      scheduleIdlePlay();
    }
  }, [active, clearIdleTimer, enabled, idleMinutes, scheduleIdlePlay, stopMusic]);

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
