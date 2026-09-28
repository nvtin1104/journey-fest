# journey-fest

Bản đồ 3D (three.js) cho sự kiện Color Fiesta: một nhân vật chibi đi từ lối vào, qua khu Check-in, tham quan từng gian hàng.

Thiết kế chi tiết: [docs/DESIGN.md](docs/DESIGN.md).

## Chạy

```bash
npm install
npm run dev       # http://localhost:5173
npm test          # unit test cho phần xử lý dữ liệu map
npm run build     # bản build tĩnh trong dist/ (deploy Vercel/Netlify)
```

Mặc định app dùng snapshot `src/data/event-map.json`. Để lấy dữ liệu live:

```bash
VITE_MAP_URL="https://map-cdn.colorfiesta.vn/events/<eventId>/map" npm run dev
```

## Điều khiển

| | Máy tính | Điện thoại |
|---|---|---|
| Đi | WASD / phím mũi tên | Joystick |
| Chạy | Shift | Kéo joystick hết cỡ |
| Xoay camera | Kéo chuột | Vuốt |
| Zoom | Cuộn chuột | Chụm hai ngón |
| Đi tới điểm | Bấm lên sàn | Chạm lên sàn |
| Toàn cảnh | M | Nút "Toàn cảnh" |

- Tìm gian hàng theo mã hoặc tên ở ô tìm kiếm.
- Link `/#A15` mở thẳng tới trước quầy A15.
