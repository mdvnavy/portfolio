/* Agent fleet. Local card container; no production calls or external dependencies. */
(() => {
  'use strict';
  const trigger = document.getElementById('portfolio-card-trigger');
  const dialog = document.getElementById('portfolio-card-dialog');
  const panel = dialog?.querySelector('.portfolio-card-panel');
  const frame = document.getElementById('portfolio-card-frame');
  const close = dialog?.querySelector('.portfolio-card-close');
  const loading = dialog?.querySelector('.portfolio-card-loading');
  if (!trigger || !dialog || !panel || !frame || !close) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let closing = false;
  let returnFocus = trigger;
  let frameReady = false;
  let opening = null;

  // Agent fleet: current-page disclosure state only; no browser storage.
  const dock = document.getElementById('portfolio-card-dock');
  const dockChip = document.getElementById('portfolio-card-dock-chip');
  const dockPanel = document.getElementById('portfolio-card-dock-panel');
  const dockCollapse = document.getElementById('portfolio-card-dock-collapse');
  const dockLayout = window.matchMedia('(max-width: 900px)');
  let dockExpanded = false;

  function syncDock() {
    if (!dock || !dockChip || !dockPanel || !dockCollapse) return;
    const active = document.activeElement;
    const narrow = dockLayout.matches;
    const show = !narrow || dockExpanded || dialog.open;
    dockChip.hidden = !narrow;
    if (narrow && !show && dockPanel.contains(active)) dockChip.focus({preventScroll:true});
    dock.dataset.expanded = String(show);
    dockPanel.hidden = !show;
    dockCollapse.hidden = !narrow || !show;
    dockChip.setAttribute('aria-expanded', String(narrow && show));
    if (!narrow && (active === dockChip || active === dockCollapse)) trigger.focus({preventScroll:true});
  }

  dockChip?.addEventListener('click', () => {
    if (!dockLayout.matches) return;
    dockExpanded = !dockExpanded;
    syncDock();
  });
  dockCollapse?.addEventListener('click', () => {
    if (!dockLayout.matches) return;
    dockChip.focus({preventScroll:true});
    dockExpanded = false;
    syncDock();
  });
  dockLayout.addEventListener('change', syncDock);
  syncDock();

  function frameControls() {
    try {
      return [...frame.contentDocument.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),[tabindex]:not([tabindex="-1"])')]
        .filter(el => !el.closest('[inert],[hidden]') && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    } catch { return []; }
  }

  function trapFocus(event) {
    if (!dialog.open || event.key !== 'Tab') return;
    const controls = [close, ...frameControls()];
    const current = document.activeElement === frame ? frame.contentDocument?.activeElement : document.activeElement;
    let next = controls.indexOf(current) + (event.shiftKey ? -1 : 1);
    next = (next + controls.length) % controls.length;
    event.preventDefault();
    controls[next].focus({preventScroll:true});
  }

  function originTransform() {
    const origin = trigger.querySelector('img').getBoundingClientRect();
    const box = panel.getBoundingClientRect();
    const dx = origin.left + origin.width / 2 - box.left - box.width / 2;
    const dy = origin.top + origin.height / 2 - box.top - box.height / 2;
    return `translate(${dx}px,${dy}px) scale(${Math.max(.05, origin.width / box.width)},${Math.max(.05, origin.height / box.height)})`;
  }

  function finishClose() {
    if (dialog.open) dialog.close();
  }

  function requestClose() {
    if (!dialog.open || closing) return;
    closing = true;
    if (reduced.matches || !panel.animate) return finishClose();
    panel.animate([{transform:'none',opacity:1},{transform:originTransform(),opacity:0}],
      {duration:180,easing:'cubic-bezier(.4,0,1,1)'}).finished.then(finishClose,finishClose);
  }

  trigger.addEventListener('click', () => {
    if (dialog.open) return;
    returnFocus = trigger;
    closing = false;
    loading.hidden = false;
    frameReady = false;
    document.documentElement.classList.add('portfolio-card-open');
    dialog.showModal();
    trigger.setAttribute('aria-expanded','true');
    frame.src = frame.dataset.src;
    close.focus({preventScroll:true});
    if (!reduced.matches && panel.animate) {
      opening = panel.animate([{transform:originTransform(),opacity:.1},{transform:'none',opacity:1}],
        {duration:260,easing:'cubic-bezier(.2,.8,.2,1)'});
    }
  });

  close.addEventListener('click', requestClose);
  dialog.addEventListener('click', event => {
    if (event.target === dialog || event.target === panel || event.target === dialog.querySelector('.portfolio-card-topbar')) requestClose();
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); requestClose(); });
  dialog.addEventListener('keydown', trapFocus);
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); requestClose(); }
  });

  frame.addEventListener('load', () => {
    if (!dialog.open || !frame.hasAttribute('src')) return;
    // HTML load precedes final font metrics and the fitted first pose.
    if (frameReady) loading.hidden = true;
  });

  window.addEventListener('message', event => {
    if (event.source !== frame.contentWindow || event.origin !== location.origin || !dialog.open) return;
    if (event.data?.type === 'portfolio-card:ready') {
      frameReady = true;
      const reveal = () => { if (dialog.open && frameReady) loading.hidden = true; };
      if (opening) opening.finished.then(reveal,reveal);
      else reveal();
    }
    if (event.data?.type === 'portfolio-card:close') requestClose();
    if (event.data?.type === 'portfolio-card:focus-close') close.focus({preventScroll:true});
  });

  dialog.addEventListener('close', () => {
    frame.removeAttribute('src');
    frameReady = false;
    opening = null;
    document.documentElement.classList.remove('portfolio-card-open');
    trigger.setAttribute('aria-expanded','false');
    closing = false;
    loading.hidden = true;
    // Keep the existing overlay's thumbnail focus target visible on return.
    if (dockLayout.matches) dockExpanded = true;
    syncDock();
    if (returnFocus?.isConnected) returnFocus.focus({preventScroll:true});
    else trigger.focus({preventScroll:true});
  });
})();
