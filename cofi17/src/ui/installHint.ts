/** What the browser exposes about the device; passed in so the decision can be unit tested. */
export interface InstallPlatform {
  ua: string;
  platform: string;
  maxTouchPoints: number;
  /** Already running from the home screen. */
  standalone: boolean;
}

/**
 * Which manual "add to home screen" instructions to show, if any.
 * - `in-app`: in-app browsers (Facebook, Messenger, Instagram, Zalo…) cannot install web apps.
 * - `ios`: Safari has no install prompt; the visitor uses Share → Add to Home Screen.
 * Chrome, Edge and Samsung Internet fire `beforeinstallprompt` instead, handled in pwa.ts.
 */
export function installHint(p: InstallPlatform): 'ios' | 'in-app' | null {
  if (p.standalone) return null;
  if (/FBAN|FBAV|FB_IAB|Instagram|Zalo|Line\//i.test(p.ua)) return 'in-app';
  // iPadOS reports itself as a Mac; touch support gives it away.
  const ios = /iPhone|iPad|iPod/.test(p.ua) || (p.platform === 'MacIntel' && p.maxTouchPoints > 1);
  return ios ? 'ios' : null;
}

export const INSTALL_HINT_TEXT = {
  ios: 'Bước này chỉ ghim biểu tượng. Để mở khi mất mạng, hãy mở trang lúc đang có mạng, nhấn biểu tượng tải và chọn “Tải xuống dùng offline”, rồi chờ báo đã lưu.',
  'in-app': 'Đang mở trong ứng dụng khác. Mở trang bằng Safari hoặc Chrome để cài bản đồ vào màn hình chính.',
} as const;
