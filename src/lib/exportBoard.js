/*
 * Export PNG: a 1920x1080 picture of the draft board, exactly as /visual
 * draws it. The editor opens the draft preview in a hidden iframe with
 * ?export=1; that page loads this module and captures itself (so styles are
 * read in their own window), then hands the picture back.
 *
 * Photos come from Firebase Storage, which the capture has to read back -
 * that needs the bucket's one-time CORS setting (cors.json). Until then those
 * photos can't be included, and `missing` says how many.
 */
import { toPng } from 'html-to-image';

const WIDTH = 1920;
const HEIGHT = 1080;
const SETTLE_MS = 1500; // the board's data, fonts and first animation frame
const LOAD_TIMEOUT_MS = 30000;
const EXPORT_TIMEOUT_MS = 60000; // the whole capture, once the page is up

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* Every image URL the page draws: <img> sources and CSS background images. */
function imageUrls(doc) {
  const urls = new Set();
  for (const img of doc.images) if (img.currentSrc && !img.currentSrc.startsWith('data:')) urls.add(img.currentSrc);
  for (const node of doc.querySelectorAll('[style*="background-image"]')) {
    const match = node.style.backgroundImage.match(/url\(["']?(.*?)["']?\)/);
    if (match && !match[1].startsWith('data:')) urls.add(new URL(match[1], doc.baseURI).href);
  }
  return [...urls];
}

/* How many of those the capture can't read (a cross-origin photo without CORS). */
async function countUnreadable(urls) {
  const results = await Promise.all(
    urls.map((url) =>
      fetch(url, { mode: 'cors', cache: 'no-store' })
        .then((response) => !response.ok)
        .catch(() => true)
    )
  );
  return results.filter(Boolean).length;
}

/*
 * The capture can't draw <video> itself (it would read a blank frame and
 * fail), so videos are left out of the capture (see the filter below) and a
 * still of each one's current frame is laid over it for the moment. A video
 * whose frame can't be read back (cross-origin, no CORS) is simply absent.
 * Returns a function that takes the stills away again.
 */
async function freezeVideos(doc) {
  const stills = [];
  let missing = 0;
  for (const video of doc.querySelectorAll('video')) {
    if (!video.videoWidth) continue;
    const frame = (await frameOf(video)) ?? (await frameOf(await corsCopy(video)));
    if (!frame) {
      missing += 1; // a Storage video before the one-time CORS setup
      continue;
    }
    const still = doc.createElement('img');
    still.src = frame;
    still.className = video.className;
    still.style.cssText = video.style.cssText;
    video.after(still);
    stills.push(still);
  }
  return {
    missing,
    thaw: () => {
      for (const still of stills) still.remove();
    },
  };
}

/* The video's current frame as a JPEG data URL, half size (plenty for a board), or null if it can't be read. */
async function frameOf(video) {
  if (!video?.videoWidth) return null;
  try {
    const scale = Math.min(1, 960 / video.videoWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8); // throws for a cross-origin frame
  } catch {
    return null;
  }
}

/* The same video, opened with CORS so its frame can be read (works once the bucket allows it). */
function corsCopy(video) {
  return new Promise((resolve) => {
    const copy = document.createElement('video');
    copy.crossOrigin = 'anonymous';
    copy.muted = true;
    copy.preload = 'auto';
    const done = (value) => {
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => done(null), 8000);
    copy.addEventListener('loadeddata', () => {
      copy.currentTime = Math.min(video.currentTime, copy.duration || 0);
    }, { once: true });
    copy.addEventListener('seeked', () => done(copy), { once: true });
    copy.addEventListener('error', () => done(null), { once: true });
    copy.src = video.currentSrc || video.src;
  });
}

/** Runs inside the ?export=1 preview: captures this page at 1920x1080. */
export async function captureThisPage() {
  await pause(SETTLE_MS);
  await document.fonts.ready;
  await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));

  const unreadablePhotos = await countUnreadable(imageUrls(document));
  const { missing: unreadableVideos, thaw } = await freezeVideos(document);
  const missing = unreadablePhotos + unreadableVideos;
  try {
    await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));
    const dataUrl = await toPng(document.body, {
      width: WIDTH,
      height: HEIGHT,
      pixelRatio: 1,
      cacheBust: true,
      filter: (node) => node.tagName !== 'VIDEO',
      // a photo that can't be read becomes a transparent gap instead of failing the whole export
      imagePlaceholder: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
    });
    return { dataUrl, missing };
  } finally {
    thaw();
  }
}

/** From the editor: loads the board page off-screen with `layout`, asks it for its picture, and returns it. */
export async function exportBoardPng(layout) {
  const iframe = document.createElement('iframe');
  iframe.src = '/admin/visual-board/preview?export=1';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.tabIndex = -1;
  Object.assign(iframe.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: `${WIDTH}px`,
    height: `${HEIGHT}px`,
    border: '0',
    pointerEvents: 'none',
  });
  document.body.appendChild(iframe);

  try {
    const started = Date.now();
    // the preview registers its capture once it has mounted
    while (!iframe.contentWindow?.__boardExport) {
      if (Date.now() - started > LOAD_TIMEOUT_MS) throw new Error('the board took too long to load');
      await pause(200);
    }
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('the export took too long')), EXPORT_TIMEOUT_MS);
    });
    try {
      return await Promise.race([iframe.contentWindow.__boardExport(JSON.stringify(layout)), timeout]);
    } finally {
      clearTimeout(timer);
    }
  } finally {
    iframe.remove();
  }
}
