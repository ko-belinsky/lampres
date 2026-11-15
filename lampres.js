(function() {
    'use strict';
    if (window.continue_final_v1) return;
    window.continue_final_v1 = true;

    console.log('ContinueSeries: Плагин запущен (финальная версия)');

    // Слушаем событие полной загрузки карточки
    Lampa.Listener.follow('full', function(e) {
        // Ждём именно 'complite' — полной загрузки карточки
        if (e.type === 'complite') {
            // Данные карточки находятся в e.data.movie
            var movie = e.data.movie;
            if (!movie) return;

            // Нас интересуют только сериалы (можно убрать для теста)
            if (movie.media_type !== 'tv') return;

            // Ждём 300мс, чтобы интерфейс карточки точно отрисовался
            setTimeout(function() {
                // Ищем контейнер для кнопок
                var container = $('.full-start__buttons');
                
                // Если контейнер найден и нашей кнопки ещё нет
                if (container.length && !container.find('.button--continue-final').length) {
                    
                    // Создаём кнопку в стиле Lampa
                    var $btn = $(
                        '<div class="full-start__button selector button--continue-final">' +
                            '<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">' +
                                '<path d="M8 5v14l11-7z"/>' +
                            '</svg>' +
                            '<span>Продолжить</span>' +
                        '</div>'
                    );

                    // Обработчик нажатия (пока просто уведомление)
                    $btn.on('hover:enter', function() {
                        Lampa.Noty.show('Кнопка "Продолжить" работает для: ' + (movie.name || movie.title));
                    });

                    // Добавляем кнопку в начало панели
                    container.prepend($btn);
                    console.log('ContinueSeries: Кнопка добавлена для', movie.name || movie.title);
                }
            }, 300);
        }
    });
})();
