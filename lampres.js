(function () {
    'use strict';

    if (window.continue_series_v4) return;
    window.continue_series_v4 = true;

    console.log('ContinueSeries V4: Скрипт запущен');

    const STORAGE_KEY = 'continue_series_data';

    function saveData(cardId, data) {
        try {
            const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            all[cardId] = data;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
        } catch (e) { console.error('CS V4: save error', e); }
    }

    function getData(cardId) {
        try {
            const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            return all[cardId] || null;
        } catch (e) { return null; }
    }

    function formatTime(sec) {
        if (!sec || isNaN(sec)) return '0:00';
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        return (h > 0 ? h + ':' : '') + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }

    // --- Сохранение прогресса при старте плеера ---
    function setupPlayerListener() {
        if (!Lampa.Player || !Lampa.Player.listener) return;

        Lampa.Player.listener.follow('start', function (data) {
            console.log('CS V4: Player start', data);
            if (!data.torrent_hash || !data.movie || data.movie.media_type !== 'tv') return;

            const cardId = data.movie.id;
            if (!cardId) return;

            const saved = {
                torrent_hash: data.torrent_hash,
                file_index: data.id,
                position: 0,
                title: data.movie.name || data.movie.title
            };

            let video = null;

            const onCanPlay = () => {
                video = Lampa.PlayerVideo.video();
                if (video && saved.position > 0) {
                    video.currentTime = saved.position;
                }
                Lampa.PlayerVideo.listener.remove('canplay', onCanPlay);
            };

            const onTimeUpdate = () => {
                if (video && !video.paused) {
                    saved.position = video.currentTime;
                    saveData(cardId, saved);
                }
            };

            const onDestroy = () => {
                if (video) {
                    saved.position = video.currentTime;
                    saveData(cardId, saved);
                }
                Lampa.PlayerVideo.listener.remove('canplay', onCanPlay);
                Lampa.PlayerVideo.listener.remove('timeupdate', onTimeUpdate);
                Lampa.Player.listener.remove('destroy', onDestroy);
            };

            Lampa.PlayerVideo.listener.follow('canplay', onCanPlay);
            Lampa.PlayerVideo.listener.follow('timeupdate', onTimeUpdate);
            Lampa.Player.listener.follow('destroy', onDestroy);

            saveData(cardId, saved);
            console.log('CS V4: Прогресс сохранён для сериала', cardId);
        });
    }

    // --- Кнопка добавляется ВСЕГДА для сериалов ---
    function setupCardButton() {
        Lampa.Listener.follow('full', function (e) {
            if (e.type !== 'complite') return;
            if (!e.data || !e.data.movie) return;

            const movie = e.data.movie;
            if (movie.media_type !== 'tv') return;

            // Убираем старую кнопку, чтобы не дублировать
            $('.button--continue-series').remove();

            // Добавляем кнопку — без каких-либо условий
            $('.full-start-new__buttons').append(
                `<div class="full-start__button selector button--continue-series">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z"/>
                    </svg>
                    <span>Продолжить</span>
                </div>`
            );

            $('.button--continue-series').on('hover:enter', function () {
                const saved = getData(movie.id);
                console.log('CS V4: Нажата "Продолжить" для', movie.id, '| данные:', saved);

                if (!saved) {
                    Lampa.Noty.show('Нет сохранённого прогресса — запустите серию вручную один раз');
                    return;
                }

                Lampa.Torrent.open(saved.torrent_hash, movie);
                Lampa.Noty.show('Продолжаем с ' + formatTime(saved.position));
            });

            console.log('CS V4: Кнопка добавлена для', movie.name || movie.title);
        });
    }

    function init() {
        setupPlayerListener();
        setupCardButton();
        console.log('CS V4: Плагин инициализирован');
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', e => { if (e.type === 'ready') init(); });
})();
