(function () {
    'use strict';
    if (window.cs_v17) return;
    window.cs_v17 = true;

    const KEY = 'cs_v17_store';
    let lastMovieId = null;
    let lastArg = null;
    let lastTimelineHash = null;

    function L(m) { console.log('CS17 ' + m); }
    function save(id, data) {
        try { const a = JSON.parse(localStorage.getItem(KEY)||'{}'); a[String(id)]=data; localStorage.setItem(KEY, JSON.stringify(a)); }
        catch(e) { L('save err '+e.message); }
    }
    function get(id) {
        try { return JSON.parse(localStorage.getItem(KEY)||'{}')[String(id)]||null; } catch(e) { return null; }
    }
    function isSeries(m) { return m && (m.number_of_seasons > 0 || !!m.first_air_date || (m.name && !m.title)); }
    function currentMovie() { try { const a = Lampa.Activity.active(); return a && (a.movie || a.card || a.card_data); } catch(e) { return null; } }

    // === 1. Перехват Player.play: сохраняем аргумент и movieId ===
    if (Lampa.Player && typeof Lampa.Player.play === 'function' && !Lampa.Player.__hooked_v17) {
        const orig = Lampa.Player.play;
        Lampa.Player.play = function (arg) {
            try {
                if (arg && typeof arg === 'object' && arg.url) {
                    const movie = arg.card || arg.movie || currentMovie();
                    if (movie && movie.id && isSeries(movie)) {
                        lastMovieId = movie.id;
                        lastArg = arg;
                        lastTimelineHash = null; // сбрасываем при новом запуске
                        L('PLAY saved id=' + movie.id);
                    }
                }
            } catch(e) { L('hook err '+e.message); }
            return orig.apply(this, arguments);
        };
        Lampa.Player.__hooked_v17 = true;
        L('HOOKED Player.play');
    }

    // === 2. Подписка на Player.start: здесь вешаем слушатели PlayerVideo ===
    if (Lampa.Player && Lampa.Player.listener) {
        Lampa.Player.listener.follow('start', function () {
            L('PLAYER START event');
            // Подписываемся на timeupdate (как в документации: только внутри start)
            try {
                if (Lampa.PlayerVideo && Lampa.PlayerVideo.listener) {
                    Lampa.PlayerVideo.listener.follow('timeupdate', onVideoTimeUpdate);
                    L('ATTACHED timeupdate');
                }
            } catch(e) { L('attach err '+e.message); }
        });
    }

    // Обработчик timeupdate — резервное сохранение времени
    function onVideoTimeUpdate(e) {
        if (!lastMovieId) return;
        if (!e || typeof e.current !== 'number' || e.current < 1) return;
        const d = get(lastMovieId);
        if (!d) return;
        d.time = e.current;
        const now = Date.now();
        if (!d._lastSave || now - d._lastSave > 5000) {
            d._lastSave = now;
            save(lastMovieId, d);
            L('VIDEO time=' + Math.round(e.current));
        }
    }

    // === 3. Подписка на Timeline.update: получаем точный hash ===
    function attachTimeline() {
        if (!Lampa.Timeline || !Lampa.Timeline.listener) {
            setTimeout(attachTimeline, 1000);
            return;
        }
        Lampa.Timeline.listener.follow('update', function (e) {
            if (!e || !e.hash || e.hash === '0') return;
            if (!lastMovieId) return;
            lastTimelineHash = e.hash;
            const d = get(lastMovieId);
            if (d) {
                d.timeline_hash = e.hash;
                if (typeof e.time === 'number') d.time = e.time;
                save(lastMovieId, d);
            }
            L('TIMELINE hash=' + String(e.hash).slice(0,8) + ' time=' + Math.round(e.time||0));
        });
        L('ATTACHED Timeline.update');
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

            // Приоритет: хэш из Timeline → время из Timeline → сохранённое время
            let resumeTime = d.time || 0;
            const hashToUse = lastTimelineHash || d.timeline_hash;
            if (hashToUse && Lampa.Timeline && typeof Lampa.Timeline.view === 'function') {
                try {
                    const v = Lampa.Timeline.view(hashToUse);
                    if (v && v.time > 1) resumeTime = v.time;
                    L('TIMELINE.view hash=' + String(hashToUse).slice(0,8) + ' time=' + Math.round(v.time||0));
                } catch(e) { L('timeline view err '+e.message); }
            }
            L('BTN resumeTime=' + Math.round(resumeTime));

            // Восстанавливаем аргумент запуска
            const playArg = {
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
    L('v17 loaded');
})();
