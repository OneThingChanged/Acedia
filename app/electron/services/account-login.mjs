// Only fixed, non-sensitive messages cross the account-management API.
export function accountLoginError(error) {
  const message = typeof error === 'string' ? error : error?.message || '';
  if (/device.{0,30}(enable|disabled|not allowed)|enable.{0,30}device/i.test(message)) return '기기 코드 로그인이 비활성화되어 있습니다. ChatGPT 보안 설정에서 활성화하거나 PC에서 브라우저 로그인을 사용하세요.';
  if (/address.*in use|EADDRINUSE|bind.*(port|1455)|port.*(in use|occupied)/i.test(message)) return '브라우저 로그인 콜백 포트를 사용할 수 없습니다. 진행 중인 Codex 로그인을 마친 뒤 다시 시도하세요.';
  if (/cancel/i.test(message)) return '로그인이 취소되었습니다.';
  if (/timeout|timed out|expired/i.test(message)) return '로그인 시간이 초과되었습니다. 다시 시작하세요.';
  return '인증에 실패했습니다. 로그인 방식과 Codex CLI를 확인한 뒤 다시 시도하세요.';
}
export function browserLoginUrl(value) {
  try {
    const url = new URL(value);
    if (!['https://auth.openai.com', 'https://chatgpt.com'].includes(url.origin) || url.username || url.password || url.hash) throw Error();
    const callback = new URL(url.searchParams.get('redirect_uri'));
    if (callback.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(callback.hostname) || callback.username || callback.password || callback.pathname !== '/auth/callback') throw Error();
    return url.href;
  } catch { throw Object.assign(new Error('브라우저 로그인 주소를 확인할 수 없습니다. Codex CLI를 업데이트하세요.'), { status: 400 }); }
}
