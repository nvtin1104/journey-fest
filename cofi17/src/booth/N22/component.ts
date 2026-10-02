import * as THREE from 'three';
import type { Stand } from '../../map/parse';
import { createAvatar } from '../../player/avatar';
import { standMatrix, standSize } from '../../scene/booths';
import { boothConfig } from './config';

export const N22_STAND_ID = boothConfig.id;

/** Display wall geometry shared with buildBooth (see scene/booths.ts). */
const WALL = { height: 2.3, face: 0.1 };

export function buildN22Booth(stand: Stand) {
  const group = new THREE.Group();
  group.name = 'n22-feature';
  group.matrixAutoUpdate = false;
  group.matrix.copy(standMatrix(stand));
  const { W, D } = standSize(stand);
  const faceZ = -D / 2 + WALL.face;
  const loader = new THREE.TextureLoader();
  const picture = (url: string, width: number, height: number) => {
    const texture = loader.load(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, side: THREE.DoubleSide });
    return new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  };

  // Banner mounted on the display wall, under the name board.
  const bannerHeight = 0.62;
  const bannerWidth = Math.min(W - 0.24, bannerHeight * boothConfig.bannerAspect);
  const banner = picture(boothConfig.banner, bannerWidth, bannerHeight);
  banner.name = 'n22-banner';
  banner.position.set(0, 1.42, faceZ + 0.024);
  group.add(banner);

  // Sample prints hung on the wall in two rows; tapping one opens the full artwork.
  const samples = [...boothConfig.samples];
  const columns = 4;
  const cellW = (W - 0.3) / columns;
  const rowY = [0.85, 0.38];
  const targets: THREE.Mesh[] = [];

  samples.forEach((sample, index) => {
    const row = Math.floor(index / columns);
    const inRow = row * columns + columns <= samples.length ? columns : samples.length - row * columns;
    const column = index - row * columns;
    const printHeight = Math.min(0.4, (cellW - 0.1) / sample.aspect);
    const printWidth = printHeight * sample.aspect;

    const backing = new THREE.Mesh(
      new THREE.BoxGeometry(printWidth + 0.04, printHeight + 0.04, 0.02),
      new THREE.MeshStandardMaterial({ color: '#fffaf0', roughness: 0.86 }),
    );
    backing.position.set((column - (inRow - 1) / 2) * cellW, rowY[row], faceZ + 0.011);
    backing.name = `n22-sample-backing-${index + 1}`;
    group.add(backing);

    const print = picture(sample.thumbnail, printWidth, printHeight);
    print.name = `n22-sample-${index + 1}`;
    print.position.set((column - (inRow - 1) / 2) * cellW, rowY[row], faceZ + 0.024);
    print.userData.sampleUrl = sample.full;
    print.userData.sampleLabel = `${boothConfig.code} · ${sample.title}`;
    print.userData.sampleBoothName = boothConfig.name;
    print.userData.sampleFileName = `N22-${index + 1}.webp`;
    print.userData.sampleIndex = index;
    print.userData.sampleList = samples.map((entry, i) => ({
      url: entry.full,
      title: entry.title,
      fileName: `N22-${i + 1}.webp`,
    }));
    group.add(print);
    targets.push(print);
  });

  // Two softbox studio lights on tripods replace the counter at the front of the booth.
  const studioLight = (side: number) => {
    const rig = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: '#2f2b3a', roughness: 0.5 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 1.5, 10), metal);
    pole.position.y = 0.75;
    pole.castShadow = true;
    rig.add(pole);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.8, 8), metal);
      leg.position.set(Math.cos(a) * 0.22, 0.18, Math.sin(a) * 0.22);
      leg.rotation.set(-Math.sin(a) * 0.42, 0, Math.cos(a) * 0.42);
      rig.add(leg);
    }
    const head = new THREE.Group();
    head.position.y = 1.55;
    head.rotation.set(0.25, side * 0.5 + Math.PI, 0);
    const shell = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.72, 0.14), metal);
    head.add(shell);
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.66),
      new THREE.MeshBasicMaterial({ color: '#fff8e6', toneMapped: false }),
    );
    panel.position.z = 0.075;
    head.add(panel);
    const glow = new THREE.PointLight('#fff2d4', 6, 7, 2);
    glow.position.z = 0.3;
    head.add(glow);
    rig.add(head);
    return rig;
  };
  for (const side of [-1, 1]) {
    const rig = studioLight(side);
    rig.name = `n22-studio-light-${side > 0 ? 'right' : 'left'}`;
    rig.position.set(side * (W / 2 - 0.45), 0, D / 2 - 0.45);
    group.add(rig);
  }

  // Warm pool of light on the floor where the subject poses.
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(0.95, 32),
    new THREE.MeshBasicMaterial({ color: '#fff6da', transparent: true, opacity: 0.3, depthWrite: false }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.02, -D / 2 + 1.35);
  pool.name = 'n22-light-pool';
  group.add(pool);

  // Seller NPC: a male photographer with his camera on a neck strap, hosting inside the booth.
  const npc = createAvatar('male', {
    hairStyle: 'short',
    shirtStyle: 'tee',
    hairColor: '#272632',
    shirtColor: '#759bd5',
    bottomsColor: '#3a3550',
    camera: true,
  });
  npc.root.name = 'n22-vendor';
  const npcZ = -D / 2 + 0.85;
  const homeX = W / 2 - 0.85;
  const walkRadius = Math.min(0.4, Math.max(0, W / 2 - 1.2));
  npc.root.position.set(homeX, 0, npcZ);
  group.add(npc.root);

  let lastTime = 0;
  let heading = 0;
  const update = (time: number) => {
    const dt = Math.min(0.05, Math.max(0, time - lastTime));
    lastTime = time;
    const x = homeX + Math.sin(time * 0.35) * walkRadius;
    const speed = Math.abs(Math.cos(time * 0.35)) * 0.35 * walkRadius;
    npc.root.position.x = x;
    const target = speed > 0.05 ? Math.sign(Math.cos(time * 0.35)) * (Math.PI / 2) : 0;
    heading += (target - heading) * (1 - Math.exp(-4 * dt));
    npc.root.rotation.y = heading;
    npc.animate(dt, speed);
  };
  update(0);

  return { group, targets, update };
}
