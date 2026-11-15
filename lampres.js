(function() {
    'use strict';
    if (window.continue_v5) return;
    window.continue_v5 = true;

    var STORAGE_KEY = 'continue_v5';
    var lastCard = null;

    // --- Сохранение контекста при старте торрента ---
    function saveTorrent(data) {
        if (!data) return;
        var hash = data.torrent_hash || data.hash;
        var movie = data.movie || data.data;
        if (!hash || !movie || !movie.id) return;
        try {
            var store = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            store[movie.id] = {
                torrent_hash: hash,
                file_index: data.id,
                title: movie.name || movie.title || ''
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
        } catch(e) {}
    }
    try { Lampa.Player.listener.follow('start', saveTorrent); } catch(e) {}
    try { Lampa.Player.listener.follow('play', saveTorrent); } catch(e) {}

    // --- Попытка добавить кнопку ---
    function tryAddButton() {
        if (!lastCard || !lastCard.id) return;
        var $card = $('.full-start-new, .full-start, .cardify').last();
        if (!$card.length) return;

        // Ищем любую кнопку в карточке и берём её родителя как контейнер
        var $anyBtn = $card.find('.full-start__button, .full-start-new__button').first();
        if (!$anyBtn.length) return;
        var $container = $anyBtn.parent();
        if (!$container.length) return;

        if ($container.find('.button--continue-v5').length) return;

        var store = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        var saved = store[lastCard.id];

        var $btn = $('<div class="full-start__button selector button--continue-v5"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style="margin-right:.4em"><path d="M8 5v14l11-7z"/></svg><span>Продолжить</span></div>');
        $btn.on('hover:enter', function() {
            if (saved && saved.torrent_hash) {
                Lampa.Torrent.open(saved.torrent_hash, lastCard);
                Lampa.Noty.show('Запуск: ' + saved.title);
            } else {
                Lampa.Noty.show('Нет данных. Сначала запустите серию.');
            }
        });
        $container.prepend($btn);
        Lampa.Noty.show('Плагин: кнопка добавлена');
    }

    // --- Слушаем появление карточки ---
    Lampa.Listener.follow('full', function(e) {
        if (e.type !== 'complite' && e.type !== 'complete') return;
        lastCard = e.data || e.movie;
        Lampa.Noty.show('Плагин: событие карточки, тип=' + e.type);
        setTimeout(tryAddButton, 100);
        setTimeout(tryAddButton, 500);
        setTimeout(tryAddButton, 1500);
    });

    // --- Дополнительно: MutationObserver на появление карточки ---
    if (window.MutationObserver) {
        var observer = new MutationObserver(function() { tryAddButton(); });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // --- Резервный таймер ---
    setInterval(tryAddButton, 1500);

})();
