# Hsin · model 3D, GLB và thiết lập render

Hsin (Phương Anh cosplay hồ ly tóc trắng) có model riêng, dựng hoàn toàn bằng code trong `src/npc/hsin/`, và được xuất ra GLB để dùng trong mọi scene Three.js.

| File | Vai trò |
|---|---|
| `src/npc/hsin/model.ts` | Hình khối, tỉ lệ (≈ 1,75 m), khung xương dạng node, chuyển động (đứng, đi, vẫy tay, chụp hình) |
| `src/npc/hsin/materials.ts` | Vật liệu PBR, texture vẽ bằng canvas, normal/roughness map bake từ height map |
| `src/npc/hsin/geometry.ts` | Sợi thuôn nhọn (tóc, lông, đuôi), mảnh vải, sao bốn cánh |
| `src/npc/hsin/export.ts` | Lấy mẫu animation và xuất GLB |
| `tools/hsin-lab.html` | Trang dev xem model và tải GLB (`pnpm dev` → `/tools/hsin-lab.html`, thêm `?pose=photo&yaw=0.5` để xem một tư thế) |
| `scripts/export-hsin.mjs` | `pnpm export:hsin`: xuất và tối ưu GLB tự động |
| `models/hsin/hsin.glb` | Model đã tối ưu cho web |
| `models/hsin/viewer.html` | Viewer tham chiếu: camera, HDRI, tone mapping, bóng đổ |

## GLB

- Khoảng **1,4 MB**: meshopt + quantization, texture WebP ≤ 1024 px.
- Khoảng 126k tam giác, 42 mesh, 13 vật liệu.
- Vật liệu glTF PBR metallic-roughness, có `KHR_materials_sheen` (lụa, satin, lông), `KHR_materials_clearcoat` (satin, đá), `KHR_materials_ior` (đá xanh).
- Mỗi vải có base color, normal map, metallic-roughness map. Tóc, lông, đuôi dùng vertex color (COLOR_0) cho dải màu trắng → xám → đen.
- Animation: `idle` (6 s), `walk` (1 chu kỳ, đi tại chỗ, tốc độ 0,75 m/s), `wave` (2 s), `photo` (giữ tư thế). Khung xương là cây node (`hips`, `spine`, `neck`, `head`, `shoulder-l/r`, `elbow-l/r`, `wrist-l/r`, `sleeve-l/r`, `hip-l/r`, `knee-l/r`, `ankle-l/r`, `foot-l/r`, `ear-l/r`), không cần skinning.
- Lay động của tóc, đuôi, vạt áo không có trong chuẩn glTF. Mỗi vertex giữ trọng số trong thuộc tính `_ASWAY` (three đọc thành `_asway`) để viewer thêm lại bằng shader (xem `addSway` trong `viewer.html`).

Xuất lại sau khi sửa model:

```bash
pnpm add -D playwright && pnpm dlx playwright install chromium   # một lần
pnpm export:hsin
```

Hoặc chạy `pnpm dev`, mở `/tools/hsin-lab.html`, bấm **Tải hsin.glb**. File tải về chưa tối ưu, nén bằng:

```bash
npx @gltf-transform/cli optimize hsin.glb hsin.opt.glb --compress meshopt --texture-compress webp \
  --texture-size 1024 --simplify false --flatten false --instance false
```

## Thiết lập Three.js để render gần ảnh tham chiếu

Bản đầy đủ có thể chạy ngay: `models/hsin/viewer.html` (`npx serve models/hsin`, mở `viewer.html`; thêm `?hdri=<url .hdr>` để dùng HDRI riêng, `?clip=walk` để chọn animation).

```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
// PBR Neutral giữ đúng sắc đỏ bão hoà của áo; AgX/ACES làm đỏ ngả hồng.
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// IBL: HDRI studio (ví dụ Poly Haven "studio_small_09" 1k) hoặc phòng studio dựng sẵn của three.
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = hdrUrl
  ? pmrem.fromEquirectangular(await new HDRLoader().loadAsync(hdrUrl)).texture
  : pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;

// Ánh sáng ba điểm: key ấm có bóng, rim lạnh phía sau (tách tóc trắng khỏi nền tối), fill hồng nhẹ.
const key = new THREE.DirectionalLight('#fff1e0', 2.4);
key.position.set(2.2, 4.2, 3.2);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0002;
key.shadow.normalBias = 0.02;
Object.assign(key.shadow.camera, { left: -1.6, right: 1.6, top: 2.2, bottom: -0.4, near: 0.5, far: 12 });
const rim = new THREE.DirectionalLight('#bcd2ff', 2.0);
rim.position.set(-2.5, 3, -3.5);
const fill = new THREE.DirectionalLight('#ffd9e0', 0.5);
fill.position.set(-3, 1.2, 2);
scene.add(key, rim, fill);

// Sàn chỉ hiện bóng.
const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 64), new THREE.ShadowMaterial({ opacity: 0.45 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;

// Camera chân dung toàn thân: FOV hẹp (~85 mm) cho phối cảnh phẳng giống bảng turnaround.
const camera = new THREE.PerspectiveCamera(22, innerWidth / innerHeight, 0.05, 60);
camera.position.set(0, 1.0, 5.6);
camera.lookAt(0, 0.92, 0);

const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('hsin.glb');
gltf.scene.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
scene.add(gltf.scene);
const mixer = new THREE.AnimationMixer(gltf.scene);
mixer.clipAction(gltf.animations.find((c) => c.name === 'idle')).play();
```

