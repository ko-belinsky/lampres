(function () {
    'use strict';
    if (window.cs_v16) return;
    window.cs_v16 = true;

    const KEY = 'cs_v16_store';
    let lastMovieId = null;
    let lastArg = null;

    function L(m) { console.log('CS16 ' + m); }

    function save(id, data) {
        try { const a = JSON.parse(localStorage.getItem(KEY)||'{}'); a[String(id)]=data; localStorage.setItem(KEY, JSON.stringify(a)); L('SAVED id='+id); }
        catch(e) { L('save err '+e.message); }
    }
    function get(id) {
        try { return JSON.parse(localStorage.getItem(KEY)||'{}')[String(id)]||null; } catch(e) { return null; }
    }
    function isSeries(m) { return m && (m.number_of_seasons > 0 || !!m.first_air_date || (m.name && !m.title)); }
    function currentMovie() { try { const a = Lampa.Activity.active(); return a && (a.movie || a.card || a.card_data); } catch(e) { return null; } }

    // === 1. Сохраняем аргумент Player.play и lastMovieId ===
    if (Lampa.Player && typeof Lampa.Player.play === 'function' && !Lampa.Player.__hooked_v16) {
        const orig = Lampa.Player.play;
        Lampa.Player.play = function (arg) {
            try {
                if (arg && typeof arg === 'object' && arg.url) {
                    const movie = arg.card || arg.movie || currentMovie();
                    if (movie && movie.id && isSeries(movie)) {
                        lastMovieId = movie.id;
                        lastArg = arg;
                        const h = String(arg.url).match(/[?&]link=([a-f0-9]+)/i);
                        const i = String(arg.url).match(/[?&]index=(\d+)/i);
                        save(movie.id, {
                            url: arg.url,
                            torrent_hash: arg.torrent_hash || (h ? h[1] : null),
                            id: arg.id !== undefined ? arg.id : (i ? parseInt(i[1]) : 0),
                            path: arg.path,
                            season: arg.season,
                            episode: arg.episode,
                            title: arg.title || movie.name || movie.title,
                            first_title: arg.first_title,
                            time: 0,
                            timeline_hash: null
                        });
                        L('PLAY saved id='+movie.id);
                    }
                }
            } catch(e) { L('hook err '+e.message); }
            return orig.apply(this, arguments);
        };
        Lampa.Player.__hooked_v16 = true;
        L('HOOKED Player.play');
    }

    // === 2. Ловим обновления Timeline — получаем точный hash и time ===
    function attachTimeline() {
        if (!Lampa.Timeline || !Lampa.Timeline.listener) {
            setTimeout(attachTimeline, 1000);
            return;
        }
        Lampa.Timeline.listener.follow('update', function (e) {
            if (!e || !e.hash) return;
            const id = lastMovieId;
            if (!id) return;
            const d = get(id);
            if (!d) return;
            if (e.hash && e.hash !== '0') {
                d.timeline_hash = e.hash;
                if (typeof e.time === 'number') d.time = e.time;
                save(id, d);
                L('TIMELINE hash=' + String(e.hash).slice(0,8) + ' time=' + Math.round(e.time||0));
            }
        });
        L('ATTACHED Timeline.update');
    }

    // === 3. Резерв: ловим timeupdate через PlayerVideo ===
    function attachVideo() {
        if (!Lampa.PlayerVideo || !Lampa.PlayerVideo.listener) {
            setTimeout(attachVideo, 1000);
            return;
        }
        Lampa.PlayerVideo.listener.follow('timeupdate', function () {
            const id = lastMovieId;
            if (!id) return;
            const d = get(id);
            if (!d) return;
            let v = null;
            try { v = Lampa.PlayerVideo.video(); } catch(e) {}
            if (v && v.currentTime > 0.5) {
                d.time = v.currentTime;
                const now = Date.now();
                if (!d._lastSave || now - d._lastSave > 5000) {
                    d._lastSave = now;
                    save(id, d);
                    L('VIDEO time=' + Math.round(v.currentTime));
                }
            }
        });
        L('ATTACHED PlayerVideo.timeupdate');
    }

    // === 4. Кнопка «Продолжить» ===
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
            L('BTN click id=' + movie.id + ' data=' + (d ? 'hash=' + (d.timeline_hash||'none') + ' time=' + Math.round(d.time||0) : 'no'));
            if (!d || !d.url) return;

            // Если есть сохранённый timeline_hash — берём время из Timeline
            let resumeTime = d.time || 0;
            if (d.timeline_hash && Lampa.Timeline && typeof Lampa.Timeline.view === 'function') {
                try {
                    const v = Lampa.Timeline.view(d.timeline_hash);
                    if (v && v.time > 1) resumeTime = v.time;
                } catch(e) {}
            }
            L('BTN resumeTime=' + Math.round(resumeTime));

            // Запускаем тот же файл
            const playArg = lastArg && lastArg.card && lastArg.card.id === movie.id ? lastArg : {
                url: d.url,
                title: d.title,
                card: movie,
                movie: movie,
                torrent_hash: d.torrent_hash,
                id: d.id,
                path: d.path,
                season: d.season,
                episode: d.episode,
                first_title: d.first_title
            };
            // Восстанавливаем card/movie на случай, если lastArg от другого фильма
            playArg.card = movie;
            playArg.movie = movie;

            Lampa.Player.play(playArg);

            // Перематываем после старта
            if (resumeTime > 1) {
                let tries = 0;
                const timer = setInterval(function () {
                    let v = null;
                    try { v = Lampa.PlayerVideo.video(); } catch(e) {}
                    if (v && v.readyState >= 1 && v.duration > 0) {
                        v.currentTime = resumeTime;
                        clearInterval(timer);
                        L('SEEK to ' + Math.round(resumeTime));
                    } else if (++tries > 40) {
                        clearInterval(timer);
                        L('SEEK timeout');
                    }
                }, 500);
            }
        });
    });

    attachTimeline();
    attachVideo();
    L('v16 loaded');
})();
