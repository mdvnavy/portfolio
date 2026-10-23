/* Universal artifact identity is agent fleet. Local frame only. */
(function () {
      const cardRig = document.getElementById('card-rig');
      const sceneContainer = document.getElementById('scene-container');
      const floorShadow = document.getElementById('floor-shadow');
      const glareFront = document.getElementById('glare-front');
      const glareBack = document.getElementById('glare-back');

      const btnFlipCard = document.getElementById('btn-flip-card');
      const btnFlipLabel = document.getElementById('btn-flip-label');
      const cornerFlipFront = document.getElementById('corner-flip-front');
      const cornerFlipBack = document.getElementById('corner-flip-back');
      const sideIndicatorText = document.getElementById('side-indicator-text');

      const modeTiltBtn = document.getElementById('mode-tilt');
      const modeOrbitBtn = document.getElementById('mode-orbit');
      const modeFlatBtn = document.getElementById('mode-flat');
      const btnQuickReset = document.getElementById('btn-quick-Reset');
      const btnDownloadVcard = document.getElementById('btn-download-vcard');

      
      const qrModal = document.getElementById('qr-modal');
      const btnCloseQrModal = document.getElementById('btn-close-qr-modal');
      const qrModalTitle = document.getElementById('qr-modal-title');
      const qrModalBadge = document.getElementById('qr-modal-badge');
      const qrModalDesc = document.getElementById('qr-modal-desc');
      const qrModalSvgBox = document.getElementById('qr-modal-svg-box');
      const qrModalOpenLink = document.getElementById('qr-modal-open-link');
      const qrModalCopyBtn = document.getElementById('qr-modal-copy-btn');

      const btnZoomQrBash = document.getElementById('btn-zoom-qr-bash');
      const btnZoomQrCult = document.getElementById('btn-zoom-qr-cult');
      const btnModalBash = document.getElementById('btn-modal-bash');
      const btnModalCult = document.getElementById('btn-modal-cult');
      const btnCopyBash = document.getElementById('btn-copy-bash');
      const btnCopyCult = document.getElementById('btn-copy-cult');

      const toastBanner = document.getElementById('toast-banner');
      const toastMessage = document.getElementById('toast-message');

      const QR_SVGS = {
        bash: btnZoomQrBash.querySelector('svg').outerHTML,
        cult: btnZoomQrCult.querySelector('svg').outerHTML
      };


      
      let isFlipped = false;
      let motionMode = 'tilt'; 
      let tiltX = 0;
      let tiltY = 0;
      let restTimer = null;
      let pointerIdleTimer = null;
      let flipTimer = null;
      let isFlipping = false;
      let orbitRAF = null;
      let orbitStart = performance.now();
      let currentModalUrl = 'https://bashsystems.net';



      // Agent fleet local frame adapter. The host owns overlay/focus restoration.
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      const frontFace = document.getElementById('card-front');
      const backFace = document.getElementById('card-back');
      const toolbar = document.getElementById('card-toolbar');
      const cardMain = document.getElementById('card-main');
      let qrReturnFocus = null;
      let orbitPausedAt = null;
      let orbitResumeTimer = null;
      let pointerHeld = false;
      let keyboardFocusEngaged = false;
      let lastInputWasKeyboard = false;

      function interactiveTarget(element) {
        return element instanceof Element && element.closest('button,a,input,textarea,select,[contenteditable="true"]');
      }

      function orbitMustPause() {
        return motionMode !== 'orbit' || reducedMotion.matches ||
          document.visibilityState === 'hidden' || pointerHeld ||
          keyboardFocusEngaged || isFlipping || !qrModal.classList.contains('hidden');
      }

      function pauseOrbit() {
        clearTimeout(orbitResumeTimer);
        orbitResumeTimer = null;
        if (orbitRAF !== null) cancelAnimationFrame(orbitRAF);
        orbitRAF = null;
        if (motionMode === 'orbit' && orbitPausedAt === null) orbitPausedAt = performance.now();
      }

      function resumeOrbit() {
        clearTimeout(orbitResumeTimer);
        orbitResumeTimer = null;
        if (orbitMustPause() || orbitRAF !== null) return;
        if (orbitPausedAt !== null) orbitStart += performance.now() - orbitPausedAt;
        orbitPausedAt = null;
        orbitRAF = requestAnimationFrame(stepOrbit);
      }

      function queueOrbitResume(delay = 1200) {
        clearTimeout(orbitResumeTimer);
        orbitResumeTimer = null;
        if (orbitMustPause() || orbitRAF !== null) return;
        orbitResumeTimer = setTimeout(resumeOrbit, delay);
      }

      function stepOrbit(now) {
        orbitRAF = null;
        if (orbitMustPause()) { pauseOrbit(); return; }
        const t = (now - orbitStart) * 0.00042;
        tiltY = Math.sin(t) * 14;
        tiltX = Math.cos(t * 0.8) * 7;
        renderCardTransform();
        orbitRAF = requestAnimationFrame(stepOrbit);
      }

      function requestHostClose() {
        if (window.parent !== window) {
          window.parent.postMessage({type: 'portfolio-card:close'}, location.origin);
        }
      }

      function syncFaceAccessibility() {
        const focused = document.activeElement;
        const hiddenFace = isFlipped ? frontFace : backFace;
        if (focused && hiddenFace.contains(focused)) btnFlipCard.focus({preventScroll: true});
        frontFace.inert = isFlipped;
        backFace.inert = !isFlipped;
        frontFace.setAttribute('aria-hidden', String(isFlipped));
        backFace.setAttribute('aria-hidden', String(!isFlipped));
        btnFlipCard.setAttribute('aria-pressed', String(isFlipped));
      }

      function syncMotionAccessibility() {
        [[modeTiltBtn,'tilt'],[modeOrbitBtn,'orbit'],[modeFlatBtn,'flat']].forEach(([button,mode]) => {
          button.setAttribute('aria-pressed', String(motionMode === mode));
        });
        modeTiltBtn.disabled = reducedMotion.matches;
        modeOrbitBtn.disabled = reducedMotion.matches;
      }

      function applyMotionPreference() {
        setMotionMode(reducedMotion.matches ? 'flat' : 'orbit');
        if (reducedMotion.matches) {
          clearTimeout(flipTimer);
          isFlipping = false;
          cardRig.classList.remove('is-flipping', 'is-tilting');
          settleCard();
        }
        syncFaceAccessibility();
      }

      // Preserve destination while preventing the card's legacy _top link from
      // replacing the surrounding portfolio when used in this local frame.
      document.querySelectorAll('a[target="_top"]').forEach((link) => {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      });
      toastBanner.setAttribute('role', 'status');
      toastBanner.setAttribute('aria-live', 'polite');

      // Input capability controls wording; viewport width is not an input signal.
      const fineHoverHintInput = window.matchMedia('(hover: hover) and (pointer: fine)');
      const hintContainer = document.querySelector('#card-helper>div:first-child>span:last-child');
      const hintTextNode = [...(hintContainer ? hintContainer.childNodes : [])].find((node) =>
        node.nodeType === Node.TEXT_NODE && node.nodeValue.includes('Move cursor or drag to tilt in 3D'));
      const originalHintText = hintTextNode ? hintTextNode.nodeValue : '';
      let lastHintPointerType = '';
      function updateInputHint(pointerType) {
        if (['mouse','touch','pen'].includes(pointerType)) lastHintPointerType = pointerType;
        const useCursorHint = lastHintPointerType ? lastHintPointerType === 'mouse' : fineHoverHintInput.matches;
        const sentence = useCursorHint ? 'Move cursor or drag to tilt in 3D.' : 'Drag to tilt in 3D.';
        if (hintTextNode) {
          const nextText = originalHintText.replace('Move cursor or drag to tilt in 3D', sentence);
          if (hintTextNode.nodeValue !== nextText) { hintTextNode.nodeValue = nextText; fitCardStage(); }
        }
      }
      fineHoverHintInput.addEventListener('change', () => { lastHintPointerType = ''; updateInputHint(); });
      document.addEventListener('pointerdown', (event) => updateInputHint(event.pointerType), {capture:true,passive:true});
      updateInputHint();
      document.addEventListener('keydown', (event) => {
        if (event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey) return;
        const focusables = [...document.querySelectorAll('button,a[href],input,select,textarea,[tabindex]')].filter((element) => {
          if (element.disabled || element.tabIndex < 0 || element.closest('[inert],[aria-hidden="true"]')) return false;
          const style = getComputedStyle(element);
          return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
        });
        if (!focusables.length) return;
        const boundary = event.shiftKey ? focusables[0] : focusables[focusables.length - 1];
        if (document.activeElement !== boundary) return;
        event.preventDefault();
        if (window.parent !== window) {
          window.parent.postMessage({type: 'portfolio-card:focus-close'}, location.origin);
        }
      }, true);
      document.addEventListener('pointerdown', (event) => {
        lastInputWasKeyboard = false;
        keyboardFocusEngaged = false;
        pointerHeld = true;
        pauseOrbit();
        if (!(event.target instanceof Element)) return;
        if (event.target.closest('#card-rig,#card-helper,#qr-modal>div,#toast-banner,#card-toolbar button,#card-toolbar a,#card-toolbar img,#card-toolbar h1,#side-indicator-text')) return;
        requestHostClose();
      });
      window.addEventListener('pointerup', () => { pointerHeld = false; queueOrbitResume(); });
      window.addEventListener('pointercancel', () => { pointerHeld = false; queueOrbitResume(); });
      document.documentElement.addEventListener('pointerleave', () => { if (!pointerHeld) queueOrbitResume(); });
      document.addEventListener('pointerout', (event) => {
        if (event.relatedTarget !== null) return;
        finishOrbitTouchDrag();
        pointerHeld = false;
        queueOrbitResume();
      });
      document.addEventListener('keydown', (event) => {
        if (event.ctrlKey || event.altKey || event.metaKey) return;
        lastInputWasKeyboard = true;
        if (interactiveTarget(document.activeElement)) {
          keyboardFocusEngaged = true;
          pauseOrbit();
        }
      }, true);
      document.addEventListener('focusin', (event) => {
        keyboardFocusEngaged = Boolean(interactiveTarget(event.target) &&
          (lastInputWasKeyboard || event.target.matches(':focus-visible')));
        if (keyboardFocusEngaged) pauseOrbit();
      });
      document.addEventListener('focusout', () => {
        setTimeout(() => {
          keyboardFocusEngaged = Boolean(interactiveTarget(document.activeElement) &&
            (lastInputWasKeyboard || document.activeElement.matches(':focus-visible')));
          if (keyboardFocusEngaged) pauseOrbit(); else queueOrbitResume();
        }, 0);
      });
      window.addEventListener('blur', () => {
        // Blur is a brief interaction pause, never an initial hasFocus() gate.
        pointerHeld = false;
        keyboardFocusEngaged = false;
        pauseOrbit();
        queueOrbitResume();
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') pauseOrbit(); else queueOrbitResume();
      });
      reducedMotion.addEventListener('change', applyMotionPreference);

      // Single-touch manipulation temporarily overrides Orbit, never Flat.
      let orbitTouchIdentifier = null;
      function finishOrbitTouchDrag() {
        if (orbitTouchIdentifier === null) return;
        orbitTouchIdentifier = null;
        pointerHeld = false;
        clearTimeout(pointerIdleTimer);
        cardRig.classList.remove('is-tilting');
        queueOrbitResume();
      }
      sceneContainer.addEventListener('touchstart', (event) => {
        finishOrbitTouchDrag();
        if (reducedMotion.matches || motionMode !== 'orbit' || isFlipping || event.touches.length !== 1) return;
        if (interactiveTarget(event.target)) return;
        orbitTouchIdentifier = event.touches[0].identifier;
        pointerHeld = true;
        pauseOrbit();
      }, {passive:true});
      sceneContainer.addEventListener('touchend', (event) => {
        if (![...event.touches].some((touch) => touch.identifier === orbitTouchIdentifier)) finishOrbitTouchDrag();
      }, {passive:true});
      sceneContainer.addEventListener('touchcancel', finishOrbitTouchDrag, {passive:true});

      function showToast(msg) {
        toastMessage.textContent = msg;
        toastBanner.classList.remove('opacity-0', 'translate-y-2');
        toastBanner.classList.add('opacity-100', 'translate-y-0');
        clearTimeout(showToast._timer);
        showToast._timer = setTimeout(() => {
          toastBanner.classList.add('opacity-0', 'translate-y-2');
          toastBanner.classList.remove('opacity-100', 'translate-y-0');
        }, 2400);
      }

      function copyTextToClipboard(text, label) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(() => {
            showToast(label || 'Copied: ' + text);
          }).catch(() => fallbackCopy(text, label));
        } else {
          fallbackCopy(text, label);
        }
      }

      function fallbackCopy(text, label) {
        const previousFocus = document.activeElement;
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
          showToast(label || 'Copied: ' + text);
        } catch (err) {
          showToast('Link: ' + text);
        }
        document.body.removeChild(ta);
        if (previousFocus && previousFocus.isConnected && typeof previousFocus.focus === 'function') {
          previousFocus.focus({preventScroll:true});
        }
      }

      function wakeCard() {
        if (!cardRig.classList.contains('is-resting')) return;
        cardRig.style.transition = 'none';
        cardRig.classList.remove('is-resting');
        cardRig.style.transform = 'rotateX(0deg) rotateY(' + (isFlipped ? 180 : 0) + 'deg)';
        cardRig.getBoundingClientRect();
        cardRig.style.transition = '';
      }

      function settleCard() {
        if (isFlipping || motionMode === 'orbit' || tiltX !== 0 || tiltY !== 0) return;
        cardRig.dataset.side = isFlipped ? 'back' : 'front';
        cardRig.classList.add('is-resting');
        cardRig.style.transform = 'none';
      }

      function safeMotionScale(pitchDegrees, yawDegrees) {
        const scene = sceneContainer.getBoundingClientRect();
        const toolbar = document.getElementById('card-toolbar').getBoundingClientRect();
        const helper = document.getElementById('card-helper').getBoundingClientRect();
        const width = cardRig.offsetWidth;
        const height = cardRig.offsetHeight;
        const centerX = scene.left + scene.width / 2;
        const centerY = scene.top + scene.height / 2;
        const viewportWidth = document.documentElement.clientWidth;
        const topEdge = toolbar.bottom + 10;
        const bottomEdge = helper.top - 10;
        const pitch = pitchDegrees * Math.PI / 180;
        const yawValues = isFlipping ? [0, 30, 60, 90, 120, 150, 180] : [yawDegrees];
        function fits(scale) {
          for (const yawDegreesNow of yawValues) {
            const yaw = yawDegreesNow * Math.PI / 180;
            const sx = Math.sin(pitch), cx = Math.cos(pitch), sy = Math.sin(yaw), cy = Math.cos(yaw);
            for (const x0 of [-width / 2, width / 2]) for (const y0 of [-height / 2, height / 2]) for (const z0 of [-4, 4]) {
              const x = x0 * scale, y = y0 * scale, z = z0 * scale;
              const rx = cy * x + sy * z;
              const ry = sx * sy * x + cx * y - sx * cy * z;
              const rz = -cx * sy * x + sx * y + cx * cy * z;
              const factor = 1800 / (1800 - rz);
              const px = centerX + rx * factor, py = centerY + ry * factor;
              if (px < 2 || px > viewportWidth - 2 || py < topEdge || py > bottomEdge) return false;
            }
          }
          return true;
        }
        if (fits(1)) return 1;
        let lower = 0, upper = 1;
        for (let step = 0; step < 12; step += 1) {
          const middle = (lower + upper) / 2;
          if (fits(middle)) lower = middle; else upper = middle;
        }
        return Math.max(0, lower - .002);
      }

      function renderCardTransform() {
        clearTimeout(restTimer);
        const canSettle = !isFlipping && motionMode !== 'orbit' && tiltX === 0 && tiltY === 0;
        if (!canSettle) wakeCard();
        const baseRotateY = isFlipped ? 180 : 0;
        const effectiveX = motionMode === 'flat' ? 0 : tiltX;
        const effectiveY = motionMode === 'flat' ? 0 : tiltY;
        const finalY = baseRotateY + effectiveY;

        const motionScale = canSettle ? 1 : safeMotionScale(effectiveX, finalY);
        cardRig.style.transform = 'rotateX(' + effectiveX.toFixed(2) + 'deg) rotateY(' + finalY.toFixed(2) + 'deg) scale(' + motionScale.toFixed(4) + ')';

        
        const gx = Math.max(5, Math.min(95, 50 - effectiveY * 2.2));
        const gy = Math.max(5, Math.min(95, 42 + effectiveX * 2.2));
        const glareOp = motionMode === 'flat' ? 0.25 : 0.72;

        glareFront.style.setProperty('--glare-x', gx + '%');
        glareFront.style.setProperty('--glare-y', gy + '%');
        glareFront.style.setProperty('--glare-opacity', glareOp);

        glareBack.style.setProperty('--glare-x', (100 - gx) + '%');
        glareBack.style.setProperty('--glare-y', gy + '%');
        glareBack.style.setProperty('--glare-opacity', glareOp);

        
        const shadowOffsetX = -effectiveY * 1.1;
        const shadowScale = 1 - Math.min(0.15, (Math.abs(effectiveX) + Math.abs(effectiveY)) * 0.004);
        floorShadow.style.transform = `translateX(${shadowOffsetX.toFixed(1)}px) scaleX(${shadowScale.toFixed(3)})`;
        if (canSettle) restTimer = setTimeout(settleCard, 800);
      }

      function toggleFlip() {
        pauseOrbit();
        if (reducedMotion.matches) {
          clearTimeout(flipTimer);
          clearTimeout(pointerIdleTimer);
          isFlipped = !isFlipped;
          isFlipping = false;
          tiltX = 0; tiltY = 0;
          cardRig.classList.remove('is-flipping', 'is-tilting');
          btnFlipLabel.textContent = isFlipped ? 'Flip to Front (Rates)' : 'Flip to Back (QR Codes)';
          sideIndicatorText.textContent = isFlipped ? 'Showing: Back - Website & Portfolio QR Codes' : 'Showing: Front - Consulting Rate Card (CAD/hr)';
          syncFaceAccessibility();
          settleCard();
          renderCardTransform();
          return;
        }
        clearTimeout(pointerIdleTimer);
        tiltX = 0;
        tiltY = 0;
        clearTimeout(flipTimer);
        isFlipping = true;
        renderCardTransform();
        cardRig.getBoundingClientRect();
        isFlipped = !isFlipped;
        syncFaceAccessibility();
        cardRig.classList.add('is-flipping');
        flipTimer = setTimeout(() => {
          isFlipping = false;
          cardRig.classList.remove('is-flipping');
          renderCardTransform();
          settleCard();
          queueOrbitResume();
        }, 800);

        if (isFlipped) {
          btnFlipLabel.textContent = 'Flip to Front (Rates)';
          sideIndicatorText.innerHTML = 'Showing: <strong class="text-[#F4F0E4]">Back — Website &amp; Portfolio QR Codes</strong>';
        } else {
          btnFlipLabel.textContent = 'Flip to Back (QR Codes)';
          sideIndicatorText.innerHTML = 'Showing: <strong class="text-[#F4F0E4]">Front — Consulting Rate Card (CAD/hr)</strong>';
        }
        renderCardTransform();
      }

      function setMotionMode(mode) {
        clearTimeout(orbitResumeTimer);
        orbitResumeTimer = null;
        orbitPausedAt = null;
        if (reducedMotion.matches && mode !== 'flat') mode = 'flat';
        clearTimeout(pointerIdleTimer);
        motionMode = mode;
        if (mode === 'orbit') cardRig.classList.add('is-orbiting');
        else cardRig.classList.remove('is-orbiting');
        if (orbitRAF) {
          cancelAnimationFrame(orbitRAF);
          orbitRAF = null;
        }

        [modeTiltBtn, modeOrbitBtn, modeFlatBtn].forEach(b => {
          b.className = 'px-2.5 py-1.5 rounded-md text-xs font-medium transition text-[#B8ABA0] hover:text-white';
        });

        syncMotionAccessibility();
        const activeBtn = mode === 'tilt' ? modeTiltBtn : mode === 'orbit' ? modeOrbitBtn : modeFlatBtn;
        activeBtn.className = 'px-2.5 py-1.5 rounded-md text-xs font-medium transition bg-[#C8B598]/25 text-[#F4F0E4]';

        if (mode === 'flat') {
          tiltX = 0;
          tiltY = 0;
          renderCardTransform();
        } else if (mode === 'orbit') {
          orbitStart = performance.now();
          orbitPausedAt = orbitStart;
          resumeOrbit();
        } else {
          tiltX = 0;
          tiltY = 0;
          renderCardTransform();
        }
      }

      
      function handlePointerMove(clientX, clientY, temporaryOrbitTouch = false) {
        if ((motionMode !== 'tilt' && !(temporaryOrbitTouch && motionMode === 'orbit' && !reducedMotion.matches)) || isFlipping) return;
        clearTimeout(pointerIdleTimer);
        const rect = sceneContainer.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = (clientX - cx) / (rect.width / 2);
        const dy = (clientY - cy) / (rect.height / 2);

        const clampedX = Math.max(-1, Math.min(1, dx));
        const clampedY = Math.max(-1, Math.min(1, dy));

        tiltY = clampedX * 16;
        tiltX = -clampedY * 12;
        cardRig.classList.add('is-tilting');
        renderCardTransform();
        if (temporaryOrbitTouch) return;
        pointerIdleTimer = setTimeout(() => {
          if (motionMode !== 'tilt' || isFlipping) return;
          cardRig.classList.remove('is-tilting');
          tiltX = 0;
          tiltY = 0;
          renderCardTransform();
        }, 650);
      }

      sceneContainer.addEventListener('mousemove', (e) => {
        handlePointerMove(e.clientX, e.clientY);
      });

      sceneContainer.addEventListener('mouseleave', () => {
        clearTimeout(pointerIdleTimer);
        cardRig.classList.remove('is-tilting');
        if (motionMode === 'tilt') {
          tiltX = 0;
          tiltY = 0;
          renderCardTransform();
        }
      });

      sceneContainer.addEventListener('touchmove', (e) => {
        if (!e.touches || e.touches.length !== 1) { finishOrbitTouchDrag(); return; }
        const touch = e.touches[0];
        const temporaryOrbitTouch = motionMode === 'orbit' && touch.identifier === orbitTouchIdentifier;
        if (motionMode === 'tilt' || temporaryOrbitTouch) {
          handlePointerMove(touch.clientX, touch.clientY, temporaryOrbitTouch);
        }
      }, { passive: true });

      
      btnFlipCard.addEventListener('click', toggleFlip);
      cornerFlipFront.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFlip();
      });
      cornerFlipBack.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFlip();
      });

      
      modeTiltBtn.addEventListener('click', () => setMotionMode('tilt'));
      modeOrbitBtn.addEventListener('click', () => setMotionMode('orbit'));
      modeFlatBtn.addEventListener('click', () => setMotionMode('flat'));

      btnQuickReset.addEventListener('click', () => {
        isFlipped = false;
        syncFaceAccessibility();
        btnFlipLabel.textContent = 'Flip to Back (QR Codes)';
        sideIndicatorText.innerHTML = 'Showing: <strong class="text-[#F4F0E4]">Front — Consulting Rate Card (CAD/hr)</strong>';
        setMotionMode('tilt');
        tiltX = 0;
        tiltY = 0;
        renderCardTransform();
        showToast('Card orientation reset');
      });

      

      
      function openQrModal(which) {
        pauseOrbit();
        qrReturnFocus = document.activeElement;
        if (which === 'bash') {
          currentModalUrl = 'https://bashsystems.net';
          qrModalBadge.textContent = 'OFFICIAL WEBSITE';
          qrModalTitle.textContent = 'bashsystems.net';
          qrModalDesc.textContent = 'BASH Systems & Services — Architecture, Planning & Rates';
          qrModalSvgBox.innerHTML = QR_SVGS.bash;
          qrModalOpenLink.href = 'https://bashsystems.net';
          qrModalOpenLink.textContent = 'Open bashsystems.net ↗';
        } else {
          currentModalUrl = 'https://cultivatedco.ca';
          qrModalBadge.textContent = 'PORTFOLIO';
          qrModalTitle.textContent = 'cultivatedco.ca';
          qrModalDesc.textContent = 'Selected Portfolio, Case Studies & Creative Projects';
          qrModalSvgBox.innerHTML = QR_SVGS.cult;
          qrModalOpenLink.href = 'https://cultivatedco.ca';
          qrModalOpenLink.textContent = 'Open cultivatedco.ca ↗';
        }
        qrModal.classList.remove('hidden');
        qrModal.classList.add('flex');
        qrModal.firstElementChild.scrollTop = 0;
        toolbar.inert = true;
        cardMain.inert = true;
        btnCloseQrModal.focus({preventScroll:true});
      }

      function closeQrModal() {
        toolbar.inert = false;
        cardMain.inert = false;
        qrModal.classList.add('hidden');
        qrModal.classList.remove('flex');
        if (qrReturnFocus && qrReturnFocus.isConnected) qrReturnFocus.focus({preventScroll:true});
        queueOrbitResume();
      }

      btnZoomQrBash.addEventListener('click', () => openQrModal('bash'));
      btnModalBash.addEventListener('click', () => openQrModal('bash'));
      btnZoomQrCult.addEventListener('click', () => openQrModal('cult'));
      btnModalCult.addEventListener('click', () => openQrModal('cult'));

      btnCloseQrModal.addEventListener('click', closeQrModal);
      qrModal.addEventListener('click', (e) => {
        if (e.target === qrModal) closeQrModal();
      });

      qrModalCopyBtn.addEventListener('click', () => {
        copyTextToClipboard(currentModalUrl, 'Copied ' + currentModalUrl);
      });

      btnCopyBash.addEventListener('click', () => {
        copyTextToClipboard('https://bashsystems.net', 'Copied https://bashsystems.net');
      });

      btnCopyCult.addEventListener('click', () => {
        copyTextToClipboard('https://cultivatedco.ca', 'Copied https://cultivatedco.ca');
      });

      
      btnDownloadVcard.addEventListener('click', () => {
        const vcf = [
          'BEGIN:VCARD',
          'VERSION:3.0',
          'FN:BASH Systems & Services',
          'ORG:BASH Systems & Services',
          'TITLE:Consulting, Project Work & Advanced Technical Architecture',
          'EMAIL;TYPE=WORK:navy@bashsystems.net',
          'URL;TYPE=WORK:https://bashsystems.net',
          'URL;TYPE=PORTFOLIO:https://cultivatedco.ca',
          'NOTE:Rates (CAD/hr): Consultation $70/hr | Project Work $155/hr | Advanced Technical $215/hr. AI Agents at Work group workshop: C$5,000; 4 hours; 5-10 participants. Scope and applicable rate agreed before work begins.',
          'END:VCARD'
        ].join('\r\n');

        const blob = new Blob([vcf], { type: 'text/vcard;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'bash-systems-consulting.vcf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Downloaded bash-systems-consulting.vcf');
      });

      
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          requestHostClose();
          return;
        }
        if (!qrModal.classList.contains('hidden')) return;
        if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
        if (e.target instanceof Element && e.target.closest('button,a,input,textarea,select,[contenteditable="true"]')) return;
        if (e.code === 'Space' || e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          toggleFlip();
        }
      });

      function fitCardStage() {
        const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
        const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        const bodyStyle = getComputedStyle(document.body);
        const stageStyle = getComputedStyle(cardMain);
        const verticalPadding = parseFloat(bodyStyle.paddingTop) + parseFloat(bodyStyle.paddingBottom);
        const outerGap = parseFloat(bodyStyle.rowGap) || 0;
        const innerGap = parseFloat(stageStyle.rowGap) || 0;
        const helper = document.getElementById('card-helper');
        const maximum = Math.max(1, Math.min(1200, viewportWidth - 24));
        const reserve = toolbar.getBoundingClientRect().height + helper.getBoundingClientRect().height + verticalPadding + outerGap + innerGap;
        const width = Math.max(1, Math.min(maximum, (viewportHeight - reserve) * 1.75));
        document.documentElement.style.setProperty('--stage-width', width.toFixed(2) + 'px');
      }

      window.addEventListener('resize', fitCardStage);
      if (window.visualViewport) window.visualViewport.addEventListener('resize', fitCardStage);
      if (document.fonts) {
        Promise.all([
          document.fonts.load('500 16px "EB Garamond"'),
          document.fonts.load('700 16px "Playfair Display"'),
          document.fonts.load('500 16px "Inter"')
        ]).then((loaded) => document.fonts.ready.then(() => {
          document.documentElement.dataset.fontsReady = loaded.every((faces) => faces.length > 0 && faces.every((face) => face.status === 'loaded')) ? 'true' : 'false';
          fitCardStage();
        })).catch(() => {
          document.documentElement.dataset.fontsReady = 'false';
          fitCardStage();
        });
      } else fitCardStage();

      
      applyMotionPreference();
      syncMotionAccessibility();
      settleCard();
      renderCardTransform();
      window.addEventListener('load', fitCardStage);
      requestAnimationFrame(fitCardStage);
    })();
