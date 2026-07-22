// Stub for next/image so @splinetool/react-spline/next works in Vite
import React from 'react';

const Image = (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  <img {...props} />
);

export default Image;
