(function() {
    'use strict';
    if (window.continue_series_debug) return;
    window.continue_series_debug = true;

    console.log('ContinueSeries: Скрипт начал выполняться');

    // Регистрируем манифест как можно раньше
    Lampa.Manifest.plugins = {
        type: 'video',
        onContextMenu: function(card) {
            console.log('ContinueSeries: onContextMenu вызван для', card.name || card.title, 'media_type:', card.media_type);
            // ВРЕМЕННО показываем пункт для всех сериалов
            if (card.media_type !== 'tv') return null;
            return {
                title: 'Продолжить просмотр (тест)',
                icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'
            };
        },
        onContextLauch: function(card) {
            console.log('ContinueSeries: Пункт меню выбран для', card.name || card.title);
            Lampa.Noty.show('Тестовый запуск для: ' + (card.name || card.title));
            // Здесь позже будет реальный запуск
        }
    };

    // Слушаем старт плеера, чтобы сохранять данные (пока просто логируем)
    function setupListener() {
        if (!Lampa.Player || !Lampa.Player.listener) {
            console.error('ContinueSeries: Lampa.Player.listener не доступен');
            return;
        }
        Lampa.Player.listener.follow('start', function(data) {
            console.log('ContinueSeries: Событие start', data);
            if (data.torrent_hash && data.movie) {
                console.log('ContinueSeries: Обнаружен торрент. Хэш:', data.torrent_hash, 'Файл:', data.id);
                // Сохраняем простую заглушку, чтобы проверить работу
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
                    console.log('ContinueSeries: Данные сохранены для cardId', cardId);
                }
            }
        });
    }

    // Инициализация
    function init() {
        console.log('ContinueSeries: init() вызван, appready =', window.appready);
        setupListener();
        console.log('ContinueSeries: Плагин успешно инициализирован (режим отладки)');
    }

    if (window.appready) {
        init();
    } else {
        Lampa.Listener.follow('app', function(e) {
            if (e.type === 'ready') init();
        });
    }
})();
