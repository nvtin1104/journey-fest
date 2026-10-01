import * as THREE from 'three';
import { BOOTH } from '../../config';
import type { Stand } from '../../map/parse';
import { standMatrix, standSize } from '../../scene/booths';
import { createCat, type CatAction } from './cat';
import { boothConfig } from './config';
const { banner: bannerUrl, sample: sampleUrl } = boothConfig.assets;

export const FEATURED_STAND_ID = boothConfig.id;
export function buildBoothSample(stand: Stand) {
  const group = new THREE.Group();
  group.name = 'c17-c18-feature';
  group.matrixAutoUpdate = false;
  group.matrix.copy(standMatrix(stand));
  const { W, D } = standSize(stand);
  const depth = THREE.MathUtils.clamp(D * BOOTH.counterDepthRatio, 0.5, 1.2);
  const counterZ = D / 2 - depth / 2 - 0.03;
  const loader = new THREE.TextureLoader();
  function picture(url: string, width: number, height: number) {
    const texture = loader.load(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, side: THREE.DoubleSide }));
  }
  // Banner occupies the right side of the fascia, at the same height as the title.
  const bannerHeight = BOOTH.fasciaHeight - 0.04;
  const bannerWidth = bannerHeight * 3543 / 1063;
  const banner = picture(bannerUrl, bannerWidth, bannerHeight);
  banner.name = 'c17-c18-banner';
  banner.position.set(W / 2 - bannerWidth / 2 - 0.02, BOOTH.postHeight - BOOTH.fasciaHeight / 2 + 0.02, D / 2 + 0.065);
  group.add(banner);
  // Vertical rear display wall with the sample facing the visitor.
  const boardHeight = BOOTH.backPanelHeight;
  const boardZ = -D / 2 + 0.08;
  const board = new THREE.Mesh(new THREE.BoxGeometry(W - 0.12, boardHeight, 0.06), new THREE.MeshStandardMaterial({ color: '#f4ebdf', roughness: 0.9 }));
  board.position.set(0, boardHeight / 2, boardZ);
  board.name = 'c17-c18-backdrop';
  group.add(board);
  const sampleSize = Math.min(1.35, boardHeight - 0.22, W - 0.35);
  const sample = picture(sampleUrl, sampleSize, sampleSize);
  sample.name = 'c17-c18-sample';
  sample.userData.sampleUrl = sampleUrl;
  sample.position.set(W / 2 - sampleSize / 2 - 0.18, boardHeight / 2, boardZ + 0.035);
  group.add(sample);
  const tabletopSize = Math.min(0.42, depth - 0.28);
  const tabletopSample = picture(sampleUrl, tabletopSize, tabletopSize);
  tabletopSample.name = 'c17-c18-tabletop-sample';
  tabletopSample.userData.sampleUrl = sampleUrl;
  tabletopSample.rotation.x = -Math.PI / 2;
  tabletopSample.position.set(W / 2 - tabletopSize / 2 - 0.18, BOOTH.counterHeight + 0.014, counterZ);
  group.add(tabletopSample);
  const cat = createCat();
  group.add(cat.root);
  const radius = Math.max(0, W / 2 - 0.4);
  const depthRadius = Math.max(0, depth / 2 - 0.32);
  const update = (time: number) => {
    const cycle = time % 30;
    const action: CatAction = cycle < 18 ? 'walk' : cycle < 22 ? 'sit' : cycle < 26 ? 'scratch' : 'groom';
    const phase = Math.min(cycle, 18) / 18 * Math.PI * 2;
    cat.root.position.set(Math.sin(phase) * radius, BOOTH.counterHeight + 0.017, counterZ + Math.sin(phase * 2) * depthRadius);
    cat.root.rotation.y = action === 'walk' ? Math.atan2(Math.cos(phase) * radius, Math.cos(phase * 2) * depthRadius * 2) : 0;
    cat.animate(time, action);
  };
  update(0);
  return { group, targets: [sample, tabletopSample], update };
}
