import { initCalendar } from './calendar';
import { initCountdown } from './countdown';
import { initMap, initNav, initShare } from './ui';

initNav();
initCountdown();
initCalendar();
initMap();
initShare();

// Motion is loaded on demand and skipped entirely for visitors who prefer reduced motion.
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  import('./animations').then(({ initAnimations }) => initAnimations());
}
