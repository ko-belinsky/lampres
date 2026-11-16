(function () {
    'use strict';
    if (window.cs_v9) return;
    window.cs_v9 = true;

    const KEY = 'cs_v9_store';
    const LOG_KEY = 'cs_v9_logs';

    function L(m) {
        console.log('CS9 ' + m);
        try {
            const arr = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
            arr.push(new Date().toLocaleTimeString() + ' ' + m);
            if (arr.length > 100) arr.shift();
            localStorage.setItem(LOG_KEY, JSON.stringify(arr));
        } catch(e) {}
    }

    function save(id, data) {
        try {
            const all = JSON.parse(localStorage.getItem(KEY) || '{}');
            all[String(id)] = data;
            localStorage.setItem(KEY, JSON.stringify(all));
            L('SAVED id=' + id + ' hash=' + (data.hash || '').slice(0, 8) + ' idx=' + data.index);
        } catch(e) { L('SAVE ERR ' + e.message); }
    }

    function get(id) {
        try { return JSON.parse(localStorage.getItem(KEY) || '{}')[String(id)] || null; } catch(e) { return null; }
    }

    function hashFromUrl(url) {
        if (!url) return null;
        const m = String(url).match(/[?&]link=([a-f0-9]+)/i);
        return m ? m[1] : null;
    }

    function indexFromUrl(url) {
        if (!url) return 0;
        const m = String(url).match(/[?&]index=(\d+)/i);
        return m ? parseInt(m[1]) : 0;
    }

    function isSeries(m) {
        if (!m) return false;
        return m.number_of_seasons > 0 || !!m.first_air_date || !!(m.name && !m.title);
    }

    // ==== Способ 1: перехват Torrent.open ====
    function hookTorrent() {
        try {
            if (!Lampa.Torrent || typeof Lampa.Torrent.open !== 'function') return false;
            if (Lampa.Torrent.__hooked_v9) return true;
            const orig = Lampa.Torrent.open;
            Lampa.Torrent.open = function () {
                const args = Array.prototype.slice.call(arguments);
                L('TORRENT.OPEN argsLen=' + args.length + ' arg0=' + (typeof args[0]) + ' arg1type=' + (args[1] && typeof args[1]));
                let hash = null, movie = null;
                // Пробуем разные варианты сигнатуры
                if (typeof args[0] === 'string') { hash = args[0]; movie = args[1]; }
                else if (args[0] && typeof args[0] === 'object') {
                    hash = args[0].hash || args[0].torrent_hash || args[0].magnet;
                    movie = args[1] || args[0].movie || args[0].card;
                }
                L('TORRENT.OPEN hash=' + (hash ? String(hash).slice(0,10) : 'none') + ' movieId=' + (movie && movie.id) + ' series=' + isSeries(movie));
                if (hash && movie && movie.id && isSeries(movie)) {
                    const ex = get(movie.id) || {};
                    save(movie.id, { hash: hash, index: ex.index || 0, title: movie.name || movie.title, time: ex.time || 0 });
                }
                return orig.apply(this, arguments);
            };
            Lampa.Torrent.__hooked_v9 = true;
            L('HOOKED Torrent.open OK');
            return true;
        } catch(e) { L('hookTorrent err: ' + e.message); return false; }
    }

    // ==== Способ 2: Player.listener.start ====
    function onPlayerStart(d, src) {
        try {
            const keys = d ? Object.keys(d).join(',') : 'null';
            L(src + ' keys=' + keys.slice(0, 80));
            const movie = (d && (d.card || d.movie)) || (Lampa.Activity.active() && Lampa.Activity.active().movie);
            if (!movie || !movie.id) { L(src + ' no movie'); return; }
            L(src + ' id=' + movie.id + ' series=' + isSeries(movie));
            if (!isSeries(movie)) return;
            let hash = (d && (d.torrent_hash || d.hash)) || hashFromUrl(d && d.url);
            if (!hash && d && d.data) hash = d.data.hash || d.data.torrent_hash;
            const idx = indexFromUrl(d && d.url) || (d && d.file_index) || (d && d.index) || 0;
            if (!hash) { L(src + ' NO HASH url=' + ((d && d.url) || '').slice(0, 80)); return; }
            L(src + ' hash=' + hash.slice(0, 10) + ' idx=' + idx);
            const ex = get(movie.id) || {};
            save(movie.id, { hash: hash, index: idx || ex.index || 0, title: movie.name || movie.title, time: ex.time || 0 });
        } catch(e) { L(src + ' err: ' + e.message); }
    }

    let attempts = 0;
    function tryPlayerAttach() {
        attempts++;
        try {
            if (Lampa.Player && Lampa.Player.listener && typeof Lampa.Player.listener.follow === 'function') {
                Lampa.Player.listener.follow('start', d => onPlayerStart(d, 'PLAYER.start'));
                L('ATTACHED Player.start (try ' + attempts + ')');
                return;
            }
        } catch(e) { L('attachPlayer err: ' + e.message); }
        L('player try ' + attempts + ' Player=' + (typeof Lampa.Player) + ' listener=' + (Lampa.Player && typeof Lampa.Player.listener));
        if (attempts < 30) setTimeout(tryPlayerAttach, 1000);
    }

    // ==== Способ 3: глобальный Listener ====
    function tryGlobalAttach() {
        try {
            if (Lampa.Listener && typeof Lampa.Listener.follow === 'function') {
                Lampa.Listener.follow('player', function (e) {
                    if (e && (e.type === 'start' || e.type === 'play' || e.type === 'playstart')) {
                        onPlayerStart(e, 'GLOBAL.player.' + e.type);
                    }
                });
                L('ATTACHED Listener.player');
            }
        } catch(e) { L('global err: ' + e.message); }
    }

    // ==== Кнопка ====
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
            L('BTN click id=' + movie.id);
            const d = get(movie.id);
            if (!d) {
                L('BTN no data, dumped log:');
                try {
                    const logs = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
                    logs.slice(-15).forEach(x => console.log('CS9 DUMP: ' + x));
                } catch(e) {}
                return;
            }
            L('BTN open hash=' + d.hash.slice(0, 10) + ' idx=' + d.index);
            try { Lampa.Torrent.open(d.hash, movie); } catch(ex) { L('BTN err: ' + ex.message); }
        });
    });

    L('v9 loaded');
    tryPlayerAttach();
    tryGlobalAttach();
    // Пробуем хукнуть Torrent несколько раз, вдруг он позже появится
    if (!hookTorrent()) { setTimeout(hookTorrent, 1000); setTimeout(hookTorrent, 3000); setTimeout(hookTorrent, 8000); }
})();
