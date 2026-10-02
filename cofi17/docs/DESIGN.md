# Thiết kế: Bản đồ 3D Color Fiesta

Tài liệu mô tả cách dựng bản đồ sự kiện 3D bằng three.js từ dữ liệu sơ đồ 2D, trong đó có một nhân vật để người xem đi vòng quanh tham quan.

## 1. Mục tiêu & phạm vi

- Dựng **map 3D phẳng**: nền không có địa hình, mọi thứ nằm trên mặt sàn y = 0. Phong cách **pastel toon**: khối bo nhẹ, màu lấy đúng từ dữ liệu, ánh sáng mềm, bóng đổ nhẹ.
- Người xem chọn **nhân vật nam hoặc nữ** rồi điều khiển đi trong hội trường, không xuyên qua tường, gian hàng hay phòng.
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
   ┌──── Hall 5 (không có cửa → khối nhà kín có mái) ┐
```

- Hai bên là vỉa hè dọc và đường nhựa.
- Đường đi của khách: mũi tên → vỉa hè dưới → cửa Check-in (x 3120–3220) → CHECK-IN HALL → cửa lên Hall 3 → Hall 2 → vỉa hè giữa → Hall 1.

## 5. Ánh xạ dữ liệu sang phần tử 3D (`src/map/parse.ts`)

| Nguồn | Phần tử 3D |
|---|---|
| `2` Hall | Sàn tím nhạt có lưới 2 m, kèm tường. **Khử trùng**: bỏ bản trùng hệt và bản lệch nhau hơn 80%. Kết quả còn 5 hall. Hall **không có cửa nào** (Hall 5, cạnh lối vào) được đánh dấu `sealed` và dựng thành **khối nhà kín có mái**, không có sàn bên trong |
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
- **Khu nhà kín** (hall không có cửa): mái phẳng dày 0.3 m, nhô ra ngoài tường 6 cm mỗi bên, trên mái có vài khối máy lạnh. Mái cũng được làm mờ khi che nhân vật.
- **Chữ**: vẽ vào canvas atlas 2048² theo kiểu xếp kệ (shelf packing), 128 px/m. Quad bảng tên của mỗi trang được gộp thành **một mesh** bằng `mergeGeometries`, dùng `MeshBasicMaterial` để chữ không bị đổ bóng.
  - Font: Be Vietnam Pro (Google Fonts), fallback về sans-serif hệ thống. Phải chờ `document.fonts` rồi mới vẽ.
  - Nhãn khu, nhãn phòng và lối vào dùng `Sprite`.
- **Vật liệu và ánh sáng**:
  - `MeshToonMaterial` với ramp 4 ô `[0, 0, 190, 255]` theo N·L: mặt quay lưng với nắng không nhận ánh sáng trực tiếp, giống hệt vùng bị bóng đổ, nên mặt khuất và bóng đổ có **cùng một tông** tím nhạt (từ hemisphere light).
  - Hemisphere light tím nhạt (2.2) làm ánh sáng nền, nắng ấm (1.35) chiếu xiên để bóng đổ dài.
  - Bóng 2048² phủ ±32 m quanh nhân vật và đi theo nhân vật. Mép bóng mềm nhờ `shadow.radius` (PCF Vogel disk của three r186).
  - Bầu trời gradient đi theo camera, sương nhẹ, cỏ pastel ngoài biên.

### Chống nhấp nháy (z-fighting, bóng rung)

- **Không có hai khối khác màu chung một mặt phẳng**:
  - Viền trên tường cao hơn đỉnh tường 3 cm; lanh tô cửa cao hơn viền; mái khu nhà kín cao hơn tất cả. Mỗi lớp ngoài rộng hơn lớp trong vài cm.
  - Bảng tiêu đề booth đặt trước cột khung 5 mm thay vì trùng mặt cột. Bảng tên pavilion cao hơn đỉnh cột 3 cm.
- **Chữ trên bảng** cách mặt bảng `SIGN_GAP` = 12 mm và dùng `polygonOffset`, nên không rung kể cả ở góc nhìn toàn cảnh xa.
- **Mặt phẳng gần** của camera là 0.5 m (trước đây 0.3 m), giúp độ chính xác depth tốt hơn ở xa.
- **Bóng đổ không rung khi đi**: tâm shadow camera được **bắt vào lưới texel** của shadow map (`snapToShadowTexel`), nên bóng không trượt từng phần nhỏ của texel mỗi frame.
- Tường chỉ chuyển sang chế độ trong suốt khi đang được làm mờ; lúc đứng yên, tường là vật liệu đục nên thứ tự vẽ ổn định.

### Nhân vật (`src/player/avatar.ts`)

Theo ảnh tham khảo: áo sơ mi trắng cổ đứng có hàng cúc, máy ảnh đeo cổ bằng dây nâu, viền tối kiểu toon.

| | Nam | Nữ |
|---|---|---|
| Tóc | Đen, dựng nhọn (các chóp nón), mái lởm chởm | Dài qua vai, mái bằng, hai lọn hai bên, kẹp tóc hồng |
| Mặt | Kính tròn gọng nâu | Mắt to hơn, tay áo phồng |
| Thân dưới | Quần ống rộng xanh than, giày đen | Váy dài xoè xanh than (đung đưa khi đi) |

- Cao khoảng 1.65 m. Chân và tay xoay quanh hông và vai khi đi, máy ảnh lắc nhẹ.
- **Viền tối**: inverted hull, tức một bản sao mặt sau được đẩy ra theo pháp tuyến 11 mm trong vertex shader.
- Khoảng 90 mảnh được **gộp theo vật liệu** trong từng bộ phận cứng (đầu, thân, tay, chân, máy ảnh), nên chỉ tốn vài chục draw call.
- Bóng tiếp xúc dưới chân là texture gradient tròn mềm.

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
- **Chế độ camera theo hướng đi** (phím F hoặc nút): điều khiển chuyển sang kiểu "lái".
  - W/S đi tới/lùi theo hướng nhân vật; lùi chậm hơn và vẫn quay mặt về trước.
  - A/D xoay nhân vật 2.6 rad/s. Trên điện thoại, trục x của joystick là xoay, trục y là đi.
  - Camera luôn trượt về sau lưng nhân vật, trừ 1.5 s sau khi người dùng tự kéo camera.

## 9. Camera & giao diện

- **Camera góc thứ 3** (`src/player/camera.ts`):
  - Kéo chuột hoặc vuốt để xoay, cuộn chuột hoặc pinch để zoom (3–32 m).
  - Nếu tường hoặc phòng che giữa camera và nhân vật thì **làm mờ** xuống 0.18 (raycast mỗi frame).
- **Màn bắt đầu**: toàn cảnh xoay chậm, bảng chọn **Nam / Nữ** và nút "Bắt đầu tham quan". Lựa chọn được nhớ trong `localStorage`.
- **Intro**: sau khi bấm Bắt đầu, camera bay từ toàn cảnh xuống sau lưng nhân vật ở lối vào. Bấm phím bất kỳ để bỏ qua.
- **Toàn cảnh** (phím M hoặc nút): nhìn xiên toàn map, phía bắc ở trên. Bấm lên sàn để dịch chuyển tới đó.
  - Khoảng cách camera được tính theo tỉ lệ khung hình (`fitDistance`), nên cả map luôn vừa màn hình, kể cả điện thoại dọc.
  - Sương mù lùi ra xa theo khoảng cách camera để map không bị che.
- **HUD** (`src/ui/hud.ts`), toàn bộ bằng tiếng Việt:
  - Ô tìm kiếm: so khớp không dấu theo mã, tên hoặc tên stamp rally.
  - Minimap: bấm vào để dịch chuyển.
  - **Thẻ thông tin** khi đứng trước quầy (≤ 2.4 m): mã, tên, loại gian, chip stamp rally. Kèm marker hồng nhấp nhô trên bảng tên.
  - Nút **Toàn cảnh**, **Lối vào**, **Camera theo hướng đi (F)** và **⚙ Cài đặt**.
  - Menu ⚙ gồm hai nhóm:
    - **Nhân vật**: Nam / Nữ, đổi ngay tại chỗ.
    - **Chất lượng đồ hoạ**: Tự động / Cao / Vừa / Thấp, kèm dòng ghi chú mức đang dùng.
  - Mọi lựa chọn được nhớ lại (`src/ui/prefs.ts`, `localStorage` bọc try/catch nên chế độ riêng tư vẫn chạy).
  - Hướng dẫn điều khiển, tự đổi theo chế độ camera.
  - **Màn hình cảm ứng** (`pointer: coarse`):
    - Có joystick ảo.
    - Ẩn bảng hướng dẫn phím và nhãn phím tắt "(M)", "(F)".
    - Nút nhỏ lại và tự xuống dòng.
    - Minimap thu còn 150 px khi màn hình hẹp hơn 640 px.
- **Deep link**: `/#A15` dịch chuyển thẳng tới trước quầy A15. Chọn một gian trong ô tìm kiếm cũng cập nhật hash của URL.

