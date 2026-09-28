/** Per-viewer preferences in localStorage. Storage can be unavailable (private mode), so every access is guarded. */
export function loadPref(key: string): string | null {
  try {
    return window.localStorage.getItem(`journey-fest:${key}`);
  } catch {
    return null;
  }
}

export function savePref(key: string, value: string) {
  try {
    window.localStorage.setItem(`journey-fest:${key}`, value);
  } catch {
    // Ignore: preferences are a convenience only.
  }
}
