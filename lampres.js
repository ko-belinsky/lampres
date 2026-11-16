(function () {
    'use strict';
    if (window.cs_v13) return;
    window.cs_v13 = true;

    const KEY = 'cs_v13_store';

    function L(m) { console.log('CS13 ' + m); }

    function save(id, data) {
        try {
            const a = JSON.parse(localStorage.getItem(KEY) || '{}');
            a[String(id)] = data;
            localStorage.setItem(KEY, JSON.stringify(a));
            L('SAVED id=' + id + ' hash=' + (data.hash||'').slice(0,8) + ' idx=' + data.index);
        } catch(e) { L('save err: ' + e.message); }
    }

    function get(id) {
        try { return JSON.parse(localStorage.getItem(KEY) || '{}')[String(id)] || null; } catch(e) { return null; }
    }

    function isSeries(m) {
        if (!m) return false;
        return m.number_of_seasons > 0 || !!m.first_air_date || !!(m.name && !m.title);
    }

    // === 1. Перехват старта плеера: сохраняем hash и index ===
    // Используем официально документированный паттерн из docs/en/10-player.md
    if (Lampa.Player && Lampa.Player.listener) {
        Lampa.Player.listener.follow('start', function (data) {
            // data.torrent_hash и data.id (индекс файла) — документированные поля
            const hash = data.torrent_hash;
            const index = data.id;
            const movie = data.movie || data.card;

            if (!hash || !movie || !movie.id || !isSeries(movie)) {
                L('start skip: hash=' + !!hash + ' movieId=' + (movie && movie.id));
                return;
            }

            L('START hash=' + hash.slice(0,8) + ' idx=' + index + ' id=' + movie.id);
            const ex = get(movie.id) || {};
            save(movie.id, {
                hash: hash,
                index: index || 0,
                title: movie.name || movie.title,
                // Поле time оставляем, но оно больше не нужно для перемотки
                time: ex.time || 0
            });
        });
        L('listener Player.start attached');
    } else {
        L('Player.listener not found');
    }

    // === 2. Кнопка «Продолжить» ===
    Lampa.Listener.follow('full', function (e) {
        if (e.type !== 'complite' || !e.data || !e.data.movie) return;
        const movie = e.data.movie;
        if (!isSeries(movie)) return;

        $('.button--continue-series').remove();
        $('.full-start-new__buttons').append(
            '<div class="full-start__button selector button--continue-series">' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>' +
            '<span>Продолжить</span></div>'
        );

        $('.button--continue-series').on('hover:enter', function () {
            const d = get(movie.id);
            L('BTN click id=' + movie.id + ' data=' + (d ? 'hash=' + d.hash.slice(0,8) + ' idx=' + d.index : 'no'));
            if (!d || !d.hash) { L('BTN: нет сохранённых данных'); return; }

            try {
                // Torrent.start(element, movie) — element содержит hash и index
                L('BTN Torrent.start hash=' + d.hash.slice(0,8) + ' idx=' + d.index);
                Lampa.Torrent.start({
                    hash: d.hash,
                    index: d.index || 0
                }, movie);
            } catch(ex) {
                L('BTN err: ' + ex.message);
                // Запасной вариант, если start не сработает
                try { Lampa.Torrent.open(d.hash, movie); } catch(e2) { L('BTN open err: ' + e2.message); }
            }
        });
    });

    L('v13 loaded');
})();
