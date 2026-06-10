document.addEventListener('DOMContentLoaded', () => {
  const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');
  // Ищем сначала АКТИВНУЮ вкладку Яндекса
  chrome.tabs.query({ url: "*://music.yandex.ru/*", active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) {
      chrome.tabs.query({ url: "*://music.yandex.ru/*" }, (allTabs) => {
        if (allTabs.length === 0) {
          document.getElementById('error-msg').classList.add('show');
          return;
        }
        const sorted = allTabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
        initPopup(sorted[0]);
      });
      return;
    }
    initPopup(tabs[0]);
  });

  function initPopup(ymTab) {
    const likeBtn = document.getElementById('btn-like');
    const dlBtn = document.getElementById('btn-download');
    const playBtn = document.getElementById('btn-play');
    const playIcon = document.getElementById('play-icon');
    const pauseIcon = document.getElementById('pause-icon');
    const prevBtn = document.getElementById('btn-prev');
    const nextBtn = document.getElementById('btn-next');
    const bgBlur = document.getElementById('bg-blur');

    const setPlayIconState = (isPlaying) => {
      if (isPlaying) {
        playIcon.style.display = 'none';
        pauseIcon.style.display = 'block';
      } else {
        playIcon.style.display = 'block';
        pauseIcon.style.display = 'none';
      }
    };

    const updateUI = () => {
      chrome.tabs.sendMessage(ymTab.id, { action: "GET_PLAYER_STATE" }, (res) => {
        if (!chrome.runtime.lastError && res && res.trackId) {
          document.getElementById('player').style.display = 'flex';
          
          const coverUrl = res.cover || 'icon.png';
          document.getElementById('cover').src = coverUrl;
          // МАГИЯ ДИЗАЙНА: Ставим обложку на задний фон для эффекта стекла!
          bgBlur.style.backgroundImage = `url('${coverUrl}')`;
          
          document.getElementById('title').textContent = res.title || 'Неизвестный трек';
          document.getElementById('artist').textContent = res.artist || 'Неизвестный исполнитель';
          
          if (res.isLiked) likeBtn.classList.add('liked');
          else likeBtn.classList.remove('liked');
          
          setPlayIconState(res.isPlaying);
        }
      });
    };

    // Первичная загрузка (с умной задержкой)
    const initPlayer = (retry = false) => {
      chrome.tabs.sendMessage(ymTab.id, { action: "GET_PLAYER_STATE" }, (res) => {
        if (chrome.runtime.lastError || !res || !res.trackId) {
          if (!retry) {
            // Плеер еще не отрендерился, ждем 500мс и пробуем снова (скрыто от юзера)
            setTimeout(() => initPlayer(true), 500);
          } else {
            // Если и со второго раза пусто — показываем ошибку
            document.getElementById('error-msg').classList.add('show');
          }
          return;
        }
        updateUI();
      });
    };
    initPlayer();

    let errorHideTimer = null;
    let isPlayBtnLocked = false;

    playBtn.addEventListener('click', () => {
      if (isPlayBtnLocked) return;
      isPlayBtnLocked = true;

      const wasPlaying = (playIcon.style.display === 'none');
      setPlayIconState(!wasPlaying); // Оптимистично меняем иконку сразу

      chrome.tabs.sendMessage(ymTab.id, { action: "PLAYER_CONTROL", control: "play" });

      if (isFirefox && !wasPlaying) {
        let attempts = 0;
        // Следим за плеером 2 секунды (5 проверок каждые 400мс)
        const checkTimer = setInterval(() => {
          attempts++;
          chrome.tabs.sendMessage(ymTab.id, { action: "GET_PLAYER_STATE" }, (newState) => {
            if (chrome.runtime.lastError || !newState) {
              clearInterval(checkTimer);
              isPlayBtnLocked = false;
              return;
            }

            // Если плеер "сдался" и откатился в Паузу
            if (!newState.isPlaying) {
              clearInterval(checkTimer);
              isPlayBtnLocked = false;
              setPlayIconState(false); // Возвращаем иконку на Play
              
              const errorMsg = document.getElementById('error-msg');
              errorMsg.innerHTML = "Сделайте <b>один клик</b> мышкой на странице Яндекс Музыки для активации плеера.";
              errorMsg.classList.add('show');
              if (errorHideTimer) clearTimeout(errorHideTimer);
              errorHideTimer = setTimeout(() => { errorMsg.classList.remove('show'); }, 4000);
            } 
            // Если стабильно проиграло все 2 секунды
            else if (attempts >= 5) {
              clearInterval(checkTimer);
              isPlayBtnLocked = false;
              setPlayIconState(true);
            }
          });
        }, 400);
      } else {
        // Обычная логика для Chrome или если мы просто нажали Паузу
        setTimeout(() => {
          chrome.tabs.sendMessage(ymTab.id, { action: "GET_PLAYER_STATE" }, (newState) => {
            isPlayBtnLocked = false;
            if (!chrome.runtime.lastError && newState) setPlayIconState(newState.isPlaying);
          });
        }, 400);
      }
    });

    const handleTrackChange = (controlAction) => {
      chrome.tabs.sendMessage(ymTab.id, { action: "PLAYER_CONTROL", control: controlAction });
      setTimeout(updateUI, 400); 
      setTimeout(updateUI, 1200); 
    };

    prevBtn.addEventListener('click', () => handleTrackChange("prev"));
    nextBtn.addEventListener('click', () => handleTrackChange("next"));

    likeBtn.addEventListener('click', () => {
      likeBtn.style.pointerEvents = 'none';
      const wasLiked = likeBtn.classList.contains('liked');
      likeBtn.classList.toggle('liked');
      
      chrome.tabs.sendMessage(ymTab.id, { action: "TOGGLE_LIKE" }, (apiRes) => {
        likeBtn.style.pointerEvents = 'auto';
        if (chrome.runtime.lastError || !apiRes || !apiRes.ok) {
          if (wasLiked) likeBtn.classList.add('liked');
          else likeBtn.classList.remove('liked');
          return;
        }
        if (apiRes.isLiked) likeBtn.classList.add('liked');
        else likeBtn.classList.remove('liked');
      });
    });

    dlBtn.addEventListener('click', () => {
      dlBtn.style.pointerEvents = 'none';
      dlBtn.innerHTML = `<svg style="animation: ym-dl-spin 1s linear infinite;" viewBox="0 0 24 24"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>`;
      
      chrome.tabs.sendMessage(ymTab.id, { action: "DOWNLOAD_CURRENT" }, (response) => {
        if (chrome.runtime.lastError || !response || !response.ok) {
          dlBtn.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="#ff3333"></circle><line x1="15" y1="9" x2="9" y2="15" stroke="#ff3333"></line><line x1="9" y1="9" x2="15" y2="15" stroke="#ff3333"></line></svg>`;
          dlBtn.style.pointerEvents = 'auto';
          setTimeout(() => {
            dlBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
          }, 2000);
        } else {
          dlBtn.innerHTML = `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" stroke="#00cc00"></polyline></svg>`;
          setTimeout(() => window.close(), 1200); 
        }
      });
    });
  }
    // Ловим красивые имена артистов из фона и плавно обновляем текст
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.action === "UPDATE_POPUP_META") {
        const titleEl = document.getElementById('title');
        const artistEl = document.getElementById('artist');
        if (titleEl && msg.title) titleEl.textContent = msg.title;
        if (artistEl && msg.artist) artistEl.textContent = msg.artist;
      }
    });
    // --- ПРОВЕРКА ОБНОВЛЕНИЙ И ОТОБРАЖЕНИЕ ВЕРСИИ ---
    const currentVersion = chrome.runtime.getManifest().version;
    document.getElementById('app-version').textContent = `v${currentVersion}`;

    fetch('https://api.github.com/repos/KernelPace/yamusic-downloader-pro/releases/latest')
      .then(res => res.json())
      .then(data => {
        if (data && data.tag_name) {
          const latestVersion = data.tag_name.replace(/^v/, ''); 
          
          // Умная функция сравнения версий (например: 1.1.0 > 1.0.1)
          const isNewer = (local, github) => {
            const v1 = local.split('.').map(Number);
            const v2 = github.split('.').map(Number);
            for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
              const num1 = v1[i] || 0;
              const num2 = v2[i] || 0;
              if (num2 > num1) return true;
              if (num2 < num1) return false;
            }
            return false;
          };

          if (isNewer(currentVersion, latestVersion)) {
            const banner = document.getElementById('update-banner');
            document.getElementById('new-version-num').textContent = data.tag_name;
            banner.style.display = 'block';
            document.getElementById('app-version').style.color = '#FF9500';
          }
        }
      })
      .catch(err => console.warn('Не удалось проверить обновления:', err));
});