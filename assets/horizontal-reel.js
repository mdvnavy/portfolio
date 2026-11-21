/* Shared horizontal-strip motion used by the Featured reel (#cc-reel) and
   the build-record timeline. Extracted from the Featured reel: a lerp toward
   a target offset, applied as translate3d; on coarse pointers / narrow
   viewports / reduced motion the strip is a native overflow-x scroller. */
(() => {
  const DEFAULT_INTERACTIVE = '(hover: hover) and (pointer: fine) and (min-width: 761px)';

  function bindHorizontalReel(options) {
    const viewport = options.viewport;
    const track = options.track;
    if (!viewport || !track) return null;

    const rm = options.reducedMedia || window.matchMedia('(prefers-reduced-motion: reduce)');
    const drift = options.interactiveMedia || window.matchMedia(DEFAULT_INTERACTIVE);
    const items = () => options.itemSelector ? [...track.querySelectorAll(options.itemSelector)] : [...track.children];
    const pad = options.focusPadding == null ? 46 : options.focusPadding;
    const pinSpace = options.pinSpace || null;
    const hint = options.hint || null;
    const drive = options.drive || 'pointer';
    const onHint = options.onHint;

    let range = 0, target = 0, cur = 0, raf = 0;

    const usesTransform = () => drift.matches && !rm.matches;
    const syncMode = () => {
      viewport.classList.toggle('is-transform', usesTransform());
      if (pinSpace) pinSpace.classList.toggle('is-pinned', !!(usesTransform() && options.pin));
    };

    const applyNative = (x) => {
      const left = Math.max(0, Math.min(range, x));
      if (typeof viewport.scrollTo === 'function') viewport.scrollTo({ left, behavior: 'auto' });
      else viewport.scrollLeft = left;
    };

    const step = () => {
      cur += (target - cur) * 0.075;
      if (Math.abs(target - cur) < 0.3) cur = target;
      track.style.transform = `translate3d(${-cur.toFixed(2)}px,0,0)`;
      raf = cur === target ? 0 : requestAnimationFrame(step);
    };

    const kick = () => { if (!raf && usesTransform()) raf = requestAnimationFrame(step); };

    const setTarget = (x, {immediate} = {}) => {
      target = Math.max(0, Math.min(range, x));
      if (!usesTransform()) {
        cur = target;
        track.style.transform = '';
        applyNative(target);
        return;
      }
      if (immediate) {
        cur = target;
        track.style.transform = `translate3d(${-cur.toFixed(2)}px,0,0)`;
      }
      kick();
    };

    const measure = () => {
      syncMode();
      const prev = range;
      range = Math.max(0, track.scrollWidth - viewport.clientWidth);
      if (pinSpace && usesTransform() && options.pin) {
        const sticky = options.pin;
        const panel = Math.max(sticky.offsetHeight, viewport.clientHeight * 0.5);
        pinSpace.style.height = `${Math.round(panel + range)}px`;
      } else if (pinSpace) {
        pinSpace.style.height = '';
      }
      if (prev !== range) target = Math.min(target, range);
      if (usesTransform()) {
        if (drive === 'scroll' || drive === 'pointer+scroll') {
          target = Math.max(0, Math.min(range, (function(){
            if (!pinSpace || !options.pin) return target;
            const panel = options.pin.offsetHeight;
            const travel = Math.max(1, pinSpace.offsetHeight - panel);
            const scrolled = options.pin.getBoundingClientRect().top - pinSpace.getBoundingClientRect().top;
            return Math.max(0, Math.min(1, scrolled / travel)) * range;
          })()));
        }
        kick();
      } else {
        track.style.transform = '';
        cur = viewport.scrollLeft || 0;
        target = cur;
      }
    };

    const progressToX = (p) => Math.max(0, Math.min(1, p)) * range;

    const scrollProgress = () => {
      if (!pinSpace || !options.pin) return 0;
      const panel = options.pin.offsetHeight;
      const travel = Math.max(1, pinSpace.offsetHeight - panel);
      const scrolled = options.pin.getBoundingClientRect().top - pinSpace.getBoundingClientRect().top;
      return Math.max(0, Math.min(1, scrolled / travel));
    };

    const syncFromScroll = () => {
      if (!usesTransform() || (drive !== 'scroll' && drive !== 'pointer+scroll')) return;
      setTarget(progressToX(scrollProgress()));
    };

    const stickyOffset = () => {
      const top = parseFloat(getComputedStyle(options.pin).top);
      return Number.isFinite(top) ? top : 0;
    };

    const syncScrollToX = (x) => {
      if (!pinSpace || !options.pin || !usesTransform()) return;
      const panel = options.pin.offsetHeight;
      const travel = Math.max(1, pinSpace.offsetHeight - panel);
      // Align pin-space to the sticky top, not the viewport top, so progress 0
      // is the frame where the panel has just become sticky.
      const start = pinSpace.getBoundingClientRect().top + window.scrollY - stickyOffset();
      const y = start + (range ? (x / range) * travel : 0);
      window.scrollTo({ top: Math.max(0, y), behavior: 'auto' });
    };

    const revealItem = (item, {immediate, syncPage} = {}) => {
      if (!item) return;
      const x = Math.max(0, Math.min(range, item.offsetLeft - pad));
      if (syncPage && usesTransform() && pinSpace) syncScrollToX(x);
      setTarget(x, {immediate});
      if (!usesTransform()) applyNative(x);
    };

    const setHint = () => {
      syncMode();
      const text = usesTransform()
        ? (drive === 'pointer' ? 'Move across to browse' : 'Scroll to browse')
        : 'Swipe to browse';
      if (typeof onHint === 'function') onHint(text);
      else if (hint) hint.textContent = text;
    };

    window.addEventListener('pointermove', (e) => {
      if (!usesTransform()) return;
      if (drive !== 'pointer' && drive !== 'pointer+scroll') return;
      const r = viewport.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return;
      const t = Math.min(1, Math.max(0, (e.clientX / innerWidth - 0.15) / 0.7));
      setTarget(t * range);
    }, {passive: true});

    window.addEventListener('scroll', () => {
      if (drive === 'scroll' || drive === 'pointer+scroll') syncFromScroll();
    }, {passive: true});

    viewport.addEventListener('focusin', (e) => {
      const item = e.target.closest(options.itemSelector || ':scope > *');
      if (!item || !viewport.contains(item)) return;
      revealItem(item, {syncPage: drive === 'scroll' || drive === 'pointer+scroll'});
    });

    viewport.addEventListener('keydown', (e) => {
      const list = items();
      if (!list.length) return;
      const active = document.activeElement;
      const i = list.indexOf(active);
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
      if (i < 0 && !viewport.contains(active)) return;
      e.preventDefault();
      let next = i < 0 ? 0 : i;
      if (e.key === 'ArrowRight') next = Math.min(list.length - 1, (i < 0 ? 0 : i) + 1);
      if (e.key === 'ArrowLeft') next = Math.max(0, (i < 0 ? 0 : i) - 1);
      if (e.key === 'Home') next = 0;
      if (e.key === 'End') next = list.length - 1;
      list[next].focus({preventScroll: true});
      revealItem(list[next], {syncPage: drive === 'scroll' || drive === 'pointer+scroll'});
    });

    viewport.addEventListener('wheel', (e) => {
      if (!e.shiftKey) return;
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!delta) return;
      e.preventDefault();
      const x = (usesTransform() ? target : (viewport.scrollLeft || 0)) + delta;
      if (usesTransform() && (drive === 'scroll' || drive === 'pointer+scroll') && pinSpace) {
        syncScrollToX(Math.max(0, Math.min(range, x)));
      } else {
        setTarget(x);
      }
    }, {passive: false});

    const onHash = ({immediate} = {}) => {
      const id = location.hash.slice(1);
      if (!id) return;
      const item = track.querySelector(`#${CSS.escape(id)}`);
      if (!item) return;
      revealItem(item, {immediate: immediate !== false, syncPage: true});
    };

    window.addEventListener('resize', () => { measure(); setHint(); });
    window.addEventListener('load', measure);
    drift.addEventListener('change', () => { measure(); setHint(); });
    rm.addEventListener('change', () => { measure(); setHint(); });
    window.addEventListener('hashchange', () => onHash({immediate: false}));

    setHint();
    measure();
    if (location.hash) requestAnimationFrame(() => { measure(); onHash({immediate: true}); });

    return { measure, setTarget, revealItem, get range() { return range; }, get current() { return usesTransform() ? cur : (viewport.scrollLeft || 0); } };
  }

  window.bindHorizontalReel = bindHorizontalReel;
})();
