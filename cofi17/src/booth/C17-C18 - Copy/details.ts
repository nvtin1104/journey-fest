import type { Stand } from '../../map/parse';
import { boothConfig } from './config';
import { openSampleViewer } from './viewer';

export function createBoothDetails(_stand: Stand): HTMLElement {
  const section = document.createElement('section');
  section.className = 'booth-details';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'booth-info-link';
  button.setAttribute('aria-label', 'Xem ảnh mẫu sản phẩm của gian C17–C18');
  button.textContent = 'Xả kho đi Úc';
  button.addEventListener('click', () => openSampleViewer());
  section.append(button);
  for (const link of boothConfig.links) {
    const anchor = document.createElement('a');
    anchor.className = 'booth-info-link';
    anchor.href = link.url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.textContent = 'Open link';
    anchor.setAttribute('aria-label', link.label);
    section.append(anchor);
  }
  return section;
}

