import { photoCropStyle } from '../lib/photoCrop';

export default function CandidatePhoto({ url, crop, alt, className, position }) {
  return (
    <div
      role="img"
      aria-label={alt}
      className={className}
      style={{ ...photoCropStyle(url, crop, position), backgroundRepeat: 'no-repeat' }}
    />
  );
}
