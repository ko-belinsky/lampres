(function () {
    'use strict';
    if (window.cs_final_diag) return;
    window.cs_final_diag = true;

    console.log('CS FINAL: Скрипт загружен');

    // Регистрируем слушатель СРАЗУ (как делает рабочий плагин), без appready
    Lampa.Listener.follow('full', function (e) {
        console.log('CS FINAL: Событие full, type =', e.type);

        if (e.type !== 'complite') return;
        console.log('CS FINAL: complite! e.data =', e.data);
        if (!e.data || !e.data.movie) {
            console.log('CS FINAL: Нет e.data.movie');
            return;
        }

        const movie = e.data.movie;
        console.log('CS FINAL: Название =', movie.title || movie.name, '| media_type =', movie.media_type);

        $('.button--continue-series').remove();

        // Проверяем все возможные селекторы панели
        const sels = ['.full-start-new__buttons', '.full-start__buttons', '.full-buttons', '.card-buttons'];
        sels.forEach(s => console.log('CS FINAL: селектор', s, '=', $(s).length));

        const $panel = $('.full-start-new__buttons');
        if (!$panel.length) {
            console.log('CS FINAL: ПАНЕЛЬ НЕ НАЙДЕНА — кнопка не добавлена');
            return;
        }

        // Добавляем кнопку ровно как в рабочем плагине
        $panel.append(
            `<div class="full-start__button selector button--continue-series">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                </svg>
                <span>Продолжить</span>
            </div>`
        );

        $('.button--continue-series').on('hover:enter', function () {
            console.log('CS FINAL: Кнопка нажата');
            Lampa.Noty.show('Кнопка "Продолжить" работает!');
        });

        console.log('CS FINAL: КНОПКА ДОБАВЛЕНА');
    });

    console.log('CS FINAL: Слушатель full зарегистрирован');
})();
