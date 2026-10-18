// Broken metadata or a browser decoder must never block an import indefinitely.
export function readDuration(file, timeoutMs = 6000) {
  return new Promise((resolve) => {
    const audio = document.createElement('audio');
    const url = URL.createObjectURL(file);
    let timer;
    const finish = (duration = 0) => {
      clearTimeout(timer);
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(duration) ? duration : 0);
    };
    timer = setTimeout(finish, timeoutMs);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => finish(audio.duration);
    audio.onerror = () => finish();
    audio.src = url;
  });
}

export function readTags(file, reader = window.jsmediatags, timeoutMs = 6000) {
  return new Promise((resolve) => {
    if (!reader) return resolve({});
    const timer = setTimeout(() => resolve({}), timeoutMs);
    const finish = (tags = {}) => { clearTimeout(timer); resolve(tags); };
    try { reader.read(file, { onSuccess: ({ tags }) => finish(tags), onError: () => finish() }); }
    catch { finish(); }
  });
}

export async function pictureDataUrl(picture) {
  if (!picture?.data?.length || picture.data.length > 2 * 1024 * 1024) return '';
  const blob = new Blob([new Uint8Array(picture.data)], { type: picture.format || 'image/jpeg' });
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve('');
    reader.readAsDataURL(blob);
  });
}
