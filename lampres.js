(function() {
    'use strict';
    if (window.continue_series_direct) return;
    window.continue_series_direct = true;

    console.log('ContinueSeries DIRECT: Скрипт запущен');

    const STORAGE_KEY = 'continue_series_data';

    // --- 1. Сохранение прогресса при старте торрент-плеера ---
    function setupPlayerListener() {
        if (!Lampa.Player || !Lampa.Player.listener) return;

        Lampa.Player.listener.follow('start', function(data) {
            if (!data.torrent_hash || !data.movie || data.movie.media_type !== 'tv') return;

            const cardId = data.movie.id;
            if (!cardId) return;

            let saved = {
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
            console.log('ContinueSeries DIRECT: Данные сохранены для сериала', cardId);
        });
    }

    // --- 2. Вспомогательные функции ---
    function saveData(cardId, data) {
        try {
            const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            all[cardId] = data;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
        } catch (e) { console.error('ContinueSeries DIRECT: Ошибка сохранения', e); }
    }

    function getData(cardId) {
        try {
            const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            return all[cardId] || null;
        } catch (e) { return null; }
    }

    // --- 3. Внедрение кнопки в карточку сериала ---
    function injectButtonToCard() {
        // Следим за открытием страницы с подробной информацией
        Lampa.Listener.follow('full', function(e) {
            // 'complite' означает, что страница полностью отрисована
            if (e.type !== 'complite' || !e.data || !e.data.movie) return;

            const movie = e.data.movie;
            // Работаем только с сериалами
            if (movie.media_type !== 'tv') return;

            const saved = getData(movie.id);
            // Если для этого сериала нет сохранённого прогресса, кнопку не добавляем
            if (!saved) return;

            // Ищем панель с кнопками. В разных темах она может называться по-разному,
            // но обычно это один из этих селекторов.
            const $buttonsPanel = $('.full-start-new__buttons, .full-buttons, .card-buttons').first();
            if (!$buttonsPanel.length) return;

            // Проверяем, не добавили ли мы уже кнопку, чтобы не дублировать
            if ($buttonsPanel.find('.continue-series-btn').length) return;

            // Создаём кнопку, стилизуя её под остальные кнопки Lampa
            const $btn = $(`
                <div class="full-start-new__button selector continue-series-btn">
                    <div class="full-start-new__button-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z"/>
                        </svg>
                    </div>
                    <div class="full-start-new__button-text">Продолжить</div>
                </div>
            `);

            // Обработчик нажатия на кнопку
            $btn.on('hover:enter', function() {
                const savedData = getData(movie.id);
                if (!savedData) return;

                // Прямой запуск торрента по сохранённому хэшу
                Lampa.Torrent.open(savedData.torrent_hash, movie);

                // Небольшая задержка, чтобы торрент успел инициализироваться,
                // затем показываем уведомление и пытаемся перемотать.
                setTimeout(() => {
                    Lampa.Noty.show('Запуск с позиции ' + formatTime(savedData.position));
                    // Позиция восстановится через слушатель 'canplay' в setupPlayerListener
                }, 1000);
            });

            // Добавляем кнопку в панель (в начало или в конец)
            $buttonsPanel.prepend($btn);
            console.log('ContinueSeries DIRECT: Кнопка добавлена для', movie.name || movie.title);
        });
    }

    function formatTime(sec) {
        if (!sec || isNaN(sec)) return '0:00';
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        return (h > 0 ? h + ':' : '') + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }

    // --- 4. Инициализация ---
    function init() {
        setupPlayerListener();
        injectButtonToCard();
        console.log('ContinueSeries DIRECT: Плагин инициализирован');
    }

    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', e => { if (e.type === 'ready') init(); });
    }
})();
