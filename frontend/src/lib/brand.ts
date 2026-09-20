/** Builds a 50–900 ramp from one hex color and writes brand CSS variables at runtime. */
function hexToHsl(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [174, 84, 26];
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0; const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h = Math.round(h * 60); if (h < 0) h += 360;
  }
  return [h, Math.round(s * 100), Math.round(l * 100)];
}
const hsl = (h: number, s: number, l: number) => `hsl(${h} ${s}% ${l}%)`;

export function applyBrand(primary?: string | null, accent?: string | null) {
  const root = document.documentElement;
  const [h, s] = hexToHsl(primary || '#0f766e');
  const ramp: Record<string, number> = { 50: 97, 100: 92, 200: 84, 300: 72, 400: 58, 500: 46, 600: 38, 700: 31, 800: 25, 900: 19 };
  for (const [k, l] of Object.entries(ramp)) root.style.setProperty(`--brand-${k}`, hsl(h, Math.min(s, 85), l));
  const [ah, as] = hexToHsl(accent || '#f59e0b');
  root.style.setProperty('--accent-400', hsl(ah, as, 60));
  root.style.setProperty('--accent-500', hsl(ah, as, 50));
  root.style.setProperty('--accent-600', hsl(ah, as, 42));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', primary || '#0f766e');
}

export function applyTheme(theme: 'system' | 'light' | 'dark') {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}
