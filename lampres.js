(function () {
    'use strict';
    if (window.cs_hook_diag) return;
    window.cs_hook_diag = true;

    console.log('CS HOOK: Запуск');

    // === 1. Хукаем send, чтобы видеть ВСЕ события Lampa ===
    try {
        const origSend = Lampa.Listener.send;
        Lampa.Listener.send = function (name, data) {
            console.log('CS HOOK EVENT:', name, '| type:', data && data.type);
            return origSend.apply(this, arguments);
        };
        console.log('CS HOOK: send захукан');
    } catch (e) {
        console.error('CS HOOK: ошибка хука send', e);
    }

    // === 2. Пробуем follow('full') ===
    Lampa.Listener.follow('full', function (e) {
        console.log('CS HOOK: FOLLOW FULL СРАБОТАЛ!', e && e.type, e && e.data);
    });
    console.log('CS HOOK: follow("full") зарегистрирован');

    // === 3. Самопроверка: через 8 секунд отправим искусственное событие ===
    setTimeout(() => {
        console.log('CS HOOK: SELF-TEST — отправляем искусственный full/complite');
        try {
            Lampa.Listener.send('full', {
                type: 'complite',
                data: { movie: { id: 999999, media_type: 'tv', title: 'SELF-TEST MOVIE' } }
            });
            console.log('CS HOOK: SELF-TEST отправлен. Если выше не появилось "FOLLOW FULL СРАБОТАЛ" — follow не работает.');
        } catch (e) {
            console.error('CS HOOK: ошибка SELF-TEST', e);
        }
    }, 8000);

    // === 4. MutationObserver — страховка, ловит появление панели в DOM ===
    const observer = new MutationObserver(function () {
        const $panel = $('.full-start-new__buttons');
        if (!$panel.length) return;
        if ($panel.find('.button--continue-series').length) return;

        console.log('CS HOOK: MutationObserver — панель найдена, добавляем кнопку');
        $panel.append(
            `<div class="full-start__button selector button--continue-series">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                </svg>
                <span>Продолжить</span>
            </div>`
        );
        $('.button--continue-series').on('hover:enter', function () {
            console.log('CS HOOK: кнопка нажата');
            Lampa.Noty.show('CS HOOK: кнопка работает!');
        });
        console.log('CS HOOK: КНОПКА ДОБАВЛЕНА через MutationObserver');
    });
    observer.observe(document.body, { childList: true, subtree: true });
    console.log('CS HOOK: MutationObserver запущен');

    // === 5. Убираем кнопку при закрытии карточки (по событию Activity) ===
    if (Lampa.Activity && Lampa.Activity.listener) {
        Lampa.Activity.listener.follow('start', function (e) {
            console.log('CS HOOK: Activity start', e && e.activity);
            if (e && e.activity && e.activity.component !== 'full') {
                $('.button--continue-series').remove();
            }
        });
    }
})();
