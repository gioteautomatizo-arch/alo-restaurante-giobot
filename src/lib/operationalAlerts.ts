const SOUND_KEY = 'alo_operational_sound_enabled_v1';
const SOUND_PROFILE_KEY = 'alo_operational_sound_profile_v1';

export type OperationalSoundProfile = 'low' | 'normal' | 'high' | 'kitchen';

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

export function getOperationalSoundProfile(): OperationalSoundProfile {
  try {
    const raw = localStorage.getItem(SOUND_PROFILE_KEY);
    if (raw === 'low' || raw === 'normal' || raw === 'high' || raw === 'kitchen') return raw;
  } catch {
    // ignore
  }
  return 'high';
}

export function setOperationalSoundProfile(profile: OperationalSoundProfile): void {
  try {
    localStorage.setItem(SOUND_PROFILE_KEY, profile);
  } catch {
    // ignore
  }
}

export function getOperationalSoundProfileLabel(profile: OperationalSoundProfile): string {
  if (profile === 'low') return 'Bajo';
  if (profile === 'normal') return 'Normal';
  if (profile === 'kitchen') return 'Cocina';
  return 'Alto';
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

function beep(
  frequency: number,
  start: number,
  duration: number,
  gainValue: number,
  type: OscillatorType = 'square',
) {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;

  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  const compressor = ctx.createDynamicsCompressor();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, ctx.currentTime + start);

  compressor.threshold.setValueAtTime(-14, ctx.currentTime);
  compressor.knee.setValueAtTime(10, ctx.currentTime);
  compressor.ratio.setValueAtTime(8, ctx.currentTime);
  compressor.attack.setValueAtTime(0.003, ctx.currentTime);
  compressor.release.setValueAtTime(0.12, ctx.currentTime);

  gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(gainValue, ctx.currentTime + start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);

  oscillator.connect(gain);
  gain.connect(compressor);
  compressor.connect(ctx.destination);

  oscillator.start(ctx.currentTime + start);
  oscillator.stop(ctx.currentTime + start + duration + 0.04);
}

function profileSettings(profile: OperationalSoundProfile) {
  switch (profile) {
    case 'low':
      return { gain: 0.16, repeat: 1, gap: 0.7, vibrationScale: 0.65 };
    case 'normal':
      return { gain: 0.24, repeat: 1, gap: 0.65, vibrationScale: 0.85 };
    case 'kitchen':
      return { gain: 0.42, repeat: 3, gap: 0.48, vibrationScale: 1.25 };
    case 'high':
    default:
      return { gain: 0.36, repeat: 2, gap: 0.58, vibrationScale: 1 };
  }
}

function playPattern(kind: 'request' | 'order' | 'ready', profile: OperationalSoundProfile) {
  const { gain, repeat, gap } = profileSettings(profile);

  const patterns = {
    request: [
      { f: 920, d: 0.22 },
      { f: 920, d: 0.22 },
      { f: 1320, d: 0.26 },
    ],
    order: [
      { f: 760, d: 0.22 },
      { f: 980, d: 0.24 },
      { f: 1240, d: 0.30 },
    ],
    ready: [
      { f: 980, d: 0.20 },
      { f: 1320, d: 0.22 },
      { f: 1560, d: 0.30 },
    ],
  } as const;

  const pattern = patterns[kind];
  let burstLength = 0;
  pattern.forEach((step, index) => {
    burstLength += step.d + (index < pattern.length - 1 ? 0.06 : 0);
  });

  for (let r = 0; r < repeat; r += 1) {
    let cursor = r * (burstLength + gap);
    pattern.forEach((step) => {
      beep(step.f, cursor, step.d, gain);
      cursor += step.d + 0.06;
    });
  }
}

export async function playOperationalAlert(kind: 'request' | 'order' | 'ready' = 'request') {
  if (!isOperationalSoundEnabled()) return;
  if (!unlocked) await unlockOperationalSound();
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;

  const profile = getOperationalSoundProfile();
  playPattern(kind, profile);

  try {
    if ('vibrate' in navigator) {
      const scale = profileSettings(profile).vibrationScale;
      const scaleMs = (value: number) => Math.max(40, Math.round(value * scale));

      const vibration =
        kind === 'order'
          ? [220, 90, 260, 120, 320]
          : kind === 'ready'
            ? [180, 80, 220, 100, 260]
            : [220, 90, 220, 120, 260];

      navigator.vibrate(vibration.map(scaleMs));
    }
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