## 10. Tải trang & hiệu năng

**Tải theo hai giai đoạn** (`src/main.ts` → `src/experience.ts`):

1. **Mở trang**: chỉ tải `index` (app shell + data map, ~47 KB gzip) và `three` (chunk riêng, ~138 KB gzip, cache lâu dài).
   - Dựng phần **tổng quan**: sàn, tường, mái khu kín, và **khối màu giản lược** cho mọi gian/phòng/sân khấu, tất cả trong 1 draw call (`src/scene/proxies.ts`).
   - Bảng Bắt đầu có sẵn trong `index.html` nên hiện ngay, trước khi JS chạy. Font Be Vietnam Pro được tự host (`@fontsource`, chỉ subset Latin + tiếng Việt, 3 độ đậm), `font-display: swap` nên không chặn hiển thị.
2. **Bấm Bắt đầu**:
   - Tải chunk `experience` (~14 KB gzip; tải trước khi rê chuột lên nút).
   - Dựng chi tiết theo từng bước, mỗi bước nhường một frame và cập nhật thanh tiến độ: font, gian hàng, khu vực, bảng tên, nhân vật, biên dịch shader.
   - Xong thì thay khối giản lược bằng cảnh chi tiết và bay xuống lối vào.

**Hiệu năng**:
- Khoảng 250 draw call khi nhìn toàn cảnh cả map, tính cả shadow pass. Booth, viền tường, khung cửa, mái/cửa phòng đều instanced; chữ gộp theo trang atlas; nhân vật gộp theo vật liệu.
- Bóng đổ chỉ phủ vùng quanh nhân vật, sương che phần xa.
- Không tải gì từ server khác: font tự host, nhân vật và props đều dựng từ primitive.

