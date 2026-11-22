(() => {
  const viewport = document.getElementById('record-reel');
  const track = document.getElementById('record-list');
  const pinSpace = document.getElementById('record-pin-space');
  const pin = document.getElementById('record-pin');
  const hint = document.querySelector('.record-hint span:last-child');
  if (!viewport || !track || typeof window.bindHorizontalReel !== 'function') return;

  window.bindHorizontalReel({
    viewport,
    track,
    itemSelector: '.record-item',
    pinSpace,
    pin,
    drive: 'scroll',
    hint,
    focusPadding: 24,
    // Scroll-linked motion does not need a mouse; match desktop width only.
    // The Featured reel keeps its finer pointer query because it is pointer-driven.
    interactiveMedia: window.matchMedia('(min-width: 761px)'),
  });
})();
