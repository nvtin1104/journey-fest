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

export const boothConfig = {
  id: '10e1e0e0-97c7-44b3-8e19-11a5aed76789',
  code: 'A9',
  name: 'Chop chop the factory',
  bannerAspect: 1800 / 1345,
  banner: bannerUrl,
  samples: [
    { full: sample1, thumbnail: sample1Thumb, title: 'Mẫu 1' },
    { full: sample2, thumbnail: sample2Thumb, title: 'Mẫu 2' },
    { full: sample3, thumbnail: sample3Thumb, title: 'Mẫu 3' },
    { full: sample4, thumbnail: sample4Thumb, title: 'Mẫu 4' },
    { full: sample5, thumbnail: sample5Thumb, title: 'Mẫu 5' },
    { full: sample6, thumbnail: sample6Thumb, title: 'Mẫu 6' },
  ],
} as const;
