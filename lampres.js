(function() {
    'use strict';
    if (window.continue_series_v4) return;
    window.continue_series_v4 = true;

    const STORAGE_KEY = 'continue_series_v4';

    // --- 1. Добавление кнопки в карточку ---
    Lampa.Listener.follow('full', function(e) {
        if (e.type !== 'complite') return;      // тип именно 'complite' — из cardify
        var card = e.data;                       // ← ИСПРАВЛЕНО: e.data, не e.movie
        if (!card) return;

        // Показываем кнопку для всех типов карточек — для проверки
        var $container = e.object.activity.render().find('.full-start-new__buttons');
        if (!$container.length) {
            $container = e.object.activity.render().find('.buttons--container');
        }
        if (!$container.length) return;
        if ($container.find('.button--continue-v4').length) return;

        var $btn = $(
            '<div class="full-start__button selector button--continue-v4">' +
                '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>' +
                '<span>Продолжить</span>' +
            '</div>'
        );

        $btn.on('hover:enter', function() {
            var store = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            var saved = store[card.id];
            if (saved && saved.torrent_hash) {
                Lampa.Torrent.open(saved.torrent_hash, card);
                Lampa.Noty.show('Запуск: ' + saved.title);
            } else {
                Lampa.Noty.show('Нет сохранённой раздачи для: ' + (card.name || card.title));
            }
        });

        $container.prepend($btn);
    });

    // --- 2. Сохранение контекста при старте торрента ---
    function saveTorrent(data) {
        if (!data || !data.torrent_hash) return;
        var movie = data.movie || data.data;
        if (!movie) return;
        var cardId = movie.id;
        if (!cardId) return;
        var store = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        store[cardId] = {
            torrent_hash: data.torrent_hash,
            file_index: data.id,
            title: movie.name || movie.title
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    }

    try {
        if (Lampa.Player && Lampa.Player.listener) {
            Lampa.Player.listener.follow('start', saveTorrent);
        }
    } catch (e) {}
    try {
        Lampa.Listener.follow('player', saveTorrent);
    } catch (e) {}

})();
