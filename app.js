/* ============================================================================
   APP.JS — Verified Gmail Gate, TradingView 1-Tap Tool Bar & Settings,
            Sliding Opacity, Scrollable Favorites & Clean Paper Trading
   ============================================================================ */

(function () {
  'use strict';

  const {
    TVStore,
    TVFirebase,
    CloudSyncEngine,
    QuantEngine,
    DataFeed,
    TradingEngine,
    SuperChartPane,
    exportPaneToCSV
  } = window;

  const GMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;
  const BLOCKED_LOCAL_PARTS = new Set([
    'test', 'testing', 'demo', 'dummy', 'fake', 'temp', 'example',
    'admin', 'user', 'abc', 'abcd', '123', '1234', '12345', '123456',
    'qwerty', 'asdf', 'djdj', 'djdjdj', 'djdjdjdj', 'xyz', 'none', 'null'
  ]);

  let appBooted = false;
  let authMode = 'login';
  let wakeLockRef = null;
  let showBacktesterInTrading = false;

  /* --------------------------------------------------------------------------
     0. PREVENT WEBVIEW PULL-TO-REFRESH WHILE ALLOWING SCROLLABLE CONTAINERS
     -------------------------------------------------------------------------- */
  document.addEventListener('touchmove', (e) => {
    if (!e.target.closest('.fav-items, .object-edit-bar, .wl-list, .tv-menu-scroll, .modal-body, .sheet-grid-body, .sh-body, .auth-screen, .tpl-dropdown-menu, .smooth-opacity-slider')) {
      e.preventDefault();
    }
  }, { passive: false });

  /* --------------------------------------------------------------------------
     1. INITIALIZE 4 CHART PANES (1x1, 2x1, 1x2, 2x2)
     -------------------------------------------------------------------------- */
  const panes = [
    new SuperChartPane(0, 'XAUUSD', '300'),
    new SuperChartPane(1, 'XAUUSD', '900'),
    new SuperChartPane(2, 'EURUSD', '300'),
    new SuperChartPane(3, 'BTCUSD', '300')
  ];
  TVStore.panes = panes;

  function activePane() {
    return panes[TVStore.selectedPaneIdx] || panes[0];
  }

  function hapticTick(ms = 10) {
    try {
      navigator.vibrate?.(ms);
    } catch (_) {}
  }

  /* --------------------------------------------------------------------------
     2. TOAST, POPOVER & SHEET HELPERS
     -------------------------------------------------------------------------- */
  const toastEl = document.getElementById('toastPill');
  let toastTimer = null;

  function showToast(msg, ms = 2100) {
    if (!toastEl) return;
    if (toastTimer) clearTimeout(toastTimer);
    toastEl.textContent = msg;
    toastEl.style.display = 'block';
    if (ms > 0) {
      toastTimer = setTimeout(() => {
        toastEl.style.display = 'none';
      }, ms);
    }
  }

  function closeAllPopovers() {
    document.getElementById('tvColorPalettePopover')?.classList.remove('open');
    document.getElementById('tplQuickPopover')?.classList.remove('open');
    document.getElementById('deTemplateDropdown')?.classList.remove('open');
  }

  function closeAllSheetsAndModals() {
    closeAllPopovers();
    closeSlidingHub();
    document.querySelectorAll('.sheet-backdrop, .modal-backdrop').forEach(el => {
      el.classList.remove('open');
    });
  }

  function hideSplashScreen() {
    const splash = document.getElementById('splashScreen');
    if (!splash || splash.classList.contains('hidden')) return;
    splash.style.opacity = '0';
    setTimeout(() => splash.classList.add('hidden'), 260);
  }

  /* --------------------------------------------------------------------------
     3. FIRST-TIME SECURE GMAIL VERIFICATION GATE
     -------------------------------------------------------------------------- */
  function isGenuineGmail(email) {
    const clean = String(email || '').trim().toLowerCase();
    if (!GMAIL_REGEX.test(clean)) return false;
    const local = clean.split('@')[0].replace(/\./g, '');
    if (local.length < 4) return false;
    if (BLOCKED_LOCAL_PARTS.has(local)) return false;
    if (/^(.)\1+$/.test(local)) return false;
    return true;
  }

  function showVerifyStep(email) {
    document.getElementById('authFormStep')?.classList.add('hidden');
    document.getElementById('verifyEmailStep')?.classList.remove('hidden');
    const targetEl = document.getElementById('verifyTargetEmail');
    if (targetEl) targetEl.textContent = email;
  }

  function showAuthFormStep() {
    document.getElementById('verifyEmailStep')?.classList.add('hidden');
    document.getElementById('authFormStep')?.classList.remove('hidden');
  }

  function initFirstTimeGmailGate() {
    const authScreen = document.getElementById('authScreen');
    const appShell = document.getElementById('appShell');
    const errBox = document.getElementById('authErrorBox');
    const submitBtn = document.getElementById('authSubmitBtn');

    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        authMode = tab.dataset.authMode;
        document.getElementById('nameFieldWrap')?.classList.toggle('hidden', authMode !== 'signup');
        submitBtn.textContent = authMode === 'signup'
          ? 'Create Account & Send Gmail Verification'
          : 'Sign In with Verified Gmail';
        errBox.classList.add('hidden');
      };
    });

    document.getElementById('gmailAuthForm').onsubmit = async (e) => {
      e.preventDefault();
      errBox.classList.add('hidden');

      const email = document.getElementById('authEmail').value.trim().toLowerCase();
      const pass = document.getElementById('authPassword').value;
      const fullName = document.getElementById('authName').value.trim();

      if (!isGenuineGmail(email)) {
        errBox.textContent = 'Enter a valid personal @gmail.com ID (dummy/test addresses are blocked).';
        errBox.classList.remove('hidden');
        return;
      }
      if (pass.length < 6) {
        errBox.textContent = 'Password must be at least 6 characters.';
        errBox.classList.remove('hidden');
        return;
      }
      if (!TVFirebase?.auth) {
        errBox.textContent = 'Firebase Auth SDK failed to load. Check internet connection.';
        errBox.classList.remove('hidden');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Connecting to Firebase...';

      try {
        if (authMode === 'signup') {
          const cred = await TVFirebase.auth.createUserWithEmailAndPassword(email, pass);
          if (fullName) {
            await cred.user.updateProfile({ displayName: fullName });
          }
          await cred.user.sendEmailVerification();
          showVerifyStep(email);
        } else {
          const cred = await TVFirebase.auth.signInWithEmailAndPassword(email, pass);
          await cred.user.reload();
          if (!cred.user.emailVerified) {
            try { await cred.user.sendEmailVerification(); } catch (_) {}
            showVerifyStep(email);
          }
        }
      } catch (err) {
        if (err.code === 'auth/operation-not-allowed') {
          errBox.textContent = 'Enable "Email/Password" in Firebase Console → Authentication → Sign-in method first.';
        } else if (err.code === 'auth/email-already-in-use') {
          errBox.textContent = 'This Gmail is already registered. Switch to "Sign In" tab above.';
        } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
          errBox.textContent = 'Incorrect password or account not found. Tap "Create Account" if you are new.';
        } else {
          errBox.textContent = err.message || 'Authentication error. Please try again.';
        }
        errBox.classList.remove('hidden');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = authMode === 'signup'
          ? 'Create Account & Send Gmail Verification'
          : 'Sign In with Verified Gmail';
      }
    };

    document.getElementById('googleSignInBtn').onclick = async () => {
      errBox.classList.add('hidden');
      if (!TVFirebase?.auth || !TVFirebase?.googleProvider) {
        errBox.textContent = 'Google Sign-In unavailable. Please verify with your @gmail.com above.';
        errBox.classList.remove('hidden');
        return;
      }
      try {
        await TVFirebase.auth.signInWithPopup(TVFirebase.googleProvider);
      } catch (_) {
        errBox.textContent = 'Google popup is restricted in mobile WebView. Enter your @gmail.com & password above to receive a real Gmail verification link.';
        errBox.classList.remove('hidden');
        document.getElementById('authEmail')?.focus();
      }
    };

    document.getElementById('checkVerifiedBtn').onclick = async () => {
      const vErr = document.getElementById('verifyErrorBox');
      vErr.classList.add('hidden');
      const user = TVFirebase.auth?.currentUser;
      if (!user) return;
      try {
        await user.reload();
        if (user.emailVerified) {
          await unlockVerifiedWorkspace(user);
        } else {
          vErr.textContent = 'Not verified yet! Open your Gmail app, click the verification link from Google/NoxAlgo, then tap again.';
          vErr.classList.remove('hidden');
        }
      } catch (err) {
        vErr.textContent = err.message || 'Could not check verification status.';
        vErr.classList.remove('hidden');
      }
    };

    document.getElementById('resendVerifyBtn').onclick = async () => {
      const user = TVFirebase.auth?.currentUser;
      if (!user) return;
      try {
        await user.sendEmailVerification();
        showToast('Verification link resent to ' + user.email);
      } catch (_) {
        showToast('Please wait 30 seconds before resending.');
      }
    };

    document.getElementById('changeGmailBtn').onclick = () => {
      CloudSyncEngine.signOut();
      showAuthFormStep();
    };

    setTimeout(hideSplashScreen, 2500);

    if (TVFirebase?.auth) {
      TVFirebase.auth.onAuthStateChanged(async (user) => {
        hideSplashScreen();
        if (user) {
          try { await user.reload(); } catch (_) {}
          const email = (user.email || '').toLowerCase();
          if (!isGenuineGmail(email)) {
            CloudSyncEngine.signOut();
            authScreen.classList.remove('hidden');
            appShell.classList.add('hidden');
            return;
          }
          if (user.emailVerified) {
            await unlockVerifiedWorkspace(user);
          } else {
            authScreen.classList.remove('hidden');
            appShell.classList.add('hidden');
            showVerifyStep(email);
          }
        } else {
          authScreen.classList.remove('hidden');
          appShell.classList.add('hidden');
          showAuthFormStep();
        }
      });
    } else {
      hideSplashScreen();
      authScreen.classList.remove('hidden');
    }
  }

  async function unlockVerifiedWorkspace(firebaseUser) {
    await CloudSyncEngine.signInWithVerifiedUser(firebaseUser);
    document.getElementById('authScreen')?.classList.add('hidden');
    document.getElementById('appShell')?.classList.remove('hidden');
    updateSyncStatusUI('Verified');

    if (!appBooted) {
      appBooted = true;
      applyTheme(TVStore.theme, true);
      initUniversalMovableWidgets();
      renderFavToolbar();
      selectPane(0);
      panes[0].resize();
      panes[0].startFeed();
    } else {
      setTimeout(() => panes.forEach(p => p.resize()), 40);
    }
  }

  /* --------------------------------------------------------------------------
     4. UNIVERSAL DRAG-AND-DROP FOR MOVABLE FLOATING OVERLAYS
     -------------------------------------------------------------------------- */
  function initUniversalMovableWidgets() {
    document.querySelectorAll('.drag-grip[data-drag-target]').forEach(grip => {
      const targetId = grip.dataset.dragTarget;
      const el = document.getElementById(targetId);
      if (!el) return;
      try {
        const saved = JSON.parse(localStorage.getItem('tvfb_wpos_' + targetId) || 'null');
        if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
          el.style.left = saved.left + 'px';
          el.style.top = saved.top + 'px';
          el.style.right = 'auto';
          el.style.bottom = 'auto';
          el.style.transform = 'none';
        }
      } catch (_) {}
    });

    let dragEl = null;
    let dragId = null;
    let startX = 0;
    let startY = 0;
    let origLeft = 0;
    let origTop = 0;

    const startDrag = (grip, cx, cy) => {
      const targetId = grip.dataset.dragTarget;
      const el = document.getElementById(targetId);
      if (!el) return;

      const parent = el.offsetParent || document.body;
      const elRect = el.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();

      origLeft = elRect.left - parentRect.left;
      origTop = elRect.top - parentRect.top;

      el.style.left = origLeft + 'px';
      el.style.top = origTop + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      el.style.transform = 'none';

      dragEl = el;
      dragId = targetId;
      startX = cx;
      startY = cy;
    };

    const moveDrag = (cx, cy) => {
      if (!dragEl) return;
      const parent = dragEl.offsetParent || document.body;
      const maxX = Math.max(0, parent.clientWidth - dragEl.offsetWidth);
      const maxY = Math.max(0, parent.clientHeight - dragEl.offsetHeight);

      dragEl.style.left = Math.max(0, Math.min(maxX, origLeft + (cx - startX))) + 'px';
      dragEl.style.top = Math.max(0, Math.min(maxY, origTop + (cy - startY))) + 'px';
    };

    const endDrag = () => {
      if (!dragEl || !dragId) return;
      try {
        localStorage.setItem('tvfb_wpos_' + dragId, JSON.stringify({
          left: parseFloat(dragEl.style.left) || 0,
          top: parseFloat(dragEl.style.top) || 0
        }));
      } catch (_) {}
      dragEl = null;
      dragId = null;
    };

    document.querySelectorAll('.drag-grip[data-drag-target]').forEach(grip => {
      grip.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        startDrag(grip, e.clientX, e.clientY);
      });
      grip.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        if (e.touches[0]) startDrag(grip, e.touches[0].clientX, e.touches[0].clientY);
      }, { passive: true });
    });

    window.addEventListener('mousemove', (e) => {
      if (dragEl) moveDrag(e.clientX, e.clientY);
    });
    window.addEventListener('touchmove', (e) => {
      if (dragEl && e.touches[0]) {
        e.preventDefault();
        moveDrag(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: false });
    window.addEventListener('mouseup', endDrag);
    window.addEventListener('touchend', endDrag);
  }

  /* --------------------------------------------------------------------------
     5. FULLSCREEN MODE (CLEAN 'X' CROSS ICON ONLY)
     -------------------------------------------------------------------------- */
  function enterFullscreen() {
    document.body.classList.add('zen-fullscreen');
    document.getElementById('cabFullscreenBtn')?.classList.add('active');
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
    setTimeout(() => panes.forEach(p => p.resize()), 60);
  }

  function exitFullscreen() {
    document.body.classList.remove('zen-fullscreen');
    document.getElementById('cabFullscreenBtn')?.classList.remove('active');
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
    setTimeout(() => panes.forEach(p => p.resize()), 60);
  }

  document.getElementById('cabFullscreenBtn').onclick = () => {
    if (document.body.classList.contains('zen-fullscreen')) exitFullscreen();
    else enterFullscreen();
  };
  document.getElementById('exitFsBtn').onclick = exitFullscreen;

  /* --------------------------------------------------------------------------
     6. THEME SWITCHER (DARK / LIGHT)
     -------------------------------------------------------------------------- */
  function applyTheme(themeName, skipSave = false) {
    TVStore.theme = themeName;
    if (!skipSave) TVStore.saveTheme();

    const isLight = themeName === 'light';
    document.body.classList.toggle('theme-light', isLight);
    document.body.classList.toggle('theme-dark', !isLight);

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', isLight ? '#FFFFFF' : '#000000');

    const valEl = document.getElementById('settingThemeValue');
    if (valEl) valEl.textContent = isLight ? 'Light' : 'Dark';

    panes.forEach(p => p.draw());
  }

  /* --------------------------------------------------------------------------
     7. TRADINGVIEW-STYLE MENU & SETTINGS UI
     -------------------------------------------------------------------------- */
  function updateMenuProfileStats() {
    const p = activePane();
    const dCount = document.getElementById('statDrawings');
    const aCount = document.getElementById('statAlerts');
    const tCount = document.getElementById('statTemplates');
    if (dCount) dCount.textContent = p ? p.drawings.length : 0;
    if (aCount) aCount.textContent = p ? p.alerts.length : 0;
    if (tCount) tCount.textContent = Object.keys(TVStore.drawTemplates || {}).length;
  }

  function updateSyncStatusUI(label = 'Verified') {
    const isSignedIn = !!TVStore.currentUser?.email;
    const topDot = document.getElementById('topSyncStatusDot');
    if (topDot) topDot.classList.toggle('synced', isSignedIn);

    if (isSignedIn) {
      const name = TVStore.currentUser.name || 'Trader';
      const email = TVStore.currentUser.email;
      const nameEl = document.getElementById('gmailUserName');
      const emailEl = document.getElementById('gmailUserEmail');
      const avatarTextEl = document.getElementById('menuAvatar');
      const avatarImgEl = document.getElementById('gmailUserAvatar');
      const contactPrev = document.getElementById('contactGmailPreview');
      const badge = document.getElementById('cloudSyncBadge');

      if (nameEl) nameEl.textContent = name;
      if (emailEl) emailEl.textContent = email;
      if (contactPrev) contactPrev.textContent = email + ' ›';
      if (badge) badge.textContent = label.toUpperCase();

      if (TVStore.currentUser.avatar && avatarImgEl) {
        avatarImgEl.src = TVStore.currentUser.avatar;
        avatarImgEl.classList.remove('hidden');
        avatarTextEl?.classList.add('hidden');
      } else if (avatarTextEl) {
        avatarTextEl.textContent = name.charAt(0).toUpperCase();
        avatarTextEl.classList.remove('hidden');
        avatarImgEl?.classList.add('hidden');
      }
    }
    updateMenuProfileStats();
  }

  document.getElementById('menuBellBtn').onclick = () => switchBottomNav('alerts');
  document.getElementById('openSettingsScreenBtn').onclick = () => switchBottomNav('settings');
  document.getElementById('backFromSettingsBtn').onclick = () => switchBottomNav('menu');
  document.getElementById('settingsChartJumpBtn').onclick = () => switchBottomNav('chart');

  document.querySelectorAll('[data-jump-nav]').forEach(btn => {
    btn.onclick = () => switchBottomNav(btn.dataset.jumpNav);
  });

  document.getElementById('settingThemeRow').onclick = () => {
    const next = TVStore.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    showToast(`${next === 'dark' ? 'Dark' : 'Light'} theme applied`);
  };

  document.getElementById('keepScreenOnToggle').onchange = async (e) => {
    if (e.target.checked && 'wakeLock' in navigator) {
      try {
        wakeLockRef = await navigator.wakeLock.request('screen');
        showToast('Keep Screen On enabled');
      } catch (_) {
        showToast('Screen wake active');
      }
    } else if (wakeLockRef) {
      wakeLockRef.release().catch(() => {});
      wakeLockRef = null;
    }
  };

  document.getElementById('forceCloudSyncBtn').onclick = async () => {
    if (!TVStore.currentUser?.email) return;
    await CloudSyncEngine.pushToCloud();
    const stEl = document.getElementById('syncStatusText');
    if (stEl) stEl.textContent = 'Synced ›';
    showToast('Cloud data synced to Firebase');
  };

  document.getElementById('menuSubCard').onclick = () => showToast('NoxAlgo Pro unlocked for verified Gmail');
  document.getElementById('menuReferCard').onclick = () => showToast('Share NoxAlgo APK with friends');
  document.getElementById('menuRateBtn').onclick = () => showToast('Thanks for rating NoxAlgo 5★');
  document.getElementById('menuHelpBtn').onclick = () => showToast('Tap any drawing once to customize or open Settings');
  document.getElementById('menuAboutBtn').onclick = () => showToast('NoxAlgo Supercharts Pro • Smooth 60fps Engine');
  document.getElementById('contactInfoRow').onclick = () => {
    if (TVStore.currentUser?.email) showToast('Verified Gmail: ' + TVStore.currentUser.email);
  };

  document.getElementById('googleSignOutBtn').onclick = () => {
    CloudSyncEngine.signOut();
    document.getElementById('appShell')?.classList.add('hidden');
    document.getElementById('authScreen')?.classList.remove('hidden');
    showAuthFormStep();
    showToast('Signed out');
  };

  document.getElementById('deleteAccountBtn').onclick = async () => {
    if (!confirm('Delete your NoxAlgo account permanently?')) return;
    try {
      const user = TVFirebase.auth?.currentUser;
      if (user) {
        const docId = CloudSyncEngine.getDocId(user.email);
        await TVFirebase.db?.collection('supercharts_workspaces').doc(docId).delete().catch(() => {});
        await user.delete();
      }
      CloudSyncEngine.signOut();
      location.reload();
    } catch (_) {
      showToast('Please Sign Out and Sign In again before deleting account.');
    }
  };

  /* --------------------------------------------------------------------------
     8. SCROLLABLE + HOLD-TO-REORDER FAVORITES BAR & ALL TOOLS SHEET
     -------------------------------------------------------------------------- */
  const favToolbar = document.getElementById('favToolbar');
  const favItemsContainer = document.getElementById('favItemsContainer');

  let reorderingToolId = null;
  let reorderingStartedAt = 0;

  function triggerToolAction(actionId) {
    const p = activePane();
    if (actionId === 'magnet_action') {
      TVStore.magnetLevel = (TVStore.magnetLevel + 1) % 3;
      showToast(['Magnet: OFF', 'Magnet: Weak Snap', 'Magnet: Strong Snap'][TVStore.magnetLevel]);
      renderFavToolbar();
    } else if (actionId === 'stay_action') {
      TVStore.stayInDrawingMode = !TVStore.stayInDrawingMode;
      showToast(TVStore.stayInDrawingMode ? 'Stay in Drawing Mode: ON' : 'Stay in Drawing Mode: OFF');
      renderFavToolbar();
    } else if (actionId === 'lock_action') {
      const lockTarget = p.drawings.some(d => !d.locked);
      p.drawings.forEach(d => { d.locked = lockTarget; });
      p.saveDrawings();
      updateObjectEditBar();
      p.draw();
      showToast(lockTarget ? 'All drawings locked' : 'All drawings unlocked');
      renderFavToolbar();
    } else if (actionId === 'hide_action') {
      TVStore.hideAllDrawings = !TVStore.hideAllDrawings;
      panes.forEach(x => x.draw());
      showToast(TVStore.hideAllDrawings ? 'Drawings hidden' : 'Drawings visible');
      renderFavToolbar();
    } else if (actionId === 'trash_action') {
      if (p.selectedDrawingId) {
        p.pushHistory();
        p.drawings = p.drawings.filter(d => d.id !== p.selectedDrawingId);
        p.selectedDrawingId = null;
        p.saveDrawings();
        updateObjectEditBar();
        p.draw();
        showToast('Selected drawing deleted');
      } else if (p.drawings.length) {
        p.pushHistory();
        p.drawings = [];
        p.saveDrawings();
        updateObjectEditBar();
        p.draw();
        showToast('All drawings deleted');
      }
    }
  }

  function setActiveTool(toolId) {
    const meta = TVStore.drawingCatalog.find(t => t.id === toolId);
    if (meta?.isAction) {
      triggerToolAction(toolId);
      return;
    }
    const prevPane = activePane();
    if (prevPane?.activeMultiDrawing) {
      prevPane.cancelActiveMultiDrawing();
    }
    TVStore.activeTool = toolId;
    renderFavToolbar();

    const p = activePane();
    if (!p.isNavTool(toolId) && toolId !== 'eraser') {
      p.activateToolAimCrosshair();
    } else {
      p.crosshairActive = false;
      p.crossX = null;
      p.crossY = null;
      p.draw();
    }
  }

  document.getElementById('finishMultiPtBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    activePane().completeActiveMultiDrawing();
  });

  document.getElementById('cancelMultiPtBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    activePane().cancelActiveMultiDrawing();
  });

  function renderFavToolbar() {
    if (!favToolbar || !favItemsContainer) return;
    const show = TVStore.showFavToolbar && TVStore.starredTools.length > 0;
    favToolbar.classList.toggle('hidden', !show);

    favItemsContainer.innerHTML = TVStore.starredTools.map(toolId => {
      const item = TVStore.drawingCatalog.find(t => t.id === toolId);
      if (!item) return '';
      let isActive = TVStore.activeTool === item.id;
      if (item.id === 'magnet_action') isActive = TVStore.magnetLevel > 0;
      if (item.id === 'stay_action') isActive = TVStore.stayInDrawingMode;
      if (item.id === 'hide_action') isActive = TVStore.hideAllDrawings;

      return `<button type="button" class="fav-tool-btn ${isActive ? 'active' : ''} ${reorderingToolId === item.id ? 'reordering' : ''}" data-fav-tool="${item.id}" title="${item.name}">
        ${item.svg}
      </button>`;
    }).join('');

    favItemsContainer.querySelectorAll('[data-fav-tool]').forEach(btn => {
      const tid = btn.dataset.favTool;
      let holdTimer = null;
      let isDraggingOrder = false;
      let startX = 0;
      let startY = 0;

      btn.addEventListener('touchstart', (e) => {
        isDraggingOrder = false;
        const t = e.touches[0];
        startX = t ? t.clientX : 0;
        startY = t ? t.clientY : 0;
        holdTimer = setTimeout(() => {
          reorderingToolId = tid;
          reorderingStartedAt = Date.now();
          isDraggingOrder = true;
          hapticTick(25);
          renderFavToolbar();
        }, 380);
      }, { passive: true });

      btn.addEventListener('touchmove', (e) => {
        const touch = e.touches[0];
        if (!touch) return;

        if (!isDraggingOrder) {
          if (Math.hypot(touch.clientX - startX, touch.clientY - startY) > 6 && holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
          }
          return;
        }

        e.preventDefault();
        e.stopPropagation();

        const isVert = favToolbar.classList.contains('vertical');
        const siblings = [...favItemsContainer.querySelectorAll('[data-fav-tool]')];

        for (const sib of siblings) {
          const otherId = sib.dataset.favTool;
          if (otherId === tid) continue;
          const rect = sib.getBoundingClientRect();
          const hit = isVert
            ? (touch.clientY >= rect.top && touch.clientY <= rect.bottom)
            : (touch.clientX >= rect.left && touch.clientX <= rect.right);

          if (hit) {
            const fromIdx = TVStore.starredTools.indexOf(tid);
            const toIdx = TVStore.starredTools.indexOf(otherId);
            if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
              TVStore.starredTools.splice(fromIdx, 1);
              TVStore.starredTools.splice(toIdx, 0, tid);
              hapticTick(10);
              renderFavToolbar();
              break;
            }
          }
        }
      }, { passive: false });

      btn.addEventListener('touchend', (e) => {
        if (holdTimer) {
          clearTimeout(holdTimer);
          holdTimer = null;
        }
        if (isDraggingOrder) {
          e.stopPropagation();
          isDraggingOrder = false;
          reorderingToolId = null;
          TVStore.saveStarred();
          renderFavToolbar();
        }
      });

      btn.onclick = (e) => {
        if (Date.now() - reorderingStartedAt < 420) return;
        e.stopPropagation();
        setActiveTool(tid);
      };
    });
  }

  document.getElementById('favRotateBtn').onclick = () => {
    const isVert = favToolbar.classList.contains('vertical');
    favToolbar.classList.toggle('vertical', !isVert);
    favToolbar.classList.toggle('horizontal', isVert);
  };

  let activeDrawCat = 'Favorites';

  function renderDrawingsSheet() {
    const grid = document.getElementById('drawToolsGrid');
    const q = (document.getElementById('drawSearchInput')?.value || '').trim().toLowerCase();
    document.getElementById('showFavToolbarChk').checked = TVStore.showFavToolbar;

    let items = TVStore.drawingCatalog;
    if (q) {
      items = items.filter(t => t.name.toLowerCase().includes(q) || t.cat.toLowerCase().includes(q));
    } else if (activeDrawCat === 'Favorites') {
      items = items.filter(t => TVStore.starredTools.includes(t.id));
    } else {
      items = items.filter(t => t.cat === activeDrawCat);
    }

    if (!items.length) {
      grid.innerHTML = `<div style="padding:20px;color:var(--text-muted);text-align:center;">No tools here. Tap ★ on any tool to add to Favorites.</div>`;
      return;
    }

    grid.innerHTML = `<div class="draw-cards-grid">` + items.map(t => {
      const starred = TVStore.starredTools.includes(t.id);
      const isSelected = TVStore.activeTool === t.id;
      return `
        <div class="tool-card ${isSelected ? 'active' : ''}" data-pick-tool="${t.id}">
          <button type="button" class="star-pin-btn ${starred ? 'starred' : ''}" data-star-tool="${t.id}">${starred ? '★' : '☆'}</button>
          ${t.svg}
          <span>${t.name}</span>
        </div>`;
    }).join('') + `</div>`;

    grid.querySelectorAll('[data-star-tool]').forEach(starBtn => {
      starBtn.onclick = (e) => {
        e.stopPropagation();
        const tid = starBtn.dataset.starTool;
        if (TVStore.starredTools.includes(tid)) {
          TVStore.starredTools = TVStore.starredTools.filter(x => x !== tid);
        } else {
          TVStore.starredTools.push(tid);
        }
        TVStore.saveStarred();
        renderFavToolbar();
        renderDrawingsSheet();
      };
    });

    grid.querySelectorAll('[data-pick-tool]').forEach(card => {
      card.onclick = () => {
        setActiveTool(card.dataset.pickTool);
        document.getElementById('drawingsSheet').classList.remove('open');
      };
    });
  }

  document.getElementById('cabDrawingsBtn').onclick = () => {
    closeAllPopovers();
    renderDrawingsSheet();
    document.getElementById('drawingsSheet').classList.add('open');
  };

  document.querySelectorAll('#drawCatTabs .stab').forEach(tab => {
    tab.onclick = () => {
      activeDrawCat = tab.dataset.dcat;
      document.querySelectorAll('#drawCatTabs .stab').forEach(t => t.classList.toggle('active', t === tab));
      renderDrawingsSheet();
    };
  });

  document.getElementById('drawSearchInput').oninput = renderDrawingsSheet;
  document.getElementById('showFavToolbarChk').onchange = (e) => {
    TVStore.showFavToolbar = e.target.checked;
    TVStore.saveStarred();
    renderFavToolbar();
  };

  /* --------------------------------------------------------------------------
     9. 10x8 TRADINGVIEW COLOR PALETTE & SMOOTH FINGER-SLIDING OPACITY BAR
     -------------------------------------------------------------------------- */
  const TV_COLOR_MATRIX = [
    ['#FFFFFF', '#E0E3EB', '#B2B5BE', '#9598A1', '#787B86', '#5D606B', '#434651', '#2A2E39', '#1E222D', '#000000'],
    ['#F23645', '#FF9800', '#FFEB3B', '#4CAF50', '#089981', '#00BCD4', '#2962FF', '#673AB7', '#9C27B0', '#E91E63'],
    ['#FCCBCD', '#FFE0B2', '#FFF9C4', '#C8E6C9', '#ACE5DC', '#B2EBF2', '#BBD9FB', '#D1C4E9', '#E1BEE7', '#F8BBD0'],
    ['#FAA1A4', '#FFCC80', '#FFF59D', '#A5D6A7', '#70CCBD', '#80DEEA', '#90BFF9', '#B39DDB', '#CE93D8', '#F48FB1'],
    ['#F77C80', '#FFB74D', '#FFF176', '#81C784', '#42B5A2', '#4DD0E1', '#5B9CF6', '#9575CD', '#BA68C8', '#F06292'],
    ['#F7525F', '#FFA726', '#FFEE58', '#66BB6A', '#22AB94', '#26C6DA', '#3179F5', '#7E57C2', '#AB47BC', '#EC407A'],
    ['#B22833', '#F57C00', '#FBC02D', '#388E3C', '#056656', '#0097A7', '#1848CC', '#512DA8', '#7B1FA2', '#C2185B'],
    ['#801922', '#E65100', '#F57F17', '#1B5E20', '#00332A', '#006064', '#0C3299', '#311B92', '#4A148C', '#880E4F']
  ];

  function parseRgba(str) {
    if (!str) return { hex: '#2962FF', alpha: 100 };
    if (str.startsWith('#')) return { hex: str.slice(0, 7).toUpperCase(), alpha: 100 };
    const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i);
    if (!m) return { hex: '#2962FF', alpha: 100 };
    const toHex = (n) => Number(n).toString(16).padStart(2, '0').toUpperCase();
    return {
      hex: `#${toHex(m[1])}${toHex(m[2])}${toHex(m[3])}`,
      alpha: m[4] !== undefined ? Math.round(Number(m[4]) * 100) : 100
    };
  }

  function buildRgba(hex, alphaPct) {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.slice(0, 2), 16) || 0;
    const g = parseInt(clean.slice(2, 4), 16) || 0;
    const b = parseInt(clean.slice(4, 6), 16) || 0;
    const a = Math.max(0, Math.min(1, alphaPct / 100));
    return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(2))})`;
  }

  const palettePopover = document.getElementById('tvColorPalettePopover');
  const cpSwatchesGrid = document.getElementById('cpSwatchesGrid');
  const cpOpacitySlider = document.getElementById('cpOpacitySlider');
  const cpOpacityVal = document.getElementById('cpOpacityVal');
  const cpCustomHexInp = document.getElementById('cpCustomHexInp');
  const cpHexPreview = document.getElementById('cpHexPreview');

  let activeColorCallback = null;
  let activeColorAnchorBtn = null;
  let currentPaletteHex = '#2962FF';
  let currentPaletteAlpha = 100;

  function updateOpacitySliderTrack() {
    if (!cpOpacitySlider) return;
    const transparentEnd = buildRgba(currentPaletteHex, 5);
    const solidEnd = buildRgba(currentPaletteHex, 100);
    cpOpacitySlider.style.background = `linear-gradient(90deg, ${transparentEnd} 0%, ${solidEnd} 100%)`;
  }

  function renderPaletteSwatches() {
    cpSwatchesGrid.innerHTML = TV_COLOR_MATRIX.flat().map(hex => `
      <div class="cp-cell ${hex === currentPaletteHex ? 'selected' : ''}" data-cp-hex="${hex}" style="background:${hex};"></div>
    `).join('');

    cpSwatchesGrid.querySelectorAll('.cp-cell').forEach(cell => {
      cell.onclick = (e) => {
        e.stopPropagation();
        currentPaletteHex = cell.dataset.cpHex;
        cpHexPreview.textContent = currentPaletteHex;
        cpCustomHexInp.value = currentPaletteHex;
        updateOpacitySliderTrack();
        renderPaletteSwatches();
        emitPaletteChange();
      };
    });
  }

  function emitPaletteChange() {
    const rgba = buildRgba(currentPaletteHex, currentPaletteAlpha);
    if (activeColorAnchorBtn && activeColorAnchorBtn.classList.contains('tv-swatch-btn')) {
      activeColorAnchorBtn.style.background = rgba;
      activeColorAnchorBtn.dataset.rgba = rgba;
    }
    if (activeColorCallback) activeColorCallback(rgba);
  }

  function openColorPalette(anchorBtn, initialColorStr, onChange) {
    activeColorAnchorBtn = anchorBtn;
    activeColorCallback = onChange;

    const parsed = parseRgba(initialColorStr || anchorBtn.dataset.rgba || '#2962FF');
    currentPaletteHex = parsed.hex;
    currentPaletteAlpha = parsed.alpha;

    cpOpacitySlider.value = currentPaletteAlpha;
    cpOpacityVal.textContent = currentPaletteAlpha + '%';
    cpHexPreview.textContent = currentPaletteHex;
    cpCustomHexInp.value = currentPaletteHex;
    updateOpacitySliderTrack();
    renderPaletteSwatches();

    const rect = anchorBtn.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - 276, rect.left - 90));
    const top = rect.bottom + 8 + 260 > window.innerHeight ? Math.max(10, rect.top - 265) : rect.bottom + 8;

    palettePopover.style.left = left + 'px';
    palettePopover.style.top = top + 'px';
    palettePopover.classList.add('open');
  }

  const handleOpacitySlide = (val) => {
    currentPaletteAlpha = Math.max(0, Math.min(100, Number(val)));
    cpOpacityVal.textContent = currentPaletteAlpha + '%';
    emitPaletteChange();
  };

  cpOpacitySlider.addEventListener('input', (e) => {
    e.stopPropagation();
    handleOpacitySlide(e.target.value);
  });

  cpOpacitySlider.addEventListener('touchmove', (e) => {
    e.stopPropagation();
    const touch = e.touches[0];
    if (!touch) return;
    const rect = cpOpacitySlider.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    const pct = Math.round(ratio * 100);
    cpOpacitySlider.value = pct;
    handleOpacitySlide(pct);
  }, { passive: true });

  cpCustomHexInp.oninput = (e) => {
    currentPaletteHex = e.target.value.toUpperCase();
    cpHexPreview.textContent = currentPaletteHex;
    updateOpacitySliderTrack();
    renderPaletteSwatches();
    emitPaletteChange();
  };

  /* --------------------------------------------------------------------------
     10. SYMBOL CONTEXT SHEET & CANDLE SETTINGS MODAL
     -------------------------------------------------------------------------- */
  const symbolContextSheet = document.getElementById('symbolContextSheet');

  document.getElementById('topSymMoreBtn').onclick = () => {
    const p = activePane();
    const meta = TVStore.getSymMeta(p.sym);
    const px = (p.lastBid != null ? p.disp(p.lastBid) : (TVStore.quotes[p.sym]?.last || meta.base || 100)).toFixed(meta.prec);

    document.getElementById('scAlertSym').textContent = p.sym;
    document.getElementById('scAlertPx').textContent = px;
    document.getElementById('scOrdSym').textContent = p.sym;
    document.getElementById('scOrdPx').textContent = px;
    document.getElementById('scCopyPx').textContent = px;

    symbolContextSheet.classList.add('open');
  };

  document.getElementById('scAddAlertRow').onclick = () => {
    symbolContextSheet.classList.remove('open');
    openAlertModal();
  };
  document.getElementById('scAddOrderRow').onclick = () => {
    symbolContextSheet.classList.remove('open');
    switchBottomNav('trading');
  };
  document.getElementById('scAddIndRow').onclick = () => {
    symbolContextSheet.classList.remove('open');
    openIndicatorsModal();
  };
  document.getElementById('scDetailsRow').onclick = () => {
    symbolContextSheet.classList.remove('open');
    switchBottomNav('watchlist');
  };
  document.getElementById('scCopyPxRow').onclick = () => {
    const px = document.getElementById('scCopyPx').textContent;
    navigator.clipboard?.writeText(px).catch(() => {});
    symbolContextSheet.classList.remove('open');
    showToast(`Copied ${px}`);
  };
  document.getElementById('scSettingsRow').onclick = () => {
    symbolContextSheet.classList.remove('open');
    openSymbolSettingsModal();
  };

  function syncSymbolSettingsUI() {
    const s = TVStore.settings;
    const p = activePane();

    document.getElementById('ssColorPrevClose').checked = !!s.colorPrevClose;
    document.getElementById('ssBodyChk').checked = s.bodyEnabled !== false;
    document.getElementById('ssBorderChk').checked = s.borderEnabled !== false;
    document.getElementById('ssWickChk').checked = s.wickEnabled !== false;

    const swatches = {
      ssBodyBullBtn: s.bodyBull,
      ssBodyBearBtn: s.bodyBear,
      ssBorderBullBtn: s.borderBull,
      ssBorderBearBtn: s.borderBear,
      ssWickBullBtn: s.wickBull,
      ssWickBearBtn: s.wickBear
    };
    Object.entries(swatches).forEach(([id, col]) => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.style.background = col;
        btn.dataset.rgba = col;
      }
    });

    document.getElementById('ssPrecisionSel').value = s.precisionOverride || 'default';
    document.getElementById('ssTimezoneSel').value = String(TVStore.tzOffsetSec);
    document.getElementById('ssOffsetSym').textContent = p.sym;
    document.getElementById('ssOffsetInp').value = p.offset;
  }

  function openSymbolSettingsModal() {
    syncSymbolSettingsUI();
    document.getElementById('symbolSettingsModal').classList.add('open');
  }

  document.getElementById('menuSymbolSettingsBtn').onclick = openSymbolSettingsModal;

  document.querySelectorAll('#symbolSettingsModal .tv-swatch-btn[data-color-key]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const key = btn.dataset.colorKey;
      openColorPalette(btn, TVStore.settings[key], (newRgba) => {
        TVStore.settings[key] = newRgba;
        panes.forEach(p => p.draw());
      });
    };
  });

  ['ssColorPrevClose', 'ssBodyChk', 'ssBorderChk', 'ssWickChk'].forEach(chkId => {
    document.getElementById(chkId).onchange = () => {
      TVStore.settings.colorPrevClose = document.getElementById('ssColorPrevClose').checked;
      TVStore.settings.bodyEnabled = document.getElementById('ssBodyChk').checked;
      TVStore.settings.borderEnabled = document.getElementById('ssBorderChk').checked;
      TVStore.settings.wickEnabled = document.getElementById('ssWickChk').checked;
      panes.forEach(p => p.draw());
    };
  });

  document.getElementById('ssResetDefaultBtn').onclick = () => {
    Object.assign(TVStore.settings, TVStore.defaultSymbolSettings);
    TVStore.saveSettings();
    syncSymbolSettingsUI();
    panes.forEach(p => p.draw());
    showToast('Candle settings reset to default');
  };

  document.getElementById('ssOkBtn').onclick = () => {
    TVStore.settings.precisionOverride = document.getElementById('ssPrecisionSel').value;
    TVStore.tzOffsetSec = Number(document.getElementById('ssTimezoneSel').value);
    document.getElementById('tzSelect').value = String(TVStore.tzOffsetSec);

    const p = activePane();
    const off = Number(document.getElementById('ssOffsetInp').value);
    if (!isNaN(off)) {
      p.offset = off;
      TVStore.setOffset(p.sym, off);
    }

    TVStore.saveSettings();
    closeAllPopovers();
    document.getElementById('symbolSettingsModal').classList.remove('open');
    panes.forEach(x => x.draw());
    showToast('Symbol settings saved');
  };

  /* --------------------------------------------------------------------------
     11. DIRECT TOUCH-SCROLLABLE MOMENTUM WHEEL SPINNERS (SYMBOL & TIMEFRAME)
     -------------------------------------------------------------------------- */
  const inlineWheelHud = document.getElementById('inlineWheelHud');
  const inlineWheelTrack = document.getElementById('inlineWheelTrack');
  const QUICK_TFS = ['1', '5', '15', '30', '60', '180', '300', '900', '1800', '3600', '7200', '14400', '43200', '86400', '604800'];

  let activeSpinnerMode = null;
  let spinnerItems = [];
  let spinnerFloatIdx = 0;
  let spinnerVelocity = 0;
  let spinnerRaf = null;
  let spinnerHideTimer = null;
  let lastHapticSlot = -1;

  function updateMiniWheelLabels(previewSym = null, previewTf = null) {
    const p = activePane();
    const syms = TVStore.watchlist;
    const targetSym = previewSym || p.sym;
    const sIdx = Math.max(0, syms.indexOf(targetSym));
    document.getElementById('mwSymPrev').textContent = syms[(sIdx - 1 + syms.length) % syms.length] || '';
    document.getElementById('mwSymCurr').textContent = targetSym;
    document.getElementById('mwSymNext').textContent = syms[(sIdx + 1) % syms.length] || '';

    const targetTf = String(previewTf || p.tf);
    const tIdx = Math.max(0, QUICK_TFS.indexOf(targetTf));
    document.getElementById('mwTfPrev').textContent = TVStore.getTfLabel(QUICK_TFS[(tIdx - 1 + QUICK_TFS.length) % QUICK_TFS.length]);
    document.getElementById('mwTfCurr').textContent = TVStore.getTfLabel(targetTf);
    document.getElementById('mwTfNext').textContent = TVStore.getTfLabel(QUICK_TFS[(tIdx + 1) % QUICK_TFS.length]);
  }

  function renderInlineSpinnerHUD() {
    if (!spinnerItems.length || !inlineWheelHud || !inlineWheelTrack) return;
    const count = spinnerItems.length;
    const centerIdx = Math.round(spinnerFloatIdx);
    const wrappedCenter = ((centerIdx % count) + count) % count;
    const centerItem = spinnerItems[wrappedCenter];

    if (centerIdx !== lastHapticSlot) {
      lastHapticSlot = centerIdx;
      hapticTick(9);
      if (centerItem) {
        if (activeSpinnerMode === 'symbol') updateMiniWheelLabels(centerItem.value, null);
        else if (activeSpinnerMode === 'tf') updateMiniWheelLabels(null, centerItem.value);
      }
    }

    let html = '';
    for (let offset = -2; offset <= 2; offset++) {
      const virtualIdx = centerIdx + offset;
      const wrappedIdx = ((virtualIdx % count) + count) % count;
      const item = spinnerItems[wrappedIdx];
      const delta = virtualIdx - spinnerFloatIdx;

      const angleDeg = delta * -28;
      const translateY = Math.sin((delta * 28 * Math.PI) / 180) * 66;
      const scale = Math.max(0.76, 1 - Math.abs(delta) * 0.09);
      const opacity = Math.max(0.18, 1 - Math.abs(delta) * 0.34);
      const isCenter = Math.abs(delta) < 0.45;

      html += `
        <div class="iwh-item ${isCenter ? 'center' : ''}"
             style="transform: translateY(${translateY.toFixed(1)}px) rotateX(${angleDeg.toFixed(1)}deg) scale(${scale.toFixed(2)}); opacity:${opacity.toFixed(2)};">
          ${item.badge ? `<span class="sym-badge-dot" style="background:${item.badgeCol};width:15px;height:15px;font-size:8px;">${item.badge}</span>` : ''}
          <span>${item.label}</span>
        </div>`;
    }
    inlineWheelTrack.innerHTML = html;
  }

  function commitInlineSpinnerSelection() {
    const count = spinnerItems.length;
    if (!count) return;
    const wrapped = ((Math.round(spinnerFloatIdx) % count) + count) % count;
    const picked = spinnerItems[wrapped];
    if (!picked) return;

    if (activeSpinnerMode === 'symbol' && activePane().sym !== picked.value) {
      switchSymbol(picked.value);
    } else if (activeSpinnerMode === 'tf' && String(activePane().tf) !== String(picked.value)) {
      switchTimeframe(picked.value);
    }

    if (spinnerHideTimer) clearTimeout(spinnerHideTimer);
    spinnerHideTimer = setTimeout(() => {
      inlineWheelHud.classList.remove('open');
    }, 380);
  }

  function runInlineSpinnerMomentum(isDraggingNow) {
    if (spinnerRaf) cancelAnimationFrame(spinnerRaf);

    const step = () => {
      if (isDraggingNow()) return;

      if (Math.abs(spinnerVelocity) > 0.015) {
        spinnerFloatIdx += spinnerVelocity;
        spinnerVelocity *= 0.91;
        renderInlineSpinnerHUD();
        spinnerRaf = requestAnimationFrame(step);
      } else {
        const target = Math.round(spinnerFloatIdx);
        const diff = target - spinnerFloatIdx;
        if (Math.abs(diff) > 0.01) {
          spinnerFloatIdx += diff * 0.3;
          renderInlineSpinnerHUD();
          spinnerRaf = requestAnimationFrame(step);
        } else {
          spinnerFloatIdx = target;
          spinnerVelocity = 0;
          renderInlineSpinnerHUD();
          commitInlineSpinnerSelection();
        }
      }
    };
    spinnerRaf = requestAnimationFrame(step);
  }

  function bindDirectTouchSpinner(slotElId, mode) {
    const slotEl = document.getElementById(slotElId);
    if (!slotEl) return;

    let dragging = false;
    let lastY = 0;
    let lastTime = 0;
    let totalDragDist = 0;

    const prepareSpinner = () => {
      if (spinnerRaf) cancelAnimationFrame(spinnerRaf);
      if (spinnerHideTimer) clearTimeout(spinnerHideTimer);
      activeSpinnerMode = mode;
      spinnerVelocity = 0;

      if (mode === 'symbol') {
        spinnerItems = TVStore.watchlist.map(s => {
          const meta = TVStore.getSymMeta(s);
          return { value: s, label: s, badge: meta.badge, badgeCol: meta.badgeCol };
        });
        spinnerFloatIdx = Math.max(0, spinnerItems.findIndex(x => x.value === activePane().sym));
        inlineWheelHud.style.left = '8px';
      } else {
        spinnerItems = QUICK_TFS.map(sec => ({ value: sec, label: TVStore.getTfLabel(sec) }));
        spinnerFloatIdx = Math.max(0, spinnerItems.findIndex(x => x.value === String(activePane().tf)));
        inlineWheelHud.style.left = '82px';
      }

      lastHapticSlot = Math.round(spinnerFloatIdx);
      renderInlineSpinnerHUD();
      inlineWheelHud.classList.add('open');
    };

    slotEl.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      dragging = true;
      totalDragDist = 0;
      lastY = e.touches[0].clientY;
      lastTime = performance.now();
      prepareSpinner();
    }, { passive: true });

    slotEl.addEventListener('touchmove', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!dragging) return;
      const now = performance.now();
      const y = e.touches[0].clientY;
      const dy = y - lastY;
      const dt = Math.max(8, now - lastTime);
      totalDragDist += Math.abs(dy);

      const deltaItems = -dy / 22;
      spinnerFloatIdx += deltaItems;
      spinnerVelocity = (deltaItems / dt) * 16;

      lastY = y;
      lastTime = now;
      renderInlineSpinnerHUD();
    }, { passive: false });

    slotEl.addEventListener('touchend', (e) => {
      e.stopPropagation();
      dragging = false;
      if (totalDragDist < 6) {
        spinnerVelocity = 0;
        spinnerFloatIdx = Math.round(spinnerFloatIdx) + 1;
        renderInlineSpinnerHUD();
        commitInlineSpinnerSelection();
      } else {
        runInlineSpinnerMomentum(() => dragging);
      }
    });

    slotEl.addEventListener('wheel', (e) => {
      e.preventDefault();
      prepareSpinner();
      spinnerVelocity = e.deltaY > 0 ? 0.45 : -0.45;
      runInlineSpinnerMomentum(() => false);
    }, { passive: false });
  }

  bindDirectTouchSpinner('cabSymWheelBtn', 'symbol');
  bindDirectTouchSpinner('cabTfWheelBtn', 'tf');

  /* --------------------------------------------------------------------------
     12. EXACT TRADINGVIEW FLOATING OBJECT BAR & 1-TAP TOOL SETTINGS
     -------------------------------------------------------------------------- */
  const objEditBar = document.getElementById('objectEditBar');

  function updateDashButtonPreview(dash) {
    const btn = document.getElementById('objDashQuickBtn');
    if (!btn) return;
    if (dash === 'dashed') {
      btn.innerHTML = `<svg viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12" stroke-width="2" stroke-dasharray="4 3"/></svg>`;
    } else if (dash === 'dotted') {
      btn.innerHTML = `<svg viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12" stroke-width="2" stroke-dasharray="1.5 3"/></svg>`;
    } else {
      btn.innerHTML = `<svg viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12" stroke-width="2"/></svg>`;
    }
  }

  function updateObjectEditBar() {
    const p = activePane();
    const d = p.drawings.find(x => x.id === p.selectedDrawingId);
    if (!d) {
      objEditBar.classList.remove('show');
      document.getElementById('tplQuickPopover')?.classList.remove('open');
      return;
    }
    objEditBar.classList.add('show');

    const strokeCol = d.color || '#2962FF';
    const fillCol = d.fillColor || 'rgba(41, 98, 255, 0.2)';
    const wVal = d.width || 2;
    const dashVal = d.dash || 'solid';

    const strokeBar = document.getElementById('objStrokeBar');
    const fillBar = document.getElementById('objFillBar');
    const widthBtn = document.getElementById('objWidthQuickBtn');
    const lockBtn = document.getElementById('objLockBtn');

    if (strokeBar) strokeBar.style.background = strokeCol;
    if (fillBar) fillBar.style.background = fillCol;
    if (widthBtn) widthBtn.textContent = `${wVal}px`;
    updateDashButtonPreview(dashVal);

    if (lockBtn) {
      lockBtn.classList.toggle('on', !!d.locked);
      lockBtn.innerHTML = d.locked
        ? `<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`
        : `<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-1.5"/></svg>`;
    }
    updateMenuProfileStats();
  }

  // 1-Tap Stroke Color + Opacity Slider
  document.getElementById('objStrokeColorBtn').onclick = (e) => {
    e.stopPropagation();
    const p = activePane();
    const d = p.drawings.find(x => x.id === p.selectedDrawingId);
    if (!d) return;
    openColorPalette(e.currentTarget, d.color || '#2962FF', (newRgba) => {
      p.pushHistory();
      d.color = newRgba;
      d.textColor = newRgba;
      updateObjectEditBar();
      p.saveDrawings();
      p.draw();
    });
  };

  // 1-Tap Fill Color + Opacity Slider
  document.getElementById('objFillColorBtn').onclick = (e) => {
    e.stopPropagation();
    const p = activePane();
    const d = p.drawings.find(x => x.id === p.selectedDrawingId);
    if (!d) return;
    openColorPalette(e.currentTarget, d.fillColor || 'rgba(41, 98, 255, 0.2)', (newRgba) => {
      p.pushHistory();
      d.fillColor = newRgba;
      d.fillEnabled = true;
      updateObjectEditBar();
      p.saveDrawings();
      p.draw();
    });
  };

  // 1-Tap Text Editor
  document.getElementById('objTextQuickBtn').onclick = (e) => {
    e.stopPropagation();
    openDrawingEditModal('text');
  };

  // 1-Tap Thickness Cycle (1px -> 2px -> 3px -> 4px)
  document.getElementById('objWidthQuickBtn').onclick = (e) => {
    e.stopPropagation();
    const p = activePane();
    const d = p.drawings.find(x => x.id === p.selectedDrawingId);
    if (!d) return;
    p.pushHistory();
    const widths = [1, 2, 3, 4];
    d.width = widths[(widths.indexOf(Number(d.width || 2)) + 1) % widths.length];
    updateObjectEditBar();
    p.saveDrawings();
    p.draw();
  };

  // 1-Tap Line Style Cycle (Solid -> Dashed -> Dotted)
  document.getElementById('objDashQuickBtn').onclick = (e) => {
    e.stopPropagation();
    const p = activePane();
    const d = p.drawings.find(x => x.id === p.selectedDrawingId);
    if (!d) return;
    p.pushHistory();
    const styles = ['solid', 'dashed', 'dotted'];
    d.dash = styles[(styles.indexOf(d.dash || 'solid') + 1) % styles.length];
    updateObjectEditBar();
    p.saveDrawings();
    p.draw();
  };

  // 1-Tap Full Tool Settings Gear
  document.getElementById('objSettingsModalBtn').onclick = (e) => {
    e.stopPropagation();
    openDrawingEditModal('style');
  };

  // 1-Tap Lock Toggle
  document.getElementById('objLockBtn').onclick = (e) => {
    e.stopPropagation();
    const p = activePane();
    const d = p.drawings.find(x => x.id === p.selectedDrawingId);
    if (!d) return;
    d.locked = !d.locked;
    updateObjectEditBar();
    p.saveDrawings();
    p.draw();
    showToast(d.locked ? 'Locked' : 'Unlocked');
  };

  // 1-Tap Delete
  document.getElementById('objDeleteBtn').onclick = (e) => {
    e.stopPropagation();
    const p = activePane();
    p.pushHistory();
    p.drawings = p.drawings.filter(x => x.id !== p.selectedDrawingId);
    p.selectedDrawingId = null;
    updateObjectEditBar();
    p.saveDrawings();
    p.draw();
  };

  // More (...) Popover (Clone, Bring to Front, Send to Back, Reset Default)
  const tplQuickPopover = document.getElementById('tplQuickPopover');

  document.getElementById('objMoreMenuBtn').onclick = (e) => {
    e.stopPropagation();
    const wasOpen = tplQuickPopover.classList.contains('open');
    closeAllPopovers();
    if (wasOpen) return;

    const p = activePane();
    const d = p.drawings.find(x => x.id === p.selectedDrawingId);
    if (!d) return;

    tplQuickPopover.innerHTML = `
      <button type="button" class="tpl-menu-item" id="qmCloneBtn"><span>❐ Clone Drawing</span></button>
      <button type="button" class="tpl-menu-item" id="qmFrontBtn"><span>↑ Bring to Front</span></button>
      <button type="button" class="tpl-menu-item" id="qmBackBtn"><span>↓ Send to Back</span></button>
      <div class="pop-divider"></div>
      <button type="button" class="tpl-menu-item" id="qmResetDefBtn"><span>↺ Reset Default</span></button>
    `;

    document.getElementById('qmCloneBtn').onclick = (ev) => {
      ev.stopPropagation();
      p.pushHistory();
      const copy = JSON.parse(JSON.stringify(d));
      copy.id = 'd_' + Date.now();
      copy.locked = false;
      const shift = (p.viewMaxP - p.viewMinP) * 0.05;
      copy.p1 += shift;
      if (copy.p2 != null) copy.p2 += shift;
      if (copy.p3 != null) copy.p3 += shift;
      if (copy.pts) copy.pts.forEach(pt => { pt.p += shift; });
      p.drawings.push(copy);
      p.selectedDrawingId = copy.id;
      updateObjectEditBar();
      p.saveDrawings();
      p.draw();
      tplQuickPopover.classList.remove('open');
    };

    document.getElementById('qmFrontBtn').onclick = (ev) => {
      ev.stopPropagation();
      p.pushHistory();
      p.drawings = p.drawings.filter(x => x.id !== d.id);
      p.drawings.push(d);
      p.saveDrawings();
      p.draw();
      tplQuickPopover.classList.remove('open');
    };

    document.getElementById('qmBackBtn').onclick = (ev) => {
      ev.stopPropagation();
      p.pushHistory();
      p.drawings = p.drawings.filter(x => x.id !== d.id);
      p.drawings.unshift(d);
      p.saveDrawings();
      p.draw();
      tplQuickPopover.classList.remove('open');
    };

    document.getElementById('qmResetDefBtn').onclick = (ev) => {
      ev.stopPropagation();
      p.pushHistory();
      d.color = '#2962FF';
      d.fillColor = 'rgba(41, 98, 255, 0.2)';
      d.fillEnabled = true;
      d.width = 2;
      d.dash = 'solid';
      d.text = '';
      d.extLeft = false;
      d.extRight = false;
      updateObjectEditBar();
      p.saveDrawings();
      p.draw();
      tplQuickPopover.classList.remove('open');
      showToast('Reset to Default');
    };

    const rect = e.currentTarget.getBoundingClientRect();
    tplQuickPopover.style.left = Math.max(8, Math.min(window.innerWidth - 185, rect.right - 175)) + 'px';
    tplQuickPopover.style.top = (rect.bottom + 6) + 'px';
    tplQuickPopover.classList.add('open');
  };

  function applyDrawingTemplateToObj(drawingObj, tpl) {
    if (!drawingObj || !tpl) return;
    if (tpl.color) drawingObj.color = tpl.color;
    if (tpl.fillColor) drawingObj.fillColor = tpl.fillColor;
    if (tpl.fillEnabled !== undefined) drawingObj.fillEnabled = tpl.fillEnabled;
    if (tpl.width) drawingObj.width = tpl.width;
    if (tpl.dash) drawingObj.dash = tpl.dash;
    if (tpl.text !== undefined) drawingObj.text = tpl.text;
    if (tpl.textColor) drawingObj.textColor = tpl.textColor;
    if (tpl.fontSize) drawingObj.fontSize = Number(tpl.fontSize);
    if (tpl.textVAlign) drawingObj.textVAlign = tpl.textVAlign;
    if (tpl.textHAlign) drawingObj.textHAlign = tpl.textHAlign;
    if (tpl.extLeft !== undefined) drawingObj.extLeft = tpl.extLeft;
    if (tpl.extRight !== undefined) drawingObj.extRight = tpl.extRight;
    if (tpl.visTfs !== undefined) drawingObj.visTfs = tpl.visTfs;
  }

  document.getElementById('objQuickTplBtn').onclick = (e) => {
    e.stopPropagation();
    const wasOpen = tplQuickPopover.classList.contains('open');
    closeAllPopovers();
    if (wasOpen) return;

    const p = activePane();
    const d = p.drawings.find(x => x.id === p.selectedDrawingId);
    if (!d) return;

    const catTemplates = TVStore.getTemplatesForTool(d.type);
    const names = Object.keys(catTemplates);

    let html = `<button type="button" class="tpl-menu-item" id="qtplSaveNewBtn" style="color:var(--tv-blue);font-weight:700;">+ Save as Template...</button>`;
    html += `<button type="button" class="tpl-menu-item" data-qtpl-default="1" style="color:var(--text-muted);">Reset Default</button>`;
    html += `<div class="pop-divider"></div>`;

    if (!names.length) {
      html += `<div style="padding:6px 8px;font-size:11px;color:var(--text-muted);">No saved templates yet.</div>`;
    } else {
      html += names.map(name => `
        <button type="button" class="tpl-menu-item" data-qtpl-name="${name}">
          <span>${name}</span>
          <span style="width:10px;height:10px;border-radius:50%;background:${catTemplates[name].color || '#2962FF'};"></span>
        </button>`).join('');
    }

    tplQuickPopover.innerHTML = html;

    document.getElementById('qtplSaveNewBtn').onclick = (ev) => {
      ev.stopPropagation();
      tplQuickPopover.classList.remove('open');
      openDrawingEditModal('text');
    };

    tplQuickPopover.querySelector('[data-qtpl-default]')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      p.pushHistory();
      d.color = '#2962FF';
      d.fillColor = 'rgba(41, 98, 255, 0.2)';
      d.fillEnabled = true;
      d.width = 2;
      d.dash = 'solid';
      d.text = '';
      d.extLeft = false;
      d.extRight = false;
      updateObjectEditBar();
      p.saveDrawings();
      p.draw();
      tplQuickPopover.classList.remove('open');
      showToast('Reset to Default');
    });

    tplQuickPopover.querySelectorAll('[data-qtpl-name]').forEach(btn => {
      btn.onclick = (ev) => {
        ev.stopPropagation();
        const tplName = btn.dataset.qtplName;
        if (tplName && catTemplates[tplName]) {
          p.pushHistory();
          applyDrawingTemplateToObj(d, catTemplates[tplName]);
          updateObjectEditBar();
          p.saveDrawings();
          p.draw();
        }
        tplQuickPopover.classList.remove('open');
      };
    });

    const rect = e.currentTarget.getBoundingClientRect();
    tplQuickPopover.style.left = Math.max(8, Math.min(window.innerWidth - 185, rect.left)) + 'px';
    tplQuickPopover.style.top = (rect.bottom + 6) + 'px';
    tplQuickPopover.classList.add('open');
  };

  let draftEditLineCol = '#2962FF';
  let draftEditFillCol = 'rgba(41, 98, 255, 0.2)';
  let draftEditTextCol = '#D1D4DC';

  function getSelectedVisTfsFromModal() {
    const checkedTfs = [];
    const allBoxes = document.querySelectorAll('#visCheckboxesGrid input[data-vistf]');
    allBoxes.forEach(chk => {
      if (chk.checked) checkedTfs.push(chk.dataset.vistf);
    });
    return checkedTfs.length === allBoxes.length ? 'all' : checkedTfs;
  }

  function applyVisTfsToModal(visTfsVal) {
    const isAllTfs = !visTfsVal || visTfsVal === 'all';
    document.getElementById('visAllTfsBtn').classList.toggle('on', isAllTfs);
    document.getElementById('visCurrentTfOnlyBtn').classList.toggle('on', !isAllTfs);
    document.querySelectorAll('#visCheckboxesGrid input[data-vistf]').forEach(chk => {
      chk.checked = isAllTfs ? true : visTfsVal.includes(chk.dataset.vistf);
    });
  }

  function openDrawingEditModal(initialTab = 'style') {
    const p = activePane();
    const d = p.drawings.find(x => x.id === p.selectedDrawingId);
    if (!d) {
      showToast('Tap a drawing on chart first');
      return;
    }

    const meta = TVStore.drawingCatalog.find(t => t.id === d.type);
    const prec = TVStore.getSymMeta(p.sym).prec;

    document.getElementById('drawEditModalTitle').textContent = `${meta ? meta.name : 'Drawing'} Settings`;

    draftEditLineCol = d.color || '#2962FF';
    draftEditFillCol = d.fillColor || 'rgba(41, 98, 255, 0.2)';
    draftEditTextCol = d.textColor || d.color || '#D1D4DC';

    document.getElementById('deLineColorBtn').style.background = draftEditLineCol;
    document.getElementById('deFillColorBtn').style.background = draftEditFillCol;
    document.getElementById('deTextColorBtn').style.background = draftEditTextCol;
    document.getElementById('deFillEnabledChk').checked = d.fillEnabled !== false;

    const curW = String(d.width || 2);
    document.querySelectorAll('.de-w-btn').forEach(b => b.classList.toggle('on', b.dataset.w === curW));

    const curD = d.dash || 'solid';
    document.querySelectorAll('.de-d-btn').forEach(b => b.classList.toggle('on', b.dataset.d === curD));

    document.getElementById('deExtLeftChk').checked = !!d.extLeft;
    document.getElementById('deExtRightChk').checked = !!d.extRight;

    document.getElementById('deTextInp').value = d.text || '';
    document.getElementById('deFontSizeInp').value = String(d.fontSize || 12);
    document.getElementById('deTextVAlign').value = d.textVAlign || 'top';
    document.getElementById('deTextHAlign').value = d.textHAlign || 'center';

    const p2Row = document.getElementById('deP2Row');
    const p3Row = document.getElementById('deP3Row');
    document.getElementById('deP1Inp').value = Number(d.p1).toFixed(prec);

    if (d.type === 'long' || d.type === 'short') {
      document.getElementById('deP1Label').textContent = 'Entry Price';
      document.getElementById('deP2Label').textContent = 'Take Profit Price';
      document.getElementById('deP3Label').textContent = 'Stop Loss Price';
      p2Row.style.display = 'flex';
      p3Row.style.display = 'flex';
      document.getElementById('deP2Inp').value = Number(d.p2 ?? d.p1).toFixed(prec);
      document.getElementById('deP3Inp').value = Number(d.p3 ?? d.p1).toFixed(prec);
    } else if (['hline', 'hray', 'vline', 'crossline', 'cycliclines', 'anchoredvwap', 'pricelabel', 'arrowmark', 'arrowup', 'arrowdown', 'flag', 'text', 'anchoredtext', 'note', 'pricenote', 'callout', 'comment'].includes(d.type)) {
      document.getElementById('deP1Label').textContent = 'Price Level';
      p2Row.style.display = 'none';
      p3Row.style.display = 'none';
    } else {
      document.getElementById('deP1Label').textContent = 'Price 1';
      document.getElementById('deP2Label').textContent = 'Price 2';
      p2Row.style.display = 'flex';
      p3Row.style.display = 'none';
      document.getElementById('deP2Inp').value = Number(d.p2 ?? d.p1).toFixed(prec);
    }

    applyVisTfsToModal(d.visTfs);

    document.querySelectorAll('#drawEditTabs .stab').forEach(t => {
      t.classList.toggle('active', t.dataset.detab === initialTab);
    });
    document.querySelectorAll('.de-pane').forEach(pane => {
      const show = pane.id === 'de-' + initialTab;
      pane.style.display = show ? (initialTab === 'style' ? 'block' : 'flex') : 'none';
    });

    document.getElementById('drawingEditModal').classList.add('open');
  }

  document.getElementById('deResetDefaultBtn')?.addEventListener('click', () => {
    draftEditLineCol = '#2962FF';
    draftEditFillCol = 'rgba(41, 98, 255, 0.2)';
    draftEditTextCol = '#2962FF';
    document.getElementById('deLineColorBtn').style.background = draftEditLineCol;
    document.getElementById('deFillColorBtn').style.background = draftEditFillCol;
    document.getElementById('deTextColorBtn').style.background = draftEditTextCol;
    document.getElementById('deFillEnabledChk').checked = true;
    document.querySelectorAll('.de-w-btn').forEach(b => b.classList.toggle('on', b.dataset.w === '2'));
    document.querySelectorAll('.de-d-btn').forEach(b => b.classList.toggle('on', b.dataset.d === 'solid'));
    document.getElementById('deExtLeftChk').checked = false;
    document.getElementById('deExtRightChk').checked = false;
    document.getElementById('deTextInp').value = '';
    document.getElementById('deFontSizeInp').value = '12';
    document.getElementById('deTextVAlign').value = 'top';
    document.getElementById('deTextHAlign').value = 'center';
    applyVisTfsToModal('all');
    showToast('Reset to Default');
  });

  document.getElementById('deLineColorBtn').onclick = (e) => {
    e.stopPropagation();
    openColorPalette(e.currentTarget, draftEditLineCol, (rgba) => { draftEditLineCol = rgba; });
  };
  document.getElementById('deFillColorBtn').onclick = (e) => {
    e.stopPropagation();
    openColorPalette(e.currentTarget, draftEditFillCol, (rgba) => { draftEditFillCol = rgba; });
  };
  document.getElementById('deTextColorBtn').onclick = (e) => {
    e.stopPropagation();
    openColorPalette(e.currentTarget, draftEditTextCol, (rgba) => { draftEditTextCol = rgba; });
  };

  document.getElementById('visCurrentTfOnlyBtn').onclick = () => {
    const p = activePane();
    const curKey = Number(p.tf) < 60 ? 'sec' : String(p.tf);
    document.getElementById('visCurrentTfOnlyBtn').classList.add('on');
    document.getElementById('visAllTfsBtn').classList.remove('on');
    document.querySelectorAll('#visCheckboxesGrid input[data-vistf]').forEach(chk => {
      chk.checked = chk.dataset.vistf === curKey;
    });
  };

  document.getElementById('visAllTfsBtn').onclick = () => {
    document.getElementById('visAllTfsBtn').classList.add('on');
    document.getElementById('visCurrentTfOnlyBtn').classList.remove('on');
    document.querySelectorAll('#visCheckboxesGrid input[data-vistf]').forEach(chk => {
      chk.checked = true;
    });
  };

  const deTemplateDropdown = document.getElementById('deTemplateDropdown');

  function renderDeTemplateMenu() {
    const p = activePane();
    const d = p.drawings.find(x => x.id === p.selectedDrawingId);
    if (!d) return;

    const toolCat = TVStore.getToolCategory(d.type);
    const catTemplates = TVStore.getTemplatesForTool(d.type);
    const names = Object.keys(catTemplates);

    let html = `
      <button type="button" class="tpl-menu-item" id="deSaveTplAsBtn" style="color:var(--tv-blue);font-weight:700;">+ Save as Template...</button>
      <div class="pop-divider"></div>
    `;

    if (!names.length) {
      html += `<div style="padding:6px 9px;font-size:11px;color:var(--text-muted);">No saved templates yet</div>`;
    } else {
      html += names.map(name => `
        <div class="tpl-menu-item" data-load-dtpl="${name}">
          <span>${name}</span>
          <span data-del-dtpl="${name}" style="color:var(--bear);padding:0 4px;">✕</span>
        </div>`).join('');
    }

    deTemplateDropdown.innerHTML = html;

    document.getElementById('deSaveTplAsBtn').onclick = (e) => {
      e.stopPropagation();
      const suggested = document.getElementById('deTextInp').value.trim() || `${toolCat.toUpperCase()} Template`;
      const name = prompt(`Save ${toolCat} template as:`, suggested);
      if (!name || !name.trim()) return;

      const cleanName = name.trim();
      const wBtn = document.querySelector('.de-w-btn.on');
      const dBtn = document.querySelector('.de-d-btn.on');

      TVStore.drawTemplates[cleanName] = {
        category: toolCat,
        color: draftEditLineCol,
        fillColor: draftEditFillCol,
        fillEnabled: document.getElementById('deFillEnabledChk').checked,
        width: wBtn ? Number(wBtn.dataset.w) : 2,
        dash: dBtn ? dBtn.dataset.d : 'solid',
        text: document.getElementById('deTextInp').value.trim(),
        textColor: draftEditTextCol,
        fontSize: Number(document.getElementById('deFontSizeInp').value) || 12,
        textVAlign: document.getElementById('deTextVAlign').value,
        textHAlign: document.getElementById('deTextHAlign').value,
        extLeft: document.getElementById('deExtLeftChk').checked,
        extRight: document.getElementById('deExtRightChk').checked,
        visTfs: getSelectedVisTfsFromModal()
      };
      TVStore.saveDrawTemplates();
      updateMenuProfileStats();
      deTemplateDropdown.classList.remove('open');
      showToast(`Saved "${cleanName}"`);
    };

    deTemplateDropdown.querySelectorAll('[data-del-dtpl]').forEach(delBtn => {
      delBtn.onclick = (e) => {
        e.stopPropagation();
        const targetName = delBtn.dataset.delDtpl;
        delete TVStore.drawTemplates[targetName];
        TVStore.saveDrawTemplates();
        updateMenuProfileStats();
        renderDeTemplateMenu();
      };
    });

    deTemplateDropdown.querySelectorAll('[data-load-dtpl]').forEach(row => {
      row.onclick = (e) => {
        e.stopPropagation();
        const tplName = row.dataset.loadDtpl;
        const tpl = catTemplates[tplName];
        if (!tpl) return;

        draftEditLineCol = tpl.color || draftEditLineCol;
        draftEditFillCol = tpl.fillColor || draftEditFillCol;
        draftEditTextCol = tpl.textColor || tpl.color || draftEditTextCol;

        document.getElementById('deLineColorBtn').style.background = draftEditLineCol;
        document.getElementById('deFillColorBtn').style.background = draftEditFillCol;
        document.getElementById('deTextColorBtn').style.background = draftEditTextCol;
        document.getElementById('deFillEnabledChk').checked = tpl.fillEnabled !== false;

        document.querySelectorAll('.de-w-btn').forEach(b => b.classList.toggle('on', b.dataset.w === String(tpl.width || 2)));
        document.querySelectorAll('.de-d-btn').forEach(b => b.classList.toggle('on', b.dataset.d === (tpl.dash || 'solid')));

        document.getElementById('deTextInp').value = tpl.text !== undefined ? tpl.text : '';
        document.getElementById('deFontSizeInp').value = String(tpl.fontSize || 12);
        document.getElementById('deTextVAlign').value = tpl.textVAlign || 'top';
        document.getElementById('deTextHAlign').value = tpl.textHAlign || 'center';
        document.getElementById('deExtLeftChk').checked = !!tpl.extLeft;
        document.getElementById('deExtRightChk').checked = !!tpl.extRight;
        applyVisTfsToModal(tpl.visTfs);

        deTemplateDropdown.classList.remove('open');
      };
    });
  }

  document.getElementById('deTemplateMenuBtn').onclick = (e) => {
    e.stopPropagation();
    const wasOpen = deTemplateDropdown.classList.contains('open');
    deTemplateDropdown.classList.remove('open');
    if (!wasOpen) {
      renderDeTemplateMenu();
      deTemplateDropdown.classList.add('open');
    }
  };

  document.querySelectorAll('#drawEditTabs .stab').forEach(tab => {
    tab.onclick = () => {
      const target = tab.dataset.detab;
      document.querySelectorAll('#drawEditTabs .stab').forEach(t => t.classList.toggle('active', t === tab));
      document.querySelectorAll('.de-pane').forEach(pane => {
        pane.style.display = pane.id === 'de-' + target ? (target === 'style' ? 'block' : 'flex') : 'none';
      });
    };
  });

  document.querySelectorAll('.de-w-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.de-w-btn').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
    };
  });

  document.querySelectorAll('.de-d-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.de-d-btn').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
    };
  });

  document.getElementById('applyDrawEditBtn').onclick = () => {
    const p = activePane();
    const d = p.drawings.find(x => x.id === p.selectedDrawingId);
    if (!d) return;

    p.pushHistory();
    d.color = draftEditLineCol;
    d.fillColor = draftEditFillCol;
    d.fillEnabled = document.getElementById('deFillEnabledChk').checked;
    d.textColor = draftEditTextCol;

    const wBtn = document.querySelector('.de-w-btn.on');
    if (wBtn) d.width = Number(wBtn.dataset.w);

    const dBtn = document.querySelector('.de-d-btn.on');
    if (dBtn) d.dash = dBtn.dataset.d;

    d.extLeft = document.getElementById('deExtLeftChk').checked;
    d.extRight = document.getElementById('deExtRightChk').checked;

    d.text = document.getElementById('deTextInp').value.trim();
    d.fontSize = Number(document.getElementById('deFontSizeInp').value) || 12;
    d.textVAlign = document.getElementById('deTextVAlign').value;
    d.textHAlign = document.getElementById('deTextHAlign').value;

    const p1Val = Number(document.getElementById('deP1Inp').value);
    if (!isNaN(p1Val)) d.p1 = p1Val;

    if (document.getElementById('deP2Row').style.display !== 'none') {
      const p2Val = Number(document.getElementById('deP2Inp').value);
      if (!isNaN(p2Val)) d.p2 = p2Val;
    }
    if (document.getElementById('deP3Row').style.display !== 'none') {
      const p3Val = Number(document.getElementById('deP3Inp').value);
      if (!isNaN(p3Val)) d.p3 = p3Val;
    }

    d.visTfs = getSelectedVisTfsFromModal();

    updateObjectEditBar();
    p.saveDrawings();
    p.draw();
    closeAllPopovers();
    document.getElementById('drawingEditModal').classList.remove('open');
  };

  /* --------------------------------------------------------------------------
     13. TOGGLEABLE ANALYSIS HUB DRAWER (OPEN & CLOSE ON 3-DOTS RE-TAP)
     -------------------------------------------------------------------------- */
  const slidingHubDrawer = document.getElementById('slidingHubDrawer');
  const slidingHubBackdrop = document.getElementById('slidingHubBackdrop');
  const cabMoreBtn = document.getElementById('cabMoreBtn');

  function openSlidingHub() {
    closeAllPopovers();
    slidingHubBackdrop.classList.add('open');
    slidingHubDrawer.classList.add('open');
    cabMoreBtn?.classList.add('active');
  }

  function closeSlidingHub() {
    slidingHubBackdrop.classList.remove('open');
    slidingHubDrawer.classList.remove('open');
    cabMoreBtn?.classList.remove('active');
  }

  function toggleSlidingHub(e) {
    if (e) e.stopPropagation();
    if (slidingHubDrawer.classList.contains('open')) {
      closeSlidingHub();
    } else {
      openSlidingHub();
    }
  }

  cabMoreBtn.onclick = toggleSlidingHub;
  document.getElementById('closeSlidingHubBtn').onclick = closeSlidingHub;
  slidingHubBackdrop.onclick = closeSlidingHub;

  function setGridLayout(gridType) {
    TVStore.layoutGrid = gridType;
    const wrap = document.getElementById('panesWrap');
    wrap.className = 'panes-wrap grid-' + gridType;

    document.querySelectorAll('#slidingHubDrawer .hub-card[data-grid]').forEach(b => {
      b.classList.toggle('active', b.dataset.grid === gridType);
    });

    const visibleCount = gridType === '1x1' ? 1 : (gridType === '2x2' ? 4 : 2);
    panes.forEach((p, idx) => {
      const show = idx < visibleCount;
      p.el.classList.toggle('hidden', !show);
      if (show && !p.fullData.length) p.startFeed();
    });
    if (TVStore.selectedPaneIdx >= visibleCount) selectPane(0);
    setTimeout(() => panes.forEach(p => p.resize()), 40);
  }

  document.querySelectorAll('#slidingHubDrawer .hub-card[data-grid]').forEach(btn => {
    btn.onclick = () => {
      setGridLayout(btn.dataset.grid);
      closeSlidingHub();
      showToast(`Layout: ${btn.dataset.grid}`);
    };
  });

  document.getElementById('hubReplayBtn').onclick = () => {
    closeSlidingHub();
    activePane().replayWaitingPick = true;
    showToast('Tap any candle on the chart to start Bar Replay', 3200);
  };
  document.getElementById('hubAlertBtn').onclick = () => {
    closeSlidingHub();
    openAlertModal();
  };
  document.getElementById('hubSettingsBtn').onclick = () => {
    closeSlidingHub();
    openSymbolSettingsModal();
  };
  document.getElementById('hubCompareBtn').onclick = () => {
    closeSlidingHub();
    openSymbolModal('compare');
  };
  document.getElementById('hubAutoFitBtn').onclick = () => {
    closeSlidingHub();
    const p = activePane();
    p.autoScale = true;
    p.draw();
    showToast('Chart scale reset');
  };
  document.getElementById('hubJumpLiveBtn').onclick = () => {
    closeSlidingHub();
    const p = activePane();
    p.scrollOffset = 6;
    p.autoScale = true;
    p.draw();
  };
  document.getElementById('hubTemplatesBtn').onclick = () => {
    closeSlidingHub();
    renderSavedLayouts();
    document.getElementById('layoutModal').classList.add('open');
  };
  document.getElementById('hubCsvBtn').onclick = () => {
    closeSlidingHub();
    exportPaneToCSV(activePane());
    showToast('Exported CSV');
  };

  document.getElementById('syncCrosshairChk').onchange = (e) => { TVStore.syncCrosshair = e.target.checked; };
  document.getElementById('syncSymbolChk').onchange = (e) => {
    TVStore.syncSymbol = e.target.checked;
    if (TVStore.syncSymbol) switchSymbol(activePane().sym);
  };
  document.getElementById('syncTfChk').onchange = (e) => {
    TVStore.syncTf = e.target.checked;
    if (TVStore.syncTf) switchTimeframe(activePane().tf);
  };

  function renderChartTypeSheet() {
    const grid = document.getElementById('chartTypeGrid');
    const curStyle = activePane().chartStyle;
    grid.innerHTML = `<div class="chart-type-grid">` + TVStore.chartTypesCatalog.map(ct => `
      <button type="button" class="tool-card ${ct.id === curStyle ? 'active' : ''}" data-pick-ctype="${ct.id}">
        ${ct.svg}
        <span>${ct.name}</span>
      </button>`).join('') + `</div>`;

    grid.querySelectorAll('[data-pick-ctype]').forEach(btn => {
      btn.onclick = () => {
        const p = activePane();
        p.chartStyle = btn.dataset.pickCtype;
        p.recompute();
        p.draw();
        document.getElementById('chartTypeSheet').classList.remove('open');
      };
    });
  }

  document.getElementById('cabChartTypeBtn').onclick = () => {
    closeAllPopovers();
    renderChartTypeSheet();
    document.getElementById('chartTypeSheet').classList.add('open');
  };

  function selectPane(idx) {
    TVStore.selectedPaneIdx = idx;
    panes.forEach((p, i) => p.el.classList.toggle('selected', i === idx));

    const p = activePane();
    const meta = TVStore.getSymMeta(p.sym);

    document.getElementById('topSymDot').textContent = meta.badge;
    document.getElementById('topSymDot').style.background = meta.badgeCol;
    document.getElementById('topSymDesc').textContent = meta.desc;

    updateMiniWheelLabels();
    document.getElementById('pctScaleBtn')?.classList.toggle('on', p.pctScale);
    document.getElementById('logScaleBtn')?.classList.toggle('on', p.logScale);
    document.getElementById('autoScaleFooterBtn')?.classList.toggle('on', p.autoScale);

    updateObjectEditBar();
    renderWatchlist();
    renderAlertsPanel();
    renderObjectTree();
    updateSymbolDetailsCard();
  }

  function switchSymbol(sym) {
    const targets = TVStore.syncSymbol
      ? panes.filter(p => !p.el.classList.contains('hidden'))
      : [activePane()];

    targets.forEach(p => {
      p.sym = sym;
      p.startFeed();
    });
    selectPane(TVStore.selectedPaneIdx);
  }

  function switchTimeframe(tfSec) {
    const tfStr = String(tfSec);
    const targets = TVStore.syncTf
      ? panes.filter(p => !p.el.classList.contains('hidden'))
      : [activePane()];

    targets.forEach(p => {
      p.tf = tfStr;
      p.startFeed();
    });
    updateMiniWheelLabels();
  }

  document.getElementById('topSymTitleBtn').onclick = () => openSymbolModal('switch');
  document.getElementById('undoBtn').onclick = () => { if (activePane().undo()) showToast('Undo'); };
  document.getElementById('redoBtn').onclick = () => { if (activePane().redo()) showToast('Redo'); };
  document.getElementById('screenshotBtn').onclick = () => {
    const p = activePane();
    const link = document.createElement('a');
    link.download = `NoxAlgo_${p.sym}_${TVStore.getTfLabel(p.tf)}_${Date.now()}.png`;
    link.href = p.canvas.toDataURL('image/png');
    link.click();
    showToast('Chart snapshot saved');
  };

  const quickTradeFloat = document.getElementById('quickTradeFloat');
  document.getElementById('toggleQuickTradeBtn').onclick = (e) => {
    const shown = quickTradeFloat.classList.toggle('show');
    e.currentTarget.classList.toggle('active', shown);
  };
  document.getElementById('closeQuickTradeBtn').onclick = () => {
    quickTradeFloat.classList.remove('show');
    document.getElementById('toggleQuickTradeBtn').classList.remove('active');
  };

  function placeQuickMarketOrder(side) {
    const p = activePane();
    const meta = TVStore.getSymMeta(p.sym);
    const px = p.lastBid != null ? p.disp(p.lastBid) : (TVStore.quotes[p.sym]?.last || meta.base || 100);
    const lot = Math.max(0.01, Number(document.getElementById('qtFloatLotInp').value) || 0.01);
    TradingEngine.placeOrder(p.sym, side, 'MARKET', lot, px, null, null);
    p.draw();
    renderTradingView();
    showToast(`${side} ${lot} ${p.sym} @ ${px.toFixed(meta.prec)}`);
  }
  document.getElementById('qtFloatBuyBtn').onclick = () => placeQuickMarketOrder('BUY');
  document.getElementById('qtFloatSellBtn').onclick = () => placeQuickMarketOrder('SELL');

  document.querySelectorAll('.legend-collapse-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const det = document.getElementById('legDetails' + btn.dataset.collapse);
      if (det) {
        const collapsed = det.classList.toggle('collapsed');
        btn.textContent = collapsed ? '▾' : '▴';
      }
    };
  });

  document.getElementById('legendIndChip0').onclick = () => openIndicatorsModal();
  document.getElementById('cabIndicatorsBtn').onclick = () => openIndicatorsModal();

  function switchBottomNav(viewName) {
    document.querySelectorAll('.bnav-btn').forEach(b => {
      const isMenuTab = b.dataset.nav === 'menu' && (viewName === 'menu' || viewName === 'settings');
      b.classList.toggle('active', b.dataset.nav === viewName || isMenuTab);
    });
    document.querySelectorAll('.main-view').forEach(v => {
      v.classList.toggle('active', v.id === 'view-' + viewName);
    });

    if (viewName === 'chart') {
      setTimeout(() => panes.forEach(p => p.resize()), 30);
    } else if (viewName === 'watchlist') {
      renderWatchlist();
      updateSymbolDetailsCard();
    } else if (viewName === 'alerts') {
      renderAlertsPanel();
      renderObjectTree();
    } else if (viewName === 'trading') {
      renderTradingView();
    } else if (viewName === 'menu' || viewName === 'settings') {
      updateSyncStatusUI('Verified');
    }
  }

  document.querySelectorAll('.bnav-btn').forEach(btn => {
    btn.onclick = () => switchBottomNav(btn.dataset.nav);
  });

  /* --------------------------------------------------------------------------
     14. WATCHLIST, ALERTS, OBJECT TREE, CLEAN PAPER TRADING & SCALE CONTROLS
     -------------------------------------------------------------------------- */
  function renderWatchlist() {
    const container = document.getElementById('watchlistContainer');
    if (!container) return;
    const filter = (document.getElementById('wlSearchInput')?.value || '').trim().toUpperCase();
    const curSym = activePane().sym;

    const items = TVStore.watchlist
      .map(s => TVStore.getSymMeta(s))
      .filter(m => !filter || m.sym.includes(filter) || m.desc.toUpperCase().includes(filter));

    const cats = [...new Set(items.map(m => m.cat))];
    let html = '';
    cats.forEach(cat => {
      html += `<div class="wl-cat">${cat}</div>`;
      items.filter(m => m.cat === cat).forEach(m => {
        const q = TVStore.quotes[m.sym] || { last: m.base || m.synthBase || 100, open: m.base || m.synthBase || 100 };
        const chg = q.last - q.open;
        const pct = (chg / (q.open || 1)) * 100;
        const col = chg >= 0 ? 'var(--bull)' : 'var(--bear)';

        html += `
          <div class="wl-row ${m.sym === curSym ? 'active' : ''}" data-wl-sym="${m.sym}">
            <div>
              <div class="wl-sym">${m.sym}</div>
              <div class="wl-desc">${m.desc}</div>
            </div>
            <div class="num" style="text-align:right;font-weight:700;">${q.last.toFixed(m.prec)}</div>
            <div class="num" style="text-align:right;color:${col};font-size:11px;">
              ${chg >= 0 ? '+' : ''}${chg.toFixed(m.prec)}<br>${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%
            </div>
            <button type="button" class="wl-del" data-wl-del="${m.sym}">✕</button>
          </div>`;
      });
    });

    container.innerHTML = html;

    container.querySelectorAll('[data-wl-sym]').forEach(row => {
      row.onclick = (e) => {
        if (e.target.closest('[data-wl-del]')) return;
        switchSymbol(row.dataset.wlSym);
        switchBottomNav('chart');
      };
    });

    container.querySelectorAll('[data-wl-del]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        TVStore.watchlist = TVStore.watchlist.filter(x => x !== btn.dataset.wlDel);
        TVStore.saveWatchlist();
        renderWatchlist();
        updateMiniWheelLabels();
      };
    });
  }

  document.getElementById('wlSearchInput').oninput = renderWatchlist;
  document.getElementById('wlAddSymBtn').onclick = () => openSymbolModal('watchlist');

  function updateSymbolDetailsCard() {
    const p = activePane();
    const meta = TVStore.getSymMeta(p.sym);
    const q = TVStore.quotes[p.sym] || { last: meta.base || meta.synthBase || 100, low: meta.low52, high: meta.high52 };

    document.getElementById('sdSymbol').textContent = p.sym;
    document.getElementById('sdDesc').textContent = `${meta.desc} · ${meta.cat}`;
    document.getElementById('sdMarketStatus').textContent = meta.status;
    document.getElementById('sdDayLow').textContent = q.low.toFixed(meta.prec);
    document.getElementById('sdDayHigh').textContent = q.high.toFixed(meta.prec);
    document.getElementById('sdDayFill').style.width = Math.max(4, Math.min(96, ((q.last - q.low) / ((q.high - q.low) || 1)) * 100)) + '%';

    document.getElementById('sd52Low').textContent = meta.low52.toFixed(meta.prec);
    document.getElementById('sd52High').textContent = meta.high52.toFixed(meta.prec);
    document.getElementById('sd52Fill').style.width = Math.max(4, Math.min(96, ((q.last - meta.low52) / ((meta.high52 - meta.low52) || 1)) * 100)) + '%';
  }

  let editingAlertId = null;

  function openAlertModal(defaultPrice = null, editId = null) {
    const p = activePane();
    const meta = TVStore.getSymMeta(p.sym);
    editingAlertId = editId;

    if (editId) {
      const al = p.alerts.find(a => a.id === editId);
      if (al) {
        document.getElementById('alertModalTitle').textContent = `Edit Alert (${p.sym})`;
        document.getElementById('alertConditionSel').value = al.condition || 'crossing';
        document.getElementById('alertPriceInput').value = al.price.toFixed(meta.prec);
        document.getElementById('alertMsgInput').value = al.msg || '';
      }
    } else {
      const px = defaultPrice != null ? defaultPrice : (p.lastBid != null ? p.disp(p.lastBid) : (meta.base || 100));
      document.getElementById('alertModalTitle').textContent = `Create Alert (${p.sym})`;
      document.getElementById('alertConditionSel').value = 'crossing';
      document.getElementById('alertPriceInput').value = Number(px).toFixed(meta.prec);
      document.getElementById('alertMsgInput').value = '';
    }
    document.getElementById('alertModal').classList.add('open');
  }

  document.getElementById('viewAddAlertBtn').onclick = () => openAlertModal();

  document.getElementById('saveAlertModalBtn').onclick = () => {
    const p = activePane();
    const cond = document.getElementById('alertConditionSel').value;
    const price = Number(document.getElementById('alertPriceInput').value);
    const msg = document.getElementById('alertMsgInput').value.trim();
    if (isNaN(price) || price <= 0) return;

    if (editingAlertId) {
      const al = p.alerts.find(a => a.id === editingAlertId);
      if (al) { al.condition = cond; al.price = price; al.msg = msg; al.active = true; }
    } else {
      p.alerts.push({ id: 'al_' + Date.now(), condition: cond, price, msg, active: true });
    }
    editingAlertId = null;
    p.saveAlerts();
    p.draw();
    updateMenuProfileStats();
    document.getElementById('alertModal').classList.remove('open');
    showToast(`Alert saved @ ${price}`);
  };

  function renderAlertsPanel() {
    const p = activePane();
    const meta = TVStore.getSymMeta(p.sym);
    const box = document.getElementById('alertsListContainer');
    if (!box) return;

    if (!p.alerts.length) {
      box.innerHTML = `<div style="padding:14px;color:var(--text-muted);text-align:center;">No active alerts on ${p.sym}.</div>`;
      return;
    }

    box.innerHTML = p.alerts.map(al => `
      <div class="modal-item">
        <div>
          <div style="font-weight:700;" class="num">${p.sym} · ${al.price.toFixed(meta.prec)}</div>
          <div style="font-size:10px;color:${al.active ? 'var(--bull)' : 'var(--text-muted)'};">
            ${al.active ? `● Active (${al.condition || 'crossing'})` : `Triggered ${al.triggeredAt || ''}`}
          </div>
        </div>
        <div style="display:flex;gap:4px;">
          <button type="button" class="obj-btn" data-al-tog="${al.id}">${al.active ? 'Pause' : 'Resume'}</button>
          <button type="button" class="obj-btn" data-al-ed="${al.id}">Edit</button>
          <button type="button" class="obj-btn" data-al-del="${al.id}" style="color:var(--bear);">✕</button>
        </div>
      </div>`).join('');

    box.querySelectorAll('[data-al-tog]').forEach(b => {
      b.onclick = () => {
        const al = p.alerts.find(x => x.id === b.dataset.alTog);
        if (al) { al.active = !al.active; p.saveAlerts(); p.draw(); }
      };
    });
    box.querySelectorAll('[data-al-ed]').forEach(b => {
      b.onclick = () => openAlertModal(null, b.dataset.alEd);
    });
    box.querySelectorAll('[data-al-del]').forEach(b => {
      b.onclick = () => {
        p.alerts = p.alerts.filter(x => x.id !== b.dataset.alDel);
        p.saveAlerts();
        p.draw();
        updateMenuProfileStats();
      };
    });
  }

  function renderObjectTree() {
    const p = activePane();
    const box = document.getElementById('objectTreeContainer');
    if (!box) return;

    if (!p.drawings.length) {
      box.innerHTML = `<div style="padding:14px;color:var(--text-muted);text-align:center;">No drawings on ${p.sym}.</div>`;
      return;
    }

    box.innerHTML = p.drawings.slice().reverse().map(d => {
      const tfTag = !d.visTfs || d.visTfs === 'all' ? 'All TFs' : d.visTfs.map(t => TVStore.getTfLabel(t)).join(',');
      return `
        <div class="modal-item">
          <div>
            <div style="font-weight:600;text-transform:uppercase;">${d.type} ${d.text ? `· ${d.text}` : ''}</div>
            <div style="font-size:10px;color:var(--text-muted);">Visible: ${tfTag}</div>
          </div>
          <div style="display:flex;gap:4px;">
            <button type="button" class="obj-btn" data-ot-edit="${d.id}">⚙</button>
            <button type="button" class="obj-btn" data-ot-eye="${d.id}">${d.hidden ? 'Show' : 'Hide'}</button>
            <button type="button" class="obj-btn" data-ot-del="${d.id}" style="color:var(--bear);">✕</button>
          </div>
        </div>`;
    }).join('');

    box.querySelectorAll('[data-ot-edit]').forEach(b => {
      b.onclick = () => {
        p.selectedDrawingId = b.dataset.otEdit;
        updateObjectEditBar();
        switchBottomNav('chart');
        openDrawingEditModal('style');
      };
    });
    box.querySelectorAll('[data-ot-eye]').forEach(b => {
      b.onclick = () => {
        const d = p.drawings.find(x => x.id === b.dataset.otEye);
        if (d) { d.hidden = !d.hidden; p.saveDrawings(); p.draw(); }
      };
    });
    box.querySelectorAll('[data-ot-del]').forEach(b => {
      b.onclick = () => {
        p.pushHistory();
        p.drawings = p.drawings.filter(x => x.id !== b.dataset.otDel);
        if (p.selectedDrawingId === b.dataset.otDel) p.selectedDrawingId = null;
        updateObjectEditBar();
        p.saveDrawings();
        p.draw();
      };
    });
  }

  function renderTradingView() {
    const body = document.getElementById('tradingViewBody');
    if (!body) return;

    const p = activePane();
    const meta = TVStore.getSymMeta(p.sym);
    const curMarketPx = p.lastBid != null ? p.disp(p.lastBid) : (TVStore.quotes[p.sym]?.last || meta.base || 100);

    let floatingPnL = 0;
    const openRows = TVStore.paper.positions.map(pos => {
      const px = TVStore.quotes[pos.sym]?.last || pos.entry;
      const posPrec = TVStore.getSymMeta(pos.sym).prec;
      const pnl = TradingEngine.calcUnrealizedPnL(pos, px);
      floatingPnL += pnl;
      const statusTag = pos.status === 'PENDING' ? ' (LIMIT)' : '';
      return `<tr>
        <td><strong>${pos.sym}</strong>${statusTag}</td>
        <td style="color:${pos.side === 'BUY' ? 'var(--bull)' : 'var(--bear)'};font-weight:700;">${pos.side}</td>
        <td class="num">${pos.lot}</td>
        <td class="num">${pos.entry.toFixed(posPrec)}</td>
        <td class="num" style="color:${pnl >= 0 ? 'var(--bull)' : 'var(--bear)'};font-weight:700;">${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}</td>
        <td><button type="button" class="obj-btn" data-close-ord="${pos.id}">Close</button></td>
      </tr>`;
    }).join('');

    const historyRows = (TVStore.paper.history || []).slice(0, 15).map(h => `
      <tr>
        <td><strong>${h.sym}</strong></td>
        <td style="color:${h.side === 'BUY' ? 'var(--bull)' : 'var(--bear)'};font-weight:700;">${h.side}</td>
        <td class="num">${h.lot}</td>
        <td class="num" style="color:${h.pnl >= 0 ? 'var(--bull)' : 'var(--bear)'};font-weight:700;">${h.pnl >= 0 ? '+' : ''}$${h.pnl.toFixed(2)}</td>
      </tr>
    `).join('');

    let backtesterHTML = '';
    if (showBacktesterInTrading) {
      if (!p.ind.ema1 && p.data.length) {
        p.ind.ema1 = QuantEngine.calcEMA(p.data, 9);
        p.ind.ema2 = QuantEngine.calcEMA(p.data, 20);
      }
      const bt = QuantEngine.runBacktest(p.data, p.ind, meta);
      backtesterHTML = `
        <div class="settings-card" style="margin-top:8px;">
          <div class="sc-title">EMA 9/20 Simulation (${p.sym} · ${TVStore.getTfLabel(p.tf)})</div>
          <div class="stat-grid num" style="margin-bottom:0;">
            <div class="stat-card"><div class="lbl">Simulated PnL</div><div class="val" style="color:${bt.netProfit >= 0 ? 'var(--bull)' : 'var(--bear)'};">${bt.netProfit >= 0 ? '+' : ''}$${bt.netProfit.toFixed(2)}</div></div>
            <div class="stat-card"><div class="lbl">Sim Signals</div><div class="val">${bt.totalTrades}</div></div>
            <div class="stat-card"><div class="lbl">Win Rate</div><div class="val">${bt.winRate.toFixed(1)}%</div></div>
            <div class="stat-card"><div class="lbl">Profit Factor</div><div class="val">${bt.profitFactor.toFixed(2)}</div></div>
          </div>
        </div>`;
    }

    body.innerHTML = `
      <div class="stat-grid num">
        <div class="stat-card"><div class="lbl">Demo Balance</div><div class="val">$${TVStore.paper.balance.toFixed(2)}</div></div>
        <div class="stat-card"><div class="lbl">Equity</div><div class="val">$${(TVStore.paper.balance + floatingPnL).toFixed(2)}</div></div>
        <div class="stat-card"><div class="lbl">Unrealized PnL</div><div class="val" style="color:${floatingPnL >= 0 ? 'var(--bull)' : 'var(--bear)'};">${floatingPnL >= 0 ? '+' : ''}$${floatingPnL.toFixed(2)}</div></div>
        <div class="stat-card"><div class="lbl">My Open Trades</div><div class="val">${TVStore.paper.positions.length}</div></div>
      </div>

      <div class="order-ticket">
        <select id="ordTypeSel" class="ticket-inp">
          <option value="MARKET">Market</option>
          <option value="LIMIT">Limit</option>
        </select>
        <input type="number" id="ordLotInp" class="ticket-inp num" value="0.01" step="0.01" min="0.01" placeholder="Lots" />
        <input type="number" id="ordLimitPxInp" class="ticket-inp num" step="any" placeholder="Limit Px" style="display:none;" />
        <input type="number" id="ordSlInp" class="ticket-inp num" step="any" placeholder="SL Price" />
        <input type="number" id="ordTpInp" class="ticket-inp num" step="any" placeholder="TP Price" />
        <button type="button" class="btn-buy" id="execBuyBtn">BUY ${curMarketPx.toFixed(meta.prec)}</button>
        <button type="button" class="btn-sell" id="execSellBtn">SELL ${curMarketPx.toFixed(meta.prec)}</button>
        <button type="button" class="obj-btn" id="resetDemoBtn">Reset $10k</button>
      </div>

      <div class="settings-card" style="margin-bottom:10px;">
        <div class="sc-title">Open Positions (${TVStore.paper.positions.length})</div>
        ${TVStore.paper.positions.length ? `
          <table class="tv-table">
            <thead><tr><th>Symbol</th><th>Side</th><th>Lots</th><th>Entry</th><th>PnL</th><th>Action</th></tr></thead>
            <tbody>${openRows}</tbody>
          </table>` : `<div style="color:var(--text-muted);font-size:11px;padding:6px 0;">No open trades yet. Tap BUY or SELL above to place a trade.</div>`}
      </div>

      ${historyRows ? `
        <div class="settings-card" style="margin-bottom:10px;">
          <div class="sc-title">My Closed Trades (${TVStore.paper.history.length})</div>
          <table class="tv-table">
            <thead><tr><th>Symbol</th><th>Side</th><th>Lots</th><th>Realized PnL</th></tr></thead>
            <tbody>${historyRows}</tbody>
          </table>
        </div>` : ''}

      <button type="button" class="obj-btn" id="toggleBacktesterBtn" style="width:100%;padding:8px;text-align:center;">
        ${showBacktesterInTrading ? '▴ Hide Strategy Simulator' : '▾ Show EMA Strategy Simulator'}
      </button>
      ${backtesterHTML}
    `;

    const typeSel = document.getElementById('ordTypeSel');
    const limInp = document.getElementById('ordLimitPxInp');
    typeSel.onchange = () => {
      limInp.style.display = typeSel.value === 'LIMIT' ? 'inline-block' : 'none';
      if (typeSel.value === 'LIMIT' && !limInp.value) limInp.value = curMarketPx.toFixed(meta.prec);
    };

    const submit = (side) => {
      const oType = typeSel.value;
      const lot = Number(document.getElementById('ordLotInp').value) || 0.01;
      const entryPx = oType === 'LIMIT' ? (Number(limInp.value) || curMarketPx) : curMarketPx;
      const sl = Number(document.getElementById('ordSlInp').value) || null;
      const tp = Number(document.getElementById('ordTpInp').value) || null;
      TradingEngine.placeOrder(p.sym, side, oType, lot, entryPx, sl, tp);
      p.draw();
      renderTradingView();
      showToast(`${side} ${lot} ${p.sym} placed`);
    };

    document.getElementById('execBuyBtn').onclick = () => submit('BUY');
    document.getElementById('execSellBtn').onclick = () => submit('SELL');
    document.getElementById('resetDemoBtn').onclick = () => {
      TVStore.paper = { balance: 10000.00, positions: [], history: [] };
      TVStore.savePaper();
      p.draw();
      renderTradingView();
      showToast('Demo balance reset to $10,000');
    };

    document.getElementById('toggleBacktesterBtn').onclick = () => {
      showBacktesterInTrading = !showBacktesterInTrading;
      renderTradingView();
    };

    body.querySelectorAll('[data-close-ord]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.closeOrd;
        const pos = TVStore.paper.positions.find(x => x.id === id);
        const closePx = pos ? (TVStore.quotes[pos.sym]?.last || pos.entry) : curMarketPx;
        TradingEngine.closeOrder(id, closePx);
        p.draw();
        renderTradingView();
        showToast('Position closed');
      };
    });
  }

  document.getElementById('tzSelect').onchange = (e) => {
    TVStore.tzOffsetSec = Number(e.target.value);
    panes.forEach(p => p.draw());
  };
  document.getElementById('pctScaleBtn').onclick = (e) => {
    const p = activePane();
    p.pctScale = !p.pctScale;
    e.currentTarget.classList.toggle('on', p.pctScale);
    p.draw();
  };
  document.getElementById('logScaleBtn').onclick = (e) => {
    const p = activePane();
    p.logScale = !p.logScale;
    e.currentTarget.classList.toggle('on', p.logScale);
    p.draw();
  };
  document.getElementById('autoScaleFooterBtn').onclick = (e) => {
    const p = activePane();
    p.autoScale = !p.autoScale;
    e.currentTarget.classList.toggle('on', p.autoScale);
    p.draw();
  };
  document.getElementById('menuTemplatesBtn').onclick = () => {
    renderSavedLayouts();
    document.getElementById('layoutModal').classList.add('open');
  };
  document.getElementById('menuExportCsvBtn').onclick = () => {
    exportPaneToCSV(activePane());
    showToast('Exported CSV');
  };

  /* --------------------------------------------------------------------------
     15. SYMBOL SEARCH & ADD CUSTOM SYMBOL MODAL
     -------------------------------------------------------------------------- */
  let symbolModalMode = 'switch';

  function openSymbolModal(mode = 'switch') {
    symbolModalMode = mode;
    document.getElementById('symModalTitle').textContent =
      mode === 'compare' ? 'Compare Overlay Symbol' : (mode === 'watchlist' ? 'Add Symbol to Watchlist' : 'Symbol Search & Add');
    const inp = document.getElementById('symSearchInput');
    inp.value = '';
    renderSymbolModalList('');
    document.getElementById('symbolModal').classList.add('open');
    setTimeout(() => inp.focus(), 50);
  }

  async function selectOrCreateSymbolFromModal(rawSym) {
    const meta = TVStore.addCustomSymbol(rawSym);
    if (!meta) return;
    const sym = meta.sym;

    document.getElementById('symbolModal').classList.remove('open');
    renderWatchlist();
    updateMiniWheelLabels();

    if (symbolModalMode === 'switch') {
      switchSymbol(sym);
      showToast(`Saved & opened ${sym}`);
    } else if (symbolModalMode === 'watchlist') {
      showToast(`${sym} added & saved to Watchlist`);
    } else if (symbolModalMode === 'compare') {
      TVStore.compareSymbol = sym;
      try {
        const bars = await DataFeed.loadHistorical(sym, Number(panes[0].tf));
        TVStore.compareCloses = bars.map(b => b.close);
      } catch (_) {
        TVStore.compareCloses = [];
      }
      panes[0].draw();
      showToast(`Overlay added: ${sym}`);
    }
  }

  function renderSymbolModalList(query) {
    const q = query.trim().toUpperCase().replace(/[^A-Z0-9._-]/g, '');
    const list = document.getElementById('symModalList');
    const allSyms = TVStore.getAllSymbols();
    const filtered = allSyms.filter(s =>
      s.sym.includes(q) || s.desc.toUpperCase().includes(q) || s.cat.toUpperCase().includes(q)
    );

    let html = '';
    if (symbolModalMode === 'compare' && TVStore.compareSymbol) {
      html += `<div class="modal-item" id="clearCompareItem" style="color:var(--bear);font-weight:700;">Remove Active Overlay (${TVStore.compareSymbol})</div>`;
    }

    if (q.length >= 2) {
      const exactExists = allSyms.some(s => s.sym === q);
      html += `
        <div class="modal-item" id="addCustomSymRow" style="background:rgba(41,98,255,0.14);border-left:3px solid var(--tv-blue);">
          <div>
            <div style="font-weight:700;color:var(--tv-blue);">+ Add & Save "${q}"</div>
            <div style="font-size:11px;color:var(--text-muted);">${exactExists ? 'Save to Watchlist & open chart' : 'Create custom symbol, save to Watchlist & Firebase'}</div>
          </div>
          <span style="font-size:11px;font-weight:700;color:var(--tv-blue);">SAVE</span>
        </div>`;
    }

    html += filtered.map(s => `
      <div class="modal-item" data-pick-sym="${s.sym}">
        <div>
          <div style="font-weight:700;">${s.sym}</div>
          <div style="font-size:11px;color:var(--text-muted);">${s.desc}</div>
        </div>
        <span style="font-size:10px;color:var(--text-muted);background:var(--bg-main);padding:2px 6px;border-radius:3px;">${s.cat}</span>
      </div>`).join('');

    list.innerHTML = html;

    document.getElementById('clearCompareItem')?.addEventListener('click', () => {
      TVStore.compareSymbol = null;
      TVStore.compareCloses = [];
      document.getElementById('symbolModal').classList.remove('open');
      panes[0].draw();
    });

    document.getElementById('addCustomSymRow')?.addEventListener('click', () => {
      selectOrCreateSymbolFromModal(q);
    });

    list.querySelectorAll('[data-pick-sym]').forEach(row => {
      row.onclick = () => selectOrCreateSymbolFromModal(row.dataset.pickSym);
    });
  }

  document.getElementById('symSearchInput').oninput = (e) => renderSymbolModalList(e.target.value);
  document.getElementById('symSearchInput').onkeydown = (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      e.preventDefault();
      selectOrCreateSymbolFromModal(e.target.value.trim());
    }
  };

  function openIndicatorsModal() {
    const inp = document.getElementById('indSearchInput');
    inp.value = '';
    renderIndicatorsModalList('');
    document.getElementById('indModal').classList.add('open');
    setTimeout(() => inp.focus(), 50);
  }

  function renderIndicatorsModalList(query) {
    const q = query.trim().toLowerCase();
    const list = document.getElementById('indModalList');
    const filtered = TVStore.indicatorCatalog.filter(item =>
      item.name.toLowerCase().includes(q) || item.desc.toLowerCase().includes(q) || item.cat.toLowerCase().includes(q)
    );

    list.innerHTML = filtered.map(item => {
      const enabled = !!TVStore.indicators[item.key]?.enabled;
      return `
        <div class="modal-item" data-toggle-ind-row="${item.key}">
          <div>
            <div style="font-weight:600;color:${enabled ? 'var(--tv-blue)' : 'var(--text-primary)'};">${item.name}</div>
            <div style="font-size:10px;color:var(--text-muted);">${item.desc} · ${item.cat}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <button type="button" class="obj-btn" data-ind-cfg="${item.key}">⚙</button>
            <input type="checkbox" ${enabled ? 'checked' : ''} style="accent-color:#2962FF;width:16px;height:16px;pointer-events:none;" />
          </div>
        </div>`;
    }).join('');

    list.querySelectorAll('[data-ind-cfg]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        editIndicatorParams(btn.dataset.indCfg);
      };
    });

    list.querySelectorAll('[data-toggle-ind-row]').forEach(row => {
      row.onclick = () => {
        const key = row.dataset.toggleIndRow;
        TVStore.indicators[key].enabled = !TVStore.indicators[key].enabled;
        TVStore.indicators[key].hidden = false;
        TVStore.saveIndicators();
        renderIndicatorsModalList(document.getElementById('indSearchInput').value);
        panes.forEach(p => { p.recompute(); p.draw(); });
      };
    });
  }

  function editIndicatorParams(indKey) {
    const meta = TVStore.indicatorCatalog.find(x => x.key === indKey);
    const cfg = TVStore.indicators[indKey];
    if (!meta || !cfg) return;
    const keys = Object.keys(cfg.params || {});
    if (!keys.length) {
      showToast(`${meta.name} uses automatic session detection`);
      return;
    }
    const inp = prompt(`Configure ${meta.name} (${keys.join(', ')}):`, keys.map(k => cfg.params[k]).join(', '));
    if (inp !== null) {
      const vals = inp.split(',').map(Number);
      if (vals.length === keys.length && vals.every(n => !isNaN(n) && n > 0)) {
        keys.forEach((k, idx) => { cfg.params[k] = vals[idx]; });
        TVStore.saveIndicators();
        panes.forEach(p => { p.recompute(); p.draw(); });
        showToast(`${meta.name} updated`);
      }
    }
  }

  document.getElementById('indSearchInput').oninput = (e) => renderIndicatorsModalList(e.target.value);

  function renderSavedLayouts() {
    const box = document.getElementById('savedLayoutsList');
    const names = Object.keys(TVStore.templates);
    if (!names.length) {
      box.innerHTML = `<div style="padding:12px;color:var(--text-muted);text-align:center;">No saved chart layouts yet.</div>`;
      return;
    }
    box.innerHTML = names.map(name => `
      <div class="modal-item">
        <span style="font-weight:600;">${name}</span>
        <div style="display:flex;gap:4px;">
          <button type="button" class="obj-btn on" data-load-tpl="${name}">Load</button>
          <button type="button" class="obj-btn" data-del-tpl="${name}" style="color:var(--bear);">✕</button>
        </div>
      </div>`).join('');

    box.querySelectorAll('[data-load-tpl]').forEach(b => {
      b.onclick = () => {
        const tpl = TVStore.templates[b.dataset.loadTpl];
        if (!tpl) return;
        TVStore.indicators = JSON.parse(JSON.stringify(tpl.indicators));
        TVStore.settings = JSON.parse(JSON.stringify(tpl.settings));
        TVStore.saveIndicators();
        TVStore.saveSettings();
        const p = activePane();
        p.drawings = JSON.parse(JSON.stringify(tpl.drawings || []));
        p.saveDrawings();
        p.recompute();
        p.draw();
        document.getElementById('layoutModal').classList.remove('open');
        showToast(`Loaded "${b.dataset.loadTpl}"`);
      };
    });

    box.querySelectorAll('[data-del-tpl]').forEach(b => {
      b.onclick = () => {
        delete TVStore.templates[b.dataset.delTpl];
        TVStore.saveTemplates();
        renderSavedLayouts();
      };
    });
  }

  document.getElementById('saveLayoutTemplateBtn').onclick = () => {
    const inp = document.getElementById('newLayoutNameInput');
    const name = inp.value.trim();
    if (!name) return;
    const p = activePane();
    TVStore.templates[name] = {
      indicators: JSON.parse(JSON.stringify(TVStore.indicators)),
      settings: JSON.parse(JSON.stringify(TVStore.settings)),
      drawings: JSON.parse(JSON.stringify(p.drawings))
    };
    TVStore.saveTemplates();
    inp.value = '';
    renderSavedLayouts();
    showToast(`Saved "${name}"`);
  };

  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.onclick = () => {
      closeAllPopovers();
      document.getElementById(btn.dataset.close).classList.remove('open');
    };
  });
  document.querySelectorAll('[data-close-sheet]').forEach(btn => {
    btn.onclick = () => document.getElementById(btn.dataset.closeSheet).classList.remove('open');
  });
  document.querySelectorAll('.modal-backdrop, .sheet-backdrop').forEach(bg => {
    bg.onclick = (e) => {
      if (e.target === bg) {
        closeAllPopovers();
        bg.classList.remove('open');
      }
    };
  });
  window.addEventListener('click', (e) => {
    if (!e.target.closest('#tvColorPalettePopover, .tv-swatch-btn, #objStrokeColorBtn, #objFillColorBtn')) {
      palettePopover.classList.remove('open');
    }
    if (!e.target.closest('#tplQuickPopover, #objQuickTplBtn, #objMoreMenuBtn')) {
      tplQuickPopover.classList.remove('open');
    }
    if (!e.target.closest('#deTemplateDropdown, #deTemplateMenuBtn')) {
      deTemplateDropdown.classList.remove('open');
    }
  });

  /* --------------------------------------------------------------------------
     16. BAR REPLAY PLAYBACK CONTROLLER
     -------------------------------------------------------------------------- */
  let replayTimer = null;
  let replaySpeed = 1;
  const repPlayBtn = document.getElementById('repPlayBtn');

  function stopReplayPlayback() {
    if (replayTimer) {
      clearInterval(replayTimer);
      replayTimer = null;
    }
    repPlayBtn.textContent = '▶ Play';
  }

  function stepReplayBar() {
    const p = activePane();
    if (!p.replayActive) return;
    if (p.replayIdx < p.fullData.length - 1) {
      p.replayIdx++;
      p.recompute();
      p.draw();
    } else {
      stopReplayPlayback();
      showToast('Replay reached live bar');
    }
  }

  repPlayBtn.onclick = () => {
    if (replayTimer) { stopReplayPlayback(); return; }
    repPlayBtn.textContent = '⏸ Pause';
    replayTimer = setInterval(stepReplayBar, Math.round(650 / replaySpeed));
  };
  document.getElementById('repStepBtn').onclick = () => { stopReplayPlayback(); stepReplayBar(); };
  document.getElementById('repSpeedBtn').onclick = (e) => {
    const speeds = [0.5, 1, 2, 5];
    replaySpeed = speeds[(speeds.indexOf(replaySpeed) + 1) % speeds.length];
    e.currentTarget.textContent = replaySpeed + 'x';
    if (replayTimer) { stopReplayPlayback(); repPlayBtn.click(); }
  };

  const exitReplay = () => {
    stopReplayPlayback();
    document.getElementById('replayBar').classList.remove('show');
    const p = activePane();
    p.replayActive = false;
    p.replayWaitingPick = false;
    p.recompute();
    p.draw();
  };
  document.getElementById('repLiveBtn').onclick = exitReplay;
  document.getElementById('repExitBtn').onclick = exitReplay;

  /* --------------------------------------------------------------------------
     17. KEYBOARD SHORTCUTS & LIVE CLOCK LOOP
     -------------------------------------------------------------------------- */
  window.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
      if (e.key === 'Escape') document.activeElement.blur();
      return;
    }
    if (e.key === 'Escape') {
      if (document.body.classList.contains('zen-fullscreen')) {
        exitFullscreen();
        return;
      }
      closeAllSheetsAndModals();
      setActiveTool('cursor');
      const p = activePane();
      p.selectedDrawingId = null;
      updateObjectEditBar();
      p.draw();
    } else if (e.altKey && e.key.toLowerCase() === 't') {
      e.preventDefault();
      setActiveTool('trend');
    } else if (e.altKey && e.key.toLowerCase() === 'h') {
      e.preventDefault();
      setActiveTool('hline');
    } else if (e.altKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      setActiveTool('fib');
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      activePane().undo();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      activePane().redo();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (activePane().selectedDrawingId) {
        e.preventDefault();
        document.getElementById('objDeleteBtn').click();
      }
    }
  });

  setInterval(() => {
    if (!appBooted) return;
    const now = new Date((Math.floor(Date.now() / 1000) + TVStore.tzOffsetSec) * 1000);
    const clockEl = document.getElementById('liveClock');
    if (clockEl) {
      clockEl.textContent = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}:${String(now.getUTCSeconds()).padStart(2, '0')}`;
    }

    const activeSyms = new Set(panes.filter(p => !p.el.classList.contains('hidden')).map(p => p.sym));
    TVStore.watchlist.forEach(sym => {
      if (activeSyms.has(sym)) return;
      const q = TVStore.quotes[sym];
      if (!q) return;
      q.prevLast = q.last;
      q.last += (Math.random() - 0.5) * (q.last * 0.00025);
      q.high = Math.max(q.high, q.last);
      q.low = Math.min(q.low, q.last);
    });

    if (document.getElementById('view-watchlist')?.classList.contains('active')) renderWatchlist();
    if (document.getElementById('view-trading')?.classList.contains('active')) renderTradingView();
    panes.forEach(p => { if (!p.el.classList.contains('hidden')) p.draw(); });
  }, 1000);

  window.TVUI = {
    toast: showToast,
    applyTheme,
    updateSyncStatusUI,
    renderFavToolbar,
    selectPane,
    closeAllPopovers,
    setActiveTool,
    updateObjectEditBar,
    openDrawingEditModal,
    renderWatchlist,
    renderObjectTree,
    renderAlertsPanel,
    renderTradingView,
    renderBottomDrawer: renderTradingView,
    updateSymbolDetailsCard,
    editIndicatorParams,
    openAlertModal
  };

  new ResizeObserver(() => {
    if (appBooted) panes.forEach(p => p.resize());
  }).observe(document.getElementById('panesWrap'));

  // Boot First-Time Verified Gmail Gate
  applyTheme(TVStore.theme, true);
  initFirstTimeGmailGate();
})();
