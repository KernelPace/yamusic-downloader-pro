(() => {
  if (!document.getElementById('ym-dl-styles')) {
    const style = document.createElement('style');
    style.id = 'ym-dl-styles';
    style.textContent = `
      @keyframes ym-dl-spin { 100% { transform: rotate(360deg); } }
      .ym-dl-spin-icon { animation: ym-dl-spin 1s linear infinite; }
      .ym-dl-svg { width: 100%; height: 100%; object-fit: contain; transition: stroke 0.2s ease; }
      .ym-dl-btn-list:hover, .ym-dl-btn-page:hover, .ym-dl-btn-player:hover, .ym-dl-btn-sidebar:hover { color: #ffcc00 !important; }
      .ym-dl-btn-player .ym-dl-svg { width: 30px; height: 30px; }
      .ym-dl-btn-player:hover, .ym-dl-btn-sidebar:hover { background: rgba(255, 204, 0, 0.15) !important; border-color: rgba(255, 204, 0, 0.4) !important; }
    `;
    document.head.appendChild(style);
  }

  const baseStyle = Object.freeze({
    background: 'none', border: 'none', cursor: 'pointer', lineHeight: '1', display: 'inline-flex',
    alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease', flexShrink: '0', color: 'inherit'
  });

  const ICONS = {
    idle: `<svg class="ym-dl-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`,
    loading: `<svg class="ym-dl-svg ym-dl-spin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>`,
    success: `<svg class="ym-dl-svg" viewBox="0 0 24 24" fill="none" stroke="#00cc00" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    error: `<svg class="ym-dl-svg" viewBox="0 0 24 24" fill="none" stroke="#ff3333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`
  };

  globalThis.YM_DL_BUTTON_CONFIG = Object.freeze({
    states: ICONS,
    selectors: {
      trackLink: 'a[href*="/track/"]',
      trackRoots: ['[class*="CommonTrack_root"]', '[class*="Track_root"]', '[class*="SimpleTrack"]', '[class*="TrackComponent"]'],
      trackTitle: '[class*="Meta_title"], [class*="title"]',
      playerBar: '[class*="PlayerBarDesktopWithBackgroundProgressBar_player"], [class*="PlayerBarDesktop_player"], [class*="PlayerBar"]',
      playerTitle: '[class*="Meta_title"]',
      trackPageHeader: '[class*="TrackPage_header"], [class*="SidebarTrack_root"], [class*="page-track"], [class*="EntityHeader"]',
      sidebarPanel: ['[class*="TrackModal_root"]']
    },
    buttons: {
      trackList: {
        className: 'ym-dl-btn-list', title: 'Скачать MP3',
        style: { ...baseStyle, width: '18px', height: '18px', padding: '0', marginLeft: '8px', opacity: '0.6', verticalAlign: 'middle', position: 'relative' }
      },
      playerBar: {
        className: 'ym-dl-btn-player', title: 'Скачать текущий трек',
        style: { ...baseStyle, width: '46px', height: '46px', margin: '0 12px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '50%', border: '1px solid rgba(255, 255, 255, 0.1)', opacity: '0.8', zIndex: '99999' }
      },
      sidebarButton: { 
        className: 'ym-dl-btn-sidebar', title: 'Скачать MP3',
        // ТЕКСТ УБРАН! Идеально круглая иконка
        style: { ...baseStyle, width: '36px', height: '36px', margin: '0 8px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '50%', border: '1px solid rgba(255, 255, 255, 0.1)', opacity: '0.9' }
      },
      pageButton: {
        className: 'ym-dl-btn-page', title: 'Скачать трек',
        style: { ...baseStyle, padding: '10px 20px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', color: 'inherit', gap: '8px' }
      }
    }
  });
})();