### Chất lượng đồ hoạ (`src/scene/quality.ts`)

| Mức | pixelRatio tối đa | Bóng đổ | Shadow map | Chữ bảng tên (px/m) | Khử răng cưa |
|---|---|---|---|---|---|
| Cao | 2 | có, viền mềm 2.5 | 2048 | 128 | có |
| Vừa | 1.5 | có, viền mềm 1.5 | 1024 | 112 | có |
| Thấp | 1 | tắt | – | 96 | tắt |

- **Mức ban đầu** (chế độ Tự động), đoán từ thông tin trình duyệt cho biết:
  - RAM ≤ 2 GB hoặc ≤ 2 nhân CPU → Thấp.
  - Màn cảm ứng, RAM ≤ 4 GB hoặc ≤ 4 nhân → Vừa.
  - Còn lại → Cao.
  - `navigator.deviceMemory` chỉ có trên Chromium. Safari và Firefox không có nên chỉ dựa vào cảm ứng và số nhân.
- **Tự hạ mức** (`FpsGovernor`):
  - Nếu FPS trung bình trong 3 s dưới 40 thì hạ một bậc. Sau đó chờ 3 s rồi mới đo tiếp.
  - Không đo lúc dựng cảnh (`hold`) và trong 3 s đầu.
  - Chỉ bỏ qua frame dài hơn 2 s (tạm dừng, máy ngủ). Frame chậm của máy yếu vẫn được tính.
- Khử răng cưa chỉ đặt được lúc tạo renderer, nên theo mức ban đầu. Các thông số khác đổi ngay khi chạy. Bật/tắt bóng thì đánh dấu `needsUpdate` cho mọi vật liệu để biên dịch lại shader.
- Chọn tay Cao / Vừa / Thấp sẽ tắt tự hạ.

