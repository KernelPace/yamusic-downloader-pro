(function() {
  'use strict';
  
  // 1. НЕВИДИМЫЙ ШПИОН: Каждую секунду запрашивает ID трека у плеера.
  // Это ГАРАНТИРОВАННО ловит первую песню при открытии страницы, 
  // так как для неё не бывает сетевых запросов.
  setInterval(() => {
    try {
      if (window.externalAPI) {
        const t = window.externalAPI.getCurrentTrack();
        if (t && t.id) {
          document.dispatchEvent(new CustomEvent('ym-dl-track-id', { detail: String(t.id) }));
        }
      }
    } catch (e) {}
  }, 1000);

  // 2. СЕТЕВОЙ ПЕРЕХВАТЧИК: Ловит ID из любых пролетающих запросов (как фоллбэк)
  const _orig = window.fetch;
  window.fetch = async function() {
    const url = arguments[0]?.url || arguments[0] || '';
    const m = url.match(/trackIds?=(\d+)/i) || url.match(/\/tracks\/(\d+)/i);
    
    if (m) {
      document.dispatchEvent(new CustomEvent('ym-dl-track-id', { detail: m[1] }));
    }

    return _orig.apply(this, arguments);
  };
})();