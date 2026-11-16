(function () {
    'use strict';
    if (window.cs_v7) return;
    window.cs_v7 = true;

    const STORAGE_KEY = 'continue_series_v7';
    const log = (m, tv) => { console.log('CS v7:', m); if (tv) try { Lampa.Noty.show('CS: ' + m); } catch(e){} };

    const save = (id, d) => { try { const a = JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'); a[id]=d; localStorage.setItem(STORAGE_KEY, JSON.stringify(a)); } catch(e){} };
    const get  = (id) => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')[id]||null; } catch(e){ return null; } };

    // Определение сериала — по нескольким признакам, как в MyShows
    function isSeries(movie, activity) {
        if (!movie) return false;
        if (movie.number_of_seasons > 0) return true;
        if (movie.first_air_date) return true;
        if (activity && activity.method === 'tv') return true;
        if (movie.name && !movie.title) return true;
        return false;
    }

    // === Сохранение при старте плеера ===
    Lampa.Player.listener.follow('start', function (data) {
        const movie = data.card || (Lampa.Activity.active() && Lampa.Activity.active().movie);
        if (!movie || !movie.id || !isSeries(movie)) return;

        // Ищем торрент-инфу в нескольких местах
        let hash = data.torrent_hash || null;
        let index = data.file_index ?? data.index ?? 0;
        if (!hash && data.url) {
            const m = data.url.match(/[?&]link=([^&]+)/i);
            const i = data.url.match(/[?&]index=(\d+)/i);
            if (m) hash = m[1];
            if (i) index = parseInt(i[1]);
        }
        if (!hash) { log('нет torrent_hash в событии плеера', true); return; }

        // Timeline hash — Lampa сама его генерирует, часто = data.hash
        const timeline_hash = data.hash || data.timeline_hash || null;

        save(movie.id, {
            hash, index, timeline_hash,
            url: data.url,
            title: movie.name || movie.title,
            savedAt: Date.now()
        });
        log('сохранено "' + (movie.name || movie.title) + '"', true);
    });

    // === Кнопка в карточке ===
    Lampa.Listener.follow('full', function (e) {
        if (e.type !== 'complite' || !e.data || !e.data.movie) return;
        $('.button--continue-series').remove();

        const movie = e.data.movie;
        const activity = Lampa.Activity.active();

        if (!isSeries(movie, activity)) { log('не сериал', false); return; }

        $('.full-start-new__buttons').append(
            `<div class="full-start__button selector button--continue-series">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                <span>Продолжить</span>
            </div>`
        );

        $('.button--continue-series').on('hover:enter', function () {
            const d = get(movie.id);
            log('нажата. данные: ' + (d ? 'есть' : 'нет'), true);
            if (!d) { Lampa.Noty.show('CS: нет сохранённой серии'); return; }
            try { resume(d, movie); } catch (ex) { log('ошибка: ' + ex.message, true); }
        });
    });

    function resume(d, movie) {
        // 1) Пытаемся получить сохранённую позицию из нативного Timeline Lampa
        let position = 0;
        try {
            if (d.timeline_hash && Lampa.Timeline && Lampa.Timeline.view) {
                const tl = Lampa.Timeline.view(d.timeline_hash);
                if (tl && tl.time) position = tl.time;
                log('timeline: ' + Math.round(position) + 'с', false);
            }
        } catch (e) { log('timeline err: ' + e.message, false); }

        // 2) Открываем торрент напрямую
        log('открываю торрент ' + d.hash.slice(0, 8) + '…', true);
        try { Lampa.Torrent.open(d.hash, movie); } catch (e) {
            log('torrent.open: ' + e.message, true);
            return;
        }

        // 3) Через 1с пробуем перемотать плеер
        if (position > 0) {
            let tries = 0;
            const t = setInterval(() => {
                let v = null;
                try { v = Lampa.PlayerVideo.video(); } catch (e) {}
                if (v) {
                    v.currentTime = position;
                    clearInterval(t);
                    log('перемотал на ' + Math.round(position) + 'с', true);
                } else if (++tries > 20) clearInterval(t);
            }, 500);
        }
    }

    log('плагин v7 загружен', true);
})();
