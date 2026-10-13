// Single source of truth for event facts: used by the page sections, JSON-LD, the countdown and the .ics file.

export const EVENT = {
  name: 'Artist Day 21: Wasteland',
  vol: 21,
  theme: 'Wasteland',
  tagline: 'Khi nghệ thuật hồi sinh sự sống',
  dateLabel: '08.11.2026',
  weekday: 'Chủ nhật',
  timeLabel: '10:00 – 17:00',
  start: '2026-11-08T10:00:00+07:00',
  end: '2026-11-08T17:00:00+07:00',
  venue: 'AEON MALL Tân Phú Celadon',
  spot: 'Bãi xe P6 – Tháp ô tô',
  street: '30 Tân Thắng',
  ward: 'Tân Sơn Nhì',
  city: 'TP. Hồ Chí Minh',
  organizer: 'Fly Media',
  facebook: 'https://www.facebook.com/artistdayvietnam',
  // Direct Google Drive link (the bit.ly short link shows Bitly's preview interstitial first).
  frameUrl: 'https://drive.google.com/file/d/1AdpgS5zPSGO_9w1yuTY4oZTFducA8kC8/view?usp=drive_link',
  mapsQuery: 'AEON MALL Tân Phú Celadon, 30 Tân Thắng, Tân Sơn Nhì, TP.HCM',
} as const;

export const fullAddress = `${EVENT.street}, ${EVENT.ward}, ${EVENT.city}`;
export const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(EVENT.mapsQuery)}`;
export const mapEmbedUrl = `https://www.google.com/maps?q=${encodeURIComponent(EVENT.mapsQuery)}&hl=vi&z=16&output=embed`;

export const DESCRIPTION =
  'Artist Day 21: Wasteland – ngày hội họa sĩ lớn nhất miền Nam 2026. Chủ nhật 08/11/2026, 10:00–17:00 tại Bãi xe P6, ' +
  'Tháp ô tô – AEON MALL Tân Phú Celadon, TP.HCM. Miễn phí vào cửa: chợ phiên họa sĩ, workshop tái chế, live commission, ' +
  'cosplay, OC trading và sân khấu âm nhạc.';

export type Activity = {
  id: string;
  title: string;
  text: string;
  icon: 'store' | 'recycle' | 'brush' | 'sparkles' | 'star' | 'cards' | 'hand' | 'music';
  tone: 'leaf' | 'sky' | 'sun' | 'coral' | 'lilac' | 'mint';
};

export const ACTIVITIES: Activity[] = [
  {
    id: 'cho-phien',
    title: 'Chợ phiên họa sĩ',
    text: 'Lạc lối trong ma trận goods độc quyền. Săn merch “xanh”, rước waifu/husbando về dinh từ hàng trăm gian hàng artist xịn xò.',
    icon: 'store',
    tone: 'leaf',
  },
  {
    id: 'workshop',
    title: 'Workshop “Tái chế”',
    text: 'Tự tay hô biến vật liệu “hết đát” thành siêu phẩm nghệ thuật mang đậm dấu ấn cá nhân, bảo vệ môi trường theo cách của dân hệ art.',
    icon: 'recycle',
    tone: 'mint',
  },
  {
    id: 'oc-trading',
    title: 'Original Character Trading',
    text: 'Sân chơi cho các artist khoe “con cưng”: trao đổi OC, flex card và săn lùng những thiết kế độc nhất.',
    icon: 'cards',
    tone: 'sky',
  },
  {
    id: 'live-art',
    title: 'Live Art & Live Commission',
    text: 'Chốt đơn commission tại trận, ngắm artist vẽ trực tiếp và rinh art xịn nóng hổi mang về.',
    icon: 'brush',
    tone: 'coral',
  },
  {
    id: 'hobby',
    title: 'Hobby, Cosplay & More Artists',
    text: 'Đâu chỉ có art 2D! Hội tụ artist mọi “hệ phái”: đồ hobby, thủ công, cosplay và vô số siêu phẩm mang chất riêng.',
    icon: 'sparkles',
    tone: 'lilac',
  },
  {
    id: 'guests',
    title: 'Meet “The Guests”',
    text: 'Đu idol artist thành công! Vừa có các họa sĩ tài năng, vừa có dàn idol group cực “choáy”.',
    icon: 'star',
    tone: 'sun',
  },
  {
    id: 'diy',
    title: 'DIY & Trải nghiệm',
    text: 'Góc chill sáng tạo, tự do nhào nặn và đem về món đồ handmade có 1-0-2 từ vật liệu tái chế.',
    icon: 'hand',
    tone: 'leaf',
  },
  {
    id: 'music',
    title: 'Music Save The Earth',
    text: 'Quẩy bung nóc với tracklist cực cháy. Chuẩn bị lightstick để cháy hết mình cùng các tiết mục live bùng nổ năng lượng!',
    icon: 'music',
    tone: 'coral',
  },
];

export const FAQ = [
  {
    q: 'Artist Day 21 có mất phí vào cửa không?',
    a: 'Không. Artist Day 21: Wasteland mở cửa miễn phí cho tất cả khách tham quan.',
  },
  {
    q: 'Sự kiện diễn ra khi nào và ở đâu?',
    a: `Chủ nhật 08/11/2026, từ 10:00 đến 17:00 tại ${EVENT.spot}, ${EVENT.venue} – ${fullAddress}.`,
  },
  {
    q: 'Có quà cho khách tham quan không?',
    a: 'Có! Kỳ này Artist Day chuẩn bị GIFT SUPER VIP và “cơn mưa quà check-in” cho khách tham quan, bất kể bạn là fan của thể loại nào. Nhớ đến sớm để xí phần nhé.',
  },
  {
    q: 'Tải frame nhận diện ở đâu?',
    a: 'Bấm nút “Tải frame” trên trang này (file ảnh chính thức trên Google Drive), chèn ảnh outfit và text của bạn rồi đăng lên mạng xã hội để bạn bè dễ nhận ra bạn tại AD21.',
  },
  {
    q: 'Artist Day 22 khi nào diễn ra?',
    a: 'Vol.22 mang chủ đề “Fever Dream” – coming soon. Theo dõi fanpage Artist Day Vietnam để cập nhật sớm nhất.',
  },
];
