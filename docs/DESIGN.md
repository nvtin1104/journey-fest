# Thiết kế: Bản đồ 3D Color Fiesta

Tài liệu mô tả cách dựng bản đồ sự kiện 3D bằng three.js từ dữ liệu sơ đồ 2D, trong đó có một nhân vật để người xem đi vòng quanh tham quan.

## 1. Mục tiêu & phạm vi

- Dựng **map 3D phẳng**: nền không có địa hình, mọi thứ nằm trên mặt sàn y = 0. Phong cách **pastel toon**: khối bo nhẹ, màu lấy đúng từ dữ liệu, ánh sáng mềm, bóng đổ nhẹ.
- Người xem điều khiển **một nhân vật chibi** đi trong hội trường, không xuyên qua tường, gian hàng hay phòng.
- Nhân vật **xuất hiện ở lối vào**, tức đầu mũi tên xanh lá ở vỉa hè dưới. Từ đó đi qua cửa khu **Check-in** để vào trong.
- Các ô **xanh dương đậm** (`small gate`) là **cửa thông** giữa các khu, dựng thành lỗ mở trên tường.
- Phần **xanh nhạt** (Sidewalk) là đường đi bộ. Đường nhựa (Road) chỉ để trang trí và không đi vào được.
- Mỗi booth là một **quầy bán hàng**: có thùng quầy, khung và **bảng tiêu đề** phía trên ghi mã booth và tên gian.

Ngoài phạm vi hiện tại: multiplayer, dẫn đường tự động, nội dung chi tiết từng gian (ảnh, link).

## 2. Nguồn dữ liệu

- API: `https://map-cdn.colorfiesta.vn/events/<eventId>/map`. Bản snapshot được lưu ở `src/data/event-map.json`.
  - Snapshot giữ nguyên schema của API nhưng bỏ các field không dùng.
  - Chỉ giữ các edge có `groupId`, tức các edge thuộc stamp rally.
- Nếu đặt biến môi trường `VITE_MAP_URL` thì app fetch dữ liệu live lúc chạy. Fetch lỗi thì quay về snapshot.

| Field | Ý nghĩa |
|---|---|
| `nodes[].type` | `BOOTH` (gian artist alley) hoặc `AREA` (mọi thứ khác) |
| `x, y, width, height` | Hình chữ nhật trên canvas 2D. Trục y hướng xuống, `gridSize = 10` |
| `areaTypeId` | Loại khu vực (bảng ở mục 5) |
| `refId`, `boothSlot`, `boothCode2` | Hai ô cùng `refId` là **booth đôi** (vd A15 + A16) |
| `edges[]` (`source == target`, có `groupId`) | Booth thuộc stamp rally `groups[groupId]` |

## 3. Hệ toạ độ & tỉ lệ

- `SCALE = 0.05 m/unit`. Booth 40u = 2 m, lối đi giữa hai dãy booth 110u = 5.5 m, hall 3360u = 168 m.
- Quy đổi: `X = (x − 1900)·S`, `Z = (y − 1265)·S`, trong đó (1900, 1265) là tâm bbox toàn map. **Phía trên bản đồ tương ứng hướng −Z**. Góc nhìn toàn cảnh đặt phía bắc ở trên, giống minimap.
- Mọi hình trong dữ liệu đều là **hình chữ nhật thẳng trục**, nên va chạm cũng làm bằng AABB 2D trên mặt XZ.

## 4. Bố cục & đồ thị cửa thông

```
          Đường nhựa (trên)
          Vỉa hè trên
   ┌──── Hall 1 · Artist Alley (A–H, P) ────┐   cửa y=-410: x 580 · 1910 · 3120
   └────────────────────────────────────────┘   cửa y=550 : x 600 · 1900 · 3120
          Vỉa hè giữa
   ┌──── Hall 2 · F&B, W, I, S, N ──────────┐   cửa y=720 : x 600 · 1900
   ├──── Hall 3 · Main stage, R, M ─────────┤   cửa y=1250: x 600 · 1900
   ├──── Hall 4 · CHECK-IN HALL, kho… ──────┤   cửa y=2210: x 610 · 1900 · 3120
   └────────────────────────────────────────┘   cửa y=2740: x 610 · 1900 · 3120
          Vỉa hè dưới  ← ◀ LỐI VÀO (mũi tên xanh, x≈3600)
   ┌──── Hall 5 (trống, không có cửa) ──────┐
```

