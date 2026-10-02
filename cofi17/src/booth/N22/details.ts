import type { Stand } from '../../map/parse';
import { boothConfig } from './config';
import { openSampleViewer } from '../C17-C18/viewer';

export function createBoothDetails(_stand: Stand): HTMLElement {
  const section = document.createElement('section');
  section.className = 'booth-details';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'booth-info-link';
  button.textContent = 'Xem sample';
  button.setAttribute('aria-label', `Xem ${boothConfig.samples.length} sample của gian N22`);
  button.addEventListener('click', () => openSampleViewer({
    boothLabel: boothConfig.code,
    boothName: boothConfig.name,
    samples: boothConfig.samples.map((sample, index) => ({
      url: sample.full,
      title: sample.title,
      fileName: `N22-${index + 1}.webp`,
    })),
  }));
  section.append(button);
  return section;
}
