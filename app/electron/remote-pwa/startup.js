try {
  await import('./app.js');
} catch (error) {
  console.error('Acedia Remote startup failed', error);
  const connection = document.querySelector('#connection');
  connection.dataset.state = 'offline';
  connection.querySelector('span').textContent = '초기화 실패';
  document.querySelector('#updated').textContent = '페이지를 새로고침해 주세요.';
  document.querySelector('#refreshButton').onclick = () => location.reload();
  // The app normally registers its worker after startup. A failed import
  // leaves that path unavailable, so ask the existing worker to update here.
  void navigator.serviceWorker?.getRegistration().then(registration => registration?.update()).catch(() => {});
}