- Hai bên là vỉa hè dọc và đường nhựa.
- Đường đi của khách: mũi tên → vỉa hè dưới → cửa Check-in (x 3120–3220) → CHECK-IN HALL → cửa lên Hall 3 → Hall 2 → vỉa hè giữa → Hall 1.

## 5. Ánh xạ dữ liệu sang phần tử 3D (`src/map/parse.ts`)

| Nguồn | Phần tử 3D |
|---|---|
| `2` Hall | Sàn tím nhạt có lưới 2 m, kèm tường. **Khử trùng**: bỏ bản trùng hệt và bản lệch nhau hơn 80%. Kết quả còn 5 hall |
| `10` small gate | Lỗ cửa trên tường, khung xanh đậm `#38528f` và thảm cửa. Có 16 cửa |
| `14` Sidewalk | Nền gạch xanh xám, đi được |
| `15` Road | Đường nhựa có vạch, bị chặn. "Road" nằm **bên trong hall** là **sân khấu** |
| `BOOTH` | Booth quầy hàng. Các ô cùng `refId` gộp thành một booth đôi, nhãn "A15–A16" |
| `6, 7, 9, 11, 12, 13` (và `3, 5` không phải phòng) | Có cạnh ≤ 20u là **billboard**. Cả hai cạnh ≥ 100u là **pavilion**. Label có "FOOD COURT" là **khu ăn uống**. Còn lại là **stall**, dựng giống booth |
| `4`, và `3, 5` có label WC/VIP | **Phòng kín**: khối có mái, cửa giả, biển tên. Không vào được |
| `8` Col | 10×10 là cột trụ. Kích thước khác là khối trang trí (trong R9 Trading Town) |
| `16` Sign | Mũi tên xanh trên nền, kèm nhãn "LỐI VÀO" |
| `17` Zone | Tô màu sàn và nhãn nổi. CHECK-IN HALL có quầy check-in đặt hai bên lối đi thẳng giữa hai cửa |
| `18` Highlight | Nền và mái đỏ của pavilion mà nó phủ lên (R9) |

Label có mã được tách thành mã và tên, vd `"L03: Pick Miu Store"` → mã `L03`, tên `Pick Miu Store`.

## 6. Spec dựng hình (đơn vị m, `src/config.ts`)

### Booth / stall: quầy có thùng, khung và bảng tiêu đề

```
      ┌──────────── bảng tiêu đề 0.45 m ─────────────┐   ← mã (khối màu) + tên (chữ đậm)
      │ A15–A16 │ 5 Chữ Suy                          │
      ├─┬──────────────────────────────────────────┬─┤   2.4 m  thanh ngang khung
      │ │            vách lưng 1.8 m               │ │
      │ │                                          │ │   cột khung 6 cm × 4 góc
      │ ├──────── mặt quầy (khăn trắng) ───────────┤ │   0.9 m
      │ │  thùng quầy (màu booth) + sọc sáng       │ │
      └─┴──────────────────────────────────────────┴─┘
                       ▲ mặt trước (hướng lối đi)
```

- Thùng quầy sâu 40% chiều sâu ô (kẹp trong 0.5–1.2 m), đặt sát mép trước. Trên mặt quầy có 2–4 hộp hàng màu pastel, sinh ngẫu nhiên theo seed id.
- Mọi chi tiết đều là `InstancedMesh` của một box đơn vị, tô màu bằng `instanceColor`. Có 4 mesh cho khoảng 420 gian.

### Các phần tử khác

