/**
 * lang.js – Hindi / English language toggle for Eye In
 * Usage: include this script on any page.
 * Adds a 🌐 button to the navbar that toggles language.
 */

(function () {
  'use strict';

  const LANG_KEY = 'eyein_lang';

  // ─── Translation Dictionary ───────────────────────────────────────────────
  const translations = {
    en: {
      // Navbar
      'nav.myrides': 'My Rides',
      'nav.driver': 'Driver',
      'nav.admin': 'Admin',
      // Hero
      'hero.badge': 'Live Transport Tracking',
      'hero.title1': 'See your ride',
      'hero.title2': 'before you board',
      'hero.desc': 'Real-time seat availability, routes and fares — all in one place. No more waiting, just smart travel. 🚀',
      'hero.stats.rides': 'Rides',
      'hero.stats.seats': 'Seats',
      'hero.stats.free': 'Always',
      // Search card
      'search.title': '🔍 Find Route',
      'search.subtitle': 'Where do you want to go?',
      'search.from': 'From',
      'search.from.placeholder': 'Detecting location...',
      'search.to': 'To',
      'search.to.placeholder': 'Type destination...',
      'search.popular': '⚡ Popular Stops',
      'search.btn': 'Search Route',
      // How it works
      'how.title': 'How does Eye In work?',
      'how.subtitle': 'Track your ride in just 3 steps',
      'how.step1.title': 'Find Route',
      'how.step1.desc': 'Enter your pickup and destination to see available transport.',
      'how.step2.title': 'Live Map',
      'how.step2.desc': 'See live vehicles on map — exactly where they are now.',
      'how.step3.title': 'Check Seats',
      'how.step3.desc': 'Tap on any vehicle and see real-time seat availability.',
      // History
      'history.title': 'My Rides',
      'history.hint': 'Enter your phone number to see past rides',
      'history.btn': 'View Rides 🚀',
      // Toast messages
      'toast.pickup.required': 'Please enter your pickup location 📍',
      'toast.dest.required': 'Destination is required 🎯',
      'toast.location.denied': '📍 Permission denied. Enter manually.',
      'toast.location.detected': '📍 Location detected: ',
    },
    hi: {
      // Navbar
      'nav.myrides': 'मेरी Rides',
      'nav.driver': 'Driver',
      'nav.admin': 'Admin',
      // Hero
      'hero.badge': 'Live Transport Tracking',
      'hero.title1': 'Apni ride',
      'hero.title2': 'pehle dekho',
      'hero.desc': 'Real-time seat availability, routes aur fares — sab ek jagah. Ab wait nahi, sirf smart travel. 🚀',
      'hero.stats.rides': 'Rides',
      'hero.stats.seats': 'Seats',
      'hero.stats.free': 'Hamesha',
      // Search card
      'search.title': '🔍 Route Dhundho',
      'search.subtitle': 'Kahan se kahan jaana hai?',
      'search.from': 'Kahan se',
      'search.from.placeholder': 'Location detect ho rahi hai...',
      'search.to': 'Kahan tak',
      'search.to.placeholder': 'Destination type karo...',
      'search.popular': '⚡ Popular Stops',
      'search.btn': 'Route Search Karo',
      // How it works
      'how.title': 'Kaise kaam karta hai Eye In?',
      'how.subtitle': 'Sirf 3 steps mein apni ride track karo',
      'how.step1.title': 'Route Dhundho',
      'how.step1.desc': 'Apna pickup aur destination daalke available transport dekho.',
      'how.step2.title': 'Live Map Dekho',
      'how.step2.desc': 'Map pe live vehicles dekho — exactly kahan hain abhi.',
      'how.step3.title': 'Seat Check Karo',
      'how.step3.desc': 'Kisi bhi vehicle pe tap karo aur real-time seats dekho.',
      // History
      'history.title': 'Meri Rides',
      'history.hint': 'Apna phone number daalein purani rides dekhne ke liye',
      'history.btn': 'Rides Dekho 🚀',
      // Toast messages
      'toast.pickup.required': 'Pehle apna pickup location daalein 📍',
      'toast.dest.required': 'Destination bhi daalna zaroori hai 🎯',
      'toast.location.denied': '📍 Permission deny ki. Manually enter karo.',
      'toast.location.detected': '📍 Location mili: ',
    }
  };

  // ─── Get/Set Language ─────────────────────────────────────────────────────
  function getLang() {
    return localStorage.getItem(LANG_KEY) || 'hi';
  }

  function setLang(lang) {
    localStorage.setItem(LANG_KEY, lang);
    applyLang(lang);
    updateToggleBtn(lang);
  }

  // ─── Apply translations to elements with [data-i18n] ─────────────────────
  function applyLang(lang) {
    const dict = translations[lang] || translations['hi'];
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (dict[key]) {
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          el.placeholder = dict[key];
        } else {
          el.textContent = dict[key];
        }
      }
    });
    // Update html lang attribute
    document.documentElement.lang = lang === 'hi' ? 'hi' : 'en';
  }

  // ─── Create & Inject Toggle Button ───────────────────────────────────────
  function createToggleBtn() {
    const btn = document.createElement('button');
    btn.id = 'langToggleBtn';
    btn.className = 'lang-toggle-btn nav-btn';
    btn.title = 'Language Toggle';
    btn.setAttribute('aria-label', 'Toggle language between Hindi and English');
    btn.onclick = () => {
      const current = getLang();
      setLang(current === 'hi' ? 'en' : 'hi');
    };
    btn.style.cssText = `
      display: flex; align-items: center; gap: 6px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 10px;
      padding: 8px 14px;
      color: #94a3b8;
      font-family: 'Outfit', sans-serif;
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      letter-spacing: 0.02em;
    `;
    btn.onmouseover = () => {
      btn.style.background = 'rgba(99,102,241,0.12)';
      btn.style.borderColor = 'rgba(99,102,241,0.3)';
      btn.style.color = '#a78bfa';
    };
    btn.onmouseout = () => {
      btn.style.background = 'rgba(255,255,255,0.04)';
      btn.style.borderColor = 'rgba(255,255,255,0.1)';
      btn.style.color = '#94a3b8';
    };
    return btn;
  }

  function updateToggleBtn(lang) {
    const btn = document.getElementById('langToggleBtn');
    if (!btn) return;
    btn.innerHTML = lang === 'hi'
      ? '<span>🌐</span><span>EN</span>'
      : '<span>🌐</span><span>हि</span>';
    btn.title = lang === 'hi' ? 'Switch to English' : 'Hindi mein switch karo';
  }

  // ─── Expose global translate function ────────────────────────────────────
  window.t = function (key) {
    const lang = getLang();
    return (translations[lang] || translations['hi'])[key] || key;
  };

  // ─── Init ────────────────────────────────────────────────────────────────
  function init() {
    // Inject button into navbar-actions if present
    const navbarActions = document.querySelector('.navbar-actions');
    if (navbarActions) {
      const btn = createToggleBtn();
      navbarActions.insertBefore(btn, navbarActions.firstChild);
    }

    const lang = getLang();
    applyLang(lang);
    updateToggleBtn(lang);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
