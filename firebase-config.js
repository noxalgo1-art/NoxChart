/* ============================================================================
   FIREBASE-CONFIG.JS — Firebase Auth (Verified Gmail) & Firestore Cloud Sync
   Project: trading-app-109e8
   ============================================================================ */

(function () {
  'use strict';

  const firebaseConfig = {
    apiKey: "AIzaSyD3YEeGy0YZsWc0vpof0EEnQUnUjsol1-o",
    authDomain: "trading-app-109e8.firebaseapp.com",
    projectId: "trading-app-109e8",
    storageBucket: "trading-app-109e8.firebasestorage.app",
    messagingSenderId: "275553216670",
    appId: "1:275553216670:web:aff87c53d1b30bb675738f",
    measurementId: "G-8D8MLG7M7X"
  };

  let app = null;
  let auth = null;
  let db = null;
  let googleProvider = null;

  try {
    if (window.firebase && !window.firebase.apps.length) {
      app = window.firebase.initializeApp(firebaseConfig);
    } else if (window.firebase && window.firebase.apps.length) {
      app = window.firebase.app();
    }

    if (window.firebase?.auth) {
      auth = window.firebase.auth();
      auth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
      googleProvider = new window.firebase.auth.GoogleAuthProvider();
      googleProvider.addScope('email');
      googleProvider.addScope('profile');
      googleProvider.setCustomParameters({ prompt: 'select_account' });
    }

    if (window.firebase?.firestore) {
      db = window.firebase.firestore();
    }
  } catch (err) {
    console.warn('Firebase init warning:', err);
  }

  window.TVFirebase = {
    config: firebaseConfig,
    app,
    auth,
    db,
    googleProvider,
    isReady: Boolean(app && auth && db)
  };
})();
