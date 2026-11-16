(function () {
    'use strict';
    if (window.cs_v10) return;
    window.cs_v10 = true;

    const KEY = 'cs_v10_store';
    const LOG_KEY = 'cs_v10_logs';

    function L(m) {
        console.log('CS10 ' + m);
        try {
            const arr = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
            arr.push(new Date().toLocaleTimeString() + ' ' + m);
            if (arr.length > 200) arr.shift();
            localStorage.setItem(LOG_KEY, JSON.stringify(arr));
        } catch(e) {}
    }

    function save(id, data) {
        try {
            const all = JSON.parse(localStorage.getItem(KEY) || '{}');
            all[String(id)] = data;
            localStorage.setItem(KEY, JSON.stringify(all));
            L('SAVED id=' + id + ' hash=' + (data.hash||'').slice(0,8) + ' idx=' + data.index);
        } catch(e) { L('SAVE ERR ' + e.message); }
    }

    function get(id) {
        try { return JSON.parse(localStorage.getItem(KEY) || '{}')[String(id)] || null; } catch(e) { return null; }
    }

    function isSeries(m) {
        if (!m) return false;
        return m.number_of_seasons > 0 || !!m.first_air_date || !!(m.name && !m.title);
    }

    function currentMovie() {
        try {
            const a = Lampa.Activity.active();
            return a && (a.movie || a.card || a.card_data);
        } catch(e) { return null; }
    }

    // === 1. Хук на Lampa.Player.play ===
    function hookPlayerPlay() {
        try {
            if (!Lampa.Player || typeof Lampa.Player.play !== 'function') { L('no Lampa.Player.play'); return; }
            if (Lampa.Player.__hooked_v10) return;
            const orig = Lampa.Player.play;
            Lampa.Player.play = function () {
                L('PLAYER.PLAY argsLen=' + arguments.length + ' arg0Type=' + (arguments[0] && typeof arguments[0]));
                try {
                    const args = Array.prototype.slice.call(arguments);
                    const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url);
                    const movie = currentMovie();
                    L('PLAYER.PLAY url=' + (url ? String(url).slice(0, 100) : 'none') + ' movieId=' + (movie && movie.id));
                    if (url && movie && movie.id && isSeries(movie)) {
                        const m = String(url).match(/[?&]link=([a-f0-9]+)/i);
                        const i = String(url).match(/[?&]index=(\d+)/i);
                        if (m) {
                            const ex = get(movie.id) || {};
                            save(movie.id, { hash: m[1], index: i ? parseInt(i[1]) : 0, title: movie.name || movie.title, time: ex.time || 0 });
                        }
                    }
                } catch(e) { L('PLAYER.PLAY hook err: ' + e.message); }
                return orig.apply(this, arguments);
            };
            Lampa.Player.__hooked_v10 = true;
            L('HOOKED Player.play OK');
        } catch(e) { L('hookPlayerPlay err: ' + e.message); }
    }

    // === 2. Поллинг <video> ===
    let last = { hash: null, id: null };
    function pollVideo() {
        try {
            const v = document.querySelector('video');
            if (!v || !v.src) return;
            const m = v.src.match(/[?&]link=([a-f0-9]+)/i);
            if (!m) return;
            const hash = m[1];
            const iM = v.src.match(/[?&]index=(\d+)/i);
            const idx = iM ? parseInt(iM[1]) : 0;
            const movie = currentMovie();
            if (!movie || !movie.id) return;
            if (last.hash === hash && last.id === movie.id) return;
            last = { hash, id: movie.id };
            L('POLL src=' + v.src.slice(0, 120));
            L('POLL hash=' + hash.slice(0, 10) + ' idx=' + idx + ' id=' + movie.id + ' series=' + isSeries(movie));
            if (!isSeries(movie)) { L('POLL skip: not series'); return; }
            const ex = get(movie.id) || {};
            save(movie.id, { hash, index: idx, title: movie.name || movie.title, time: ex.time || 0 });
        } catch(e) {}
    }

    // === 3. Дамп доступных API ===
    setTimeout(() => {
        try {
            L('Lampa.Torrent keys: ' + Object.keys(Lampa.Torrent || {}).join(','));
            L('Lampa.Player keys: ' + Object.keys(Lampa.Player || {}).slice(0, 40).join(','));
            L('Lampa.PlayerVideo keys: ' + Object.keys(Lampa.PlayerVideo || {}).slice(0, 40).join(','));
        } catch(e) {}
    }, 2000);

    // === Кнопка ===
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
            L('BTN click id=' + movie.id + ' data=' + (d ? 'yes hash=' + d.hash.slice(0,8) + ' idx=' + d.index : 'no'));
            if (!d) {
                L('--- DUMP last 20 log lines ---');
                try {
                    const logs = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
                    logs.slice(-20).forEach(x => console.log('CS10 DUMP: ' + x));
                } catch(e) {}
                return;
            }
            try { Lampa.Torrent.open(d.hash, movie); } catch(ex) { L('BTN err: ' + ex.message); }
        });
    });

    hookPlayerPlay();
    setInterval(pollVideo, 500);
    L('v10 loaded');
})();
