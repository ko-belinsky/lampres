(function () {
    'use strict';
    if (window.cs_v11) return;
    window.cs_v11 = true;

    const KEY = 'cs_v11_store';

    function L(m) {
        console.log('CS11 ' + m);
    }

    function save(id, data) {
        try {
            const all = JSON.parse(localStorage.getItem(KEY) || '{}');
            all[String(id)] = data;
            localStorage.setItem(KEY, JSON.stringify(all));
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

    // === Хук на Lampa.Player.play — сохраняем ПОЛНЫЙ URL ===
    function hookPlayerPlay() {
        try {
            if (!Lampa.Player || typeof Lampa.Player.play !== 'function') return;
            if (Lampa.Player.__hooked_v11) return;
            const orig = Lampa.Player.play;
            Lampa.Player.play = function () {
                try {
                    const args = Array.prototype.slice.call(arguments);
                    const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url);
                    const movie = currentMovie();
                    if (url && movie && movie.id && isSeries(movie)) {
                        const m = String(url).match(/[?&]link=([a-f0-9]+)/i);
                        const i = String(url).match(/[?&]index=(\d+)/i);
                        const hash = m ? m[1] : (args[0] && args[0].hash);
                        const idx = i ? parseInt(i[1]) : 0;
                        const ex = get(movie.id) || {};
                        save(movie.id, {
                            fullUrl: url,
                            hash: hash,
                            index: idx,
                            title: movie.name || movie.title,
                            time: ex.time || 0
                        });
                        L('SAVED fullUrl len=' + url.length + ' hash=' + (hash||'').slice(0,8) + ' idx=' + idx + ' id=' + movie.id);
                    }
                } catch(e) { L('PLAYER.PLAY hook err: ' + e.message); }
                return orig.apply(this, arguments);
            };
            Lampa.Player.__hooked_v11 = true;
            L('HOOKED Player.play OK');
        } catch(e) { L('hookPlayerPlay err: ' + e.message); }
    }

    // === Отслеживание позиции через <video> ===
    let attachedVideo = null;
    function pollVideo() {
        try {
            const v = document.querySelector('video');
            if (!v || v === attachedVideo) return;
            if (!v.src) return;
            const movie = currentMovie();
            if (!movie || !movie.id) return;
            const d = get(movie.id);
            if (!d) return;

            attachedVideo = v;
            L('VIDEO attached, tracking time');
            v.addEventListener('timeupdate', function () {
                if (!v.paused && v.currentTime > 0) {
                    const cur = get(movie.id);
                    if (cur) {
                        cur.time = v.currentTime;
                        save(movie.id, cur);
                    }
                }
            });
            v.addEventListener('pause', function () {
                const cur = get(movie.id);
                if (cur && v.currentTime > 0) {
                    cur.time = v.currentTime;
                    save(movie.id, cur);
                    L('PAUSE saved time=' + Math.round(v.currentTime));
                }
            });
        } catch(e) {}
    }

    // === Дамп API на случай проблем ===
    setTimeout(() => {
        try {
            L('Player.play type=' + typeof Lampa.Player.play);
            L('Torrent keys: ' + Object.keys(Lampa.Torrent || {}).join(','));
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
            L('BTN click id=' + movie.id + ' data=' + (d ? 'fullUrl=' + (d.fullUrl ? 'yes(' + d.fullUrl.length + ')' : 'no') + ' time=' + Math.round(d.time||0) : 'no'));
            if (!d || !d.fullUrl) { L('BTN: no fullUrl'); return; }
            try {
                L('BTN play url=' + d.fullUrl.slice(0, 120));
                Lampa.Player.play({
                    url: d.fullUrl,
                    title: d.title,
                    card: movie,
                    movie: movie
                });
                // Перемотка после старта
                if (d.time > 0) {
                    let tries = 0;
                    const t = setInterval(() => {
                        const v = document.querySelector('video');
                        if (v && v.readyState > 0) {
                            v.currentTime = d.time;
                            clearInterval(t);
                            L('BTN seek to ' + Math.round(d.time));
                        } else if (++tries > 30) clearInterval(t);
                    }, 500);
                }
            } catch(ex) { L('BTN err: ' + ex.message); }
        });
    });

    hookPlayerPlay();
    setInterval(pollVideo, 1000);
    L('v11 loaded');
})();
