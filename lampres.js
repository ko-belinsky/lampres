(function() {
    'use strict';
    if (window.continue_series_final) return;
    window.continue_series_final = true;

    const STORAGE_KEY = 'continue_series_data_final';

    // --- 1. Сохранение данных при старте торрент-плеера ---
    function setupPlayerListener() {
        Lampa.Player.listener.follow('start', function(data) {
            // Нас интересуют только торренты и только сериалы
            if (!data.torrent_hash || !data.movie || data.movie.media_type !== 'tv') return;

            const cardId = data.movie.id;
            if (!cardId) return;

            const store = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            store[cardId] = {
                torrent_hash: data.torrent_hash,
                file_index: data.id, // Индекс файла (серии)
                position: 0, // Позиция будет обновляться в плеере
                title: data.movie.name || data.movie.title
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
        });
    }

    // --- 2. Добавление кнопки в карточку сериала ---
    function addButtonToCard(e) {
        // Ждём именно событие 'complite' — полной загрузки карточки
        if (e.type !== 'complite' || !e.movie || e.movie.media_type !== 'tv') return;

        const card = e.movie;
        const cardId = card.id;
        if (!cardId) return;

        // Проверяем, есть ли сохранённые данные для этого сериала
        const store = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        const saved = store[cardId];
        if (!saved) return; // Нет данных — нет кнопки

        const $container = e.object.activity.render().find('.full-start-new__buttons');
        if (!$container.length) return;
        if ($container.find('.button--continue').length) return; // Уже добавлена

        const $btn = $(`
            <div class="full-start__button selector button--continue">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                </svg>
                <span>Продолжить</span>
            </div>
        `);

        $btn.on('hover:enter', function() {
            // Мгновенный запуск: открываем торрент по хэшу, минуя поиск
            Lampa.Torrent.open(saved.torrent_hash, card);
            Lampa.Noty.show('Запуск: ' + saved.title + ' (серия ' + (saved.file_index + 1) + ')');
        });

        $container.prepend($btn);
    }

    // --- 3. Инициализация ---
    function init() {
        setupPlayerListener();
        Lampa.Listener.follow('full', addButtonToCard); // Подписываемся на событие карточки
    }

    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', function(e) {
            if (e.type === 'ready') init();
        });
    }
})();
