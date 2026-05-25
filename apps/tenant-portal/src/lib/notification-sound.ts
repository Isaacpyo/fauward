// Lightweight two-tone chime synthesized via Web Audio so we don't ship an
// audio asset. Mirrors the Slack "knock-brush" feel: short, polite, two notes.

const STORAGE_KEY = "fw-notifications-muted";

type AudioCtxCtor = typeof AudioContext;

let cachedContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (cachedContext) return cachedContext;
  const Ctor: AudioCtxCtor | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtxCtor }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    cachedContext = new Ctor();
    return cachedContext;
  } catch {
    return null;
  }
}

export function isNotificationSoundMuted(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

export function setNotificationSoundMuted(muted: boolean) {
  if (typeof window === "undefined") return;
  if (muted) window.localStorage.setItem(STORAGE_KEY, "1");
  else window.localStorage.removeItem(STORAGE_KEY);
}

/**
 * Play a brief two-tone chime. Safe to call from any user-visible event.
 * Silently no-ops if the browser blocks audio (autoplay policy, etc.) or the
 * user has muted notifications.
 */
export function playNotificationChime() {
  if (isNotificationSoundMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  // Some browsers leave the context "suspended" until the next user gesture.
  // resume() may itself reject — swallow it.
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.connect(ctx.destination);

  const tone = (freq: number, start: number, duration: number, peak: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + start);
    gain.gain.exponentialRampToValueAtTime(peak, now + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
    osc.connect(gain).connect(master);
    osc.start(now + start);
    osc.stop(now + start + duration + 0.02);
  };

  // Slack-like rising fifth: A5 → E6 with a short softening overtone.
  tone(880, 0, 0.18, 0.18);
  tone(1318.5, 0.12, 0.22, 0.16);

  // Master fade-in to avoid clicks.
  master.gain.exponentialRampToValueAtTime(0.9, now + 0.01);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
}
