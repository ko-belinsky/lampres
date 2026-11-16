(function() {
    'use strict';
    if (window.continue_series_diag) return;
    window.continue_series_diag = true;

    console.log('ContinueSeries DIAG: Скрипт начал выполняться');

    // РЕГИСТРИРУЕМ МАНИФЕСТ СРАЗУ, не дожидаясь appready
    try {
        Lampa.Manifest.plugins = {
            type: 'video',
            version: '1.0.0',
            name: 'ContinueSeriesDiag',
            description: 'Диагностика контекстного меню',
            component: 'my_screen', // на всякий случай
            onContextMenu: function(card) {
                console.log('ContinueSeries DIAG: onContextMenu ВЫЗВАН! card =', card);
                // Возвращаем пункт ДЛЯ ВСЕХ карточек, без проверок
                return {
                    name: 'Продолжить просмотр (ДИАГ)',
                    title: 'Продолжить просмотр (ДИАГ)', // на случай, если Lampa ждёт title
                    icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'
                };
            },
            onContextLauch: function(card) {
                console.log('ContinueSeries DIAG: onContextLauch ВЫЗВАН! card =', card);
                Lampa.Noty.show('ДИАГ: пункт меню выбран для: ' + (card.name || card.title));
            }
        };
        console.log('ContinueSeries DIAG: Манифест зарегистрирован (сразу)');
    } catch (e) {
        console.error('ContinueSeries DIAG: Ошибка регистрации манифеста', e);
    }

    // Дополнительно: проверим, что лежит в Lampa.Manifest.plugins после регистрации
    setTimeout(function() {
        console.log('ContinueSeries DIAG: Lampa.Manifest.plugins =', Lampa.Manifest.plugins);
    }, 1000);

})();
