(function() {
    'use strict';
    if (window.continue_series_fixed) return;
    window.continue_series_fixed = true;

    console.log('ContinueSeries: Скрипт запущен (исправленная версия)');

    // Регистрируем манифест с ПРАВИЛЬНЫМИ полями name и description
    Lampa.Manifest.plugins = {
        type: 'video',
        version: '1.0.0',
        name: 'Продолжить просмотр',
        description: 'Запуск сериала с последней позиции',
        onContextMenu: function(card) {
            console.log('ContinueSeries: onContextMenu для', card.name || card.title, 'тип:', card.media_type);
            // Показываем пункт только для сериалов
            if (card.media_type !== 'tv') return null;
            return {
                name: 'Продолжить просмотр', // ← Правильное поле
                description: 'Запустить с последней позиции' // ← Правильное поле
            };
        },
        onContextLauch: function(card) {
            console.log('ContinueSeries: Пункт выбран для', card.name || card.title);
            Lampa.Noty.show('Тестовый запуск для: ' + (card.name || card.title));
            // Здесь позже будет реальная логика запуска торрента
        }
    };

    // Слушаем старт плеера, чтобы сохранять данные о торренте
    function setupListener() {
        if (!Lampa.Player || !Lampa.Player.listener) {
            console.error('ContinueSeries: Lampa.Player.listener не доступен');
            return;
        }
        Lampa.Player.listener.follow('start', function(data) {
            console.log('ContinueSeries: Событие start', data);
            if (data.torrent_hash && data.movie) {
                console.log('ContinueSeries: Торрент обнаружен. Хэш:', data.torrent_hash);
                const cardId = data.movie.id;
                if (cardId) {
                    const store = JSON.parse(localStorage.getItem('continue_series_data') || '{}');
                    store[cardId] = {
                        torrent_hash: data.torrent_hash,
                        file_index: data.id,
                        position: 0,
                        title: data.movie.name || data.movie.title
                    };
                    localStorage.setItem('continue_series_data', JSON.stringify(store));
                    console.log('ContinueSeries: Данные сохранены для TMDB ID', cardId);
                }
            }
        });
    }

    function init() {
        console.log('ContinueSeries: init() вызван, appready =', window.appready);
        setupListener();
        console.log('ContinueSeries: Плагин успешно инициализирован');
    }

    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', function(e) {
            if (e.type === 'ready') init();
        });
    }
})();
