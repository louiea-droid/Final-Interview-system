export type PixelCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', reject);
    // Lets canvas read pixels from a cross-origin (e.g. Supabase storage)
    // URL as long as that host allows CORS; harmless for local blob: URLs.
    image.crossOrigin = 'anonymous';
    image.src = url;
  });
}

/*
 * Draws the cropped region of an image onto an off-screen canvas and
 * returns it as a File, ready to be uploaded like any other selected
 * photo.
 */
export async function getCroppedImageFile(
  imageSrc: string,
  crop: PixelCrop,
  fileName: string
): Promise<File> {
  const image = await loadImage(imageSrc);

  const canvas = document.createElement('canvas');
  canvas.width = crop.width;
  canvas.height = crop.height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not get a 2D canvas context');
  }

  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Cropping failed: canvas produced no image data.'));
        return;
      }

      resolve(new File([blob], fileName, { type: 'image/png' }));
    }, 'image/png');
  });
}