### Tương thích trình duyệt

- **Yêu cầu WebGL2** (three.js r163 trở lên): iOS/iPadOS 15+, Chrome/Edge/Firefox 100+, Samsung Internet.
  - `hasWebGL2()` kiểm tra trước khi tạo renderer. Nếu thiếu thì bảng Bắt đầu báo rõ lý do và cách khắc phục (cập nhật trình duyệt, bật tăng tốc phần cứng) thay vì màn hình đen.
- **Build target** `es2021, safari15, chrome100, edge100, firefox100`: cú pháp mới hơn được Vite hạ xuống.
- **iOS 15**:
  - Chưa có `CanvasRenderingContext2D.roundRect`, nên dùng `roundRect()` trong `signAtlas.ts`, tự fallback sang `arcTo`.
  - CSS `color-mix` có màu nền đặt trước để trình duyệt cũ vẫn hiện được.
  - Có thêm tiền tố `-webkit-backdrop-filter`.
- **Mất WebGL context** (điện thoại hết bộ nhớ GPU, chuyển app lâu):
  - `webglcontextlost` hiện thông báo "Đồ hoạ tạm dừng" kèm nút Tải lại.
  - Khi trình duyệt trả context (`webglcontextrestored`) thì thông báo tự ẩn.
- **Lỗi khi tải chi tiết** (mạng rớt khi tải chunk `experience`): bảng Bắt đầu báo lỗi và gợi ý tải lại trang.

### Offline & cài vào màn hình chính (PWA)

Service worker được `vite-plugin-pwa` (Workbox, `generateSW`) sinh khi build, cấu hình trong `vite.config.ts`.
Phần đăng ký và giao diện nằm ở `src/ui/pwa.ts`.

- **Precache toàn bộ app ngay lần mở đầu** (khoảng 34 file, 8 MB):
  - Code: `index`, `three`, `experience`.
  - CSS, 6 file font woff2.
  - 7 sơ đồ mặt bằng, 5 poster, ảnh mẫu C17-C18, logo, icon.
  - Từ lần sau mở được hoàn toàn khi không có mạng, kể cả khi chưa bấm Bắt đầu lúc còn mạng.
  - Có toast "Đã lưu bản đồ…" khi lưu xong.
- **Data map**:
  - Snapshot nằm sẵn trong chunk `index`.
  - Nếu build có `VITE_MAP_URL`: SW thêm `NetworkFirst` cho URL đó (timeout 5 s, cache `map-data`). Offline sẽ dùng bản live gần nhất; nếu chưa có bản nào thì `loadData()` dùng snapshot.
- **Cập nhật** (`registerType: 'prompt'`):
  - Bản mới được tải ngầm. App hiện toast "Đã có bản cập nhật" kèm nút **Cập nhật**, bấm thì kích hoạt bản mới và tải lại trang.
  - Không tự `skipWaiting`, vì trang đang mở còn cần chunk `experience` cũ.
  - Đóng hết tab thì lần mở sau tự dùng bản mới.
  - App mở lâu (ngày sự kiện) tự kiểm tra bản mới mỗi giờ.
- **Cài app**:
  - Chrome/Edge/Samsung Internet: bắt `beforeinstallprompt`, hiện nút "Cài vào màn hình chính" trên màn Bắt đầu và trong menu ⚙.
  - iPhone/iPad: Safari không có prompt, nên hiện hướng dẫn "Chia sẻ → Thêm vào MH chính".
  - Trình duyệt trong app (Facebook, Messenger, Instagram, Zalo) không cài được: nhắc mở bằng Safari/Chrome.
  - Logic nhận biết là hàm thuần `installHint()` (`src/ui/installHint.ts`), có test.
  - Khi đã chạy dạng app (`display-mode: standalone`) thì ẩn hết.
- **Manifest**:
  - `display: standalone`, `theme_color` `#5b45c9`, `background_color` `#f3ecff`.
  - Icon: `favicon-192.png`, `icons/icon-512.png`, `icons/maskable-512.png` (logo nằm trong vùng an toàn 80%).
  - `apple-touch-icon.png` có nền trắng vì iOS tô đen phần trong suốt.
  - Các icon 512 được phóng to từ bản 192. Khi có file logo gốc độ phân giải cao thì nên dựng lại.
