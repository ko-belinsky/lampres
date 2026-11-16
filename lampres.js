(function () {
    'use strict';

    if (window.continue_series_final) return;
    window.continue_series_final = true;

    console.log('ContinueSeries FINAL: Запуск');

    const STORAGE_KEY = 'continue_series_data';

    // --- Хранилище ---
    function saveData(cardId, data) {
        try {
            const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            all[cardId] = data;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
        } catch (e) { console.error('CS: save error', e); }
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

    // --- 1. Сохранение прогресса при старте плеера ---
    function setupPlayerListener() {
        if (!Lampa.Player || !Lampa.Player.listener) return;

        Lampa.Player.listener.follow('start', function (data) {
            console.log('CS: Player start', data);
            if (!data.torrent_hash || !data.movie) return;

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
            console.log('CS: Прогресс сохранён для', cardId);
        });
    }

    // --- 2. Добавление кнопки в карточку ---
    function setupCardButton() {
        Lampa.Listener.follow('full', function (e) {
            if (e.type !== 'complite') return;
            if (!e.data || !e.data.movie) return;

            const movie = e.data.movie;

            // ПРАВИЛЬНАЯ проверка типа — через e.object.method, как в RezkaComment
            const method = e.object && e.object.method;
            console.log('CS: Карточка', movie.title || movie.name, '| method =', method, '| media_type =', movie.media_type);

            if (method !== 'tv') {
                console.log('CS: Не сериал, пропускаем');
                return;
            }

            // Убираем старую кнопку, чтобы не дублировать
            $('.button--continue-series').remove();

            const saved = getData(movie.id);
            console.log('CS: Сохранённые данные:', saved);

            // Добавляем кнопку всегда
            $('.full-start-new__buttons').append(
                `<div class="full-start__button selector button--continue-series">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z"/>
                    </svg>
                    <span>Продолжить</span>
                </div>`
            );

            $('.button--continue-series').on('hover:enter', function () {
                const savedData = getData(movie.id);
                console.log('CS: Нажата "Продолжить" | данные:', savedData);

                if (!savedData) {
                    Lampa.Noty.show('Нет сохранённого прогресса — запустите серию вручную один раз');
                    return;
                }

                Lampa.Torrent.open(savedData.torrent_hash, movie);
                Lampa.Noty.show('Продолжаем с ' + formatTime(savedData.position));
            });

            console.log('CS: Кнопка добавлена для', movie.title || movie.name);
        });
    }

    function init() {
        setupPlayerListener();
        setupCardButton();
        console.log('CS: Плагин инициализирован');
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', e => { if (e.type === 'ready') init(); });
})();
