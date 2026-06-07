(() => {
  'use strict';

  let _vibeCurrentTrackId = null;
  let _recentVibeTracks = [];

  document.addEventListener('ym-dl-track-id', (e) => {
    if (!e.detail) return;
    const id = String(e.detail);
    
    // Записываем каждый перехваченный трек в историю (до 10 штук)
    _recentVibeTracks = _recentVibeTracks.filter(x => x !== id);
    _recentVibeTracks.push(id);
    if (_recentVibeTracks.length > 10) _recentVibeTracks.shift();

    _vibeCurrentTrackId = id; 
    
    const existingVibe = document.querySelector('.ym-dl-btn-vibe');
    if (!existingVibe || existingVibe.dataset.downloading !== 'true') {
      setTimeout(() => injectVibePlayerButton(), 200);
    }
  });

  const cfg = globalThis.YM_DL_BUTTON_CONFIG;
  if (!cfg) return;

  const { buttons: BTN, selectors: SEL, states: ST } = cfg;
  const MD5_SALT = 'XGRlBW9FXlekgbPrRHuSiA';
  const API_BASE = 'https://api.music.yandex.ru';

  const _getTrackIdFromUrl = () => {
    const m = location.href.match(/\/track\/(\d+)/);
    return m ? m[1] : null;
  };

  let _lastClickedTrackId = _getTrackIdFromUrl();
  let _lastHref = location.href;
  setInterval(() => {
    if (location.href !== _lastHref) {
      _lastHref = location.href;
      const fromUrl = _getTrackIdFromUrl();
      if (fromUrl) _lastClickedTrackId = fromUrl;
    }
  }, 300);

  // --- УМНЫЙ АЛГОРИТМ ПОИСКА ИГРАЮЩЕГО ТРЕКА ---
  async function getExactVibeTrackId(domTitle, domArtist) {
    if (!domTitle) return null;
    const searchTitle = domTitle.toLowerCase().trim();

    // 1. Ищем точное совпадение в истории (решает проблему прелоадов)
    if (_recentVibeTracks.length > 0) {
      const ids = [..._recentVibeTracks].reverse(); 
      for (const id of ids) {
        try {
          const meta = await fetchMeta(id);
          const metaTitle = (meta.title || '').toLowerCase().trim();
          if (metaTitle === searchTitle || metaTitle.includes(searchTitle) || searchTitle.includes(metaTitle)) {
            return id;
          }
        } catch(e) {}
      }
    }
    
    // 2. Если история пуста, ищем через официальный Поиск Яндекса
    try {
      const cleanArtist = (domArtist === 'Яндекс Музыка') ? '' : domArtist;
      const query = encodeURIComponent(`${cleanArtist} ${domTitle}`.trim());
      const res = await fetch(`${API_BASE}/search?text=${query}&type=track`, { credentials: 'include' });
      
      if (res.ok) {
        const json = await res.json();
        const track = json?.result?.tracks?.results?.[0];
        if (track && track.id) {
          console.log('[YM-DL] 🔍 Трек найден через Search API:', track.id);
          return String(track.id);
        }
      }
    } catch(e) {}
    
    return null; 
  }

  async function fetchMeta(trackId) {
    const res = await fetch(`${API_BASE}/tracks/${trackId}`, { credentials: 'include' });
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    const json = await res.json();
    return json.result[0];
  }

  function buildFileName(meta) {
    const artists = (meta.artists || []).map(a => a.name).filter(Boolean).join(', ') || 'Unknown Artist';
    const title   = meta.title || 'Unknown Title';
    const version = meta.version ? ` (${meta.version})` : ''; 
    const rawName = `${artists} - ${title}${version}`;
    return rawName.replace(/[\/\\?%*:|"<>]/g, '_');
  }

  async function performDownload(trackId, btn = null) {
    const isUI = !!btn;
    // Блокируем множественные клики
    if (isUI && btn.dataset.downloading === 'true') return;
    
    const setUI = (html) => { if (isUI) btn.innerHTML = html; };

    if (isUI) {
      btn.dataset.downloading = 'true';
      btn.style.cursor = 'not-allowed';
      setUI(ST.loading);
    }

    try {
      const [meta, infoRes] = await Promise.all([
        fetchMeta(trackId),
        fetch(`${API_BASE}/tracks/${trackId}/download-info`, { credentials: 'include' })
      ]);
      
      const fileName = buildFileName(meta);
      const infoData = await infoRes.json();
      const variants = infoData.result || [];
      const pool = variants.filter(v => v.codec === 'mp3' && !v.preview);
      if (!pool.length) throw new Error('Нет MP3 варианта');
      pool.sort((a, b) => b.bitrateInKbps - a.bitrateInKbps);
      const best = pool[0];

      const xmlRes = await fetch(best.downloadInfoUrl);
      const xml = new DOMParser().parseFromString(await xmlRes.text(), 'text/xml');
      const host = xml.querySelector('host')?.textContent;
      const path = xml.querySelector('path')?.textContent;
      const ts   = xml.querySelector('ts')?.textContent;
      const s    = xml.querySelector('s')?.textContent;
      if (!host || !path || !ts || !s) throw new Error('Ошибка XML');

      function md5(string) {
        function safeAdd(x, y) { const lsw = (x & 0xFFFF) + (y & 0xFFFF); const msw = (x >> 16) + (y >> 16) + (lsw >> 16); return (msw << 16) | (lsw & 0xFFFF); }
        function bitRotateLeft(num, cnt) { return (num << cnt) | (num >>> (32 - cnt)); }
        function md5cmn(q, a, b, x, s, t) { return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b); }
        function md5ff(a,b,c,d,x,s,t){ return md5cmn((b&c)|((~b)&d),a,b,x,s,t); } function md5gg(a,b,c,d,x,s,t){ return md5cmn((b&d)|(c&(~d)),a,b,x,s,t); }
        function md5hh(a,b,c,d,x,s,t){ return md5cmn(b^c^d,a,b,x,s,t); } function md5ii(a,b,c,d,x,s,t){ return md5cmn(c^(b|(~d)),a,b,x,s,t); }
        const M = new Array(Math.ceil((string.length + 8) / 64) * 64 / 4).fill(0);
        for (let i=0; i<string.length; i++) M[i >> 2] |= string.charCodeAt(i) << ((i%4)*8);
        M[string.length >> 2] |= 0x80 << ((string.length%4)*8); M[M.length-2] = string.length*8;
        let a=1732584193, b=-271733879, c=-1732584194, d=271733878;
        for (let i=0; i<M.length; i+=16) {
          const [oa,ob,oc,od]=[a,b,c,d];
          a=md5ff(a,b,c,d,M[i+ 0], 7,-680876936); d=md5ff(d,a,b,c,M[i+ 1],12,-389564586); c=md5ff(c,d,a,b,M[i+ 2],17, 606105819); b=md5ff(b,c,d,a,M[i+ 3],22,-1044525330);
          a=md5ff(a,b,c,d,M[i+ 4], 7,-176418897); d=md5ff(d,a,b,c,M[i+ 5],12, 1200080426); c=md5ff(c,d,a,b,M[i+ 6],17,-1473231341);b=md5ff(b,c,d,a,M[i+ 7],22,-45705983);
          a=md5ff(a,b,c,d,M[i+ 8], 7, 1770035416); d=md5ff(d,a,b,c,M[i+ 9],12,-1958414417); c=md5ff(c,d,a,b,M[i+10],17,-42063);      b=md5ff(b,c,d,a,M[i+11],22,-1990404162);
          a=md5ff(a,b,c,d,M[i+12], 7, 1804603682); d=md5ff(d,a,b,c,M[i+13],12,-40341101); c=md5ff(c,d,a,b,M[i+14],17,-1502002290);b=md5ff(b,c,d,a,M[i+15],22, 1236535329);
          a=md5gg(a,b,c,d,M[i+ 1], 5,-165796510); d=md5gg(d,a,b,c,M[i+ 6], 9,-1069501632); c=md5gg(c,d,a,b,M[i+11],14, 643717713); b=md5gg(b,c,d,a,M[i+ 0],20,-373897302);
          a=md5gg(a,b,c,d,M[i+ 5], 5,-701558691); d=md5gg(d,a,b,c,M[i+10], 9, 38016083); c=md5gg(c,d,a,b,M[i+15],14,-660478335); b=md5gg(b,c,d,a,M[i+ 4],20,-405537848);
          a=md5gg(a,b,c,d,M[i+ 9], 5, 568446438); d=md5gg(d,a,b,c,M[i+14], 9,-1019803690); c=md5gg(c,d,a,b,M[i+ 3],14,-187363961); b=md5gg(b,c,d,a,M[i+ 8],20,1163531501);
          a=md5gg(a,b,c,d,M[i+13], 5,-1444681467);d=md5gg(d,a,b,c,M[i+ 2], 9,-51403784); c=md5gg(c,d,a,b,M[i+ 7],14,1735328473); b=md5gg(b,c,d,a,M[i+12],20,-1926607734);
          a=md5hh(a,b,c,d,M[i+ 5], 4,-378558);    d=md5hh(d,a,b,c,M[i+ 8],11,-2022574463); c=md5hh(c,d,a,b,M[i+11],16, 1839030562);b=md5hh(b,c,d,a,M[i+14],23,-35309556);
          a=md5hh(a,b,c,d,M[i+ 1], 4,-1530992060);d=md5hh(d,a,b,c,M[i+ 4],11, 1272893353); c=md5hh(c,d,a,b,M[i+ 7],16,-155497632); b=md5hh(b,c,d,a,M[i+10],23,-1094730640);
          a=md5hh(a,b,c,d,M[i+13], 4, 681279174); d=md5hh(d,a,b,c,M[i+ 0],11,-358537222); c=md5hh(c,d,a,b,M[i+ 3],16,-722521979); b=md5hh(b,c,d,a,M[i+ 6],23, 76029189);
          a=md5hh(a,b,c,d,M[i+ 9], 4,-640364487); d=md5hh(d,a,b,c,M[i+12],11,-421815835); c=md5hh(c,d,a,b,M[i+15],16, 530742520); b=md5hh(b,c,d,a,M[i+ 2],23,-995338651);
          a=md5ii(a,b,c,d,M[i+ 0], 6,-198630844); d=md5ii(d,a,b,c,M[i+ 7],10,1126891415); c=md5ii(c,d,a,b,M[i+14],15,-1416354905);b=md5ii(b,c,d,a,M[i+ 5],21,-57434055);
          a=md5ii(a,b,c,d,M[i+12], 6, 1700485571); d=md5ii(d,a,b,c,M[i+ 3],10,-1894986606); c=md5ii(c,d,a,b,M[i+10],15,-1051523);   b=md5ii(b,c,d,a,M[i+ 1],21,-2054922799);
          a=md5ii(a,b,c,d,M[i+ 8], 6, 1873313359); d=md5ii(d,a,b,c,M[i+15],10,-30611744); c=md5ii(c,d,a,b,M[i+ 6],15,-1560198380);b=md5ii(b,c,d,a,M[i+13],21, 1309151649);
          a=md5ii(a,b,c,d,M[i+ 4], 6,-145523070);  d=md5ii(d,a,b,c,M[i+11],10,-1120210379); c=md5ii(c,d,a,b,M[i+ 2],15, 718787259);  b=md5ii(b,c,d,a,M[i+ 9],21,-343485551);
          a=safeAdd(a,oa); b=safeAdd(b,ob); c=safeAdd(c,oc); d=safeAdd(d,od);
        }
        const out=[]; [a,b,c,d].forEach(n=>{ for(let j=0;j<4;j++) out.push((n>>>(j*8))&0xFF); });
        return out.map(b=>('0'+b.toString(16)).slice(-2)).join('');
      }

      const sign = md5(MD5_SALT + path.substring(1) + s);
      const directUrl = `https://${host}/get-mp3/${sign}/${ts}${path}`;

      let resp;
      try {
        resp = await chrome.runtime.sendMessage({ type: 'YM_DL_DOWNLOAD', payload: { url: directUrl, filename: `${fileName}.mp3` } });
      } catch (e) {
        if (e.message.includes('Extension context invalidated')) {
          alert('Расширение обновлено.\nНажмите F5 на вкладке Я.Музыки.');
          throw new Error('Требуется F5');
        }
        throw e;
      }

      if (resp && !resp.ok) throw new Error(resp.error || 'Сбой при сохранении');
      setUI(ST.success);

    } catch (err) {
      console.warn('[YM-DL] Ошибка:', err.message);
      setUI(ST.error);
    } finally {
      if (isUI) {
        setTimeout(() => {
          // Ищем все кнопки, которые застряли на загрузке и принудительно сбрасываем!
          const activeBtns = document.querySelectorAll('[data-downloading="true"]');
          activeBtns.forEach(b => {
            b.innerHTML = ST.idle;
            b.dataset.downloading = 'false';
            b.style.cursor = 'pointer';
          });
        }, 3000);
      }
    }
  }

  function isNativeLiked(btn) {
    if (!btn) return false;
    const label = (btn.getAttribute('aria-label') || '').toLowerCase().trim();
    if (label.includes('больше не') || label.includes('удалить') || (label.includes('убрать') && !label.includes('не нравится'))) return true;

    const svg = btn.querySelector('svg');
    if (svg) {
      const color = window.getComputedStyle(svg).color || '';
      const fill = window.getComputedStyle(svg).fill || '';
      if (color.includes('rgb(255,') || color.includes('rgb(253,') || color === 'red' ||
          fill.includes('rgb(255,') || fill.includes('rgb(253,') || fill === 'red') {
        return true;
      }
    }
    
    if (btn.getAttribute('aria-pressed') === 'true' || btn.getAttribute('aria-checked') === 'true') {
      return true;
    }
    return false;
  }

  function clickPlayerControl(action) {
    // Ищем только ВИДИМЫЙ плеер, игнорируя скрытых "призраков"
    const bars = [
      '[class*="PlayerBarDesktopWithBackgroundProgressBar"]',
      '[class*="PlayerBarDesktop"]',
      '[class*="VibePlayerBar_root"]',
      '[class*="PlayerBar"]'
    ].map(sel => {
      return Array.from(document.querySelectorAll(sel)).find(el => el.getBoundingClientRect().width > 0);
    }).filter(Boolean);

    const labelMap = {
      'play': ['воспроизвести', 'приостановить', 'пауза', 'play', 'pause', 'воспроизведение'],
      'next': ['следующая песня', 'следующий', 'next', 'пропустить'],
      'prev': ['предыдущая песня', 'предыдущий', 'prev', 'назад']
    };

    const targets = labelMap[action];
    if (!targets) return false;

    for (const bar of bars) {
      const allBtns = Array.from(bar.querySelectorAll('button'));
      const btn = allBtns.find(b => {
        const label = (b.getAttribute('aria-label') || b.getAttribute('title') || '').toLowerCase().trim();
        return targets.some(t => label === t || label.includes(t));
      });

      if (btn) {
        btn.click();
        return true;
      }
    }
    return false;
  }

  function createButton(config, trackId, resolveTrackId = null) {
    const btn = document.createElement('button');
    btn.className = config.className;
    btn.innerHTML = ST.idle;
    btn.title = config.title;
    btn.dataset.loading = 'false';
    Object.assign(btn.style, config.style);

    ['click', 'mousedown', 'pointerdown', 'mouseup'].forEach(evt => {
      btn.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); });
    });

    btn.addEventListener('click', () => { const id = resolveTrackId ? resolveTrackId() : trackId; if (id) performDownload(id, btn); });
    return btn;
  }

  function extractTrackId(el) {
    if (!el) return null;
    const link = el.querySelector(SEL.trackLink);
    if (link) { const m = link.href.match(/\/track\/(\d+)/); if (m) return m[1]; }
    const data = el.closest('[data-track-id]') || el.querySelector('[data-track-id]');
    return data ? data.dataset.trackId : null;
  }

  function injectTrackListButtons() {
    SEL.trackRoots.forEach(sel => {
      document.querySelectorAll(sel).forEach(trackRow => {
        if (trackRow.querySelector(`.${BTN.trackList.className}`)) return;
        const trackId = extractTrackId(trackRow);
        if (!trackId) return;

        const titleEl = trackRow.querySelector(SEL.trackTitle);
        if (titleEl) {
          const btn = createButton(BTN.trackList, trackId);
          titleEl.appendChild(btn);
          titleEl.style.display = 'inline-flex'; titleEl.style.alignItems = 'center'; titleEl.style.flexDirection = 'row'; titleEl.style.whiteSpace = 'nowrap';
          btn.style.position = 'static'; 
        }
      });
    });
  }
  
  function trackClickListeners() {
    SEL.trackRoots.forEach(sel => {
      document.querySelectorAll(sel).forEach(row => {
        if (row.dataset.ymDlListened) return;
        row.dataset.ymDlListened = '1';
        row.addEventListener('click', (e) => {
          if (e.target.closest(`.${BTN.trackList.className}`)) return;
          const trackId = extractTrackId(row);
          if (trackId) _lastClickedTrackId = trackId;
        });
      });
    });
  }
  
  function trackPlayerBarClick() {
    const playerBar = document.querySelector(SEL.playerBar);
    if (!playerBar || playerBar.dataset.ymDlListened) return;
    playerBar.dataset.ymDlListened = '1';
    playerBar.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const trackId = extractTrackId(playerBar);
      if (trackId) _lastClickedTrackId = trackId;
    });
  }
  
  // ИСПРАВЛЕННАЯ КНОПКА VIBE
  function injectVibePlayerButton() {
    const vibeBar = document.querySelector('[class*="VibePlayerBar_root"]');
    if (!vibeBar) return;

    const VIBE_BTN_CLASS = 'ym-dl-btn-vibe';
    const existing = vibeBar.querySelector(`.${VIBE_BTN_CLASS}`);
    if (existing) {
      if (existing.dataset.downloading === 'true' || existing.dataset.searching === 'true') return; 
      return; 
    }

    const btn = document.createElement('button');
    btn.className = VIBE_BTN_CLASS;
    btn.innerHTML = ST.idle;
    btn.title = 'Скачать текущий трек';
    btn.dataset.loading = 'false';
    Object.assign(btn.style, BTN.playerBar.style);

    btn.addEventListener('mouseenter', () => { 
      if (btn.dataset.downloading !== 'true' && btn.dataset.searching !== 'true') {
        btn.style.color = '#ffcc00'; 
        btn.style.background = 'rgba(255, 204, 0, 0.15)'; 
        btn.style.borderColor = 'rgba(255, 204, 0, 0.4)'; 
      }
    });
    btn.addEventListener('mouseleave', () => { 
      btn.style.color = 'inherit'; 
      btn.style.background = 'rgba(255, 255, 255, 0.08)'; 
      btn.style.borderColor = 'rgba(255, 255, 255, 0.1)'; 
    });

    ['click', 'mousedown', 'pointerdown'].forEach(evt => {
      btn.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); });
    });

    btn.addEventListener('click', async () => {
      // Блокируем множественные клики
      if (btn.dataset.downloading === 'true' || btn.dataset.searching === 'true') return;
      
      const titleEl = vibeBar.querySelector('[class*="VibePlayerbarMeta_trackNameText"]');
      const domTitle = titleEl ? titleEl.textContent.trim() : '';
      const artistEl = vibeBar.querySelector('[class*="artist"], [class*="ArtistName"], [class*="VibePlayerbarMeta_author"]');
      const domArtist = artistEl ? artistEl.textContent.trim() : '';

      // Фаза 1: Ставим локальный флаг "поиск", чтобы крутить спиннер, но не блокировать саму функцию скачивания!
      const prevHtml = btn.innerHTML;
      btn.innerHTML = ST.loading; 
      btn.dataset.searching = 'true'; 
      btn.style.cursor = 'wait';

      const id = await getExactVibeTrackId(domTitle, domArtist);
      
      // Фаза 2: Снимаем флаг поиска, теперь работает сама функция performDownload
      btn.innerHTML = prevHtml;
      btn.dataset.searching = 'false';
      btn.style.cursor = 'pointer';
      
      if (id) {
        performDownload(id, btn);
      } else {
        alert('Расширение ожидает загрузки трека.\n\nПожалуйста, нажмите "Play" (Воспроизведение), чтобы плеер инициализировался, и попробуйте снова.');
      }
    });

    const likeBtn = Array.from(vibeBar.querySelectorAll('button')).find(b => {
      const label = (b.getAttribute('aria-label') || '').trim();
      return label === 'Нравится' || label === 'Больше не нравится';
    });

    if (likeBtn?.parentElement) {
      likeBtn.parentElement.insertBefore(btn, likeBtn.nextSibling);
    } else {
      vibeBar.appendChild(btn);
    }
  }

  function injectPlayerButton() {
    const playerBar = document.querySelector(SEL.playerBar);
    if (!playerBar || playerBar.querySelector(`.${BTN.playerBar.className}`)) return;
    const trackId = extractTrackId(playerBar);
    if (!trackId) return;

    const titleEl = playerBar.querySelector(SEL.playerTitle);
    if (titleEl && titleEl.parentElement) {
      const btn = createButton(BTN.playerBar, trackId, () => extractTrackId(document.querySelector(SEL.playerBar)));
      titleEl.parentElement.parentElement.appendChild(btn);
    }
  }

  function injectSidebarButton() {
    // Ищем все боковые панели и берем САМУЮ ВЕРХНЮЮ (последнюю в коде), которая видима
    const sidebars = Array.from(document.querySelectorAll(SEL.sidebarPanel[0]));
    const sidebar = sidebars.reverse().find(el => el.offsetWidth > 0 || el.offsetHeight > 0);
    
    if (!sidebar) return;
    if (sidebar.querySelector(`.${BTN.sidebarButton.className}`)) return;

    const getSidebarTrackId = () => {
      if (_lastClickedTrackId) return _lastClickedTrackId;
      const fromUrl = _getTrackIdFromUrl();
      if (fromUrl) return fromUrl;
      // Ищем только активный плеер
      const pb = Array.from(document.querySelectorAll(SEL.playerBar)).find(el => el.getBoundingClientRect().width > 0);
      return extractTrackId(pb);
    };

    const trackId = getSidebarTrackId();
    if (!trackId) return;

    const btn = createButton(BTN.sidebarButton, trackId, () => getSidebarTrackId());

    // Ищем кнопку лайка в этой панели
    const modalLikeBtn = Array.from(sidebar.querySelectorAll('button')).find(b => {
      const label = (b.getAttribute('aria-label') || '').trim();
      return label === 'Нравится' || label === 'Больше не нравится';
    });

    if (modalLikeBtn?.parentElement) {
      modalLikeBtn.parentElement.insertBefore(btn, modalLikeBtn.nextSibling);
    } else {
      // Если кнопки лайка еще нет, цепляемся к заголовку (он не удаляется при загрузке)
      const titleEl = sidebar.querySelector(SEL.trackTitle) || sidebar.querySelector('h1, h2, h3, h4');
      if (titleEl && titleEl.parentElement) {
        titleEl.parentElement.appendChild(btn);
      } else {
        const cover = sidebar.querySelector('img');
        const target = cover?.closest('div');
        (target || sidebar).appendChild(btn);
      }
    }
  }

  function injectSingleTrackPageButton() {
    const m = location.pathname.match(/\/album\/\d+\/track\/(\d+)/);
    if (!m) return;
    const trackId = m[1];
    if (document.querySelector(`.${BTN.pageButton.className}`)) return;

    const header = document.querySelector(SEL.trackPageHeader);
    if (!header) return;

    const btn = createButton(BTN.pageButton, trackId);
    btn.innerHTML = `${ST.idle} <span style="font-size:15px; font-weight:600">Скачать MP3</span>`;
    header.appendChild(btn);
  }

  function start() {
    const injectAll = () => { 
      injectTrackListButtons(); 
      injectPlayerButton(); 
      injectSingleTrackPageButton(); 
      injectSidebarButton(); 
      trackClickListeners(); 
      trackPlayerBarClick(); 
      
      const existingVibe = document.querySelector('.ym-dl-btn-vibe');
      if (!existingVibe || (existingVibe.dataset.downloading !== 'true' && existingVibe.dataset.searching !== 'true')) {
        injectVibePlayerButton();
      }
    };
    injectAll();
    let timer;
    new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(injectAll, 300); }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  // --- СИНХРОНИЗАЦИЯ С POPUP ---
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    
    const getVisibleEl = (selector) => {
      return Array.from(document.querySelectorAll(selector)).find(el => el.getBoundingClientRect().width > 0);
    };

    const playerBar = getVisibleEl(SEL.playerBar);
    const vibeBar = getVisibleEl('[class*="VibePlayerBar_root"]');

    const extractArtists = (bar) => {
      if (!bar) return 'Неизвестный исполнитель';
      const artistLinks = Array.from(bar.querySelectorAll('a[href*="/artist/"]'));
      if (artistLinks.length > 0) {
        const names = artistLinks.map(a => a.textContent.trim()).filter(Boolean);
        return [...new Set(names)].join(', ');
      }
      const artistEl = bar.querySelector('[class*="artist"], [class*="ArtistName"], [class*="VibePlayerbarMeta_author"], [class*="Meta_artistCaption"]');
      return artistEl ? artistEl.textContent.trim() : 'Яндекс Музыка';
    };

    if (msg.action === "GET_PLAYER_STATE") {
      let activeBar = vibeBar || playerBar;
      if (!activeBar) {
        sendResponse(null);
        return;
      }

      // 1. БЫСТРЫЙ СБОР: Берем то, что есть на экране (занимает 0.001 секунды)
      let domTitle = '';
      if (vibeBar) {
        const titleEl = vibeBar.querySelector('[class*="VibePlayerbarMeta_trackNameText"]');
        domTitle = titleEl ? titleEl.textContent.trim() : 'Трек Моей Волны';
      } else {
        domTitle = playerBar.querySelector(SEL.playerTitle)?.textContent?.trim() || '';
      }

      let domArtist = extractArtists(activeBar);

      let cover = activeBar.querySelector('img')?.src || '';
      if (cover) cover = cover.replace(/\d+x\d+$/, '200x200');

      const likeBtn = Array.from(activeBar.querySelectorAll('button')).find(b => {
        const label = (b.getAttribute('aria-label') || '').toLowerCase().trim();
        return label.includes('нравится') && !label.includes('не нравится');
      });
      const isLiked = isNativeLiked(likeBtn);

      const playBtn = Array.from(activeBar.querySelectorAll('button')).find(b => {
        const label = (b.getAttribute('aria-label') || '').toLowerCase().trim();
        return label.includes('приостановить') || label.includes('пауза') || label.includes('pause');
      });
      const isPlaying = !!playBtn;

      let trackId = vibeBar ? (document.body.dataset.ymVibeId || _vibeCurrentTrackId) : extractTrackId(playerBar);

      // ⚡ МГНОВЕННЫЙ ОТВЕТ: Открываем окно Popup без ожидания сети!
      sendResponse({ 
        trackId: trackId || 'vibe-active', 
        title: domTitle, 
        artist: domArtist, 
        cover, 
        isPlaying, 
        isLiked 
      });

      // 2. ФОНОВАЯ МАГИЯ: Запрашиваем полные имена через API и отправляем вдогонку
      (async () => {
        if (vibeBar && (!trackId || trackId === 'vibe-active')) {
          const exactId = await getExactVibeTrackId(domTitle, domArtist);
          if (exactId) trackId = exactId;
        }

        if (trackId && trackId !== 'vibe-active') {
          try {
            const meta = await fetchMeta(trackId);
            const apiTitle = (meta.title || '').toLowerCase().trim();
            const apiArtist = (meta.artists || []).map(a => a.name).join(' ').toLowerCase();
            const apiText = `${apiTitle} ${apiArtist}`;
            const screenText = `${domTitle} ${domArtist}`.toLowerCase();

            const isCorrectTrack = screenText.includes(apiTitle) || apiText.includes(domTitle.toLowerCase().trim());

            if (isCorrectTrack) {
              const finalTitle = meta.title || domTitle;
              const finalArtist = (meta.artists || []).map(a => a.name).filter(Boolean).join(', ') || domArtist;
              
              // Отправляем сообщение открытому Popup-у: "Обнови текст на красивый!"
              chrome.runtime.sendMessage({
                action: "UPDATE_POPUP_META",
                title: finalTitle,
                artist: finalArtist
              });
            }
          } catch(e) {}
        }
      })();
      
      // Возвращаем false, так как мы уже ответили синхронно и мгновенно
      return false; 
    }

    if (msg.action === "TOGGLE_LIKE") {
      try {
        const activeBar = vibeBar || playerBar;
        const btn = activeBar ? Array.from(activeBar.querySelectorAll('button')).find(b => {
          const label = (b.getAttribute('aria-label') || '').toLowerCase().trim();
          return label.includes('нравится') && !label.includes('не нравится');
        }) : null;

        if (!btn) throw new Error('Кнопка лайка не найдена');
        btn.click();
        setTimeout(() => sendResponse({ ok: true, isLiked: isNativeLiked(btn) }), 250);
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
      return true;
    }

    if (msg.action === "PLAYER_CONTROL") {
      const ok = clickPlayerControl(msg.control);
      sendResponse({ ok });
      return;
    }

    if (msg.action === "DOWNLOAD_CURRENT") {
      (async () => {
        let trackId = null;
        if (vibeBar) {
          const titleEl = vibeBar.querySelector('[class*="VibePlayerbarMeta_trackNameText"]');
          const domTitle = titleEl ? titleEl.textContent.trim() : '';
          const domArtist = extractArtists(vibeBar);
          
          trackId = await getExactVibeTrackId(domTitle, domArtist);
        } else {
          trackId = extractTrackId(playerBar);
        }

        if (trackId && trackId !== 'vibe-active') {
          try {
            await performDownload(trackId);
            sendResponse({ ok: true });
          } catch (e) {
            sendResponse({ ok: false, error: e.message });
          }
        } else {
          sendResponse({ ok: false, error: 'Не удалось определить песню. Переключите трек.' });
        }
      })();
      return true;
    }
  });
})();