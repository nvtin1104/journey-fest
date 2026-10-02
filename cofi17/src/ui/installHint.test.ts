import { describe, expect, it } from 'vitest';
import { installHint } from './installHint';

const iPhone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const iPadDesktopUa = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const facebook = `${android} [FB_IAB/FB4A;FBAV/480.0.0.0;]`;

describe('installHint', () => {
  it('tells iPhone and iPad visitors to use Share → Add to Home Screen', () => {
    expect(installHint({ ua: iPhone, platform: 'iPhone', maxTouchPoints: 5, standalone: false })).toBe('ios');
    expect(installHint({ ua: iPadDesktopUa, platform: 'MacIntel', maxTouchPoints: 5, standalone: false })).toBe('ios');
  });

  it('shows nothing once the app runs from the home screen', () => {
    expect(installHint({ ua: iPhone, platform: 'iPhone', maxTouchPoints: 5, standalone: true })).toBeNull();
  });

  it('leaves Android Chrome and real Macs to the browser prompt', () => {
    expect(installHint({ ua: android, platform: 'Linux armv8l', maxTouchPoints: 5, standalone: false })).toBeNull();
    expect(installHint({ ua: iPadDesktopUa, platform: 'MacIntel', maxTouchPoints: 0, standalone: false })).toBeNull();
  });

  it('asks visitors in an in-app browser to open a real browser', () => {
    expect(installHint({ ua: facebook, platform: 'Linux armv8l', maxTouchPoints: 5, standalone: false })).toBe('in-app');
  });
});
