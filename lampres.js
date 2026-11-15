(function() {
    'use strict';
    if (window.continue_diag) return;
    window.continue_diag = true;

    console.log('DIAG: Плагин запущен');

    // 1. Слушаем событие карточки (тип 'complite'!)
    Lampa.Listener.follow('full', function(e) {
        console.log('DIAG: Событие full, тип:', e.type, 'movie:', e.movie ? e.movie.title : 'нет');
        if (e.type !== 'complite') return;

        const card = e.movie;
        if (!card) return;

        // Временно показываем кнопку для ВСЕХ карточек, чтобы проверить вставку
        const $container = e.object.activity.render().find('.full-start-new__buttons');
        console.log('DIAG: Контейнер кнопок найден?', $container.length > 0);

        if (!$container.length) return;
        if ($container.find('.button--diag').length) return; // уже добавлена

        const $btn = $(`
            <div class="full-start__button selector button--diag">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                <span>ДИАГ: Продолжить</span>
            </div>
        `);

        $btn.on('hover:enter', function() {
            Lampa.Noty.show('DIAG: Кнопка работает! Карточка: ' + card.title);
        });

        $container.prepend($btn);
        console.log('DIAG: Тестовая кнопка добавлена для', card.title);
    });

    // 2. Слушаем старт плеера и выводим ключи, чтобы понять, есть ли данные
    Lampa.Player.listener.follow('start', function(data) {
        console.log('DIAG: Player.start. Ключи data:', Object.keys(data));
        if (data.torrent_hash) {
            console.log('DIAG: Torrent hash:', data.torrent_hash, 'File id:', data.id);
        }
        if (data.movie) {
            console.log('DIAG: Movie object:', data.movie.title, 'media_type:', data.movie.media_type);
        }
    });

    console.log('DIAG: Слушатели установлены');
})();
