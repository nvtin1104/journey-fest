import * as THREE from 'three';
import { BOOTH } from '../../config';
import type { Stand } from '../../map/parse';
import { standMatrix, standSize } from '../../scene/booths';
import { boothConfig } from './config';

export const A9_STAND_ID = boothConfig.id;

export function buildA9Booth(stand: Stand) {
  const group = new THREE.Group();
  group.name = 'a9-feature';
  group.matrixAutoUpdate = false;
  group.matrix.copy(standMatrix(stand));
  const { W, D } = standSize(stand);
  const loader = new THREE.TextureLoader();
  const picture = (url: string, width: number, height: number) => {
    const texture = loader.load(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, side: THREE.DoubleSide });
    return new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  };

  // Mount the cutout artwork above the frame, leaving the name board visible.
  const bannerWidth = W * 0.8;
  const bannerHeight = bannerWidth / boothConfig.bannerAspect;
  const banner = picture(boothConfig.banner, bannerWidth, bannerHeight);
  banner.material.alphaTest = 0.05;
  banner.name = 'a9-banner';
  banner.position.set(0, BOOTH.postHeight + 0.04 + bannerHeight / 2, D / 2 + 0.065);
  group.add(banner);

  // Six miniature prints sit flat on the counter in two rows; tapping one opens its full artwork.
  const counterDepth = THREE.MathUtils.clamp(D * BOOTH.counterDepthRatio, 0.5, 1.2);
  const counterZ = D / 2 - counterDepth / 2 - 0.03;
  const sampleWidth = Math.min(0.28, (W - 0.35) / 3.4);
  const sampleHeight = sampleWidth * (1600 / 1273);
  const gapX = 0.075;
  const gapZ = 0.07;
  const targets: THREE.Mesh[] = [];

  boothConfig.samples.forEach((sample, index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const x = (column - 1) * (sampleWidth + gapX);
    const z = counterZ + (row - 0.5) * (sampleHeight + gapZ);
    const backing = new THREE.Mesh(
      new THREE.BoxGeometry(sampleWidth + 0.025, 0.012, sampleHeight + 0.025),
      new THREE.MeshStandardMaterial({ color: '#fffaf0', roughness: 0.86 }),
    );
    backing.position.set(x, BOOTH.counterHeight + 0.006, z);
    backing.name = `a9-sample-backing-${index + 1}`;
    group.add(backing);

    const print = picture(sample.thumbnail, sampleWidth, sampleHeight);
    print.name = `a9-sample-${index + 1}`;
    print.rotation.x = -Math.PI / 2;
    print.position.set(x, BOOTH.counterHeight + 0.013, z);
    print.userData.sampleUrl = sample.full;
    print.userData.sampleLabel = `${boothConfig.code} · ${sample.title}`;
    print.userData.sampleBoothName = boothConfig.name;
    print.userData.sampleFileName = `A9-${index + 1}.webp`;
    print.userData.sampleIndex = index;
    print.userData.sampleList = boothConfig.samples.map((entry, i) => ({
      url: entry.full,
      title: entry.title,
      fileName: `A9-${i + 1}.webp`,
    }));
    group.add(print);
    targets.push(print);
  });

  return { group, targets };
}
