/**
 * Alesha Pure Hardware Profile Clustering (HDP) Generator
 * 
 * Extracts physical hardware invariants independent of browser engine, network, or profile:
 * 1. Device Category (Desktop vs Mobile vs Tablet)
 * 2. GPU Physical Identifier (WebGL Unmasked Renderer normalized to true physical chip)
 * 3. Display Specs (Physical Screen Resolution snapped to standard monitor/phone panels)
 * 4. Micro-Canvas 2D Fingerprint (Subpixel GPU/anti-aliasing silicon rasterization)
 * 5. Micro-AudioContext Fingerprint (OfflineAudioContext DynamicsCompressor DSP math)
 * 6. System Timezone (Intl.DateTimeFormat().resolvedOptions().timeZone)
 * 
 * Formula:
 * Hardware_Cluster_ID = SHA256(Category + GPU + Screen_Res + Canvas_Hash + Audio_Hash + Timezone)
 */

let cachedClusterId: string | null = null;

// Pure JS SHA-256 for 100% deterministic bit-for-bit hashing across all environments
function sha256Sync(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;
  let hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;
  const isComposite: { [key: number]: boolean } = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) {
        isComposite[i] = true;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  hash = hash.slice(0, 8);
  ascii += '\x80';
  while ((ascii.length % 64) - 56) ascii += '\x00';
  for (let i = 0; i < ascii.length; i++) {
    const j = ascii.charCodeAt(i);
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;
  for (let j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash;
    hash = hash.slice(0, 8);
    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const a = hash[0], e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);
      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
    }
    for (let i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }
  let result = '';
  for (let i = 0; i < 8; i++) {
    for (let j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

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
  return sha256Sync(str).slice(0, 24);
}

export type DeviceCategory = 'desktop' | 'mobile' | 'tablet';

/**
 * Accurately detects whether visitor access is from a PC/Desktop or Mobile Phone / Tablet.
 */
export function getDeviceCategory(): DeviceCategory {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = (navigator.userAgent || '').toLowerCase();
  const maxTouch = navigator.maxTouchPoints || 0;

  // Tablets
  if (ua.includes('ipad') || (ua.includes('macintosh') && maxTouch > 1)) {
    return 'tablet';
  }
  if (ua.includes('android') && !ua.includes('mobile')) {
    return 'tablet';
  }

  // Mobile phones
  if (
    ua.includes('mobile') ||
    ua.includes('iphone') ||
    ua.includes('ipod') ||
    ua.includes('android') ||
    ua.includes('blackberry') ||
    ua.includes('windows phone')
  ) {
    return 'mobile';
  }

  // Screen-size fallback for touch devices
  if (maxTouch > 0 && typeof window !== 'undefined' && window.screen) {
    const w = window.screen.width || 0;
    const h = window.screen.height || 0;
    if (Math.min(w, h) <= 600) {
      return 'mobile';
    }
  }

  return 'desktop';
}

/**
 * Normalizes physical GPU silicon chipset across browsers.
 * Eliminates browser-specific ANGLE / Direct3D / OpenGL / driver wrappers.
 */
export function normalizeGpu(rawRenderer: string, rawVendor: string = ''): string {
  const s = ((rawVendor || '') + ' ' + (rawRenderer || '')).toLowerCase();

  // 1. Mobile Chips (Qualcomm, ARM Mali, Apple, PowerVR)
  if (s.includes('adreno')) {
    const m = s.match(/adreno\s*(?:\(tm\)\s*)?(\d{3,4}[a-z]*)/);
    return m ? ('Qualcomm Adreno ' + m[1].toUpperCase()) : 'Qualcomm Adreno GPU';
  }
  if (s.includes('mali')) {
    const m = s.match(/mali\s*[-_]?([a-z]?\d{2,4}(?:[-_][a-z0-9]+)?)/);
    return m ? ('ARM Mali ' + m[1].toUpperCase()) : 'ARM Mali GPU';
  }
  if (s.includes('powervr') || s.includes('sgx')) {
    return 'PowerVR GPU';
  }

  // 2. Intel
  if (s.includes('iris') && s.includes('xe')) {
    return 'Intel Iris Xe Graphics';
  }
  if (s.includes('arc')) {
    const m = s.match(/a[357]\d{2}/);
    return m ? ('Intel Arc ' + m[0].toUpperCase()) : 'Intel Arc Graphics';
  }
  if (s.includes('uhd')) {
    const m = s.match(/uhd\s*(?:graphics\s*)?(\d{3})/);
    return m ? ('Intel UHD Graphics ' + m[1]) : 'Intel UHD Graphics';
  }
  if (s.includes('hd graphics')) {
    const m = s.match(/hd\s*(?:graphics\s*)?(\d{3,4})/);
    return m ? ('Intel HD Graphics ' + m[1]) : 'Intel HD Graphics';
  }
  if (s.includes('intel')) {
    return 'Intel Integrated Graphics';
  }

  // 3. NVIDIA
  if (s.includes('rtx')) {
    const m = s.match(/rtx\s*(\d{3,4}(?:\s*ti)?)/);
    return m ? ('NVIDIA GeForce RTX ' + m[1].replace(/\s+/g, ' ').toUpperCase()) : 'NVIDIA GeForce RTX';
  }
  if (s.includes('gtx')) {
    const m = s.match(/gtx\s*(\d{3,4}(?:\s*ti)?)/);
    return m ? ('NVIDIA GeForce GTX ' + m[1].replace(/\s+/g, ' ').toUpperCase()) : 'NVIDIA GeForce GTX';
  }
  if (s.includes('geforce') || s.includes('nvidia')) {
    return 'NVIDIA GeForce Graphics';
  }

  // 4. AMD
  if (s.includes('radeon')) {
    const m = s.match(/radeon\s*(?:rx\s*)?(\d{3,4}[a-z]*)/);
    return m ? ('AMD Radeon ' + m[1].toUpperCase()) : 'AMD Radeon Graphics';
  }
  if (s.includes('amd')) {
    return 'AMD Radeon Graphics';
  }

  // 5. Apple Silicon
  if (s.includes('apple') || s.match(/m[1-4]/)) {
    const m = s.match(/m[1-4](?:\s*(?:pro|max|ultra))?/);
    return m ? ('Apple Silicon ' + m[0].toUpperCase()) : 'Apple Silicon GPU';
  }

  // 6. Fallback: normalize tokens
  const cleanTokens = s
    .replace(/google|mozilla|microsoft|angle|direct3d\d*|d3d\d*|opengl|vulkan|metal|vs_\d+_\d+|ps_\d+_\d+|\(.*?\)|\[.*?\]|[^a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !['inc', 'corp', 'corporation'].includes(t));
  return Array.from(new Set(cleanTokens)).sort().join(' ').toUpperCase() || 'Standard GPU';
}

/**
 * Returns physical monitor / screen display resolution.
 * Snaps to standard monitor & mobile panels to remain immune to browser zoom / DPI differences.
 */
export function getPhysicalScreen(): string {
  try {
    if (typeof window !== 'undefined' && window.screen) {
      const dpr = window.devicePixelRatio || 1;
      const rawW = window.screen.width || 0;
      const rawH = window.screen.height || 0;

      let pW = Math.round(rawW * dpr);
      let pH = Math.round(rawH * dpr);

      if (rawW >= 1920 && dpr === 1) {
        pW = rawW;
        pH = rawH;
      }

      let maxDim = Math.max(pW, pH);
      let minDim = Math.min(pW, pH);

      // Known physical monitor & mobile display panel dimensions
      const standardPanels: [number, number][] = [
        // Desktop & Laptop Panels
        [3840, 2160], // 4K UHD
        [2880, 1800], // Retina 15/16
        [2560, 1600], // WQXGA 16:10
        [2560, 1440], // 2K QHD 16:9
        [2240, 1400], // 2.2K
        [1920, 1200], // WUXGA 16:10
        [1920, 1080], // Full HD 16:9
        [1680, 1050], // WSXGA+
        [1600, 900],  // HD+
        [1440, 900],  // WXGA+
        [1366, 768],  // HD Standard
        [1280, 800],  // WXGA
        [1280, 720],  // 720p HD

        // Mobile Phone Panels (Max x Min)
        [2796, 1290], // iPhone Pro Max (14/15/16)
        [2556, 1179], // iPhone Pro (14/15/16)
        [2532, 1170], // iPhone 12/13/14
        [2400, 1080], // Android FHD+ (20:9)
        [2340, 1080], // Android FHD+ (19.5:9)
        [1792, 828],  // iPhone 11 / XR
        [1600, 720],  // Android HD+ (20:9)
        [1334, 750],  // iPhone SE / 8
      ];

      for (const [sW, sH] of standardPanels) {
        if (Math.abs(maxDim - sW) / sW < 0.08 && Math.abs(minDim - sH) / sH < 0.08) {
          maxDim = sW;
          minDim = sH;
          break;
        }
      }

      return String(maxDim) + 'x' + String(minDim) + 'x24';
    }
  } catch (_) {}
  return '1920x1080x24';
}

export function getCpuCores(): number {
  try {
    if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
      return navigator.hardwareConcurrency;
    }
  } catch (_) {}
  return 8;
}

export function getTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jakarta';
  } catch (_) {}
  return 'Asia/Jakarta';
}

