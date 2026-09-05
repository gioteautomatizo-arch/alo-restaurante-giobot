const SOUND_KEY = 'alo_operational_sound_enabled_v1';

let audioContext: AudioContext | null = null;
let unlocked = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) return null;
    if (!audioContext) audioContext = new AudioContextCtor();
    return audioContext;
  } catch {
    return null;
  }
}

export function isOperationalSoundEnabled(): boolean {
  try {
    const raw = localStorage.getItem(SOUND_KEY);
    return raw === null ? true : raw === 'true';
  } catch {
    return true;
  }
}

export async function setOperationalSoundEnabled(enabled: boolean): Promise<void> {
  try {
    localStorage.setItem(SOUND_KEY, String(enabled));
  } catch {
    // ignore
  }
  if (enabled) await unlockOperationalSound();
}

export async function unlockOperationalSound(): Promise<boolean> {
  const ctx = getAudioContext();
  if (!ctx) return false;
  try {
    if (ctx.state === 'suspended') await ctx.resume();
    unlocked = ctx.state === 'running';
    return unlocked;
  } catch {
    return false;
  }
}

function beep(frequency: number, start: number, duration: number, gainValue: number) {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, ctx.currentTime + start);
  gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(gainValue, ctx.currentTime + start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(ctx.currentTime + start);
  oscillator.stop(ctx.currentTime + start + duration + 0.03);
}

export async function playOperationalAlert(kind: 'request' | 'order' | 'ready' = 'request') {
  if (!isOperationalSoundEnabled()) return;
  if (!unlocked) await unlockOperationalSound();
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;

  if (kind === 'order') {
    beep(660, 0, 0.18, 0.14);
    beep(880, 0.22, 0.22, 0.16);
    beep(1040, 0.48, 0.28, 0.18);
  } else if (kind === 'ready') {
    beep(880, 0, 0.16, 0.14);
    beep(1175, 0.2, 0.25, 0.16);
  } else {
    beep(740, 0, 0.16, 0.14);
    beep(740, 0.22, 0.16, 0.14);
  }

  try {
    if ('vibrate' in navigator) navigator.vibrate(kind === 'order' ? [120, 70, 180] : [120, 80, 120]);
  } catch {
    // ignore
  }
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function showOperationalNotification(title: string, body: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(title, {
      body,
      icon: '/logo-calientito.png',
      tag: `alo-${title}-${body}`,
    });
  } catch {
    // ignore
  }
}
