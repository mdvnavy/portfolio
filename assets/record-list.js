(() => {
  const root = document.getElementById('evidence');
  const list = document.getElementById('record-list');
  if (!root || !list) return;

  const tabs = Array.from(root.querySelectorAll('.record-switch [role="tab"]'));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const storageKey = 'record-view';

  function setView(view, {persist} = {persist: true}) {
    const next = view === 'timeline' ? 'timeline' : 'index';
    root.setAttribute('data-record-view', next);
    tabs.forEach((tab) => {
      const on = tab.getAttribute('data-view') === next;
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
    });
    if (persist) {
      try { sessionStorage.setItem(storageKey, next); } catch (e) {}
    }
  }

  let initial = 'index';
  try {
    const saved = sessionStorage.getItem(storageKey);
    if (saved === 'timeline' || saved === 'index') initial = saved;
  } catch (e) {}
  setView(initial, {persist: false});

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => setView(tab.getAttribute('data-view')));
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'Home' && event.key !== 'End') return;
      event.preventDefault();
      const i = tabs.indexOf(tab);
      let next = i;
      if (event.key === 'ArrowRight') next = (i + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      tabs[next].focus();
      setView(tabs[next].getAttribute('data-view'));
    });
  });

  function reveal() {
    list.classList.add('is-in');
  }

  if (reduced.matches || (location.hash && root.querySelector(location.hash))) {
    reveal();
  } else if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        reveal();
        io.disconnect();
      }
    }, {threshold: 0.12, rootMargin: '0px 0px -8% 0px'});
    io.observe(list);
  } else {
    reveal();
  }
  reduced.addEventListener('change', () => { if (reduced.matches) reveal(); });
})();
