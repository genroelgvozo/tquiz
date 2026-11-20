import type { Theme } from "./types.ts";

export const DEFAULT_THEME: Theme = { bg: "#FBF5EA", text: "#2B2420", accent: "#E2552F", second: "#2F7FA8" };

export const THEME_PRESETS: { id: "cream" | "mint" | "lavender" | "night"; name: string; theme: Theme }[] = [
  { id: "cream", name: "Сливки", theme: DEFAULT_THEME },
  { id: "mint", name: "Мята", theme: { bg: "#EEF6F1", text: "#17302A", accent: "#0E9F74", second: "#F0A202" } },
  { id: "lavender", name: "Лаванда", theme: { bg: "#F4F1FB", text: "#241D40", accent: "#6B48E0", second: "#E8467C" } },
  { id: "night", name: "Ночь", theme: { bg: "#16192B", text: "#F3F1EA", accent: "#FF8A5B", second: "#5CC8C2" } },
];

function parse(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// Linear interpolation in sRGB: t=0 gives a, t=1 gives b.
export function mix(a: string, b: string, t: number): string {
  const ca = parse(a);
  const cb = parse(b);
  return (
    "#" +
    ca
      .map((v, i) =>
        Math.round(v + (cb[i] - v) * t)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

function luminance(hex: string): number {
  const [r, g, b] = parse(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// WCAG contrast ratio.
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function onAccent(accent: string, bg: string): string {
  return contrast(accent, "#ffffff") >= contrast(accent, bg) ? "#ffffff" : bg;
}

export function themeVars(theme: Theme): Record<string, string> {
  const { bg, text, accent, second } = theme;
  const light = luminance(bg) > 0.5;
  const [r, g, b] = parse(text);
  return {
    "--bg": bg,
    "--text": text,
    "--accent": accent,
    "--second": second,
    "--surface": light ? mix(bg, "#ffffff", 0.75) : mix(bg, text, 0.08),
    "--muted": mix(text, bg, 0.45),
    "--line": mix(bg, text, 0.12),
    "--accent-dim": mix(bg, accent, 0.25),
    "--second-dim": mix(bg, second, 0.25),
    "--on-accent": onAccent(accent, bg),
    "--shadow": light ? `rgb(${r} ${g} ${b} / 0.08)` : "rgb(0 0 0 / 0.25)",
  };
}

export function presetOf(theme: Theme): string | null {
  const same = (x: string, y: string) => x.toLowerCase() === y.toLowerCase();
  const hit = THEME_PRESETS.find(
    (p) =>
      same(p.theme.bg, theme.bg) &&
      same(p.theme.text, theme.text) &&
      same(p.theme.accent, theme.accent) &&
      same(p.theme.second, theme.second),
  );
  return hit ? hit.id : null;
}
