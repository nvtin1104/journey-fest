import * as THREE from 'three';
import type { ParsedMap } from '../map/parse';
import { toWorldX, toWorldZ, worldRect } from '../map/coords';

const posters = [
  { url: '/posters/cofi-timeline.png', title: 'Cẩm nang đi COFI · Timeline và lưu ý', tab: 'Timeline & lưu ý' },
  { url: '/posters/cofi-packing.png', title: 'Cẩm nang đi COFI · Vật dụng nên mang theo', tab: 'Vật dụng mang theo' },
  { url: '/posters/cofi-stage-saturday.png', title: 'Lịch trình sân khấu · Thứ Bảy', tab: 'Thứ Bảy' },
  { url: '/posters/cofi-stage-sunday.png', title: 'Lịch trình sân khấu · Chủ Nhật', tab: 'Chủ Nhật' },
  { url: '/posters/cofi-activities.png', title: 'Lịch trình hoạt động · Cả hai ngày', tab: 'Hoạt động' },
];

/** Entrance posters and two readable guide sheets on the first check-in desk. */
export function buildEntrancePosters(map: ParsedMap, onFocus: (position: THREE.Vector3, tabletop: boolean) => void, onReturn: () => void) {
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
    const poster = posters[index];
    if (!poster) return;
    title.textContent = poster.title;
    dialog.setAttribute('aria-label', poster.title);
    image.src = poster.url;
    image.alt = poster.title;
    tabButtons.forEach((button, i) => {
      button.setAttribute('aria-pressed', String(i === index));
      button.hidden = (i < 2) !== (index < 2);
    });
  };
  posters.forEach((_, index) => {
    const button = document.createElement('button');
    button.textContent = posters[index].tab;
    button.addEventListener('click', () => show(index));
    tabButtons.push(button);
    tabs.append(button);
  });
  dialog.append(header, tabs, image);
  document.body.append(dialog);
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  const loader = new THREE.TextureLoader();
  const textures = posters.map((poster) => {
    const texture = loader.load(poster.url);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  });
  const desks = map.props.filter((prop) => prop.kind === 'checkin-desk');
  // Swap the desk collections: schedules on desk one, guides on desk two.
  desks.slice(0, 2).forEach((desk, deskIndex) => {
    const { cx, cz, w, d } = worldRect(desk.rect);
    const indices = deskIndex === 0 ? [2, 3, 4] : [0, 1];
    const paperWidth = Math.min(0.44, (w - 0.1) / indices.length - 0.06);
    const paperHeight = Math.min(0.6, d * 0.6);
    indices.forEach((index, slot) => {
      const height = Math.min(paperHeight, paperWidth * (index < 2 ? 590 / 434 : 2048 / 1392));
      const width = height / (index < 2 ? 590 / 434 : 2048 / 1392);
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
    posters.forEach((_, index) => {
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
    if (!posters[index]) return;
    pill.hidden = true;
    onFocus(mesh.position.clone(), mesh.rotation.x !== 0);
    panel.replaceChildren();
    const head = document.createElement('div');
    head.className = 'card-head';
    const heading = document.createElement('strong');
    heading.textContent = index < 2 ? 'Cẩm nang đi COFI' : 'Lịch trình sự kiện';
    const dismiss = document.createElement('button');
    dismiss.className = 'card-close';
    dismiss.textContent = '×';
    dismiss.setAttribute('aria-label', 'Đóng và về nhân vật');
    dismiss.addEventListener('click', closeInspection);
    head.append(heading, dismiss);
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    (index < 2 ? [0, 1] : [2, 3, 4]).forEach((i) => {
      const button = document.createElement('button');
      button.textContent = posters[i].tab;
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
      if (nearby) pill.textContent = nearby.userData.posterIndex < 2 ? 'Cẩm nang · Chạm để xem' : 'Lịch trình · Chạm để xem';
    },
  };
}
