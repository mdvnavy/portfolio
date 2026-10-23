/* Agent fleet. Enhance verified image links; the links remain useful without JavaScript. */
(() => {
  'use strict';

  const galleries = [...document.querySelectorAll('details[data-gallery]')];
  if (!galleries.length || typeof HTMLDialogElement === 'undefined') return;

  const imageUrl = value => {
    try {
      const url = new URL(value, document.baseURI);
      return url.origin === location.origin && /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(url.pathname) ? url.href : null;
    } catch { return null; }
  };
  const safeSource = value => {
    try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; }
    catch { return null; }
  };

  const groups = galleries.map(gallery => {
    const summary = gallery.querySelector('summary');
    const items = [...gallery.querySelectorAll('a[data-gallery-item]')].map(anchor => {
      const url = imageUrl(anchor.getAttribute('href'));
      const thumbnail = anchor.querySelector('img');
      if (!url || !thumbnail) { anchor.hidden = true; return null; }
      return {
        anchor, url, thumbnail, unavailable: false,
        title: anchor.dataset.imageTitle || thumbnail.alt || 'Project image',
        caption: anchor.dataset.caption || thumbnail.alt || '',
        provenance: anchor.dataset.provenance || '',
        source: safeSource(anchor.dataset.sourceUrl)
      };
    }).filter(Boolean);
    if (!items.length) gallery.hidden = true;
    return {gallery, summary, items, label: gallery.getAttribute('aria-label') || 'Project gallery'};
  }).filter(group => group.items.length);
  if (!groups.length) return;

  const dialog = document.createElement('dialog');
  dialog.className = 'project-gallery-dialog';
  dialog.setAttribute('aria-labelledby', 'project-gallery-title');
  dialog.setAttribute('aria-describedby', 'project-gallery-caption project-gallery-provenance');
  dialog.innerHTML = `
    <div class="gallery-viewer">
      <div class="gallery-toolbar">
        <div class="gallery-heading"><h2 id="project-gallery-title">Project gallery</h2><p class="gallery-counter" aria-live="polite"></p></div>
        <button class="gallery-close" type="button" aria-label="Close image viewer">Close <span aria-hidden="true">×</span></button>
      </div>
      <div class="gallery-stage" tabindex="0" aria-label="Image viewer. Use previous and next controls to change images.">
        <p class="gallery-load-status" role="status" aria-live="polite"></p>
      </div>
      <div class="gallery-description">
        <p id="project-gallery-caption"></p>
        <p id="project-gallery-provenance"></p>
        <a class="gallery-source" target="_blank" rel="noopener" hidden>View source asset ↗</a>
      </div>
      <div class="gallery-controls">
        <button class="gallery-previous" type="button" aria-label="Previous image">← Previous</button>
        <button class="gallery-size" type="button" aria-pressed="false">View actual size</button>
        <button class="gallery-next" type="button" aria-label="Next image">Next →</button>
      </div>
    </div>`;
  document.body.append(dialog);

  const title = dialog.querySelector('#project-gallery-title');
  const counter = dialog.querySelector('.gallery-counter');
  const stage = dialog.querySelector('.gallery-stage');
  const status = dialog.querySelector('.gallery-load-status');
  const caption = dialog.querySelector('#project-gallery-caption');
  const provenance = dialog.querySelector('#project-gallery-provenance');
  const source = dialog.querySelector('.gallery-source');
  const close = dialog.querySelector('.gallery-close');
  const previous = dialog.querySelector('.gallery-previous');
  const next = dialog.querySelector('.gallery-next');
  const size = dialog.querySelector('.gallery-size');
  let activeGroup = null;
  let activeIndex = 0;
  let opener = null;
  let request = 0;
  let zoomed = false;
  let currentImage = null;
  let displayedItem = null;
  let touchStart = null;

  const availableItems = group => group.items.filter(item => !item.unavailable);
  const setZoom = value => {
    zoomed = value;
    dialog.classList.toggle('gallery-actual-size', value);
    size.setAttribute('aria-pressed', String(value));
    size.textContent = value ? 'Fit to screen' : 'View actual size';
    stage.scrollTop = 0;
    stage.scrollLeft = 0;
  };
  const focusable = () => [...dialog.querySelectorAll('button:not([disabled]),a[href]:not([hidden]),[tabindex="0"]')]
    .filter(element => !element.hidden && element.getClientRects().length);
  const refreshNavigation = () => {
    const count = activeGroup ? availableItems(activeGroup).length : 0;
    previous.disabled = next.disabled = count === 0 || (count < 2 && !!currentImage);
  };
  const describeImage = (item, index, total) => {
    title.textContent = item.title;
    counter.textContent = `${activeGroup.label} · ${index + 1} of ${total}`;
    caption.textContent = item.caption;
    provenance.textContent = item.provenance;
    source.hidden = !item.source;
    if (item.source) source.href = item.source;
    else source.removeAttribute('href');
  };

  function markUnavailable(group, item) {
    item.unavailable = true;
    item.anchor.hidden = true;
    if (!availableItems(group).length) {
      group.gallery.hidden = true;
    }
    refreshNavigation();
  }

  async function showImage(index) {
    const items = availableItems(activeGroup);
    if (!items.length) {
      status.textContent = 'These images are unavailable. Close the viewer to return to the record.';
      status.hidden = false;
      size.disabled = true;
      return;
    }
    activeIndex = (index + items.length) % items.length;
    const item = items[activeIndex];
    const token = ++request;
    status.textContent = `Loading ${item.title}…`;
    status.hidden = false;
    stage.setAttribute('aria-busy', 'true');
    size.disabled = true;
    setZoom(false);
    refreshNavigation();

    const image = new Image();
    image.alt = item.thumbnail.alt || item.caption || item.title;
    image.decoding = 'async';
    try {
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('Image unavailable'));
        image.src = item.url;
      });
      if (typeof image.decode === 'function') await image.decode();
      if (token !== request || !dialog.open) return;
      if (item.unavailable) throw new Error('Image unavailable');
      currentImage?.remove();
      currentImage = image;
      displayedItem = item;
      stage.prepend(image);
      describeImage(item, activeIndex, items.length);
      status.hidden = true;
      size.disabled = false;
      refreshNavigation();
    } catch {
      if (token !== request || !dialog.open) return;
      markUnavailable(activeGroup, item);
      status.textContent = `${item.title} is unavailable. Choose another image or close the viewer.`;
      status.hidden = false;
      // Keep an already displayed image visible rather than replacing it with a broken image.
      const remaining = availableItems(activeGroup);
      activeIndex = displayedItem ? remaining.indexOf(displayedItem) : -1;
      if (displayedItem && activeIndex >= 0) describeImage(displayedItem, activeIndex, remaining.length);
      size.disabled = !currentImage;
    } finally {
      if (token === request) stage.setAttribute('aria-busy', 'false');
    }
  }

  function move(direction) {
    if (!activeGroup) return;
    const count = availableItems(activeGroup).length;
    if (!count || (count < 2 && currentImage)) return;
    showImage(activeIndex < 0 ? (direction < 0 ? count - 1 : 0) : activeIndex + direction);
  }

  function open(group, item) {
    const items = availableItems(group);
    const index = items.indexOf(item);
    if (index < 0) return;
    activeGroup = group;
    opener = item.anchor;
    currentImage?.remove();
    currentImage = null;
    displayedItem = null;
    describeImage(item, index, items.length);
    dialog.showModal();
    document.documentElement.classList.add('project-gallery-open');
    close.focus({preventScroll: true});
    showImage(index);
  }

  groups.forEach(group => {
    group.gallery.dataset.galleryReady = 'true';
    group.items.forEach(item => {
      item.anchor.setAttribute('aria-haspopup', 'dialog');
      item.anchor.addEventListener('click', event => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        open(group, item);
      });
      item.thumbnail.addEventListener('error', () => markUnavailable(group, item));
      if (item.thumbnail.complete && !item.thumbnail.naturalWidth) markUnavailable(group, item);
    });
    const cover = group.summary?.querySelector('img');
    if (cover) {
      const hideCover = () => { cover.hidden = true; };
      cover.addEventListener('error', hideCover);
      if (cover.complete && !cover.naturalWidth) hideCover();
    }
  });

  close.addEventListener('click', () => dialog.close());
  previous.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  size.addEventListener('click', () => setZoom(!zoomed));
  dialog.addEventListener('cancel', event => { event.preventDefault(); dialog.close(); });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' && !zoomed) { event.preventDefault(); move(-1); }
    if (event.key === 'ArrowRight' && !zoomed) { event.preventDefault(); move(1); }
    if (event.key === 'Tab') {
      const controls = focusable();
      const current = controls.indexOf(document.activeElement);
      if (!controls.length) return;
      if (event.shiftKey && current <= 0) { event.preventDefault(); controls.at(-1).focus(); }
      else if (!event.shiftKey && (current < 0 || current === controls.length - 1)) { event.preventDefault(); controls[0].focus(); }
    }
  });
  stage.addEventListener('touchstart', event => {
    touchStart = !zoomed && event.touches.length === 1 ? {x: event.touches[0].clientX, y: event.touches[0].clientY} : null;
  }, {passive: true});
  stage.addEventListener('touchmove', event => {
    if (!touchStart || zoomed || event.touches.length !== 1 || !event.cancelable) return;
    const dx = event.touches[0].clientX - touchStart.x;
    const dy = event.touches[0].clientY - touchStart.y;
    // Claim the fitted image's horizontal swipe while leaving vertical and multi-touch gestures native.
    if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) event.preventDefault();
  }, {passive: false});
  stage.addEventListener('touchend', event => {
    if (!touchStart || zoomed || !event.changedTouches.length) return;
    const dx = event.changedTouches[0].clientX - touchStart.x;
    const dy = event.changedTouches[0].clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1);
  }, {passive: true});
  stage.addEventListener('touchcancel', () => { touchStart = null; }, {passive: true});
  dialog.addEventListener('close', () => {
    request++;
    document.documentElement.classList.remove('project-gallery-open');
    currentImage?.remove();
    currentImage = null;
    displayedItem = null;
    let target = opener?.isConnected && opener.getClientRects().length ? opener : activeGroup?.summary;
    if (!target?.isConnected || !target.getClientRects().length) {
      target = activeGroup?.gallery.closest('article')?.querySelector('h3,h2') || document.querySelector('main h1,main');
    }
    if (target?.isConnected && target.getClientRects().length) {
      const temporaryTabStop = !target.matches('a[href],button,[tabindex]');
      if (temporaryTabStop) target.setAttribute('tabindex', '-1');
      target.focus({preventScroll: true});
      if (temporaryTabStop) target.addEventListener('blur', () => target.removeAttribute('tabindex'), {once: true});
    }
    opener = null;
    activeGroup = null;
    touchStart = null;
    stage.setAttribute('aria-busy', 'false');
  });
})();
