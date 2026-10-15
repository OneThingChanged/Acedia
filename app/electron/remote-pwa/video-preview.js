import { t } from './i18n.js';

const previews = new WeakMap();

export function videoAccessError(status) {
  if (status === 404) return t('영상 파일을 찾을 수 없습니다. 파일 경로를 확인하세요.');
  if (status === 401 || status === 403) return t('영상 파일에 접근할 수 없습니다. 로그인 상태와 접근 권한을 확인하세요.');
  if (status === 415) return t('지원하지 않는 영상 형식입니다. MP4 또는 WebM 파일을 사용하세요.');
  return t('영상을 불러오지 못했습니다 (HTTP {0}).', [status]);
}

export function videoPlaybackError(code) {
  if (code === 2) return t('영상을 불러오는 중 네트워크 연결이 끊겼습니다. 다시 시도해 주세요.');
  if (code === 3 || code === 4) return t('이 영상의 형식이나 코덱을 재생할 수 없습니다. 다운로드해서 확인해 주세요.');
  return t('영상을 재생하지 못했습니다. 다운로드해서 확인해 주세요.');
}

export function cancelVideoPreview(video) {
  previews.get(video)?.abort();
  previews.delete(video);
  video.onerror = null;
}

export async function loadVideoPreview(video, url, { isCurrent, onError }) {
  cancelVideoPreview(video);
  const controller = new AbortController();
  previews.set(video, controller);
  const current = () => previews.get(video) === controller && isCurrent();
  const fail = message => { if (current()) onError(message); };
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    // A media element hides HTTP errors behind MEDIA_ERR_SRC_NOT_SUPPORTED.
    // Check access without downloading the video before assigning its source.
    const response = await fetch(url, { method: 'HEAD', cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
    if (!current()) return false;
    if (!response.ok) { fail(videoAccessError(response.status)); return false; }
    video.onerror = () => fail(videoPlaybackError(video.error?.code));
    video.src = url;
    return true;
  } catch {
    fail(t('영상에 연결하지 못했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.'));
    return false;
  } finally { clearTimeout(timeout); }
}