/**
 * Micro-Canvas 2D Fingerprint:
 * Extracts subpixel GPU & font anti-aliasing characteristic.
 * 100% identical between Chrome & Edge on the same machine, but differs across distinct hardware/graphics chipsets.
 */
export function getCanvasFingerprint(): string {
  try {
    if (typeof document === 'undefined') return 'cvs_none';
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 60;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'cvs_no_ctx';

    // Multi-font text with colored background and emoji
    ctx.textBaseline = 'top';
    ctx.font = "14px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillStyle = '#f60';
    ctx.fillRect(120, 1, 65, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('Alesha AI SINAU 🚀 🌟 12345', 2, 14);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('Platform Pintar Sekolah & Kursus', 4, 36);

    // Multi-color gradient stroke arc
    const grad = ctx.createLinearGradient(0, 0, 240, 0);
    grad.addColorStop(0, '#ff0055');
    grad.addColorStop(0.5, '#00ccff');
    grad.addColorStop(1, '#00ff66');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(50, 45, 12, 0, Math.PI * 2, true);
    ctx.stroke();

    return sha256Sync(canvas.toDataURL()).slice(0, 16);
  } catch (_) {
    return 'cvs_fallback';
  }
}

/**
 * Micro-AudioContext Fingerprint:
 * Headless, silent floating-point DSP dynamics compression.
 * Executed via OfflineAudioContext in 15-25ms.
 */
export async function getAudioFingerprint(): Promise<string> {
  try {
    if (typeof window === 'undefined') return 'aud_none';
    const AudioCtx =
      window.OfflineAudioContext ||
      (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    if (!AudioCtx) return 'aud_no_api';

    const context = new AudioCtx(1, 44100, 44100);
    const oscillator = context.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.value = 10000;

    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -50;
    compressor.knee.value = 40;
    compressor.ratio.value = 12;
    compressor.attack.value = 0;
    compressor.release.value = 0.25;

    oscillator.connect(compressor);
    compressor.connect(context.destination);
    oscillator.start(0);

    const renderPromise = context.startRendering();
    const timeoutPromise = new Promise<null>((res) => setTimeout(() => res(null), 300));
    const audioBuffer = await Promise.race([renderPromise, timeoutPromise]);

    if (!audioBuffer) return 'aud_timeout';

    const channelData = audioBuffer.getChannelData(0);
    let sum = 0;
    for (let i = 4500; i < 5000; i++) {
      sum += Math.abs(channelData[i]);
    }
    return sha256Sync(String(sum)).slice(0, 16);
  } catch (_) {
    return 'aud_fallback';
  }
}

export interface HardwareProfileSignals {
  deviceCategory: DeviceCategory;
  gpuRenderer: string;
  screenRes: string;
  cpuCores: number;
  timezone: string;
  canvasFingerprint: string;
  audioFingerprint: string;
  rawSignature: string;
  clusterId: string;
}

/**
 * Extracts raw hardware signals and forms the Pure Hardware Profile Cluster ID:
 * Hardware_Cluster_ID = SHA256(Category + GPU + Screen_Res + Canvas + Audio + Timezone)
 */
export async function getHardwareSignals(): Promise<HardwareProfileSignals> {
  const deviceCategory = getDeviceCategory();
  let gpuRenderer = deviceCategory === 'mobile' ? 'Qualcomm Adreno GPU' : 'Intel Integrated Graphics';
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const vendor = dbg ? (gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || '') : (gl.getParameter(gl.VENDOR) || '');
      const renderer = dbg ? (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '') : (gl.getParameter(gl.RENDERER) || '');
      if (renderer || vendor) {
        const norm = normalizeGpu(renderer, vendor);
        if (norm && norm !== 'Standard GPU') {
          gpuRenderer = norm;
        }
      }
    }
  } catch (_) {}

  const screenRes = getPhysicalScreen();
  const cpuCores = getCpuCores();
  const timezone = getTimezone();
  const canvasFingerprint = getCanvasFingerprint();
  const audioFingerprint = await getAudioFingerprint();

  // Signature: Category + GPU + Screen + Canvas + Audio + Timezone
  const rawSignature = `${deviceCategory}|${gpuRenderer}|${screenRes}|${canvasFingerprint}|${audioFingerprint}|${timezone}`;
  const hash = await hashString(rawSignature);
  const clusterId = `hdp_${hash.slice(0, 18)}`;

  return {
    deviceCategory,
    gpuRenderer,
    screenRes,
    cpuCores,
    timezone,
    canvasFingerprint,
    audioFingerprint,
    rawSignature,
    clusterId,
  };
}

