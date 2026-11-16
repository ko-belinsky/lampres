(function () {
    'use strict';
    if (window.cs_v15) return;
    window.cs_v15 = true;

    const KEY = 'cs_v15_store';
    function L(m) { console.log('CS15 ' + m); }

    function save(id, data) {
        try { const a = JSON.parse(localStorage.getItem(KEY)||'{}'); a[String(id)]=data; localStorage.setItem(KEY, JSON.stringify(a)); L('SAVED id='+id); }
        catch(e) { L('save err '+e.message); }
    }
    function get(id) {
        try { return JSON.parse(localStorage.getItem(KEY)||'{}')[String(id)]||null; } catch(e) { return null; }
    }
    function isSeries(m) { return m && (m.number_of_seasons > 0 || !!m.first_air_date || (m.name && !m.title)); }
    function currentMovie() { try { const a = Lampa.Activity.active(); return a && (a.movie || a.card || a.card_data); } catch(e) { return null; } }

    // Пробуем вычислить хэш Timeline из данных торрента
    function guessTimelineTime(d) {
        const candidates = [];
        if (!d) return 0;

        const th = d.torrent_hash || d.__hash;
        const idx = d.id !== undefined ? d.id : d.__index;
        const path = d.path;

        if (window.Lampa && Lampa.Utils && typeof Lampa.Utils.hash === 'function') {
            if (th && idx !== undefined) {
                candidates.push(Lampa.Utils.hash(th + ':' + idx));
                candidates.push(Lampa.Utils.hash(th + '_' + idx));
                candidates.push(Lampa.Utils.hash(th + idx));
            }
            if (path) {
                candidates.push(Lampa.Utils.hash(path));
            }
            if (th && d.season !== undefined && d.episode !== undefined) {
                candidates.push(Lampa.Utils.hash(th + ':s' + d.season + 'e' + d.episode));
                candidates.push(Lampa.Utils.hash(d.season + ':' + d.episode + ':' + (d.first_title || d.title)));
            }
        }

        if (window.Lampa && Lampa.Timeline && typeof Lampa.Timeline.view === 'function') {
            for (const h of candidates) {
                try {
                    const v = Lampa.Timeline.view(h);
                    if (v && v.time > 1) {
                        L('TIMELINE found hash=' + h.slice(0,8) + ' time=' + Math.round(v.time));
                        return v.time;
                    }
                } catch(e) {}
            }
        }
        L('TIMELINE not found, candidates=' + candidates.length);
        return 0;
    }

    // === Хук Player.play: сохраняем все нужные поля ===
    if (Lampa.Player && typeof Lampa.Player.play === 'function' && !Lampa.Player.__hooked_v15) {
        const orig = Lampa.Player.play;
        Lampa.Player.play = function (arg) {
            try {
                if (arg && typeof arg === 'object') {
                    const movie = arg.card || arg.movie || currentMovie();
                    if (movie && movie.id && isSeries(movie) && arg.url) {
                        const h = String(arg.url).match(/[?&]link=([a-f0-9]+)/i);
                        const i = String(arg.url).match(/[?&]index=(\d+)/i);
                        const data = {
                            url: arg.url,
                            torrent_hash: arg.torrent_hash || (h ? h[1] : null),
                            id: arg.id !== undefined ? arg.id : (i ? parseInt(i[1]) : 0),
                            path: arg.path,
                            season: arg.season,
                            episode: arg.episode,
                            title: arg.title || movie.name || movie.title,
                            first_title: arg.first_title
                        };
                        save(movie.id, data);
                        L('PLAY saved hash=' + (data.torrent_hash||'').slice(0,8) + ' idx=' + data.id);
                    }
                }
            } catch(e) { L('hook err '+e.message); }
            return orig.apply(this, arguments);
        };
        Lampa.Player.__hooked_v15 = true;
        L('HOOKED Player.play');
    }

    // === Кнопка «Продолжить» ===
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
            L('BTN click id=' + movie.id + ' data=' + (d ? 'yes' : 'no'));
            if (!d || !d.url) return;

            const resumeTime = guessTimelineTime(d);

            // Восстанавливаем аргумент Player.play
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

            L('BTN play resumeTime=' + Math.round(resumeTime));
            Lampa.Player.play(playArg);

            // Если нашли позицию в Timeline — перематываем вручную
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

    L('v15 loaded');
})();
