// "Install app" support: Android/desktop install prompt + iPhone instructions
(() => {
  if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  let deferred = null;
  const buttons = () => document.querySelectorAll('[data-install]');
  const show = on => buttons().forEach(b => b.style.display = on ? '' : 'none');
  show(false);
  if (standalone) return;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; show(true); });
  addEventListener('appinstalled', () => { deferred = null; show(false); });
  if (isIOS) show(true);
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-install]'); if (!b) return;
    e.preventDefault();
    if (deferred) { deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; show(false); return; }
    let h = document.getElementById('ios-hint');
    if (!h) {
      h = document.createElement('div'); h.id = 'ios-hint';
      h.innerHTML = `<b>Install TourGuyed</b><p>${isIOS ? 'Tap the <b>Share</b> button <span style="font-size:18px">⎋</span> at the bottom of Safari, then choose <b>Add to Home Screen</b>.' : 'Open your browser menu (⋮) and choose <b>Install app</b> or <b>Add to Home screen</b>.'}</p><button>Got it</button>`;
      h.querySelector('button').onclick = () => h.remove(); document.body.appendChild(h);
    }
  });
})();