- **Deploy**:
  - Cần HTTPS (Cloudflare Pages đạt yêu cầu).
  - `public/_headers` đặt `no-cache` cho `/sw.js` và `/manifest.webmanifest` để bản mới tới được máy đã cài.
- **Giới hạn**: Workbox bỏ qua file trên 3 MB (`maximumFileSizeToCacheInBytes`) và in cảnh báo lúc build. Ảnh lớn phải nén trước.

### Ảnh

Mọi ảnh đều được lưu trên máy khách, nên phải nhẹ.

- **Quy ước**: WebP, mỗi file dưới khoảng 1.5 MB.
- **Lệnh nén**: `pnpm image <vào> <ra.webp> [--max px] [--quality q]` (`scripts/optimize-image.mjs`, dùng sharp).
- **Đã áp dụng**:

  | Ảnh | Trước | Sau |
  |---|---|---|
  | 7 sơ đồ (3770 px, giữ nguyên độ phân giải, q82) | 52 MB | 4.2 MB |
  | 5 poster (giữ kích thước, q88) | 8 MB | 0.9 MB |
  | Ảnh mẫu C17-C18 (PNG 6004 px) | 25 MB | 1.1 MB (bản 3072 px cho trình xem) + 0.2 MB (bản 1024 px làm texture) |

- **Texture trong cảnh 3D**: dùng bản nhỏ để GPU điện thoại không phải giải nén ảnh hàng chục megapixel.

## 11. Cấu trúc code

```
src/
  main.ts               giai đoạn 1: shell tổng quan, màn bắt đầu, vòng lặp render
  experience.ts         giai đoạn 2 (chunk riêng): cảnh chi tiết, nhân vật, điều khiển, HUD
  config.ts             tỉ lệ, kích thước, tốc độ, điểm spawn
  data/                 snapshot JSON + kiểu dữ liệu API
  map/                  logic thuần, có unit test (vitest)
    coords.ts           quy đổi toạ độ, Rect helpers
    parse.ts            phân loại node → ParsedMap
    facing.ts           suy ra hướng mặt quầy
    walls.ts            tường từ viền hall, cắt lỗ cửa
    colliders.ts        AABB + spatial hash + đẩy hình tròn
  scene/                dựng three.js
    setup.ts            renderer, kiểm tra WebGL2, ánh sáng, bầu trời, bắt bóng vào lưới texel
    quality.ts          mức chất lượng, đoán theo thiết bị, tự hạ khi FPS thấp
    materials.ts        toon material + ramp + cache
    instancer.ts        gom transform/màu → một InstancedMesh
    proxies.ts          khối giản lược cho màn tổng quan
    ground.ts           cỏ, đường, vỉa hè, sàn hall, zone
    walls.ts            tường, khung cửa, mái khu nhà kín (occluder để làm mờ)
    booths.ts           booth/stall/pavilion/food court (instanced)
    areas.ts            phòng, billboard, cột, sân khấu, check-in, lối vào, nhãn
    signAtlas.ts        atlas chữ cho bảng tên
  player/               nhân vật nam/nữ, điều khiển (thường + theo hướng đi), camera
  ui/                   màn bắt đầu, HUD + menu cài đặt, lưu lựa chọn (prefs.ts), CSS
    pwa.ts              đăng ký service worker, toast offline/cập nhật, nút cài app
    installHint.ts      chọn hướng dẫn cài theo thiết bị (iPhone, trình duyệt trong app)
scripts/
  optimize-image.mjs    nén ảnh sang WebP (`pnpm image`)
```

## 12. Hướng mở rộng

- **Dẫn đường**: dùng A* trên lưới 0.5 m sinh từ collider, vẽ đường chỉ dẫn trên sàn tới booth được tìm.
- **Lọc stamp rally**: làm nổi bật các booth trong cùng một group, đánh dấu trên minimap.
- **Avatar GLB** có animation (Mixamo) và thêm tuỳ chọn trang phục.
- **Multiplayer** qua WebSocket để thấy người tham quan khác.
- Hiển thị ảnh hoặc link gian (`linkUrl`, `iconUrl`) khi API có dữ liệu.
