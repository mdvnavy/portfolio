(() => {
  const rm = window.matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.documentElement;

  /* 1. Intro: once per visit, skippable. The page paints first (hero can be LCP);
     the lockup then plays in a top band so it does not cover first content.
     ?intro forces a replay. Reduced motion skips it. */
  const intro = document.getElementById('cc-intro');
  if (intro) {
    const shouldPlay = (() => {
      try {
        const q = new URLSearchParams(location.search);
        return q.has('intro') || (!sessionStorage.getItem('cc-intro-seen') && !rm.matches);
      } catch (e) { return false; }
    })();
    if (!shouldPlay) {
      intro.remove();
    } else {
      let done = false; const timers = [];
      const finish = (fast) => {
        if (done) return; done = true; timers.forEach(clearTimeout);
        try { sessionStorage.setItem('cc-intro-seen', '1'); } catch (e) {}
        if (fast) intro.classList.add('fast');
        intro.classList.add('s1', 's3');
        setTimeout(() => intro.remove(), fast ? 280 : 560);
      };
      const start = () => {
        intro.classList.add('is-on');
        timers.push(setTimeout(() => intro.classList.add('s1'), 80));
        timers.push(setTimeout(() => intro.classList.add('s2'), 520));
        timers.push(setTimeout(() => finish(false), 1250));
        intro.addEventListener('click', () => finish(true));
        const skip = intro.querySelector('.cc-intro-skip');
        skip?.addEventListener('click', (e) => { e.stopPropagation(); finish(true); });
        window.addEventListener('keydown', () => finish(true), { once: true });
      };
      requestAnimationFrame(() => requestAnimationFrame(start));
    }
  }

  /* 4. Live Toronto clock */
  const clock = document.getElementById('cc-clock');
  if (clock) {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short' });
    const t = clock.querySelector('time');
    const tick = () => { const now = new Date(); t.textContent = fmt.format(now).replace(/\./g, '').toUpperCase(); t.dateTime = now.toISOString(); };
    tick();
    setTimeout(() => { tick(); setInterval(tick, 60000); }, 60000 - (Date.now() % 60000) + 50);
  }

  /* 4. Frosted header when imagery sits under it */
  const header = document.querySelector('.wrap > .header');
  const visuals = [...document.querySelectorAll('.cc-reel, .cc-case, .record-reel')];
  let hb = 96, queued = false;
  const measureHeader = () => { hb = header.getBoundingClientRect().height; root.style.setProperty('--cc-hdr', hb + 'px'); };
  const frost = () => {
    queued = false;
    const under = visuals.some(v => { const r = v.getBoundingClientRect(); return r.top < hb && r.bottom > 0; });
    header.classList.toggle('is-frosted', under);
  };
  const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(frost); } };
  measureHeader(); frost();
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', () => { measureHeader(); schedule(); });

  /* 2. Hero row drifts with the pointer (desktop, fine pointer only).
     Motion lives in assets/horizontal-reel.js, shared with the build record. */
  const reel = document.getElementById('cc-reel');
  if (reel && typeof window.bindHorizontalReel === 'function') {
    const hint = document.querySelector('.cc-reel-hint span:last-child');
    window.bindHorizontalReel({
      viewport: reel,
      track: reel.querySelector('.cc-reel-track'),
      itemSelector: '.cc-shot',
      reducedMedia: rm,
      drive: 'pointer',
      hint,
    });
  }
})();
