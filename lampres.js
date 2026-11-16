(function () {
    'use strict';
    if (window.cs_v12) return;
    window.cs_v12 = true;

    const KEY = 'cs_v12_store';
    let lastMovieId = null;

    function L(m) { console.log('CS12 ' + m); }
    function save(id, data) {
        try { const a = JSON.parse(localStorage.getItem(KEY)||'{}'); a[String(id)]=data; localStorage.setItem(KEY, JSON.stringify(a)); } catch(e){}
    }
    function get(id) {
        try { return JSON.parse(localStorage.getItem(KEY)||'{}')[String(id)]||null; } catch(e){ return null; }
    }
    function isSeries(m) {
        if (!m) return false;
        return m.number_of_seasons > 0 || !!m.first_air_date || !!(m.name && !m.title);
    }
    function currentMovie() {
        try { const a = Lampa.Activity.active(); return a && (a.movie || a.card || a.card_data); } catch(e){ return null; }
    }

    // === Hook Player.play — сохраняем URL и lastMovieId ===
    function hookPlayerPlay() {
        try {
            if (!Lampa.Player || typeof Lampa.Player.play !== 'function' || Lampa.Player.__hooked_v12) return;
            const orig = Lampa.Player.play;
            Lampa.Player.play = function () {
                try {
                    const args = Array.prototype.slice.call(arguments);
                    const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url);
                    const movie = currentMovie();
                    if (url && movie && movie.id && isSeries(movie)) {
                        lastMovieId = movie.id;
                        const h = String(url).match(/[?&]link=([a-f0-9]+)/i);
                        const i = String(url).match(/[?&]index=(\d+)/i);
                        const ex = get(movie.id) || {};
                        save(movie.id, {
                            fullUrl: url,
                            hash: h ? h[1] : null,
                            index: i ? parseInt(i[1]) : 0,
                            title: movie.name || movie.title,
                            time: ex.time || 0
                        });
                        L('SAVED id=' + movie.id + ' len=' + url.length + ' idx=' + (i?i[1]:0));
                    }
                } catch(e) { L('hook err: ' + e.message); }
                return orig.apply(this, arguments);
            };
            Lampa.Player.__hooked_v12 = true;
            L('HOOKED Player.play');
        } catch(e) { L('hook err: ' + e.message); }
    }

    // === Отслеживание видео — используем lastMovieId, не Activity ===
    const tracked = new WeakSet();
    function pollVideo() {
        try {
            document.querySelectorAll('video').forEach(v => {
                if (tracked.has(v)) return;
                if (!v.currentSrc && !v.src) return;
                const id = lastMovieId;
                if (!id) return;
                const d = get(id);
                if (!d) return;
                tracked.add(v);
                L('VIDEO attached id=' + id);

                let lastSave = 0;
                v.addEventListener('timeupdate', function () {
                    if (v.currentTime > 0.5) {
                        const cur = get(id);
                        if (cur) {
                            cur.time = v.currentTime;
                            const now = Date.now();
                            if (now - lastSave > 5000) {
                                save(id, cur);
                                lastSave = now;
                                L('TIME=' + Math.round(v.currentTime));
                            }
                        }
                    }
                });
                v.addEventListener('pause', function () {
                    if (v.currentTime > 0) {
                        const cur = get(id);
                        if (cur) { cur.time = v.currentTime; save(id, cur); L('PAUSE time=' + Math.round(v.currentTime)); }
                    }
                });

                // Автоперемотка после загрузки метаданных
                if (d.time > 1) {
                    const seek = () => {
                        if (v.duration > 0 && Math.abs(v.currentTime - d.time) > 2) {
                            v.currentTime = d.time;
                            L('SEEK to ' + Math.round(d.time));
                        }
                    };
                    if (v.readyState >= 1) seek();
                    else v.addEventListener('loadedmetadata', seek, {once: true});
                }
            });
        } catch(e) {}
    }

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
            L('BTN click id=' + movie.id + ' data=' + (d ? 'yes time=' + Math.round(d.time||0) : 'no'));
            if (!d || !d.fullUrl) return;
            lastMovieId = movie.id;

            // Показываем что запускаем (S01E01 из имени файла)
            const fname = d.fullUrl.split('/').pop().split('?')[0];
            const se = fname.match(/[Ss](\d{1,2})[Ee](\d{1,3})/);
            Lampa.Noty.show('CS: ' + (se ? 'S' + se[1] + ' E' + se[2] : fname.slice(0, 30)) + (d.time > 1 ? ' c ' + Math.round(d.time) + 'с' : ''));

            try {
                Lampa.Player.play({
                    url: d.fullUrl,
                    title: d.title,
                    card: movie,
                    movie: movie
                });
            } catch(ex) { L('play err: ' + ex.message); }
        });
    });

    hookPlayerPlay();
    setInterval(pollVideo, 1000);
    L('v12 loaded');
})();
