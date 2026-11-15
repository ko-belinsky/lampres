(function() {
    'use strict';
    if (window.continue_series_v2) return;
    window.continue_series_v2 = true;

    const STORAGE_KEY = 'continue_series_data_v2';
    console.log('ContinueSeries: Скрипт запущен (версия 2)');

    // --- 1. Сохранение данных при старте торрент-плеера ---
    function setupPlayerListener() {
        if (!Lampa.Player || !Lampa.Player.listener) return;

        Lampa.Player.listener.follow('start', function(data) {
            // Нас интересуют только торренты и только сериалы
            if (!data.torrent_hash || !data.movie || data.movie.media_type !== 'tv') return;

            const cardId = data.movie.id;
            if (!cardId) return;

            console.log('ContinueSeries: Сохранение контекста для TMDB ID', cardId);
            const store = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            
            // Сохраняем хэш и индекс файла. Позиция будет обновляться позже.
            store[cardId] = {
                torrent_hash: data.torrent_hash,
                file_index: data.id,
                position: 0, // Позиция будет уточнена в плеере
                title: data.movie.name || data.movie.title
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
        });
    }

    // --- 2. Добавление кнопки в карточку сериала ---
    function addButtonToCard(e) {
        if (e.type !== 'complete' || !e.movie || e.movie.media_type !== 'tv') return;

        const card = e.movie;
        const cardId = card.id;
        if (!cardId) return;

        // Проверяем, есть ли сохранённые данные для этого сериала
        const store = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        const saved = store[cardId];
        if (!saved) return; // Нет данных — нет кнопки

        // Ищем контейнер для кнопок в карточке
        const buttonsContainer = e.object.activity.render().find('.full-start-new__buttons');
        if (!buttonsContainer.length) return;

        // Если кнопка уже добавлена — выходим
        if (buttonsContainer.find('.button--continue').length) return;

        // Создаём HTML кнопки в стиле Lampa
        const buttonHtml = `
            <div class="full-start__button selector button--continue">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                </svg>
                <span>Продолжить</span>
            </div>
        `;

        const $button = $(buttonHtml);

        // Обработчик нажатия на кнопку
        $button.on('hover:enter', function() {
            console.log('ContinueSeries: Запуск с позиции', saved.position);
            // Показываем уведомление (позже здесь будет реальный запуск)
            Lampa.Noty.show('Запуск: ' + saved.title + ' (файл ' + saved.file_index + ')');
            
            // --- Логика реального запуска (пока закомментирована) ---
            // Lampa.Torrent.open(saved.torrent_hash, card);
            // После открытия торрента нужно выбрать файл по индексу `saved.file_index`.
            // Это можно сделать через слушатель события 'torrent_file'.
        });

        // Добавляем кнопку в начало панели (или в конец, по вкусу)
        buttonsContainer.prepend($button);
        console.log('ContinueSeries: Кнопка добавлена для', card.name);
    }

    // --- 3. Инициализация ---
    function init() {
        setupPlayerListener();
        // Слушаем событие полной загрузки карточки
        Lampa.Listener.follow('full', addButtonToCard);
        console.log('ContinueSeries: Плагин инициализирован (v2)');
    }

    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', function(e) {
            if (e.type === 'ready') init();
        });
    }
})();