/**
 * Primary Device Identifier for public visitor quota enforcement.
 * Deterministic and cross-browser on the same machine without using local storage tokens.
 */
export async function getDeviceId(): Promise<string> {
  if (cachedClusterId) {
    return cachedClusterId;
  }

  if (typeof window === 'undefined') {
    return 'hdp_node_server';
  }

  const signals = await getHardwareSignals();
  cachedClusterId = signals.clusterId;

  try {
    sessionStorage.setItem('alesha_device_id', signals.clusterId);
    sessionStorage.setItem('alesha_hdp_id', signals.clusterId);
  } catch (_) {}

  return signals.clusterId;
}

export interface ClientIps {
  ipv4?: string;
  ipv6?: string;
}

let cachedIps: ClientIps | null = null;
let ipFetchPromise: Promise<ClientIps> | null = null;

/**
 * Discovers and caches the client's public IPv4 and IPv6 addresses.
 * Resolves in parallel with fast timeouts.
 */
export async function getClientIps(): Promise<ClientIps> {
  if (cachedIps && (cachedIps.ipv4 || cachedIps.ipv6)) {
    return cachedIps;
  }
  if (ipFetchPromise) {
    return ipFetchPromise;
  }

  ipFetchPromise = (async () => {
    let ipv4: string | undefined;
    let ipv6: string | undefined;

    // Fetch IPv4 with 2.5s timeout
    const fetchIpv4 = async (): Promise<string | undefined> => {
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 2500);
        const res = await fetch('https://api4.ipify.org?format=json', { signal: ctrl.signal });
        clearTimeout(tid);
        if (res.ok) {
          const data = await res.json();
          if (data && typeof data.ip === 'string') return data.ip.trim();
        }
      } catch (_) {}
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 2000);
        const res = await fetch('https://api.ipify.org?format=json', { signal: ctrl.signal });
        clearTimeout(tid);
        if (res.ok) {
          const data = await res.json();
          if (data && typeof data.ip === 'string') return data.ip.trim();
        }
      } catch (_) {}
      return undefined;
    };

    // Fetch IPv6 with 2.5s timeout
    const fetchIpv6 = async (): Promise<string | undefined> => {
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 2500);
        const res = await fetch('https://api6.ipify.org?format=json', { signal: ctrl.signal });
        clearTimeout(tid);
        if (res.ok) {
          const data = await res.json();
          if (data && typeof data.ip === 'string') return data.ip.trim();
        }
      } catch (_) {}
      return undefined;
    };

    const [v4Res, v6Res] = await Promise.allSettled([fetchIpv4(), fetchIpv6()]);
    if (v4Res.status === 'fulfilled' && v4Res.value) {
      ipv4 = v4Res.value;
    }
    if (v6Res.status === 'fulfilled' && v6Res.value) {
      ipv6 = v6Res.value;
    }

    cachedIps = { ipv4, ipv6 };
    return cachedIps;
  })();

  return ipFetchPromise;
}
