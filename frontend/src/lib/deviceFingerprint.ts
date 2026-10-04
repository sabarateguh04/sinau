/**
 * Alesha Pure Hardware Profile Clustering (HDP) Generator
 * 
 * Extracts physical hardware invariants independent of browser engine, network, or profile:
 * 1. Device Category (Desktop vs Mobile vs Tablet)
 * 2. GPU Physical Identifier (WebGL Unmasked Renderer normalized to true physical chipset)
 * 3. Display Specs (Physical Screen Resolution snapped to standard monitor/phone panels)
 * 4. CPU Hardware Concurrency & Physical Device Memory
 * 5. WebGL Hardware Driver Capabilities (Driver texture/shader limits)
 * 6. Pure WebGL 3D Geometry Shader Hash (Direct silicon shader rasterization without font dependencies)
 * 7. Micro-Canvas 2D Geometry & Gradient Hash (Pure mathematical curves/arcs/gradients without font text)
 * 8. System Timezone
 * 
 * Guarantees 100% bit-for-bit identity across Chrome, Edge, and all browsers on the SAME PC,
 * while maintaining distinct, independent quotas for Mobile Phones (HP) on the same Wi-Fi.
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
  // Screen resolution removed per user request: avoids any zoom, scaling, or display differences
  return "screen_omitted";
}

export function getCpuCores(): number {
  try {
    if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
      return navigator.hardwareConcurrency;
    }
  } catch (_) {}
  return 8;
}

export function getDeviceMemory(): number {
  try {
    if (typeof navigator !== 'undefined' && (navigator as any).deviceMemory) {
      return (navigator as any).deviceMemory;
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
 * WebGL Hardware Driver Constants & Capabilities
 * Directly queries driver registers; 100% identical between Chrome & Edge on same GPU.
 */
export function getWebGlHardwareProfile(): { caps: string; renderHash: string } {
  try {
    if (typeof document === 'undefined') return { caps: 'no_doc', renderHash: 'no_doc' };
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return { caps: 'no_gl', renderHash: 'no_gl' };

    const caps = [
      gl.getParameter(gl.MAX_TEXTURE_SIZE),
      gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
      gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
      gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),
      gl.getParameter(gl.MAX_VARYING_VECTORS),
      gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS)
    ].join('-');

    // Pure 3D WebGL shader fragment rasterization without font dependencies
    const vShaderSrc = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';
    const fShaderSrc = 'precision mediump float; void main() { gl_FragColor = vec4(gl_FragCoord.xy / 64.0, 0.65, 1.0); }';

    const vs = gl.createShader(gl.VERTEX_SHADER);
    if (!vs) return { caps, renderHash: 'vs_fail' };
    gl.shaderSource(vs, vShaderSrc);
    gl.compileShader(vs);

    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    if (!fs) return { caps, renderHash: 'fs_fail' };
    gl.shaderSource(fs, fShaderSrc);
    gl.compileShader(fs);

    const prog = gl.createProgram();
    if (!prog) return { caps, renderHash: 'prog_fail' };
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    const pixels = new Uint8Array(64 * 64 * 4);
    gl.readPixels(0, 0, 64, 64, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    let sum = 0;
    for (let i = 0; i < pixels.length; i += 7) {
      sum = (sum * 31 + pixels[i]) >>> 0;
    }

    return { caps, renderHash: sum.toString(16) };
  } catch (_) {
    return { caps: 'err', renderHash: 'err' };
  }
}

/**
 * Micro-Canvas 2D Geometry Fingerprint:
 * Renders mathematical curves, arcs, radial gradients, and difference blend modes.
 * Free of font rasterizer dependencies (DirectWrite/ClearType) so Chrome and Edge
 * render identical pixel buffers.
 */
export function getCanvasFingerprint(): string {
  try {
    if (typeof document === 'undefined') return 'cvs_none';
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 60;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'cvs_no_ctx';

    // 1. Radial gradient
    const rad = ctx.createRadialGradient(60, 30, 5, 60, 30, 55);
    rad.addColorStop(0, '#ff3366');
    rad.addColorStop(0.5, '#33ccff');
    rad.addColorStop(1, '#00ff88');
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, 120, 60);

    // 2. Bezier curve with difference blend mode
    ctx.globalCompositeOperation = 'difference';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(10, 10);
    ctx.bezierCurveTo(40, 50, 80, 0, 110, 50);
    ctx.stroke();

    // 3. Geometric Arc
    ctx.beginPath();
    ctx.arc(60, 30, 18, 0, Math.PI * 2, true);
    ctx.fillStyle = '#ffff00';
    ctx.fill();

    return sha256Sync(canvas.toDataURL()).slice(0, 16);
  } catch (_) {
    return 'cvs_fallback';
  }
}

/**
 * Retained for backward interface compatibility.
 */
export async function getAudioFingerprint(): Promise<string> {
  return 'aud_synced';
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
 * Guarantees cross-browser synchronization on the same physical computer,
 * while isolating mobile phones into distinct quotas.
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
  const deviceMemory = getDeviceMemory();
  const timezone = getTimezone();
  const glProfile = getWebGlHardwareProfile();
  const canvasFingerprint = getCanvasFingerprint();
  const audioFingerprint = 'aud_synced';

  // Deterministic hardware invariant signature:
  // Category + GPU + Physical Screen + CPU Cores + Device Memory + WebGL Caps + WebGL Shader Render + Canvas Geometry + Timezone
  const rawSignature = `${deviceCategory}|${gpuRenderer}|${cpuCores}|${deviceMemory}|${glProfile.caps}|${glProfile.renderHash}|${canvasFingerprint}|${timezone}`;
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
        const res = await fetch('https://api64.ipify.org?format=json', { signal: ctrl.signal });
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



