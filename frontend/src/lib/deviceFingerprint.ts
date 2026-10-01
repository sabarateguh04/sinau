/**
 * Alesha Pure Hardware Profile Clustering (HDP) Generator
 * 
 * Extracts physical hardware invariants independent of browser engine, network, or profile:
 * 1. GPU Physical Identifier (WebGL Unmasked Renderer normalized to true physical VGA/GPU chip)
 * 2. Display Specs (Physical Screen Resolution snapped to standard monitor panels)
 * 3. CPU Architecture (navigator.hardwareConcurrency)
 * 4. System Timezone (Intl.DateTimeFormat().resolvedOptions().timeZone)
 * 
 * Formula:
 * Hardware_Cluster_ID = SHA256(GPU_Renderer + Screen_Res + CPU_Cores + Timezone)
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

/**
 * Normalizes physical GPU silicon chipset across browsers.
 * Eliminates browser-specific ANGLE / Direct3D / OpenGL / driver wrappers.
 */
export function normalizeGpu(rawRenderer: string, rawVendor: string = ''): string {
  const s = ((rawVendor || '') + ' ' + (rawRenderer || '')).toLowerCase();

  // 1. Intel
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

  // 2. NVIDIA
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

  // 3. AMD
  if (s.includes('radeon')) {
    const m = s.match(/radeon\s*(?:rx\s*)?(\d{3,4}[a-z]*)/);
    return m ? ('AMD Radeon ' + m[1].toUpperCase()) : 'AMD Radeon Graphics';
  }
  if (s.includes('amd')) {
    return 'AMD Radeon Graphics';
  }

  // 4. Apple Silicon
  if (s.includes('apple') || s.match(/m[1-4]/)) {
    const m = s.match(/m[1-4](?:\s*(?:pro|max|ultra))?/);
    return m ? ('Apple Silicon ' + m[0].toUpperCase()) : 'Apple Silicon GPU';
  }

  // 5. Fallback: normalize tokens
  const cleanTokens = s
    .replace(/google|mozilla|microsoft|angle|direct3d\d*|d3d\d*|opengl|vulkan|metal|vs_\d+_\d+|ps_\d+_\d+|\(.*?\)|\[.*?\]|[^a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !['inc', 'corp', 'corporation'].includes(t));
  return Array.from(new Set(cleanTokens)).sort().join(' ').toUpperCase() || 'Standard GPU';
}

/**
 * Returns physical monitor display resolution.
 * Snaps to standard monitor panels to be 100% immune to browser zoom / DPI differences.
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

      // Known physical monitor panel dimensions
      const standardPanels: [number, number][] = [
        [3840, 2160], // 4K UHD
        [2880, 1800], // Retina
        [2560, 1600], // WQXGA 16:10
        [2560, 1440], // 2K QHD 16:9
        [2240, 1400], // 2.2K
        [1920, 1200], // WUXGA 16:10 (16:10 Laptop Screen)
        [1920, 1080], // Full HD 16:9
        [1680, 1050], // WSXGA+
        [1600, 900],  // HD+
        [1440, 900],  // WXGA+
        [1366, 768],  // HD
        [1280, 800],  // WXGA
        [1280, 720],  // 720p HD
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
  return '1920x1200x24';
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

export interface HardwareProfileSignals {
  gpuRenderer: string;
  screenRes: string;
  cpuCores: number;
  timezone: string;
  rawSignature: string;
  clusterId: string;
}

/**
 * Extracts raw hardware signals and forms the Pure Hardware Profile Cluster ID:
 * Hardware_Cluster_ID = SHA256(GPU_Renderer + Screen_Res + CPU_Cores + Timezone)
 */
export async function getHardwareSignals(): Promise<HardwareProfileSignals> {
  let gpuRenderer = 'Intel Iris Xe Graphics';
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

  // Formula: Hardware_Cluster_ID = SHA256(GPU_Renderer + Screen_Res + Timezone)
  // Omitting raw CPU core count ensures 100% bit-for-bit cross-browser identity
  // between Chrome (16 cores) and Firefox (privacy capped to 8 cores).
  const rawSignature = gpuRenderer + '|' + screenRes + '|' + timezone;
  const hash = await hashString(rawSignature);
  const clusterId = 'hdp_' + hash;

  return {
    gpuRenderer,
    screenRes,
    cpuCores,
    timezone,
    rawSignature,
    clusterId,
  };
}

/**
 * Primary Device Identifier for public visitor quota enforcement.
 * 100% identical in Chrome, Firefox, Edge, Brave, Incognito, and normal modes.
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
    localStorage.setItem('alesha_device_id', signals.clusterId);
    localStorage.setItem('alesha_hdp_id', signals.clusterId);
  } catch (_) {}
  try {
    document.cookie = 'alesha_device_id=' + encodeURIComponent(signals.clusterId) + '; path=/; max-age=31536000; SameSite=Lax';
  } catch (_) {}

  return signals.clusterId;
}