- **Pavilion** (R1–R4, R8, R9, W5):
  - Bục nền 8 cm và 4 cột cao 3.2 m.
  - Vòng bảng tên 0.7 m có chữ ở **cả 4 mặt**.
  - Vách thương hiệu phía sau, quầy phía trước, bàn trưng bày ở giữa.
- **Food court**: bàn tròn cùng 4 ghế đẩu mỗi bàn (instanced). Khách vẫn đi lại được giữa các bàn.
- **Sân khấu**:
  - Bục cao 1.2 m, màn LED phía sau in chữ COLOR FIESTA.
  - Khung truss có 5 đèn đổi màu, hai loa.
  - Mặt sân khấu quay về tâm khu MAIN STAGE AREA.
- **Tường hall**:
  - Cao 4 m, dày 0.3 m, có viền trên và chân tường.
  - Lỗ cửa cao 3 m có khung xanh đậm. Trên cửa Check-in có marker hồng nhấp nhô.
- **Chữ**: vẽ vào canvas atlas 2048² theo kiểu xếp kệ (shelf packing), 128 px/m. Quad bảng tên của mỗi trang được gộp thành **một mesh** bằng `mergeGeometries`, dùng `MeshBasicMaterial` để chữ không bị đổ bóng.
  - Font: Be Vietnam Pro (Google Fonts), fallback về sans-serif hệ thống. Phải chờ `document.fonts` rồi mới vẽ.
  - Nhãn khu, nhãn phòng và lối vào dùng `Sprite`.
- **Vật liệu và ánh sáng**:
  - `MeshToonMaterial` với gradient 3 bậc.
  - Hemisphere light và directional light. Bóng 2048² chỉ phủ ±32 m quanh nhân vật và đi theo nhân vật.
  - Bầu trời gradient, sương nhẹ, cỏ pastel ngoài biên.

## 7. Hướng mặt quầy (`src/map/facing.ts`)

Dữ liệu không có hướng, nên hướng mặt quầy được suy ra từ khoảng trống xung quanh.

1. Với mỗi hướng N/S/E/W, tính **khoảng trống** từ mép gian tới vật cản gần nhất có phần chồng lấn theo trục vuông góc. Vật cản gồm gian khác, phòng, tường, cột, billboard, sân khấu, đường nhựa. Phía của một vật cản được quyết định bởi tâm của nó, nên tường chạm sát cho khoảng trống bằng 0.
2. Xác định kiểu xếp:
   - Gian có hàng xóm cùng loại cách dưới 45u theo phương ngang **hoặc** gian bè ngang (rộng ≥ 2 lần sâu) → chỉ xét N/S.
   - Gian có hàng xóm theo phương dọc **hoặc** gian cao (dài ≥ 2 lần rộng) → chỉ xét E/W.
3. Bỏ các hướng có khoảng trống < 25u, tức bị chặn bởi quầy dựa lưng hoặc sát tường.
4. Nếu chỉ đúng **một** hướng bị chặn thì quay mặt ngược lại hướng đó. Nếu không, chọn hướng trống nhất. Khi hoà, thứ tự ưu tiên là S, N, E, W.

Kết quả đã kiểm bằng test:
- A1 → N, A23 → S (hai dãy dựa lưng nhau).
- W8–W13 → E (cột dọc sát phòng staff).
- FB1 → S, FB7 → N (sát tường hall).
- P1 → E, R5 → S.

## 8. Va chạm & di chuyển (`src/map/colliders.ts`, `src/player/controller.ts`)

- Collider là AABB ở toạ độ thế giới, gồm:
  - tường (đã chừa lỗ cửa), booth, stall, pavilion, phòng;
  - cột, billboard, sân khấu, bàn food court, quầy check-in;
  - đường nhựa và biên map.
