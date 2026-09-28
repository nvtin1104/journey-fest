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

## Thiết bị hỗ trợ

- Cần trình duyệt có **WebGL2**: iPhone/iPad iOS 15 trở lên, Chrome/Edge/Firefox 100+, Samsung Internet. Nếu thiếu, màn Bắt đầu sẽ báo rõ lý do.
- Chất lượng đồ hoạ mặc định là **Tự động**: chọn mức theo thiết bị và tự hạ khi máy chạy chậm. Có thể chọn tay Cao / Vừa / Thấp trong menu ⚙.
- Điện thoại dùng joystick ảo. Toàn cảnh tự vừa màn hình dọc.
