import { boothConfig } from './config';

export interface SampleViewerOptions {
  url?: string;
  boothLabel?: string;
  boothName?: string;
  fileName?: string;
  samples?: readonly { url: string; title?: string; fileName?: string }[];
  initialIndex?: number;
}

export function openSampleViewer(options: SampleViewerOptions = {}) {
  const boothLabel = options.boothLabel ?? boothConfig.code;
  const boothName = options.boothName ?? boothConfig.name;
  const samples = options.samples?.length
    ? options.samples
    : [{ url: options.url ?? boothConfig.assets.sample, fileName: options.fileName }];
  let sampleIndex = ((options.initialIndex ?? 0) % samples.length + samples.length) % samples.length;
  const dialog = document.createElement('dialog');
  dialog.className = 'poster-modal';
  dialog.setAttribute('aria-label', `Ảnh mẫu ${boothLabel}`);
  const header = document.createElement('div');
  header.className = 'poster-header';
  const title = document.createElement('strong');
  title.textContent = `Ảnh mẫu · ${boothLabel}`;
  const download = document.createElement('a');
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
  image.alt = `Ảnh mẫu · ${boothName}`;
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
  const previous = document.createElement('button');
  previous.type = 'button';
  previous.className = 'poster-nav prev';
  previous.textContent = '‹';
  previous.setAttribute('aria-label', 'Sample trước');
  previous.hidden = samples.length < 2;
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'poster-nav next';
  next.textContent = '›';
  next.setAttribute('aria-label', 'Sample tiếp theo');
  next.hidden = samples.length < 2;
  const showSample = (index: number) => {
    sampleIndex = (index + samples.length) % samples.length;
    const sample = samples[sampleIndex];
    image.src = sample.url;
    image.alt = `Ảnh mẫu ${sample.title ?? ''} · ${boothName}`;
    download.href = sample.url;
    download.download = sample.fileName ?? options.fileName ?? 'C17-C18-sample.webp';
    title.textContent = samples.length > 1
      ? `Ảnh mẫu · ${boothLabel} · ${sampleIndex + 1}/${samples.length}`
      : `Ảnh mẫu · ${boothLabel}`;
    x = y = 0;
    zoom = 1;
    apply();
  };
  previous.addEventListener('click', () => showSample(sampleIndex - 1));
  next.addEventListener('click', () => showSample(sampleIndex + 1));
  image.onload = apply;
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
  stage.append(image, previous, next, bar);
  dialog.append(header, stage);
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.showModal();
  showSample(sampleIndex);
}