Trong app sự kiện, Hsin vẫn dựng bằng code (`buildHsin`) để có lay động bằng shader và tự giảm chi tiết theo máy. Nền sự kiện giữ style toon, chỉ shader của Hsin có tone curve và rim light riêng.

## Giới hạn và hướng lên photorealistic

Model hiện tại bám trang phục, màu sắc, tỉ lệ và đủ 360° theo ảnh tham chiếu, nhưng dựng bằng hình khối toán học nên **chưa phải photorealistic**:

- mặt vẽ lên texture, chưa có hình khối mũi/môi
- nếp vải mô phỏng bằng normal map
- tóc và lông là sợi thuôn chứ chưa phải hair card có alpha
- ống tay rủ theo trọng lực bằng phép quay, chưa có mô phỏng vải

Để đạt mức như ảnh render game cần một model nặn tay hoặc sinh từ ảnh. Có thể dùng prompt dưới đây với công cụ image-to-3D (Meshy, Tripo, Rodin/Hyper3D) hoặc giao cho 3D artist, rồi thay `models/hsin/hsin.glb`. Viewer và cách nạp vào app giữ nguyên.

> Lưu ý bản quyền: ảnh turnaround có watermark "Team Gemberry78" là tác phẩm của người khác. Chỉ dùng làm tham chiếu thiết kế; không dùng lại mesh hoặc texture gốc khi chưa được phép.

**Prompt image-to-3D** (dán kèm ảnh trước/sau/nghiêng):

```text
Full-body 3D character, photorealistic PBR, A-pose, real-world scale 1.72 m, Y-up, facing +Z.
Adult East-Asian woman cosplaying a white fox spirit. Long silver-white hair with a pale icy-blue tint,
straight bangs, braided high bun at the back of the head, very long low ponytail to the hips,
two long face-framing locks to the bust. Tall white fox ears with grey-black tips, gold ring and
white fluffy pompom at each ear base. Crimson-red eyes, soft red eyeliner, light blush.
Outfit: strapless black satin bustier dress with high side slits to the hip; pale ice-blue chiffon
panels hanging at the front sides; red silk bow and an oval ice-blue gem in a gold frame at the bust,
gold chain belt with a long gold tassel. Off-shoulder long open sleeves: crimson silk outside,
pale blue chiffon lining, white fur band at the upper arm, dark grey feather pauldrons on the shoulders,
long feathery white fur at the sleeve hems. Long crimson silk over-robe panels from the arms to the floor,
gold trim and gold vine embroidery, lower front hem red glitter, lower back hem black with a white fox
mask motif and crescent moons, gold tassels at mid-thigh. Gold strappy high-heel sandals, bare legs.
Huge fluffy fox tail from the lower back sweeping to her left near the floor, white fading to grey and
a black tip, with gold four-pointed star ornaments.
Separate meshes: body, hair, tail, dress, robe, sleeves, accessories. Quad topology, 60-120k triangles,
clean UVs, 2K textures: baseColor, normal, roughness, metalness (gold only), sheen on silk and fur.
No baked lighting, no stylization, no cartoon outlines.
```

**Quy trình hoàn thiện trong Blender** (sau khi có mesh):
1. Retopo và UV, bake normal map từ bản high-poly.
2. Tóc dùng hair card có alpha (2K, alpha test).
3. Rig Rigify, đặt tên xương theo bảng ở trên để dùng lại các clip.
4. Nếu cần vải chuyển động thật thì bake mô phỏng vải thành shape key hoặc animation.
5. Export glTF 2.0 (`.glb`, +Y up), rồi chạy lệnh `gltf-transform optimize` ở trên.
