(function () {
    'use strict';
    if (window.cs_v5) return;
    window.cs_v5 = true;

    const STORAGE_KEY = 'continue_series_data';

    // Показывает сообщение на экране ТВ И пишет в консоль
    function log(msg, showOnTV) {
        console.log('CS v5:', msg);
        if (showOnTV) {
            try { Lampa.Noty.show('CS: ' + msg); } catch (e) {}
        }
    }

    function saveData(cardId, data) {
        try {
            const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            all[cardId] = data;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
        } catch (e) { log('save error: ' + e.message, true); }
    }

    function getData(cardId) {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')[cardId] || null;
        } catch (e) { return null; }
    }

    // Пытаемся вытащить хэш торрента и индекс файла из URL TorrServer
    function parseTorrentUrl(url) {
        if (!url || typeof url !== 'string') return null;
        const linkMatch = url.match(/[?&]link=([^&]+)/i);
        const indexMatch = url.match(/[?&]index=(\d+)/i);
        if (linkMatch) {
            return { hash: linkMatch[1], index: indexMatch ? parseInt(indexMatch[1]) : 0 };
        }
        return null;
    }

    // Пытаемся вытащить информацию о фильме, URL и хэш из разных структур события
    function extractInfo(data) {
        let movie = null, url = null, hash = null, index = 0;
        if (!data) return { movie, url, hash, index };

        if (data.movie && typeof data.movie === 'object') movie = data.movie;
        else if (data.card && typeof data.card === 'object') movie = data.card;
        else if (data.id && (data.title || data.name)) movie = data;

        if (data.url) url = data.url;
        else if (data.movie && data.movie.url) url = data.movie.url;
        else if (data.card && data.card.url) url = data.card.url;

        if (data.torrent_hash) hash = data.torrent_hash;
        else if (data.hash) hash = data.hash;

        if (data.file_index !== undefined) index = data.file_index;
        else if (data.id && typeof data.id === 'number' && hash) index = data.id;

        if (!hash && url) {
            const parsed = parseTorrentUrl(url);
            if (parsed) { hash = parsed.hash; index = parsed.index; }
        }

        return { movie, url, hash, index };
    }

    // ===== Сохранение прогресса при старте плеера =====
    function onPlayerStart(data) {
        const info = extractInfo(data);
        log('player event: hash=' + (info.hash ? info.hash.slice(0,8) + '…' : 'нет') +
            ', movieId=' + (info.movie && info.movie.id), false);

        if (!info.hash) {
            log('НЕ НАЙДЕН хэш торрента в событии', true);
            return;
        }
        if (!info.movie || !info.movie.id) {
            log('НЕ НАЙДЕН ID фильма в событии', true);
            return;
        }

        const cardId = info.movie.id;
        const saved = {
            torrent_hash: info.hash,
            file_index: info.index || 0,
            position: 0,
            title: info.movie.name || info.movie.title,
            url: info.url
        };

        saveData(cardId, saved);
        log('СОХРАНЕНО: "' + saved.title + '"', true);

        // Отслеживание позиции
        let attempts = 0;
        const poll = setInterval(() => {
            let video = null;
            try { video = Lampa.PlayerVideo.video(); } catch (e) {}
            if (video) {
                clearInterval(poll);
                log('видео найдено, отслеживаю позицию', false);
                video.addEventListener('timeupdate', function () {
                    if (!video.paused) {
                        saved.position = video.currentTime;
                        saveData(cardId, saved);
                    }
                });
            } else if (++attempts > 30) {
                clearInterval(poll);
            }
        }, 500);
    }

    // ===== Подписка на события игрока (несколько источников) =====
    function setupPlayerListener() {
        if (Lampa.Player && Lampa.Player.listener) {
            Lampa.Player.listener.follow('start', onPlayerStart);
            log('подписан на Player.listener', false);
        }
        if (Lampa.Listener) {
            Lampa.Listener.follow('player', function (e) {
                if (e && (e.type === 'start' || e.type === 'play')) {
                    onPlayerStart(e);
                }
            });
            log('подписан на global Listener player', false);
        }
        // Страховка: перехватываем вызов Torrent.open — там гарантированно есть хэш
        if (Lampa.Torrent && Lampa.Torrent.open) {
            const orig = Lampa.Torrent.open;
            Lampa.Torrent.open = function (hash, movie) {
                if (hash && movie && movie.id) {
                    saveData(movie.id, {
                        torrent_hash: hash,
                        file_index: 0,
                        position: 0,
                        title: movie.name || movie.title
                    });
                    log('СОХРАНЕНО (через Torrent.open): "' + (movie.name || movie.title) + '"', true);
                }
                return orig.apply(this, arguments);
            };
            log('перехватил Torrent.open', false);
        }
    }

    // ===== Кнопка в карточке =====
    function setupCardButton() {
        Lampa.Listener.follow('full', function (e) {
            if (e.type !== 'complite' || !e.data || !e.data.movie) return;
            const movie = e.data.movie;
            const method = e.object && e.object.method;
            if (method !== 'tv') return;

            $('.button--continue-series').remove();
            $('.full-start-new__buttons').append(
                `<div class="full-start__button selector button--continue-series">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    <span>Продолжить</span>
                </div>`
            );

            $('.button--continue-series').on('hover:enter', function () {
                const saved = getData(movie.id);
                log('нажата кнопка. Данные ' + (saved ? 'ЕСТЬ: ' + saved.title : 'ОТСУТСТВУЮТ'), true);
                if (!saved) {
                    Lampa.Noty.show('CS: прогресса нет. Запустите серию вручную');
                    return;
                }
                Lampa.Torrent.open(saved.torrent_hash, movie);
                Lampa.Noty.show('CS: запуск "' + saved.title + '"');
            });
        });
    }

    function init() {
        log('плагин загружен (версия 5)', true);
        setupPlayerListener();
        setupCardButton();
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', e => { if (e.type === 'ready') init(); });
})();
