// Images: compressed to webp in the browser, cropped and rotated.
import { t } from './i18n/index.js';

// Cropper.js and its stylesheet are a good chunk of the editor and are only needed once someone
// crops an image, so they are built separately and fetched the first time the crop window opens.
let cropperLib;

function loadCropper() {
  if (cropperLib) return Promise.resolve(cropperLib);
  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = __CROPPER_CSS__; // eslint-disable-line no-undef
    document.head.append(link);

    const script = document.createElement('script');
    script.src = __CROPPER_JS__; // eslint-disable-line no-undef
    script.onload = () => {
      cropperLib = window.simpleGitCmsCropper.Cropper;
      resolve(cropperLib);
    };
    script.onerror = () => reject(new Error(t('img.cropperLoadFailed')));
    document.head.append(script);
  });
}

const MAX_MB = 30;
const opts = { url: '/uploads', maxWidth: 1600, quality: 0.82, timeZone: 'UTC' };

/** Set from config.media: url (the path prefix on the site), maxWidth, quality, and timeZone
 * (which decides the dated folder). */
export function setImageOptions(o = {}) {
  Object.assign(opts, Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)));
  opts.url = opts.url.replace(/\/+$/, '');
}

/** Path on the site for a new image: <media.url>/<date>/<random>.webp */
export function newImagePath() {
  const day = new Date().toLocaleDateString('sv-SE', { timeZone: opts.timeZone }).replaceAll('-', '');
  const rand = crypto.getRandomValues(new Uint32Array(2)).reduce((s, n) => s + n.toString(36), '').slice(0, 10);
  return `${opts.url}/${day}/${rand}.webp`;
}

async function canvasToWebp(canvas) {
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', opts.quality));
  if (!blob) throw new Error(t('img.compressFailed'));
  return blob;
}

/** A File or Blob to a compressed webp Blob, capped at the maximum width and turned the right
 * way up according to its EXIF orientation. */
export async function compressImage(file) {
  if (!file.type.startsWith('image/')) throw new Error(t('img.notImage'));
  if (file.size > MAX_MB * 1024 * 1024) throw new Error(t('img.tooLarge', { mb: MAX_MB }));
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, opts.maxWidth / bmp.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvasToWebp(canvas);
}

/**
 * Open the crop/rotate window. `src` is the address the image is currently displayed from —
 * same-origin or a blob: URL. Resolves to a new webp Blob, or null if cancelled.
 */
export async function openCropper(src) {
  const Cropper = await loadCropper();
  const modal = document.getElementById('crop-modal');
  const img = modal.querySelector('img');
  return new Promise((resolve) => {
    let cropper;
    const close = (result) => {
      cropper?.destroy();
      modal.hidden = true;
      modal.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const onKey = (e) => e.key === 'Escape' && close(null);
    const onClick = async (e) => {
      const btn = e.target.closest('[data-crop]');
      if (!btn) return;
      const act = btn.dataset.crop;
      if (act === 'cancel') return close(null);
      if (act === 'left') return cropper.rotate(-90);
      if (act === 'right') return cropper.rotate(90);
      if (act === 'reset') return cropper.reset();
      if (act.startsWith('ratio:')) {
        modal.querySelectorAll('[data-crop^="ratio:"]').forEach((b) => b.classList.toggle('on', b === btn));
        const r = act.slice(6);
        return cropper.setAspectRatio(r === 'free' ? NaN : Number(r));
      }
      if (act === 'apply') {
        const canvas = cropper.getCroppedCanvas({ maxWidth: opts.maxWidth, maxHeight: 4000, imageSmoothingQuality: 'high' });
        close(await canvasToWebp(canvas));
      }
    };
    modal.querySelectorAll('[data-crop^="ratio:"]').forEach((b) => b.classList.toggle('on', b.dataset.crop === 'ratio:free'));
    modal.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    img.onload = () => {
      cropper = new Cropper(img, { viewMode: 1, autoCropArea: 1, background: false, responsive: true, checkOrientation: false });
    };
    img.crossOrigin = 'anonymous';
    img.removeAttribute('src'); // so onload fires again when the same image is reopened
    img.src = src;
    modal.hidden = false;
  });
}
