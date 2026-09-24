/**
 * Alesha Device Fingerprint Generator
 * Identifies physical devices deterministically across network/ISP changes,
 * incognito sessions, and browser reloads using hardware & canvas signatures.
 */

let cachedDeviceId: string | null = null;

async function hashString(str: string): Promise<string> {
  try {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
      const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      const hex = Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      return hex.slice(0, 24);
    }
  } catch (_) {}

  // Deterministic FNV-1a fallback
  let h1 = 0x811c9dc5;
  let h2 = 0x27d4eb2f;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= code;
    h2 = Math.imul(h2, 0x01000193);
  }
  return (Math.abs(h1).toString(16) + Math.abs(h2).toString(16)).slice(0, 24);
}

export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) {
    return cachedDeviceId;
  }

  if (typeof window === 'undefined') {
    return 'dev_node_server';
  }

  // 1. Try reading from localStorage
  try {
    const saved = localStorage.getItem('alesha_device_id');
    if (saved && saved.startsWith('dev_') && saved.length >= 12) {
      cachedDeviceId = saved;
      return saved;
    }
  } catch (_) {}

  // 2. Try reading from cookie
  try {
    const match = document.cookie.match(/(?:^|;\s*)alesha_device_id=([^;]+)/);
    if (match && match[1] && match[1].startsWith('dev_')) {
      cachedDeviceId = decodeURIComponent(match[1]);
      try {
        localStorage.setItem('alesha_device_id', cachedDeviceId);
      } catch (_) {}
      return cachedDeviceId;
    }
  } catch (_) {}

  // 3. Extract Hardware & Canvas Fingerprints
  let gpuInfo = '';
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) {
        const vendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || '';
        const renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '';
        gpuInfo = `${vendor}~${renderer}`;
      }
    }
  } catch (_) {}

  let canvasSig = '';
  try {
    const c = document.createElement('canvas');
    c.width = 220;
    c.height = 36;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = "14px 'Arial', sans-serif";
      ctx.fillStyle = '#f60';
      ctx.fillRect(120, 1, 60, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('SinauAleshaAI,2026', 2, 12);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('SinauAleshaAI,2026', 4, 14);
      canvasSig = c.toDataURL();
    }
  } catch (_) {}

  const cores = navigator.hardwareConcurrency || 4;
  const memory = (navigator as any).deviceMemory || 8;
  const scr = `${window.screen?.width || 0}x${window.screen?.height || 0}x${window.screen?.colorDepth || 24}x${window.devicePixelRatio || 1}`;
  const tz = Intl?.DateTimeFormat?.().resolvedOptions?.().timeZone || 'Asia/Jakarta';
  const platform = navigator.platform || '';

  const rawFeatures = `${gpuInfo}|${canvasSig.slice(-80)}|${cores}|${memory}|${scr}|${tz}|${platform}`;
  const hash = await hashString(rawFeatures);
  const deviceId = `dev_${hash}`;

  cachedDeviceId = deviceId;

  // Persist to localStorage and cookie (1 year expiry)
  try {
    localStorage.setItem('alesha_device_id', deviceId);
  } catch (_) {}

  try {
    document.cookie = `alesha_device_id=${encodeURIComponent(deviceId)}; path=/; max-age=31536000; SameSite=Lax`;
  } catch (_) {}

  return deviceId;
}
