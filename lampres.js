(function () {
    'use strict';
    if (window.cs_v8_diag) return;
    window.cs_v8_diag = true;

    const KEY = 'continue_series_v7';
    const noty = (m) => { try { Lampa.Noty.show(m); } catch(e){} console.log('CS v8:', m); };

    function isSeries(movie) {
        if (!movie) return false;
        return movie.number_of_seasons > 0 || !!movie.first_air_date || !!(movie.name && !movie.title);
    }

    // Уведомляем при загрузке
    noty('v8: загружен');

    // === 1. Слушатель старта плеера ===
    function attach() {
        if (!window.Lampa || !Lampa.Player || !Lampa.Player.listener) {
            setTimeout(attach, 1000);
            return;
        }
        noty('v8: слушатель игрока установлен');

        Lampa.Player.listener.follow('start', function (data) {
            const keys = data ? Object.keys(data).join(',') : 'нет data';
            noty('START keys: ' + keys.slice(0, 80));

            const movie = data && (data.card || data.movie) || (Lampa.Activity.active() && Lampa.Activity.active().movie);
            if (!movie || !movie.id) { noty('START: нет movie.id'); return; }
            noty('START id=' + movie.id + ' series=' + isSeries(movie));

            let hash = data && (data.torrent_hash || data.hash);
            let url = data && data.url;
            if (!hash && url) {
                const m = url.match(/[?&]link=([^&]+)/i);
                if (m) hash = m[1];
            }
            if (!hash) {
                noty('START: нет hash. url=' + (url ? url.slice(0, 60) : 'нет'));
                return;
            }
            noty('START hash=' + hash.slice(0, 10));

            try {
                const a = JSON.parse(localStorage.getItem(KEY) || '{}');
                a[movie.id] = { hash, title: movie.name || movie.title };
                localStorage.setItem(KEY, JSON.stringify(a));
                noty('SAVED id=' + movie.id);
            } catch (e) { noty('SAVE ERR: ' + e.message); }
        });
    }

    // === 2. Кнопка в карточке ===
    Lampa.Listener.follow('full', function (e) {
        if (e.type !== 'complite' || !e.data || !e.data.movie) return;
        $('.button--continue-series').remove();
        const movie = e.data.movie;
        if (!isSeries(movie)) return;

        $('.full-start-new__buttons').append(
            `<div class="full-start__button selector button--continue-series">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                <span>Продолжить</span>
            </div>`
        );

        $('.button--continue-series').on('hover:enter', function () {
            let all = {};
            try { all = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch(e){}
            const keys = Object.keys(all).join(',') || 'пусто';
            noty('BTN id=' + movie.id);
            noty('BTN keys: ' + keys.slice(0, 80));
            const d = all[String(movie.id)];
            if (!d) { noty('BTN: данных нет'); return; }
            noty('BTN: есть hash=' + d.hash.slice(0, 10));
            try { Lampa.Torrent.open(d.hash, movie); } catch (ex) { noty('BTN err: ' + ex.message); }
        });
    });

    attach();
})();
