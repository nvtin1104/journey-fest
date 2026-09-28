import * as THREE from 'three';

/** Collects instance transforms/colours, then emits one InstancedMesh. */
export class Instancer {
  private matrices: THREE.Matrix4[] = [];
  private colors: THREE.Color[] = [];

  push(m: THREE.Matrix4, color: THREE.ColorRepresentation = '#ffffff') {
    this.matrices.push(m.clone());
    this.colors.push(new THREE.Color(color));
  }

  build(geometry: THREE.BufferGeometry, material: THREE.Material, name: string, shadows = true) {
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, this.matrices.length));
    mesh.name = name;
    mesh.count = this.matrices.length;
    this.matrices.forEach((m, i) => {
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, this.colors[i]);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    return mesh;
  }
}