- Collider được tra qua **spatial hash** ô 5 m.
- Nhân vật là hình tròn bán kính 0.35 m. Mỗi bước di chuyển được chia nhỏ tối đa 0.2 m, rồi đẩy nhân vật ra khỏi box (tối đa 4 lần lặp) nên trượt dọc tường được.
- Tốc độ đi 4.5 m/s, chạy 9 m/s (Shift, hoặc kéo joystick hết cỡ). Có làm mượt gia tốc và hướng quay.
- **Bấm lên sàn** thì nhân vật tự đi tới điểm đó. Nếu kẹt quá 0.6 s thì dừng.

## 9. Camera & giao diện

- **Camera góc thứ 3** (`src/player/camera.ts`):
  - Kéo chuột hoặc vuốt để xoay, cuộn chuột hoặc pinch để zoom (3–32 m).
  - Nếu tường hoặc phòng che giữa camera và nhân vật thì **làm mờ** xuống 0.18 (raycast mỗi frame).
- **Intro**: camera bay từ trên cao xuống sau lưng nhân vật ở lối vào. Bấm phím bất kỳ để bỏ qua.
- **Toàn cảnh** (phím M hoặc nút): nhìn xiên toàn map, phía bắc ở trên. Bấm lên sàn để dịch chuyển tới đó.
- **HUD** (`src/ui/hud.ts`), toàn bộ bằng tiếng Việt:
  - Ô tìm kiếm: so khớp không dấu theo mã, tên hoặc tên stamp rally.
  - Minimap: bấm vào để dịch chuyển.
  - **Thẻ thông tin** khi đứng trước quầy (≤ 2.4 m): mã, tên, loại gian, chip stamp rally. Kèm marker hồng nhấp nhô trên bảng tên.
  - Hướng dẫn điều khiển. Trên màn hình cảm ứng có joystick ảo.
- **Deep link**: `/#A15` dịch chuyển thẳng tới trước quầy A15. Chọn một gian trong ô tìm kiếm cũng cập nhật hash của URL.

## 10. Hiệu năng

- Khoảng 200 draw call cho toàn bộ map, vì booth instanced và chữ gộp theo trang atlas.
- Khoảng 170k tam giác, tính cả shadow pass.
- `pixelRatio ≤ 2`, bóng đổ chỉ phủ vùng quanh nhân vật, sương che phần xa.
- Không tải asset ngoài ngoài font: nhân vật và props đều dựng từ primitive.

## 11. Cấu trúc code

```
src/
  config.ts             tỉ lệ, kích thước, tốc độ, điểm spawn
  data/                 snapshot JSON + kiểu dữ liệu API
  map/                  logic thuần, có unit test (vitest)
    coords.ts           quy đổi toạ độ, Rect helpers
    parse.ts            phân loại node → ParsedMap
    facing.ts           suy ra hướng mặt quầy
    walls.ts            tường từ viền hall, cắt lỗ cửa
    colliders.ts        AABB + spatial hash + đẩy hình tròn
  scene/                dựng three.js
    setup.ts            renderer, ánh sáng, bầu trời
    materials.ts        toon material + cache
    ground.ts           cỏ, đường, vỉa hè, sàn hall, zone
    walls.ts            tường, khung cửa (occluder để làm mờ)
    booths.ts           booth/stall/pavilion/food court (instanced)
    areas.ts            phòng, billboard, cột, sân khấu, check-in, lối vào, nhãn
    signAtlas.ts        atlas chữ cho bảng tên
  player/               avatar chibi, điều khiển, camera
  ui/                   HUD + CSS
```

## 12. Hướng mở rộng

- **Dẫn đường**: dùng A* trên lưới 0.5 m sinh từ collider, vẽ đường chỉ dẫn trên sàn tới booth được tìm.
- **Lọc stamp rally**: làm nổi bật các booth trong cùng một group, đánh dấu trên minimap.
- **Avatar GLB** có animation (Mixamo) và cho người dùng chọn trang phục.
- **Multiplayer** qua WebSocket để thấy người tham quan khác.
- Hiển thị ảnh hoặc link gian (`linkUrl`, `iconUrl`) khi API có dữ liệu.
