// Photo preparation: decode (EXIF orientation is applied by the browser), downscale,
// and produce a JPEG for the AI plus a smaller thumbnail to store and sync.

function loadImg(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that image. Try a JPEG or PNG photo."));
    };
    img.src = url;
  });
}

function draw(img, maxEdge) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; // transparent PNGs -> white background
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const toBlob = (canvas, quality) =>
  new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't process that image."))), "image/jpeg", quality),
  );

export async function preparePhoto(file) {
  if (!file) throw new Error("No photo selected.");
  if (file.size > 40 * 1024 * 1024) throw new Error("That photo is too large.");
  const img = await loadImg(file);
  const big = draw(img, 1280);
  const dataUrl = big.toDataURL("image/jpeg", 0.82);
  const thumb = await toBlob(draw(img, 640), 0.74);
  return { dataUrl, thumb, previewUrl: URL.createObjectURL(thumb) };
}

export async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
