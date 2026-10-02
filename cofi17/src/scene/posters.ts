import * as THREE from 'three';
import type { ParsedMap } from '../map/parse';
import { toWorldX, toWorldZ, worldRect } from '../map/coords';

const guidePages = [
  { url: '/posters/cofi-timeline.png', title: 'Cẩm nang đi COFI · Timeline và lưu ý', tab: 'Timeline & lưu ý' },
  { url: '/posters/cofi-packing.png', title: 'Cẩm nang đi COFI · Vật dụng nên mang theo', tab: 'Vật dụng mang theo' },
  { url: '/posters/cofi-stage-saturday.png', title: 'Lịch trình sân khấu · Thứ Bảy', tab: 'Thứ Bảy' },
  { url: '/posters/cofi-stage-sunday.png', title: 'Lịch trình sân khấu · Chủ Nhật', tab: 'Chủ Nhật' },
  { url: '/posters/cofi-activities.png', title: 'Lịch trình hoạt động · Cả hai ngày', tab: 'Hoạt động' },
];

/** Entrance guides plus floor-map printouts and an enlarged viewer at the check-in desks. */
export function buildEntrancePosters(map: ParsedMap, onFocus: (position: THREE.Vector3, tabletop: boolean) => void, onReturn: () => void) {
  const mapPages = (map.referenceImages ?? []).map((path, index) => {
    const assetPath = path.startsWith('public/') ? path.slice('public'.length) : path;
    const url = /^https?:\/\//i.test(assetPath) ? assetPath : encodeURI(assetPath.startsWith('/') ? assetPath : `/${assetPath}`);
    return { url, title: `Sơ đồ mặt bằng · Khu vực ${index + 1}`, tab: `Sơ đồ ${index + 1}`, ratio: 3770 / 3650 };
  });
  const pages = [...guidePages.map((page, index) => ({ ...page, ratio: index < 2 ? 434 / 590 : 1392 / 2048 })), ...mapPages];
  const categoryOf = (index: number) => index < 2 ? 'guides' : index < guidePages.length ? 'schedule' : 'map';
  const categoryPages = (index: number) => pages.map((_, i) => i).filter((i) => categoryOf(i) === categoryOf(index));
  const group = new THREE.Group();
  group.name = 'checkin-posters';
  const targets: THREE.Mesh[] = [];
  const checkin = map.zones.find((zone) => /check\s*-?\s*in/i.test(zone.label));
  const door = checkin && map.doors.filter((d) => d.axis === 'h' && d.from >= checkin.rect.x && d.to <= checkin.rect.x + checkin.rect.w).sort((a, b) => b.at - a.at)[0];
  const dialog = document.createElement('dialog');
  dialog.className = 'poster-modal';
  dialog.setAttribute('aria-label', 'Cẩm nang đi COFI');
  const header = document.createElement('div');
  header.className = 'poster-header';
  const title = document.createElement('strong');
  const close = document.createElement('button');
  close.textContent = 'Đóng';
  close.addEventListener('click', () => dialog.close());
  header.append(title, close);
  const image = document.createElement('img');
  const tabs = document.createElement('div');
  tabs.className = 'poster-tabs';
  const tabButtons: HTMLButtonElement[] = [];
  const show = (index: number) => {
    const poster = pages[index];
    if (!poster) return;
    title.textContent = poster.title;
    dialog.setAttribute('aria-label', poster.title);
    image.src = poster.url;
    image.alt = poster.title;
    tabButtons.forEach((button, i) => {
      button.setAttribute('aria-pressed', String(i === index));
      button.hidden = categoryOf(i) !== categoryOf(index);
    });
  };
  pages.forEach((_, index) => {
    const button = document.createElement('button');
    button.textContent = pages[index].tab;
    button.addEventListener('click', () => show(index));
    tabButtons.push(button);
    tabs.append(button);
  });
  dialog.append(header, tabs, image);
  document.body.append(dialog);
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  const loader = new THREE.TextureLoader();
  const textures = pages.map((poster, index) => {
    const texture = index < guidePages.length ? loader.load(poster.url) : new THREE.Texture();
    texture.colorSpace = THREE.SRGBColorSpace;
    if (index >= guidePages.length) {
      // Downsample the large map scans before uploading them to the GPU.
      const source = new Image();
      source.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 990;
        canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);
        texture.image = canvas;
        texture.needsUpdate = true;
      };
      source.src = poster.url;
    }
    return texture;
  });
  const desks = map.props.filter((prop) => prop.kind === 'checkin-desk');
  // Floor maps and the three original schedule sheets belong on the largest desk;
  // smaller desks keep the two original guide sheets.
  const largeDeskIndex = desks.reduce((largest, desk, index) =>
    worldRect(desk.rect).w > worldRect(desks[largest].rect).w ? index : largest, 0);
  desks.forEach((desk, deskIndex) => {
    const { cx, cz, w, d } = worldRect(desk.rect);
    const indices = mapPages.length
      ? deskIndex === largeDeskIndex
        ? [...[2, 3, 4], ...mapPages.map((_, index) => guidePages.length + index)]
        : [0, 1]
      : deskIndex === 0 ? [2, 3, 4] : [0, 1];
    const paperWidth = Math.min(0.44, (w - 0.1) / indices.length - 0.06);
    const paperHeight = Math.min(0.6, d * 0.6, paperWidth / 0.7);
    indices.forEach((index, slot) => {
      const ratio = pages[index].ratio;
      const width = Math.min(paperWidth, paperHeight * ratio);
      const height = width / ratio;
      const x = cx + (slot - (indices.length - 1) / 2) * (paperWidth + 0.08);
      const z = cz + d * 0.2;
      const paper = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: textures[index], side: THREE.DoubleSide }));
      paper.rotation.x = -Math.PI / 2;
      paper.position.set(x, 1.055, z);
      paper.userData.posterIndex = index;
      const backing = new THREE.Mesh(new THREE.BoxGeometry(width + 0.02, 0.012, height + 0.02), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      backing.position.set(x, 1.048, z);
      backing.userData.posterIndex = index;
      group.add(backing, paper);
      targets.push(paper, backing);
    });
  });
  if (door) {
    guidePages.forEach((_, index) => {
      const x = index < 2
        ? toWorldX(door.to) + 0.9 + index * 1.75
        : toWorldX(door.from) - 0.9 - (index - 2) * 1.75;
      const z = toWorldZ(door.at) + 0.18;
      const texture = textures[index];
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.58, 2.1, 0.08), new THREE.MeshBasicMaterial({ color: '#fff6d7' }));
      frame.position.set(x, 1.9, z);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(index < 2 ? 2 * 434 / 590 : 2 * 1392 / 2048, 2), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
      mesh.position.set(x, 1.9, z + 0.05);
      mesh.userData.posterIndex = index;
      group.add(frame, mesh);
      targets.push(mesh);
    });
  }
  const pill = document.createElement('button');
  pill.className = 'mobile-stand-pill poster-nearby';
  pill.hidden = true;
  const panel = document.createElement('div');
  panel.className = 'card poster-inspection';
  let nearby: THREE.Mesh | null = null;
  const closeInspection = () => {
    if (!panel.classList.contains('show')) return;
    panel.classList.remove('show');
    if (dialog.open) dialog.close();
    onReturn();
  };
  const inspect = (mesh: THREE.Object3D) => {
    const index = mesh.userData.posterIndex as number;
    if (!pages[index]) return;
    pill.hidden = true;
    onFocus(mesh.position.clone(), mesh.rotation.x !== 0);
    panel.replaceChildren();
    const head = document.createElement('div');
    head.className = 'card-head';
    const heading = document.createElement('strong');
    heading.textContent = categoryOf(index) === 'guides' ? 'Cẩm nang đi COFI'
      : categoryOf(index) === 'schedule' ? 'Lịch trình sự kiện' : 'Sơ đồ khu vực';
    const dismiss = document.createElement('button');
    dismiss.className = 'card-close';
    dismiss.textContent = '×';
    dismiss.setAttribute('aria-label', 'Đóng và về nhân vật');
    dismiss.addEventListener('click', closeInspection);
    head.append(heading, dismiss);
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    categoryPages(index).forEach((i) => {
      const button = document.createElement('button');
      button.textContent = pages[i].tab;
      button.className = 'act-loc';
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        show(i);
        if (!dialog.open) dialog.showModal();
      });
      actions.append(button);
    });
    panel.append(head, actions);
    panel.classList.add('show');
  };
  pill.addEventListener('click', () => { if (nearby) inspect(nearby); });
  document.getElementById('hud')!.append(pill, panel);
  return {
    group, targets,
    open: (mesh: THREE.Object3D) => {
      inspect(mesh);
      show(mesh.userData.posterIndex as number);
      if (!dialog.open) dialog.showModal();
    },
    inspectNearby: () => { if (!nearby) return false; inspect(nearby); return true; },
    close: closeInspection,
    update: (position: THREE.Vector3, hasInput: boolean, blocked: boolean) => {
      if (hasInput && !dialog.open) closeInspection();
      nearby = null;
      let distance = 3.2;
      for (const mesh of targets) {
        const d = Math.hypot(position.x - mesh.position.x, position.z - mesh.position.z);
        if (d < distance) { distance = d; nearby = mesh; }
      }
      pill.hidden = !nearby || blocked || panel.classList.contains('show') || dialog.open;
      if (nearby) {
        const category = categoryOf(nearby.userData.posterIndex as number);
        pill.textContent = category === 'guides' ? 'Cẩm nang · Chạm để xem'
          : category === 'schedule' ? 'Lịch trình · Chạm để xem' : 'Sơ đồ mặt bằng · Chạm để xem';
      }
    },
  };
}
