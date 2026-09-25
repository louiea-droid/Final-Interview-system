function offset(start, size) {
  return size >= 100 ? 0 : +((start * 100) / (100 - size)).toFixed(4);
}

// `crop` is react-easy-crop's croppedArea: percentages of the original photo.
// Sizing by width only keeps the photo's aspect; a box that isn't the crop's
// shape just shows a little more or less vertically.
export function photoCropStyle(url, crop, fallbackPosition = 'center') {
  const backgroundImage = `url("${url}")`;

  if (!crop) {
    return { backgroundImage, backgroundSize: 'cover', backgroundPosition: fallbackPosition };
  }

  return {
    backgroundImage,
    backgroundSize: `${+(10000 / crop.width).toFixed(4)}%`,
    backgroundPosition: `${offset(crop.x, crop.width)}% ${offset(crop.y, crop.height)}%`,
  };
}
