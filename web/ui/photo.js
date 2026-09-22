// A room's photograph: shrink it on the phone, then send it. The same pipeline the old app uses (web/js/room.js):
// the hub's cap is 400 kB, and a photo shrunk to 1024 on its long edge lands at 30 to 60 kB, so a refusal the
// phone could have predicted never travels. The bytes live on the hub; the config carries only a stamp.

const MAX_PICK = 25 * 1024 * 1024;
const MAX_SEND = 400 * 1024;

export async function photoBlob(file) {
  if (file.size > MAX_PICK) throw new Error('That photo is too big. Try one under 25 MB.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('decode')); i.src = url; });
    const scale = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(img.naturalWidth * scale));
    cv.height = Math.max(1, Math.round(img.naturalHeight * scale));
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    for (const q of [0.72, 0.6, 0.5]) {
      const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', q));
      if (blob && blob.size <= MAX_SEND) return blob;
    }
    throw new Error('That photo is too big. Try one under 25 MB.');
  } catch (e) {
    if (/too big/.test(e.message)) throw e;
    throw new Error('That file is not a photo. Pick an image.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

const dataURL = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('read')); r.readAsDataURL(blob); });

// Returns the stamp the hub gave the new photo.
export async function sendPhoto(data, aid, blob) {
  if (navigator.onLine === false) throw new Error('No connection. The photo was not added.');
  const body = JSON.stringify({ data: await dataURL(blob) });
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const out = await data.api(`/api/roomphoto/${encodeURIComponent(aid)}`, { method: 'PUT', body, signal: ctl.signal });
    return String(out.stamp);
  } catch (e) {
    if (e && (e.name === 'AbortError' || /fetch|network|load failed/i.test(e.message || ''))) throw new Error('No connection. The photo was not added.');
    throw new Error(e && e.message ? e.message : 'The photo did not save.');
  } finally { clearTimeout(timer); }
}

// Open the phone's own picker (Photo Library, Take Photo, Choose File) and hand the file back.
export function pickFile() {
  return new Promise(res => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.style.cssText = 'position:fixed;left:-9999px;opacity:0';
    inp.addEventListener('change', () => { res(inp.files && inp.files[0] || null); inp.remove(); });
    document.body.appendChild(inp);
    inp.click();
  });
}
