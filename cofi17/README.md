# journey-fest

Bản đồ 3D (three.js) cho sự kiện Color Fiesta: một nhân vật (nam hoặc nữ) đi từ lối vào, qua khu Check-in, tham quan từng gian hàng.

Thiết kế chi tiết: [docs/DESIGN.md](docs/DESIGN.md).

## Chạy

```bash
pnpm install
pnpm dev          # http://localhost:4317
pnpm test         # unit test cho phần xử lý dữ liệu map
pnpm build        # bản build tĩnh trong dist/ (deploy Cloudflare Pages / Vercel / Netlify)
pnpm deploy:cf    # build và deploy lên Cloudflare Pages qua wrangler
pnpm image <vào> <ra.webp>   # nén ảnh mới sang WebP trước khi thêm vào public/ hoặc src/
```

Mặc định app dùng snapshot `src/data/event-map.json`. Để lấy dữ liệu live:

```bash
VITE_MAP_URL="https://map-cdn.colorfiesta.vn/events/<eventId>/map" pnpm dev
```

Khi mở trang, app chỉ tải phần toàn cảnh. Chọn **Nam / Nữ** rồi bấm **Bắt đầu tham quan** để tải chi tiết và vào từ lối vào khu Check-in.

## Điều khiển

| | Máy tính | Điện thoại |
|---|---|---|
| Đi | WASD / phím mũi tên | Joystick |
| Chạy | Shift | Kéo joystick hết cỡ |
| Xoay camera | Kéo chuột | Vuốt |
| Zoom | Cuộn chuột | Chụm hai ngón |
| Đi tới điểm | Bấm lên sàn | Chạm lên sàn |
| Toàn cảnh | M | Nút "Toàn cảnh" |
| Camera theo hướng đi | F (khi bật: W/S đi, A/D xoay) | Nút "Camera theo hướng đi" |
| Đổi nhân vật, chất lượng đồ hoạ | Nút ⚙ | Như máy tính |

- Tìm gian hàng theo mã hoặc tên ở ô tìm kiếm.
- Link `/#A15` mở thẳng tới trước quầy A15 (sau khi bấm Bắt đầu).
- NPC cosplay **Hsin (Jinhsi – Wuthering Waves) · Phương Anh** đi dạo trước sân khấu chính ở Hall A3. Lại gần hoặc chạm vào bạn ấy để nghe thoại (`src/npc/hsin.ts`).

## Thiết bị hỗ trợ

- Cần trình duyệt có **WebGL2**: iPhone/iPad iOS 15 trở lên, Chrome/Edge/Firefox 100+, Samsung Internet. Nếu thiếu, màn Bắt đầu sẽ báo rõ lý do.
- Chất lượng đồ hoạ mặc định là **Tự động**: chọn mức theo thiết bị và tự hạ khi máy chạy chậm. Có thể chọn tay Cao / Vừa / Thấp trong menu ⚙.
- Điện thoại dùng joystick ảo. Toàn cảnh tự vừa màn hình dọc.

## Dùng offline & cài vào màn hình chính

Mở trang **một lần khi có mạng**: app tự lưu toàn bộ bản đồ, poster, sơ đồ và font (khoảng 8 MB), rồi báo "Đã lưu bản đồ". Từ đó mở được cả khi không có mạng.

| Thiết bị | Cách cài |
|---|---|
| Android (Chrome, Samsung Internet), máy tính (Chrome, Edge) | Bấm **Cài vào màn hình chính** trên màn Bắt đầu hoặc trong menu ⚙ |
| iPhone / iPad (Safari) | Bấm nút **Chia sẻ**, rồi chọn **Thêm vào MH chính** |
| Mở từ Facebook, Messenger, Zalo… | Mở link bằng Safari/Chrome trước, rồi cài như trên |

- Khi có bản mới, app hiện thông báo **Đã có bản cập nhật**. Bấm **Cập nhật** để dùng bản mới.
- Chỉ chạy offline trên bản deploy qua **HTTPS** (Cloudflare Pages đạt yêu cầu) hoặc `pnpm preview` trên localhost. `pnpm dev` không bật service worker.
- Ảnh mới cần nén bằng `pnpm image` trước khi thêm vào. File trên 3 MB sẽ không được lưu offline, và build sẽ in cảnh báo.
