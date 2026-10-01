import { boothConfig } from './config';

export function openSampleViewer(url = boothConfig.assets.sample) {
  const dialog = document.createElement('dialog');
  dialog.className = 'poster-modal';
  dialog.setAttribute('aria-label', 'Ảnh mẫu C17–C18');
  const header = document.createElement('div');
  header.className = 'poster-header';
  const title = document.createElement('strong');
  title.textContent = 'Ảnh mẫu · C17–C18';
  const download = document.createElement('a');
  download.href = url;
  download.download = 'C17-C18-sample.png';
  download.textContent = 'Tải ảnh';
  download.className = 'sample-download';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Đóng';
  close.onclick = () => dialog.close();
  header.append(title, download, close);
  const stage = document.createElement('div');
  stage.className = 'poster-stage';
  const image = document.createElement('img');
  image.src = url;
  image.alt = `Ảnh mẫu · ${boothConfig.name}`;
  image.draggable = false;
  const bar = document.createElement('div');
  bar.className = 'poster-zoom';
  let zoom = 1, x = 0, y = 0;
  const apply = () => {
    const limitX = Math.max(0, (image.offsetWidth * zoom - stage.clientWidth) / 2);
    const limitY = Math.max(0, (image.offsetHeight * zoom - stage.clientHeight) / 2);
    x = Math.max(-limitX, Math.min(limitX, x));
    y = Math.max(-limitY, Math.min(limitY, y));
    image.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
    image.style.cursor = zoom > 1 ? 'grab' : 'zoom-in';
  };
  const setZoom = (value: number) => { zoom = Math.max(1, Math.min(8, value)); apply(); };
  for (const [label, action] of [
    ['Thu nhỏ', () => setZoom(zoom / 1.4)],
    ['Phóng to', () => setZoom(zoom * 1.4)],
    ['Vừa khung', () => { x = y = 0; setZoom(1); }],
  ] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label === 'Thu nhỏ' ? '−' : label === 'Phóng to' ? '+' : '↺';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.onclick = action;
    bar.append(button);
  }
  stage.addEventListener('wheel', event => { event.preventDefault(); setZoom(zoom * Math.exp(-event.deltaY * 0.002)); }, { passive: false });
  image.addEventListener('dblclick', () => setZoom(zoom === 1 ? 2 : 1));
  const pointers = new Map<number, { x: number; y: number }>();
  stage.addEventListener('pointerdown', event => {
    if ((event.target as HTMLElement).closest('button')) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener('pointermove', event => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const before = [...pointers.values()];
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const after = [...pointers.values()];
      const distance = (points: { x: number; y: number }[]) => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      if (distance(before) > 0) setZoom(zoom * distance(after) / distance(before));
    } else { x += event.clientX - previous.x; y += event.clientY - previous.y; apply(); }
  });
  const release = (event: PointerEvent) => pointers.delete(event.pointerId);
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);
  stage.addEventListener('lostpointercapture', release);
  image.onload = apply;
  stage.append(image, bar);
  dialog.append(header, stage);
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.showModal();
}
