import bannerUrl from './assets/banner.jpg';
import sampleUrl from './assets/sample.webp';
// 1024 px copy for the two boards in the 3D scene; the full image is only decoded in the viewer.
import sampleTextureUrl from './assets/sample-texture.webp';

/** Editable booth information and assets shared by the scene and detail card. */
export const boothConfig = {
  id: 'c85d99d3-5a6e-441b-b90a-b04415706b43',
  code: 'C17–C18',
  name: 'Bốt Củ Chuối Xả kho đi Úc',
  links: [{
    label: 'Xem bài giới thiệu trên Facebook',
    url: 'https://www.facebook.com/groups/colorfiestacommunity/permalink/1395325889463952/?rdid=9xr8ANfMM91594vx#',
  }],
  assets: { banner: bannerUrl, sample: sampleUrl, sampleTexture: sampleTextureUrl },
};
