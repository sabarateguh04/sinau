/**
 * Alesha Cross-Browser Hardware Device Fingerprint Generator
 * 
 * Generates a deterministic hardware signature that is 100% IDENTICAL across:
 * - Google Chrome
 * - Microsoft Edge
 * - Brave / Opera / Chromium browsers
 * - Incognito / InPrivate windows
 * - Browser cache & cookie resets
 * 
 * Uses ONLY hardware-level invariants:
 * 1. Normalized Physical GPU Chipset Name (stripped of browser ANGLE wrappers/driver builds)
 * 2. WebGL Hardware Capability Registers (integer limits on GPU silicon)
 * 3. Physical Screen Resolution & Color Depth
 * 4. Hardware CPU Thread Concurrency
 * 5. Timezone & OS Platform
 * 
 * Strictly avoids browser-specific rasterization quirks (e.g. Edge DirectWrite vs Chrome Skia text anti-aliasing)
 * so that switching browsers on the same machine CANNOT bypass visitor quotas.
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

function normalizeGpu(rawRenderer: string, rawVendor: string): string {
  let s = `${rawVendor} ${rawRenderer}`;
  // Strip ANGLE wrappers
  s = s.replace(/^ANGLE\s*\(/i, '').replace(/Google Inc\.\s*\(/i, '');
  // Strip Direct3D / OpenGL / Vulkan / shader version strings
  s = s.replace(/\b(Direct3D\d*|OpenGL|Vulkan|Metal|vs_\d+_\d+|ps_\d+_\d+|D3D\d+)[^,)]*/gi, '');
  // Strip PCI / device ID parentheticals like (0x00002504)
  s = s.replace(/\(0x[0-9a-fA-F]+\)/gi, '');
  s = s.replace(/\(.*?\)/g, '');
  // Strip driver build numbers e.g. 31.0.15.5222
  s = s.replace(/\b\d+\.\d+\.\d+\.\d+\b/g, '');
  s = s.replace(/[,()]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();

  // Deduplicate consecutive repeated words (e.g. 'NVIDIA NVIDIA GeForce' -> 'NVIDIA GeForce')
  const words = s.split(' ');
  const dedup: string[] = [];
  for (const w of words) {
    if (!dedup.length || dedup[dedup.length - 1].toLowerCase() !== w.toLowerCase()) {
      dedup.push(w);
    }
  }
  return dedup.join(' ').toLowerCase();
}

export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) {
    return cachedDeviceId;
  }

  if (typeof window === 'undefined') {
    return 'dev_node_server';
  }

  // Extract WebGL Hardware Profile
  let gpuClean = 'generic_gpu';
  let webglLimits = '0,0,0,0,0,0';
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const vendor = dbg ? (gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || '') : '';
      const renderer = dbg ? (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '') : '';
      gpuClean = normalizeGpu(renderer, vendor);

      // Read physical hardware registers
      const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0;
      const maxCube = gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE) || 0;
      const maxRender = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || 0;
      const maxVary = gl.getParameter(gl.MAX_VARYING_VECTORS) || 0;
      const maxFrag = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) || 0;
      const maxVert = gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS) || 0;
      webglLimits = `${maxTex},${maxCube},${maxRender},${maxVary},${maxFrag},${maxVert}`;
    }
  } catch (_) {}

  // CPU physical threads
  const cores = navigator.hardwareConcurrency || 4;

  // Screen physical dimensions (monitor hardware specs)
  const scr = `${window.screen?.width || 0}x${window.screen?.height || 0}x${window.screen?.colorDepth || 24}`;

  // Timezone (OS level setting)
  let tz = 'Asia/Jakarta';
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jakarta';
  } catch (_) {}

  // OS Platform family (clean to Windows / Mac / Linux / Android / iOS)
  let osFamily = 'win';
  const navPlat = (navigator.platform || '').toLowerCase();
  const ua = (navigator.userAgent || '').toLowerCase();
  if (navPlat.includes('win') || ua.includes('windows')) osFamily = 'win';
  else if (navPlat.includes('mac') || ua.includes('macintosh')) osFamily = 'mac';
  else if (ua.includes('android')) osFamily = 'android';
  else if (navPlat.includes('iphone') || navPlat.includes('ipad') || ua.includes('iphone')) osFamily = 'ios';
  else if (navPlat.includes('linux') || ua.includes('linux')) osFamily = 'linux';

  // Construct raw hardware features string - STRICTLY BROWSER-AGNOSTIC
  const rawHardware = `hw|${gpuClean}|${webglLimits}|${cores}|${scr}|${tz}|${osFamily}`;
  const hash = await hashString(rawHardware);
  const deviceId = `dev_${hash}`;

  cachedDeviceId = deviceId;

  // Store in localStorage & Cookie as fast cache
  try {
    localStorage.setItem('alesha_device_id', deviceId);
  } catch (_) {}
  try {
    document.cookie = `alesha_device_id=${encodeURIComponent(deviceId)}; path=/; max-age=31536000; SameSite=Lax`;
  } catch (_) {}

  return deviceId;
}
