// 图片：浏览器里压缩成 webp、裁剪 / 旋转。
import Cropper from 'cropperjs';
import { t } from './i18n/index.js';

const MAX_MB = 30;
const opts = { url: '/uploads', maxWidth: 1600, quality: 0.82, timeZone: 'UTC' };

/** 由 config.media 设置：url（网站上的图片路径前缀）、maxWidth、quality、timeZone（日期文件夹用） */
export function setImageOptions(o = {}) {
  Object.assign(opts, Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)));
  opts.url = opts.url.replace(/\/+$/, '');
}

/** 新图片的网站路径：<media.url>/<日期>/<随机>.webp */
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

/** 文件或 Blob → 压缩后的 webp Blob（限制最大宽度，按 EXIF 方向摆正） */
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
 * 打开裁剪 / 旋转窗口。src 为当前显示用的地址（同源或 blob:）。
 * 确定时返回新的 webp Blob，取消时返回 null。
 */
export function openCropper(src) {
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
    img.removeAttribute('src'); // 同一张图再次打开时也要触发 onload
    img.src = src;
    modal.hidden = false;
  });
}
