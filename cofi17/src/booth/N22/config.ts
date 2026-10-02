import bannerUrl from './assets/banner.webp';
import sample1 from './assets/sample/sample1.webp';
import sample1Thumb from './assets/sample/sample1-thumb.webp';
import sample2 from './assets/sample/sample2.webp';
import sample2Thumb from './assets/sample/sample2-thumb.webp';
import sample3 from './assets/sample/sample3.webp';
import sample3Thumb from './assets/sample/sample3-thumb.webp';
import sample4 from './assets/sample/sample4.webp';
import sample4Thumb from './assets/sample/sample4-thumb.webp';
import sample5 from './assets/sample/sample5.webp';
import sample5Thumb from './assets/sample/sample5-thumb.webp';
import sample6 from './assets/sample/sample6.webp';
import sample6Thumb from './assets/sample/sample6-thumb.webp';
import sample7 from './assets/sample/sample7.webp';
import sample7Thumb from './assets/sample/sample7-thumb.webp';

export const boothConfig = {
  id: '5e577b1f-ae3e-40ad-9aad-0f564c4c3ac3',
  code: 'N22',
  name: 'Lý Minh Hoàng',
  bannerAspect: 1280 / 473,
  banner: bannerUrl,
  samples: [
    { full: sample1, thumbnail: sample1Thumb, title: 'Mẫu 1', aspect: 1280 / 720 },
    { full: sample2, thumbnail: sample2Thumb, title: 'Mẫu 2', aspect: 1280 / 851 },
    { full: sample3, thumbnail: sample3Thumb, title: 'Mẫu 3', aspect: 851 / 1280 },
    { full: sample4, thumbnail: sample4Thumb, title: 'Mẫu 4', aspect: 851 / 1280 },
    { full: sample5, thumbnail: sample5Thumb, title: 'Mẫu 5', aspect: 1280 / 851 },
    { full: sample6, thumbnail: sample6Thumb, title: 'Mẫu 6', aspect: 851 / 1280 },
    { full: sample7, thumbnail: sample7Thumb, title: 'Mẫu 7', aspect: 1280 / 851 },
  ],
} as const;
