(function() {
    'use strict';
    if (window.continue_series_debug_selector) return;
    window.continue_series_debug_selector = true;

    console.log('CS DIAG: Скрипт запущен');

    const STORAGE_KEY = 'continue_series_data';

    function getData(cardId) {
        try {
            const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            console.log('CS DIAG: getData для', cardId, '=', all[cardId]);
            return all[cardId] || null;
        } catch (e) { return null; }
    }

    function injectButton() {
        Lampa.Listener.follow('full', function(e) {
            console.log('CS DIAG: Событие full, type =', e.type);

            // Ждём именно 'complite' (с опечаткой, как в Lampa)
            if (e.type !== 'complite' || !e.data || !e.data.movie) return;

            const movie = e.data.movie;
            console.log('CS DIAG: Карточка открыта:', movie.name || movie.title, 'media_type:', movie.media_type);

            if (movie.media_type !== 'tv') {
                console.log('CS DIAG: Не сериал, пропускаем');
                return;
            }

            // ПРИНУДИТЕЛЬНО пытаемся найти панель кнопок
            const selectors = [
                '.full-start-new__buttons',
                '.full-buttons',
                '.card-buttons',
                '.full-start__buttons'
            ];

            let $panel = null;
            selectors.forEach(sel => {
                const $el = $(sel);
                console.log('CS DIAG: Селектор', sel, 'найдено элементов:', $el.length);
                if ($el.length && !$panel) $panel = $el.first();
            });

            if (!$panel) {
                console.warn('CS DIAG: ПАНЕЛЬ КНОПОК НЕ НАЙДЕНА. Проверьте селекторы выше.');
                return;
            }

            // Проверяем, нет ли уже кнопки
            if ($panel.find('.cs-debug-btn').length) {
                console.log('CS DIAG: Кнопка уже есть');
                return;
            }

            // Добавляем кнопку ВСЕГДА (игнорируем getData для диагностики)
            const $btn = $(`
                <div class="full-start-new__button selector cs-debug-btn">
                    <div class="full-start-new__button-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z"/>
                        </svg>
                    </div>
                    <div class="full-start-new__button-text">CS ДИАГ</div>
                </div>
            `);

            $btn.on('hover:enter', function() {
                Lampa.Noty.show('Кнопка CS ДИАГ нажата!');
            });

            $panel.prepend($btn);
            console.log('CS DIAG: Кнопка добавлена в панель');
        });
    }

    function init() {
        injectButton();
        console.log('CS DIAG: Инициализация завершена');
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', e => { if (e.type === 'ready') init(); });
})();
