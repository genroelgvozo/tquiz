import { useHotkeys, type HotkeyItem } from "@mantine/hooks";

/** Drop focus from a clicked button or chip so Space/Enter does not press it again. */
export function blurActive(): void {
  const el = document.activeElement;
  if (el instanceof HTMLElement && (el.tagName === "BUTTON" || (el instanceof HTMLInputElement && el.type === "checkbox"))) el.blur();
}

/**
 * Console hotkeys. Keys are physical (work on any keyboard layout): "space", "equal", "shift+equal",
 * "numpadadd", "minus", "numpadsubtract", "escape", "arrowleft", "arrowright", "mod+z".
 * A null handler turns the key off. Keys do nothing while typing in a field (Mantine skips
 * INPUT/TEXTAREA/SELECT), while a dialog or menu is open, or on autorepeat of a held key.
 */
export function useConsoleHotkeys(bindings: [key: string, handler: (() => void) | null][]): void {
  const items: HotkeyItem[] = [];
  for (const [key, handler] of bindings) {
    if (!handler) continue;
    items.push([
      key,
      (e: KeyboardEvent) => {
        // a held key repeats: holding → would run through questions, holding − would judge the next team too
        if (e.repeat) return;
        if (document.querySelector('[role="dialog"], [role="menu"]')) return;
        blurActive();
        handler();
      },
      { preventDefault: true, usePhysicalKeys: true },
    ]);
  }
  useHotkeys(items);
}
