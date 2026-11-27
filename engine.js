/* ============================================================================
   ENGINE.JS — State Store, All TradingView Free & Pro/Paid Tools,
               Firebase Cloud Sync & Quantitative Math Engine
   ============================================================================ */

(function () {
  'use strict';

  /* --------------------------------------------------------------------------
     1. DEFAULT SYMBOL CATALOG
     -------------------------------------------------------------------------- */
  const SYMBOL_CATALOG = [
    { sym: 'XAUUSD', badge: 'Au', badgeCol: '#F59E0B', desc: 'Gold Spot / U.S. Dollar', cat: 'Commodities', prec: 2, binance: 'PAXGUSDT', base: 3565.78, low52: 2580.00, high52: 3720.00, status: '● 24/7 Live', contractSize: 100 },
    { sym: 'XAGUSD', badge: 'Ag', badgeCol: '#94A3B8', desc: 'Silver Spot / U.S. Dollar', cat: 'Commodities', prec: 3, synthBase: 38.420, low52: 27.100, high52: 41.800, status: '● Market Open', contractSize: 5000 },
    { sym: 'USOIL', badge: 'WTI', badgeCol: '#475569', desc: 'WTI Crude Oil Spot', cat: 'Commodities', prec: 2, synthBase: 69.85, low52: 61.20, high52: 84.50, status: '● Market Open', contractSize: 1000 },
    { sym: 'EURUSD', badge: '€/$', badgeCol: '#2962FF', desc: 'Euro / U.S. Dollar', cat: 'Forex', prec: 5, kraken: 'EURUSD', coinbase: 'EUR-USD', base: 1.08420, low52: 1.04500, high52: 1.12140, status: '● Market Open', contractSize: 100000 },
    { sym: 'GBPUSD', badge: '£/$', badgeCol: '#8B5CF6', desc: 'British Pound / U.S. Dollar', cat: 'Forex', prec: 5, kraken: 'GBPUSD', coinbase: 'GBP-USD', base: 1.29350, low52: 1.23100, high52: 1.34300, status: '● Market Open', contractSize: 100000 },
    { sym: 'USDJPY', badge: '$/¥', badgeCol: '#EC4899', desc: 'U.S. Dollar / Japanese Yen', cat: 'Forex', prec: 3, kraken: 'USDJPY', base: 152.640, low52: 139.580, high52: 161.950, status: '● Market Open', contractSize: 1000 },
    { sym: 'AUDUSD', badge: 'A$', badgeCol: '#10B981', desc: 'Australian Dollar / U.S. Dollar', cat: 'Forex', prec: 5, synthBase: 0.65480, low52: 0.62700, high52: 0.69420, status: '● Market Open', contractSize: 100000 },
    { sym: 'USDCAD', badge: 'C$', badgeCol: '#EF4444', desc: 'U.S. Dollar / Canadian Dollar', cat: 'Forex', prec: 5, synthBase: 1.39120, low52: 1.34100, high52: 1.41800, status: '● Market Open', contractSize: 100000 },
    { sym: 'BTCUSD', badge: '₿', badgeCol: '#F97316', desc: 'Bitcoin / U.S. Dollar', cat: 'Crypto', prec: 2, binance: 'BTCUSDT', base: 94250.00, low52: 52400.00, high52: 108300.00, status: '● 24/7 Live', contractSize: 1 },
    { sym: 'ETHUSD', badge: 'Ξ', badgeCol: '#6366F1', desc: 'Ethereum / U.S. Dollar', cat: 'Crypto', prec: 2, binance: 'ETHUSDT', base: 3340.00, low52: 2110.00, high52: 4105.00, status: '● 24/7 Live', contractSize: 1 },
    { sym: 'SOLUSD', badge: 'SOL', badgeCol: '#14B8A6', desc: 'Solana / U.S. Dollar', cat: 'Crypto', prec: 2, binance: 'SOLUSDT', base: 214.50, low52: 112.00, high52: 264.00, status: '● 24/7 Live', contractSize: 10 },
    { sym: 'NAS100', badge: '100', badgeCol: '#0EA5E9', desc: 'US Tech 100 Index', cat: 'Indices', prec: 1, synthBase: 20945.0, low52: 16980.0, high52: 21890.0, status: '● Market Open', contractSize: 1 },
    { sym: 'US30', badge: '30', badgeCol: '#3B82F6', desc: 'Dow Jones Industrial Average', cat: 'Indices', prec: 1, synthBase: 43890.5, low52: 37610.0, high52: 45070.0, status: '● Market Open', contractSize: 1 },
    { sym: 'SPX500', badge: '500', badgeCol: '#E11D48', desc: 'S&P 500 Index', cat: 'Indices', prec: 1, synthBase: 5968.0, low52: 4950.0, high52: 6095.0, status: '● Market Open', contractSize: 1 }
  ];

  /* --------------------------------------------------------------------------
     2. COMPLETE TRADINGVIEW DRAWING TOOLS CATALOG (FREE + PAID/PRO SUITE)
     -------------------------------------------------------------------------- */
  const LONG_POS_SVG = `<svg viewBox="0 0 24 24">
    <line x1="2" y1="6" x2="22" y2="6" stroke="currentColor" stroke-width="1.6"/>
    <circle cx="4" cy="6" r="2" fill="var(--bg-card)" stroke="currentColor" stroke-width="1.5"/>
    <line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="1.6"/>
    <circle cx="4" cy="12" r="2" fill="var(--bg-card)" stroke="currentColor" stroke-width="1.5"/>
    <line x1="2" y1="18" x2="22" y2="18" stroke="currentColor" stroke-width="1.6"/>
    <circle cx="4" cy="18" r="2" fill="var(--bg-card)" stroke="currentColor" stroke-width="1.5"/>
    <text x="14" y="10.5" fill="currentColor" font-size="6.5" font-weight="800" text-anchor="middle" stroke="none">L</text>
  </svg>`;

  const SHORT_POS_SVG = `<svg viewBox="0 0 24 24">
    <line x1="2" y1="6" x2="22" y2="6" stroke="currentColor" stroke-width="1.6"/>
    <circle cx="4" cy="6" r="2" fill="var(--bg-card)" stroke="currentColor" stroke-width="1.5"/>
    <line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="1.6"/>
    <circle cx="4" cy="12" r="2" fill="var(--bg-card)" stroke="currentColor" stroke-width="1.5"/>
    <line x1="2" y1="18" x2="22" y2="18" stroke="currentColor" stroke-width="1.6"/>
    <circle cx="4" cy="18" r="2" fill="var(--bg-card)" stroke="currentColor" stroke-width="1.5"/>
    <text x="14" y="16.5" fill="currentColor" font-size="6.5" font-weight="800" text-anchor="middle" stroke="none">S</text>
  </svg>`;

  const DRAWING_TOOLS_CATALOG = [
    // 1. TOOLS & UTILITIES
    { id: 'cursor', name: 'Cursor / Pan', cat: 'Tools', svg: '<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 12 13 9 20 5 3"/></svg>' },
    { id: 'crosshair', name: 'Crosshair', cat: 'Tools', svg: '<svg viewBox="0 0 24 24"><line x1="12" y1="3" x2="12" y2="21"/><line x1="3" y1="12" x2="21" y2="12"/></svg>' },
    { id: 'dot', name: 'Dot Pointer', cat: 'Tools', svg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" fill="currentColor"/><circle cx="12" cy="12" r="8"/></svg>' },
    { id: 'eraser', name: 'Eraser', cat: 'Tools', svg: '<svg viewBox="0 0 24 24"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>' },
    { id: 'measure', name: 'Measure Ruler', cat: 'Tools', svg: '<svg viewBox="0 0 24 24"><path d="M21.3 8.7L8.7 21.3c-1 1-2.5 1-3.4 0l-2.6-2.6c-1-1-1-2.5 0-3.4L15.3 2.7c1-1 2.5-1 3.4 0l2.6 2.6c1 1 1 2.5 0 3.4Z"/><line x1="7.5" y1="10.5" x2="9.5" y2="12.5"/><line x1="10.5" y1="7.5" x2="12.5" y2="9.5"/></svg>' },
    { id: 'magnet_action', name: 'Magnet Snap', cat: 'Tools', isAction: true, svg: '<svg viewBox="0 0 24 24"><path d="M6 15v-5a6 6 0 1 1 12 0v5"/><line x1="6" y1="15" x2="6" y2="19"/><line x1="18" y1="15" x2="18" y2="19"/></svg>' },
    { id: 'stay_action', name: 'Stay Drawing', cat: 'Tools', isAction: true, svg: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>' },
    { id: 'lock_action', name: 'Lock All', cat: 'Tools', isAction: true, svg: '<svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' },
    { id: 'hide_action', name: 'Hide Drawings', cat: 'Tools', isAction: true, svg: '<svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' },
    { id: 'trash_action', name: 'Delete All', cat: 'Tools', isAction: true, svg: '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' },

    // 2. TREND LINES & CHANNELS (ALL TRADINGVIEW TOOLS)
    { id: 'trend', name: 'Trend Line', cat: 'Trend tools', svg: '<svg viewBox="0 0 24 24"><line x1="4" y1="20" x2="20" y2="4"/><circle cx="4" cy="20" r="2"/><circle cx="20" cy="4" r="2"/></svg>' },
    { id: 'ray', name: 'Ray', cat: 'Trend tools', svg: '<svg viewBox="0 0 24 24"><line x1="4" y1="20" x2="21" y2="3"/><circle cx="5" cy="19" r="2.2"/><polyline points="15 3 21 3 21 9"/></svg>' },
    { id: 'infoline', name: 'Info Line', cat: 'Trend tools', svg: '<svg viewBox="0 0 24 24"><line x1="4" y1="19" x2="20" y2="7"/><rect x="7" y="4" width="10" height="5" rx="1"/><circle cx="4" cy="19" r="1.8"/><circle cx="20" cy="7" r="1.8"/></svg>' },
    { id: 'extline', name: 'Extended Line', cat: 'Trend tools', svg: '<svg viewBox="0 0 24 24"><line x1="2" y1="22" x2="22" y2="2"/><circle cx="8" cy="16" r="2"/><circle cx="16" cy="8" r="2"/></svg>' },
    { id: 'trendangle', name: 'Trend Angle', cat: 'Trend tools', svg: '<svg viewBox="0 0 24 24"><line x1="4" y1="19" x2="20" y2="7"/><line x1="4" y1="19" x2="20" y2="19" stroke-dasharray="2 2"/><path d="M10 19a6 6 0 0 0-1.5-4"/></svg>' },
    { id: 'hline', name: 'Horizontal Line', cat: 'Trend tools', svg: '<svg viewBox="0 0 24 24"><line x1="2" y1="12" x2="22" y2="12"/><circle cx="12" cy="12" r="2.3"/></svg>' },
    { id: 'hray', name: 'Horizontal Ray', cat: 'Trend tools', svg: '<svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="22" y2="12"/><circle cx="5" cy="12" r="2.3"/></svg>' },
    { id: 'vline', name: 'Vertical Line', cat: 'Trend tools', svg: '<svg viewBox="0 0 24 24"><line x1="12" y1="2" x2="12" y2="22"/><circle cx="12" cy="12" r="2.3"/></svg>' },
    { id: 'crossline', name: 'Cross Line', cat: 'Trend tools', svg: '<svg viewBox="0 0 24 24"><line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><circle cx="12" cy="12" r="2.2"/></svg>' },
    { id: 'channel', name: 'Parallel Channel', cat: 'Trend tools', svg: '<svg viewBox="0 0 24 24"><line x1="3" y1="15" x2="19" y2="3"/><line x1="5" y1="21" x2="21" y2="9"/><line x1="4" y1="18" x2="20" y2="6" stroke-dasharray="2 2"/></svg>' },
    { id: 'regression', name: 'Regression Trend', cat: 'Trend tools', pro: true, svg: '<svg viewBox="0 0 24 24"><line x1="3" y1="17" x2="21" y2="7"/><line x1="3" y1="13" x2="21" y2="3" stroke-dasharray="2 2"/><line x1="3" y1="21" x2="21" y2="11" stroke-dasharray="2 2"/></svg>' },
    { id: 'flattop', name: 'Flat Top/Bottom', cat: 'Trend tools', svg: '<svg viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="19" x2="21" y2="12"/><circle cx="4" cy="6" r="1.5"/><circle cx="20" cy="12" r="1.5"/></svg>' },
    { id: 'disjoint', name: 'Disjoint Channel', cat: 'Trend tools', svg: '<svg viewBox="0 0 24 24"><line x1="3" y1="11" x2="21" y2="5"/><line x1="3" y1="19" x2="21" y2="16"/></svg>' },

    // 3. GANN, FIBONACCI & PITCHFORKS (FREE + PAID/PRO)
    { id: 'fib', name: 'Fib Retracement', cat: 'Gann and Fibonacci', svg: '<svg viewBox="0 0 24 24"><line x1="3" y1="5" x2="21" y2="5"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="3" y1="20" x2="21" y2="20"/><circle cx="6" cy="5" r="1.5"/><circle cx="18" cy="20" r="1.5"/></svg>' },
    { id: 'trendfib', name: 'Trend-Based Fib Ext', cat: 'Gann and Fibonacci', svg: '<svg viewBox="0 0 24 24"><polyline points="3 18 9 8 13 14"/><line x1="11" y1="5" x2="21" y2="5"/><line x1="11" y1="10" x2="21" y2="10"/><line x1="11" y1="16" x2="21" y2="16"/></svg>' },
    { id: 'fibchannel', name: 'Fib Channel', cat: 'Gann and Fibonacci', svg: '<svg viewBox="0 0 24 24"><line x1="3" y1="14" x2="18" y2="3"/><line x1="5" y1="18" x2="20" y2="7"/><line x1="7" y1="22" x2="22" y2="11"/></svg>' },
    { id: 'fibtimezone', name: 'Fib Time Zone', cat: 'Gann and Fibonacci', svg: '<svg viewBox="0 0 24 24"><line x1="5" y1="3" x2="5" y2="21"/><line x1="8" y1="3" x2="8" y2="21"/><line x1="13" y1="3" x2="13" y2="21"/><line x1="20" y1="3" x2="20" y2="21"/></svg>' },
    { id: 'fibfan', name: 'Fib Speed Fan', cat: 'Gann and Fibonacci', svg: '<svg viewBox="0 0 24 24"><line x1="4" y1="20" x2="20" y2="4"/><line x1="4" y1="20" x2="21" y2="10"/><line x1="4" y1="20" x2="21" y2="16"/><circle cx="4" cy="20" r="1.8"/></svg>' },
    { id: 'fibarc', name: 'Fib Arcs', cat: 'Gann and Fibonacci', svg: '<svg viewBox="0 0 24 24"><path d="M5 19a7 7 0 0 1 14 0"/><path d="M2 19a10 10 0 0 1 20 0"/><line x1="12" y1="19" x2="12" y2="8"/></svg>' },
    { id: 'fibcircles', name: 'Fib Circles', cat: 'Gann and Fibonacci', svg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="10"/></svg>' },
    { id: 'pitchfork', name: 'Pitchfork', cat: 'Gann and Fibonacci', svg: '<svg viewBox="0 0 24 24"><line x1="4" y1="20" x2="20" y2="4"/><line x1="6" y1="11" x2="18" y2="2"/><line x1="11" y1="18" x2="22" y2="7"/><line x1="6" y1="11" x2="11" y2="18"/></svg>' },
    { id: 'schiffpitchfork', name: 'Schiff Pitchfork', cat: 'Gann and Fibonacci', svg: '<svg viewBox="0 0 24 24"><line x1="4" y1="16" x2="21" y2="4"/><line x1="6" y1="10" x2="19" y2="2"/><line x1="10" y1="19" x2="22" y2="9"/></svg>' },
    { id: 'modschiff', name: 'Modified Schiff', cat: 'Gann and Fibonacci', svg: '<svg viewBox="0 0 24 24"><line x1="5" y1="15" x2="21" y2="5"/><line x1="7" y1="9" x2="20" y2="2"/><line x1="11" y1="19" x2="22" y2="10"/></svg>' },
    { id: 'insidepitchfork', name: 'Inside Pitchfork', cat: 'Gann and Fibonacci', svg: '<svg viewBox="0 0 24 24"><line x1="4" y1="19" x2="21" y2="5"/><line x1="7" y1="11" x2="20" y2="3"/><line x1="11" y1="17" x2="22" y2="8"/></svg>' },
    { id: 'gannbox', name: 'Gann Box', cat: 'Gann and Fibonacci', svg: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16"/><line x1="4" y1="20" x2="20" y2="4"/><line x1="4" y1="4" x2="20" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>' },
    { id: 'gannsquare', name: 'Gann Square Fixed', cat: 'Gann and Fibonacci', svg: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16"/><circle cx="12" cy="12" r="8"/><line x1="4" y1="20" x2="20" y2="4"/></svg>' },
    { id: 'gannfan', name: 'Gann Fan', cat: 'Gann and Fibonacci', svg: '<svg viewBox="0 0 24 24"><line x1="4" y1="20" x2="20" y2="4"/><line x1="4" y1="20" x2="13" y2="4"/><line x1="4" y1="20" x2="20" y2="12"/><line x1="4" y1="20" x2="20" y2="17"/></svg>' },

    // 4. HARMONIC & ELLIOTT WAVE PATTERNS (PAID/PRO SUITE)
    { id: 'xabcd', name: 'XABCD Pattern', cat: 'Patterns', svg: '<svg viewBox="0 0 24 24"><polyline points="3 18 7 6 12 15 16 4 21 13"/><circle cx="3" cy="18" r="1.4"/><circle cx="7" cy="6" r="1.4"/><circle cx="12" cy="15" r="1.4"/><circle cx="16" cy="4" r="1.4"/><circle cx="21" cy="13" r="1.4"/></svg>' },
    { id: 'cypher', name: 'Cypher Pattern', cat: 'Patterns', svg: '<svg viewBox="0 0 24 24"><polyline points="3 17 8 7 12 13 17 3 21 15"/><line x1="3" y1="17" x2="12" y2="13" stroke-dasharray="2 2"/></svg>' },
    { id: 'abcd', name: 'ABCD Pattern', cat: 'Patterns', svg: '<svg viewBox="0 0 24 24"><polyline points="4 17 9 6 14 15 20 5"/><line x1="4" y1="17" x2="14" y2="15" stroke-dasharray="2 2"/></svg>' },
    { id: 'triangle', name: 'Triangle Pattern', cat: 'Patterns', svg: '<svg viewBox="0 0 24 24"><polygon points="4 19 10 5 20 14"/><circle cx="4" cy="19" r="1.4"/><circle cx="10" cy="5" r="1.4"/><circle cx="20" cy="14" r="1.4"/></svg>' },
    { id: 'threedrives', name: 'Three Drives', cat: 'Patterns', svg: '<svg viewBox="0 0 24 24"><polyline points="2 18 6 11 9 15 13 7 16 11 21 4"/></svg>' },
    { id: 'headshoulders', name: 'Head & Shoulders', cat: 'Patterns', svg: '<svg viewBox="0 0 24 24"><polyline points="2 18 5 11 8 15 12 5 16 15 19 11 22 18"/><line x1="4" y1="15" x2="20" y2="15" stroke-dasharray="2 2"/></svg>' },
    { id: 'elliott12345', name: 'Elliott Impulse (12345)', cat: 'Patterns', svg: '<svg viewBox="0 0 24 24"><polyline points="3 19 7 10 10 14 15 5 18 10 22 3"/></svg>' },
    { id: 'elliottabc', name: 'Elliott Correction (ABC)', cat: 'Patterns', svg: '<svg viewBox="0 0 24 24"><polyline points="4 6 10 17 15 11 20 19"/></svg>' },
    { id: 'elliottabcde', name: 'Elliott Triangle (ABCDE)', cat: 'Patterns', svg: '<svg viewBox="0 0 24 24"><polyline points="3 6 8 18 12 8 16 15 21 11"/></svg>' },
    { id: 'cycliclines', name: 'Cyclic Lines', cat: 'Patterns', svg: '<svg viewBox="0 0 24 24"><line x1="5" y1="3" x2="5" y2="21"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="19" y1="3" x2="19" y2="21"/><path d="M5 12h14" stroke-dasharray="2 2"/></svg>' },

    // 5. FORECASTING, POSITIONS, ANCHORED VWAP & VOLUME PROFILE (PAID/PRO)
    { id: 'long', name: 'Long Position', cat: 'Forecasting and measurement', svg: LONG_POS_SVG },
    { id: 'short', name: 'Short Position', cat: 'Forecasting and measurement', svg: SHORT_POS_SVG },
    { id: 'anchoredvwap', name: 'Anchored VWAP', cat: 'Forecasting and measurement', pro: true, svg: '<svg viewBox="0 0 24 24"><path d="M4 17c4-6 8-2 16-11"/><circle cx="4" cy="17" r="2.2"/><path d="M4 13c4-5 8-1 16-9" stroke-dasharray="2 2"/></svg>' },
    { id: 'fixedvp', name: 'Fixed Range Vol Profile', cat: 'Forecasting and measurement', pro: true, svg: '<svg viewBox="0 0 24 24"><line x1="4" y1="3" x2="4" y2="21"/><rect x="4" y="5" width="9" height="3"/><rect x="4" y="10" width="15" height="3" fill="currentColor"/><rect x="4" y="15" width="11" height="3"/></svg>' },
    { id: 'forecast', name: 'Forecast Target', cat: 'Forecasting and measurement', svg: '<svg viewBox="0 0 24 24"><line x1="4" y1="18" x2="19" y2="6"/><circle cx="4" cy="18" r="2"/><circle cx="19" cy="6" r="2.5"/></svg>' },
    { id: 'barspattern', name: 'Bars Pattern', cat: 'Forecasting and measurement', svg: '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="3" height="10"/><rect x="10" y="9" width="3" height="9"/><rect x="16" y="4" width="3" height="11"/></svg>' },
    { id: 'ghostfeed', name: 'Ghost Feed', cat: 'Forecasting and measurement', svg: '<svg viewBox="0 0 24 24"><rect x="5" y="7" width="3" height="8" stroke-dasharray="2 1"/><rect x="11" y="5" width="3" height="10" stroke-dasharray="2 1"/><rect x="17" y="9" width="3" height="7" stroke-dasharray="2 1"/></svg>' },
    { id: 'pricerange', name: 'Price Range', cat: 'Forecasting and measurement', svg: '<svg viewBox="0 0 24 24"><line x1="5" y1="5" x2="19" y2="5"/><line x1="5" y1="19" x2="19" y2="19"/><line x1="12" y1="5" x2="12" y2="19"/><polyline points="9 8 12 5 15 8"/><polyline points="9 16 12 19 15 16"/></svg>' },
    { id: 'daterange', name: 'Date Range', cat: 'Forecasting and measurement', svg: '<svg viewBox="0 0 24 24"><line x1="5" y1="5" x2="5" y2="19"/><line x1="19" y1="5" x2="19" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/><polyline points="8 9 5 12 8 15"/><polyline points="16 9 19 12 16 15"/></svg>' },
    { id: 'datetime_range', name: 'Date & Price Range', cat: 'Forecasting and measurement', svg: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" stroke-dasharray="2 2"/><line x1="12" y1="5" x2="12" y2="19"/><line x1="4" y1="12" x2="20" y2="12"/></svg>' },

    // 6. GEOMETRIC SHAPES & BRUSHES
    { id: 'rect', name: 'Rectangle / Box', cat: 'Geometric shapes', svg: '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" rx="1"/><circle cx="4" cy="6" r="1.5"/><circle cx="20" cy="18" r="1.5"/></svg>' },
    { id: 'rotrect', name: 'Rotated Rectangle', cat: 'Geometric shapes', svg: '<svg viewBox="0 0 24 24"><polygon points="12 3 21 12 12 21 3 12"/></svg>' },
    { id: 'circle', name: 'Circle / Ellipse', cat: 'Geometric shapes', svg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="4" r="1.5"/></svg>' },
    { id: 'poly_triangle', name: 'Triangle Shape', cat: 'Geometric shapes', svg: '<svg viewBox="0 0 24 24"><polygon points="12 4 21 19 3 19"/></svg>' },
    { id: 'curve', name: 'Curve', cat: 'Geometric shapes', svg: '<svg viewBox="0 0 24 24"><path d="M4 18Q12 3 20 18"/><circle cx="4" cy="18" r="1.5"/><circle cx="20" cy="18" r="1.5"/></svg>' },
    { id: 'doublecurve', name: 'Double Curve', cat: 'Geometric shapes', svg: '<svg viewBox="0 0 24 24"><path d="M3 16C7 4 17 20 21 8"/></svg>' },
    { id: 'arc', name: 'Arc', cat: 'Geometric shapes', svg: '<svg viewBox="0 0 24 24"><path d="M4 17A9 9 0 0 1 20 17"/></svg>' },
    { id: 'brush', name: 'Brush', cat: 'Geometric shapes', svg: '<svg viewBox="0 0 24 24"><path d="M18.37 2.63 14 7l-1.59-1.59a2 2 0 0 0-2.82 0L8 7l9 9 1.59-1.59a2 2 0 0 0 0-2.82L17 10l4.37-4.37a2.12 2.12 0 1 0-3-3Z"/><path d="M9 8c-2 3-4 3.5-7 4l8 10c2-1 6-5 6-7"/></svg>' },
    { id: 'highlighter', name: 'Highlighter', cat: 'Geometric shapes', svg: '<svg viewBox="0 0 24 24"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>' },
    { id: 'path', name: 'Polyline Path', cat: 'Geometric shapes', svg: '<svg viewBox="0 0 24 24"><polyline points="4 17 9 9 15 14 20 5"/><circle cx="4" cy="17" r="1.8"/><circle cx="9" cy="9" r="1.8"/><circle cx="15" cy="14" r="1.8"/><circle cx="20" cy="5" r="1.8"/></svg>' },

    // 7. ANNOTATIONS & CALLOUTS
    { id: 'text', name: 'Text Note', cat: 'Annotations', svg: '<svg viewBox="0 0 24 24"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>' },
    { id: 'anchoredtext', name: 'Anchored Text', cat: 'Annotations', svg: '<svg viewBox="0 0 24 24"><polyline points="5 8 5 5 19 5 19 8"/><line x1="12" y1="5" x2="12" y2="18"/><circle cx="12" cy="19" r="2"/></svg>' },
    { id: 'note', name: 'Note Pin', cat: 'Annotations', svg: '<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="12" rx="2"/><line x1="12" y1="15" x2="12" y2="21"/></svg>' },
    { id: 'pricenote', name: 'Price Note', cat: 'Annotations', svg: '<svg viewBox="0 0 24 24"><line x1="4" y1="18" x2="12" y2="10"/><rect x="11" y="5" width="9" height="6" rx="1"/><circle cx="4" cy="18" r="2"/></svg>' },
    { id: 'callout', name: 'Callout', cat: 'Annotations', svg: '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' },
    { id: 'comment', name: 'Comment Box', cat: 'Annotations', svg: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2"/><polyline points="8 17 12 21 16 17"/></svg>' },
    { id: 'pricelabel', name: 'Price Label', cat: 'Annotations', svg: '<svg viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>' },
    { id: 'arrowmark', name: 'Arrow Marker', cat: 'Annotations', svg: '<svg viewBox="0 0 24 24"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>' },
    { id: 'arrowup', name: 'Arrow Mark Up', cat: 'Annotations', svg: '<svg viewBox="0 0 24 24"><polygon points="12 5 19 15 14 15 14 20 10 20 10 15 5 15"/></svg>' },
    { id: 'arrowdown', name: 'Arrow Mark Down', cat: 'Annotations', svg: '<svg viewBox="0 0 24 24"><polygon points="12 19 19 9 14 9 14 4 10 4 10 9 5 9"/></svg>' },
    { id: 'flag', name: 'Flag Mark', cat: 'Annotations', svg: '<svg viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>' }
  ];

  const CHART_TYPES_CATALOG = [
    { id: 'bars', name: 'Bars', svg: '<svg viewBox="0 0 24 24"><line x1="8" y1="4" x2="8" y2="20"/><line x1="5" y1="9" x2="8" y2="9"/><line x1="8" y1="15" x2="11" y2="15"/><line x1="16" y1="5" x2="16" y2="19"/><line x1="13" y1="14" x2="16" y2="14"/><line x1="16" y1="8" x2="19" y2="8"/></svg>' },
    { id: 'candles', name: 'Candles', svg: '<svg viewBox="0 0 24 24"><line x1="8" y1="3" x2="8" y2="21"/><rect x="6" y="7" width="4" height="9" fill="currentColor"/><line x1="16" y1="4" x2="16" y2="20"/><rect x="14" y="8" width="4" height="7"/></svg>' },
    { id: 'hollow', name: 'Hollow candles', svg: '<svg viewBox="0 0 24 24"><line x1="8" y1="3" x2="8" y2="21"/><rect x="6" y="7" width="4" height="9"/><line x1="16" y1="4" x2="16" y2="20"/><rect x="14" y="8" width="4" height="7"/></svg>' },
    { id: 'volcandles', name: 'Volume candles', svg: '<svg viewBox="0 0 24 24"><line x1="7" y1="3" x2="7" y2="21"/><rect x="4" y="7" width="6" height="9" fill="currentColor"/><line x1="17" y1="5" x2="17" y2="19"/><rect x="15" y="9" width="4" height="6"/></svg>' },
    { id: 'line', name: 'Line', svg: '<svg viewBox="0 0 24 24"><polyline points="3 16 9 10 14 14 21 6"/></svg>' },
    { id: 'linemarkers', name: 'Line with markers', svg: '<svg viewBox="0 0 24 24"><polyline points="3 16 9 10 14 14 21 6"/><circle cx="3" cy="16" r="2"/><circle cx="9" cy="10" r="2"/><circle cx="14" cy="14" r="2"/><circle cx="21" cy="6" r="2"/></svg>' },
    { id: 'area', name: 'Area', svg: '<svg viewBox="0 0 24 24"><polygon points="3 19 3 15 9 9 14 13 21 6 21 19" fill="rgba(41,98,255,0.28)"/><polyline points="3 15 9 9 14 13 21 6"/></svg>' },
    { id: 'heikin', name: 'Heikin Ashi', svg: '<svg viewBox="0 0 24 24"><line x1="7" y1="5" x2="7" y2="20"/><rect x="5" y="8" width="4" height="8" fill="currentColor"/><line x1="15" y1="3" x2="15" y2="18"/><rect x="13" y="6" width="4" height="8" fill="currentColor"/></svg>' },
    { id: 'baseline', name: 'Baseline', svg: '<svg viewBox="0 0 24 24"><line x1="2" y1="12" x2="22" y2="12" stroke-dasharray="2 2"/><polyline points="3 16 8 8 15 16 21 7"/></svg>' }
  ];

  const INDICATOR_CATALOG = [
    { key: 'emaFast', name: 'EMA 9 & 20', desc: 'Fast Exponential Moving Averages', cat: 'Trend', params: { p1: 9, p2: 20 } },
    { key: 'emaSlow', name: 'EMA 50 & 200', desc: 'Major Trend Moving Averages', cat: 'Trend', params: { p1: 50, p2: 200 } },
    { key: 'sma', name: 'SMA 20 & 50', desc: 'Simple Moving Averages', cat: 'Trend', params: { p1: 20, p2: 50 } },
    { key: 'bb', name: 'Bollinger Bands (20, 2)', desc: 'Volatility Standard Deviation Bands', cat: 'Volatility', params: { period: 20, mult: 2 } },
    { key: 'st', name: 'Supertrend (10, 3)', desc: 'ATR Trailing Trend Overlay', cat: 'Trend', params: { period: 10, mult: 3 } },
    { key: 'vpvr', name: 'Volume Profile Visible Range (VPVR)', desc: 'Pro Right-Axis Volume Histogram & POC', cat: 'Pro Volume', params: { bins: 24 } },
    { key: 'killzones', name: 'Session Killzones (Asia / LDN / NY)', desc: 'Pro ICT Session Range Boxes', cat: 'Pro Smart Money', params: {} },
    { key: 'smc', name: 'Market Structure (BOS / CHoCH & FVG)', desc: 'Pro Auto Swing Structure & Fair Value Gaps', cat: 'Pro Smart Money', params: { swingLen: 5 } },
    { key: 'rsi', name: 'RSI (14)', desc: 'Relative Strength Index Sub-Pane', cat: 'Oscillator', params: { period: 14 } },
    { key: 'macd', name: 'MACD (12, 26, 9)', desc: 'MACD Sub-Pane', cat: 'Oscillator', params: { fast: 12, slow: 26, sig: 9 } },
    { key: 'atr', name: 'ATR (14)', desc: 'Average True Range Sub-Pane', cat: 'Volatility', params: { period: 14 } }
  ];

  // Zero pre-added templates: user creates their own templates manually
  const DEFAULT_DRAW_TEMPLATES = {};

  const TF_MAP = {
    '1': { label: '1s', binance: '1m', kraken: '1', subMin: true },
    '5': { label: '5s', binance: '1m', kraken: '1', subMin: true },
    '15': { label: '15s', binance: '1m', kraken: '1', subMin: true },
    '30': { label: '30s', binance: '1m', kraken: '1', subMin: true },
    '60': { label: '1m', binance: '1m', kraken: '1' },
    '180': { label: '3m', binance: '3m', kraken: '5' },
    '300': { label: '5m', binance: '5m', kraken: '5' },
    '900': { label: '15m', binance: '15m', kraken: '15' },
    '1800': { label: '30m', binance: '30m', kraken: '30' },
    '3600': { label: '1H', binance: '1h', kraken: '60' },
    '7200': { label: '2H', binance: '2h', kraken: '60' },
    '14400': { label: '4H', binance: '4h', kraken: '240' },
    '43200': { label: '12H', binance: '12h', kraken: '240' },
    '86400': { label: '1D', binance: '1d', kraken: '1440' },
    '604800': { label: '1W', binance: '1w', kraken: '10080' }
  };

  const KRAKEN_WS_MAP = { 'EURUSD': 'EUR/USD', 'GBPUSD': 'GBP/USD', 'USDJPY': 'USD/JPY' };
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /* --------------------------------------------------------------------------
     3. PERSISTENT STATE STORE
     -------------------------------------------------------------------------- */
  const STORAGE_KEYS = {
    WATCHLIST: 'tvfb_watchlist',
    CUSTOM_SYMBOLS: 'tvfb_custom_symbols',
    SETTINGS: 'tvfb_settings',
    INDICATORS: 'tvfb_indicators',
    PAPER: 'tvfb_paper',
    TEMPLATES: 'tvfb_templates',
    DRAW_TEMPLATES: 'tvfb_draw_templates',
    ACTIVE_TPL_BY_CAT: 'tvfb_active_tpl_cat',
    STARRED: 'tvfb_starred',
    SHOW_FAV: 'tvfb_show_fav',
    THEME: 'tvfb_theme',
    USER_AUTH: 'tvfb_gmail_user',
    CLOUD_VAULT_PREFIX: 'tvfb_cloud_vault_',
    DRAWINGS_PREFIX: 'tvfb_draw_',
    ALERTS_PREFIX: 'tvfb_alerts_',
    OFFSET_PREFIX: 'tvfb_offset_'
  };

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function saveJSON(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (_) {}
  }

  // All indicators disabled (clean Default) on startup
  const defaultIndicators = {};
  INDICATOR_CATALOG.forEach(item => {
    defaultIndicators[item.key] = {
      enabled: false,
      hidden: false,
      params: { ...item.params }
    };
  });

  const DEFAULT_SYMBOL_SETTINGS = {
    colorPrevClose: false,
    bodyEnabled: true,
    bodyBull: 'rgba(8, 153, 129, 1)',
    bodyBear: 'rgba(242, 54, 69, 1)',
    borderEnabled: true,
    borderBull: 'rgba(8, 153, 129, 1)',
    borderBear: 'rgba(242, 54, 69, 1)',
    wickEnabled: true,
    wickBull: 'rgba(8, 153, 129, 1)',
    wickBear: 'rgba(242, 54, 69, 1)',
    precisionOverride: 'default',
    showGrid: true,
    watermark: true,
    showBidAsk: true
  };

  const TVStore = {
    baseCatalog: SYMBOL_CATALOG,
    customSymbols: loadJSON(STORAGE_KEYS.CUSTOM_SYMBOLS, []),
    drawingCatalog: DRAWING_TOOLS_CATALOG,
    chartTypesCatalog: CHART_TYPES_CATALOG,
    indicatorCatalog: INDICATOR_CATALOG,
    defaultDrawTemplates: DEFAULT_DRAW_TEMPLATES,
    defaultSymbolSettings: DEFAULT_SYMBOL_SETTINGS,
    tfMap: TF_MAP,
    months: MONTHS,

    theme: localStorage.getItem(STORAGE_KEYS.THEME) || 'dark',
    tzOffsetSec: 19800,
    activeTool: 'cursor',
    magnetLevel: 0,
    stayInDrawingMode: false,
    hideAllDrawings: false,
    clipboardDrawing: null,

    starredTools: loadJSON(STORAGE_KEYS.STARRED, ['trend', 'hline', 'fib', 'rect', 'long', 'short', 'anchoredvwap', 'fixedvp', 'measure', 'text', 'eraser']),
    showFavToolbar: loadJSON(STORAGE_KEYS.SHOW_FAV, true),

    layoutGrid: '1x1',
    syncCrosshair: true,
    syncSymbol: false,
    syncTf: false,
    selectedPaneIdx: 0,
    panes: [],

    compareSymbol: null,
    compareCloses: [],

    watchlist: loadJSON(STORAGE_KEYS.WATCHLIST, ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'BTCUSD', 'ETHUSD', 'NAS100', 'US30']),
    quotes: {},
    indicators: loadJSON(STORAGE_KEYS.INDICATORS, defaultIndicators),

    settings: Object.assign({}, DEFAULT_SYMBOL_SETTINGS, loadJSON(STORAGE_KEYS.SETTINGS, {})),
    drawTemplates: loadJSON(STORAGE_KEYS.DRAW_TEMPLATES, {}),
    activeTemplateByCat: { line: null, box: null, fib: null, pattern: null, position: null, vp: null, text: null },

    paper: loadJSON(STORAGE_KEYS.PAPER, {
      balance: 10000.00,
      positions: [],
      history: []
    }),

    templates: loadJSON(STORAGE_KEYS.TEMPLATES, {}),
    currentUser: loadJSON(STORAGE_KEYS.USER_AUTH, null),

    getAllSymbols() {
      return [...SYMBOL_CATALOG, ...this.customSymbols];
    },

    addCustomSymbol(rawSym, rawDesc = '', rawCat = 'Custom') {
      const sym = String(rawSym || '').trim().toUpperCase().replace(/[^A-Z0-9._-]/g, '');
      if (!sym) return null;

      const existing = this.getAllSymbols().find(s => s.sym === sym);
      if (existing) {
        if (!this.watchlist.includes(sym)) {
          this.watchlist.push(sym);
          this.saveWatchlist();
        }
        return existing;
      }

      const isCrypto = sym.endsWith('USDT') || sym.endsWith('BTC') || (sym.endsWith('USD') && ['XRPUSD', 'ADAUSD', 'DOGEUSD', 'BNBUSD', 'AVAXUSD', 'DOTUSD', 'LINKUSD', 'LTCUSD'].includes(sym));
      const isJpy = sym.includes('JPY');
      const isFx = !isCrypto && sym.length === 6 && !sym.startsWith('US') && !sym.startsWith('NAS') && !sym.startsWith('SPX');
      const prec = isJpy ? 3 : (isFx ? 5 : 2);
      const synthBase = isJpy ? 150.000 : (isFx ? 1.10000 : 100.00);
      const binancePair = isCrypto ? (sym.endsWith('USDT') ? sym : sym.replace(/USD$/, 'USDT')) : null;

      const newObj = {
        sym,
        badge: sym.slice(0, 3),
        badgeCol: '#2962FF',
        desc: rawDesc.trim() || `${sym} Custom Instrument`,
        cat: rawCat || 'Custom',
        prec,
        binance: binancePair,
        synthBase,
        low52: synthBase * 0.85,
        high52: synthBase * 1.15,
        status: '● 24/7 Live',
        contractSize: isFx ? 100000 : 1
      };

      this.customSymbols.push(newObj);
      saveJSON(STORAGE_KEYS.CUSTOM_SYMBOLS, this.customSymbols);

      if (!this.watchlist.includes(sym)) {
        this.watchlist.push(sym);
      }
      this.quotes[sym] = {
        last: synthBase,
        open: synthBase,
        high: synthBase * 1.003,
        low: synthBase * 0.997,
        prevLast: synthBase
      };
      this.saveWatchlist();
      return newObj;
    },

    getToolCategory(toolType) {
      if (['trend', 'ray', 'infoline', 'extline', 'trendangle', 'hline', 'hray', 'vline', 'crossline', 'channel', 'regression', 'flattop', 'disjoint'].includes(toolType)) return 'line';
      if (['rect', 'rotrect', 'circle', 'poly_triangle', 'curve', 'doublecurve', 'arc', 'pricerange', 'daterange', 'datetime_range'].includes(toolType)) return 'box';
      if (['fib', 'trendfib', 'fibchannel', 'fibtimezone', 'fibfan', 'fibarc', 'fibcircles', 'pitchfork', 'schiffpitchfork', 'modschiff', 'insidepitchfork', 'gannbox', 'gannsquare', 'gannfan'].includes(toolType)) return 'fib';
      if (['xabcd', 'cypher', 'abcd', 'triangle', 'threedrives', 'headshoulders', 'elliott12345', 'elliottabc', 'elliottabcde', 'cycliclines', 'barspattern', 'ghostfeed'].includes(toolType)) return 'pattern';
      if (['long', 'short', 'forecast'].includes(toolType)) return 'position';
      if (['anchoredvwap', 'fixedvp'].includes(toolType)) return 'vp';
      if (['text', 'anchoredtext', 'note', 'pricenote', 'callout', 'comment', 'pricelabel', 'arrowmark', 'arrowup', 'arrowdown', 'flag'].includes(toolType)) return 'text';
      return 'other';
    },

    getTemplatesForTool(toolType) {
      const cat = this.getToolCategory(toolType);
      const result = {};
      Object.entries(this.drawTemplates).forEach(([name, tpl]) => {
        const tplCat = tpl.category || 'line';
        if (tplCat === cat) {
          result[name] = tpl;
        }
      });
      return result;
    },

    getActiveTemplateForTool(toolType) {
      const cat = this.getToolCategory(toolType);
      const tplName = this.activeTemplateByCat[cat];
      if (!tplName) return null;
      const tpl = this.drawTemplates[tplName];
      if (!tpl || (tpl.category || 'line') !== cat) return null;
      return { name: tplName, data: tpl };
    },

    setActiveTemplateForTool(toolType, tplName) {
      const cat = this.getToolCategory(toolType);
      this.activeTemplateByCat[cat] = tplName || null;
      saveJSON(STORAGE_KEYS.ACTIVE_TPL_BY_CAT, this.activeTemplateByCat);
    },

    getSymMeta(sym) {
      const base = this.getAllSymbols().find(s => s.sym === sym) || {
        sym, badge: sym.slice(0, 2), badgeCol: '#2962FF', desc: sym + ' Spot', cat: 'Custom',
        prec: 2, synthBase: 100, low52: 80, high52: 120, status: '● Live', contractSize: 1
      };
      const ov = this.settings.precisionOverride;
      if (ov && ov !== 'default' && !isNaN(Number(ov))) {
        return { ...base, prec: Number(ov) };
      }
      return base;
    },

    getTfLabel(tfSec) {
      const s = String(tfSec);
      if (TF_MAP[s]) return TF_MAP[s].label;
      const n = Number(tfSec);
      if (n < 60) return n + 's';
      if (n < 3600) return Math.round(n / 60) + 'm';
      if (n < 86400) return Math.round(n / 3600) + 'H';
      return Math.round(n / 86400) + 'D';
    },

    parseCustomTf(input) {
      if (!input) return null;
      const clean = String(input).trim().toLowerCase();
      const match = clean.match(/^(\d+)\s*(s|m|h|d|w)?$/);
      if (!match) return null;
      const val = parseInt(match[1], 10);
      const unit = match[2] || 'm';
      if (val <= 0) return null;
      const mult = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : unit === 'd' ? 86400 : 604800;
      return val * mult;
    },

    saveStarred() {
      saveJSON(STORAGE_KEYS.STARRED, this.starredTools);
      saveJSON(STORAGE_KEYS.SHOW_FAV, this.showFavToolbar);
      CloudSyncEngine.pushToCloud();
    },
    saveTheme() {
      localStorage.setItem(STORAGE_KEYS.THEME, this.theme);
      CloudSyncEngine.pushToCloud();
    },
    saveWatchlist() {
      saveJSON(STORAGE_KEYS.WATCHLIST, this.watchlist);
      CloudSyncEngine.pushToCloud();
    },
    saveSettings() {
      saveJSON(STORAGE_KEYS.SETTINGS, this.settings);
      CloudSyncEngine.pushToCloud();
    },
    saveIndicators() {
      saveJSON(STORAGE_KEYS.INDICATORS, this.indicators);
      CloudSyncEngine.pushToCloud();
    },
    savePaper() {
      saveJSON(STORAGE_KEYS.PAPER, this.paper);
    },
    saveTemplates() {
      saveJSON(STORAGE_KEYS.TEMPLATES, this.templates);
      CloudSyncEngine.pushToCloud();
    },
    saveDrawTemplates() {
      saveJSON(STORAGE_KEYS.DRAW_TEMPLATES, this.drawTemplates);
      CloudSyncEngine.pushToCloud();
    },

    getDrawings(sym) { return loadJSON(STORAGE_KEYS.DRAWINGS_PREFIX + sym, []); },
    setDrawings(sym, list) {
      saveJSON(STORAGE_KEYS.DRAWINGS_PREFIX + sym, list);
      CloudSyncEngine.pushToCloud();
    },

    getAlerts(sym) { return loadJSON(STORAGE_KEYS.ALERTS_PREFIX + sym, []); },
    setAlerts(sym, list) {
      saveJSON(STORAGE_KEYS.ALERTS_PREFIX + sym, list);
      CloudSyncEngine.pushToCloud();
    },

    getOffset(sym) { return Number(localStorage.getItem(STORAGE_KEYS.OFFSET_PREFIX + sym) || '0'); },
    setOffset(sym, val) {
      localStorage.setItem(STORAGE_KEYS.OFFSET_PREFIX + sym, String(val));
      CloudSyncEngine.pushToCloud();
    }
  };

  TVStore.getAllSymbols().forEach(s => {
    const startPx = s.base || s.synthBase || 100;
    TVStore.quotes[s.sym] = {
      last: startPx,
      open: startPx,
      high: startPx * 1.0035,
      low: startPx * 0.9965,
      prevLast: startPx
    };
  });

  /* --------------------------------------------------------------------------
     4. FIREBASE FIRESTORE + VERIFIED GMAIL MULTI-DEVICE SYNC ENGINE
     -------------------------------------------------------------------------- */
  const syncChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('tvfb_cloud_sync') : null;
  let firestoreUnsub = null;

  const CloudSyncEngine = {
    isApplyingRemote: false,

    getVaultKey(email) {
      return STORAGE_KEYS.CLOUD_VAULT_PREFIX + String(email || '').trim().toLowerCase();
    },

    getDocId(email) {
      return String(email || '').trim().toLowerCase().replace(/[^a-z0-9@._-]/g, '_');
    },

    buildSnapshotPayload() {
      const allDrawings = {};
      const allAlerts = {};
      const allOffsets = {};
      TVStore.getAllSymbols().forEach(s => {
        const d = TVStore.getDrawings(s.sym);
        if (d.length) allDrawings[s.sym] = d;
        const a = TVStore.getAlerts(s.sym);
        if (a.length) allAlerts[s.sym] = a;
        const o = TVStore.getOffset(s.sym);
        if (o !== 0) allOffsets[s.sym] = o;
      });

      return {
        updatedAt: Date.now(),
        userEmail: TVStore.currentUser?.email || '',
        theme: TVStore.theme,
        settings: TVStore.settings,
        indicators: TVStore.indicators,
        watchlist: TVStore.watchlist,
        customSymbols: TVStore.customSymbols,
        starredTools: TVStore.starredTools,
        showFavToolbar: TVStore.showFavToolbar,
        drawTemplates: TVStore.drawTemplates,
        templates: TVStore.templates,
        drawings: allDrawings,
        alerts: allAlerts,
        offsets: allOffsets
      };
    },

    applySnapshotPayload(payload) {
      if (!payload || typeof payload !== 'object') return;
      this.isApplyingRemote = true;
      try {
        if (payload.theme) {
          TVStore.theme = payload.theme;
          localStorage.setItem(STORAGE_KEYS.THEME, payload.theme);
        }
        if (payload.settings) {
          Object.assign(TVStore.settings, payload.settings);
          saveJSON(STORAGE_KEYS.SETTINGS, TVStore.settings);
        }
        if (payload.indicators) {
          TVStore.indicators = payload.indicators;
          saveJSON(STORAGE_KEYS.INDICATORS, TVStore.indicators);
        }
        if (Array.isArray(payload.customSymbols)) {
          TVStore.customSymbols = payload.customSymbols;
          saveJSON(STORAGE_KEYS.CUSTOM_SYMBOLS, TVStore.customSymbols);
        }
        if (Array.isArray(payload.watchlist) && payload.watchlist.length) {
          TVStore.watchlist = payload.watchlist;
          saveJSON(STORAGE_KEYS.WATCHLIST, TVStore.watchlist);
        }
        if (Array.isArray(payload.starredTools)) {
          TVStore.starredTools = payload.starredTools;
          saveJSON(STORAGE_KEYS.STARRED, TVStore.starredTools);
        }
        if (typeof payload.showFavToolbar === 'boolean') {
          TVStore.showFavToolbar = payload.showFavToolbar;
          saveJSON(STORAGE_KEYS.SHOW_FAV, TVStore.showFavToolbar);
        }
        if (payload.drawTemplates) {
          TVStore.drawTemplates = payload.drawTemplates;
          saveJSON(STORAGE_KEYS.DRAW_TEMPLATES, TVStore.drawTemplates);
        }
        if (payload.templates) {
          TVStore.templates = payload.templates;
          saveJSON(STORAGE_KEYS.TEMPLATES, TVStore.templates);
        }
        if (payload.drawings) {
          Object.entries(payload.drawings).forEach(([sym, list]) => {
            saveJSON(STORAGE_KEYS.DRAWINGS_PREFIX + sym, list);
          });
        }
        if (payload.alerts) {
          Object.entries(payload.alerts).forEach(([sym, list]) => {
            saveJSON(STORAGE_KEYS.ALERTS_PREFIX + sym, list);
          });
        }
        if (payload.offsets) {
          Object.entries(payload.offsets).forEach(([sym, val]) => {
            localStorage.setItem(STORAGE_KEYS.OFFSET_PREFIX + sym, String(val));
          });
        }

        TVStore.panes.forEach(p => {
          p.loadStoredMeta();
          p.recompute();
          p.draw();
        });
        window.TVUI?.applyTheme?.(TVStore.theme, true);
        window.TVUI?.renderFavToolbar?.();
        window.TVUI?.renderWatchlist?.();
        window.TVUI?.renderObjectTree?.();
        window.TVUI?.renderAlertsPanel?.();
      } finally {
        this.isApplyingRemote = false;
      }
    },

    async pushToCloud() {
      if (this.isApplyingRemote || !TVStore.currentUser?.email) return;
      const email = TVStore.currentUser.email;
      const payload = this.buildSnapshotPayload();
      saveJSON(this.getVaultKey(email), payload);

      const db = window.TVFirebase?.db;
      if (db) {
        try {
          await db.collection('supercharts_workspaces').doc(this.getDocId(email)).set(payload, { merge: true });
        } catch (_) {}
      }

      if (syncChannel) {
        syncChannel.postMessage({ type: 'CLOUD_SYNC_UPDATE', email, payload });
      }
      window.TVUI?.updateSyncStatusUI?.('Synced');
    },

    attachFirestoreListener(email) {
      if (firestoreUnsub) {
        try { firestoreUnsub(); } catch (_) {}
        firestoreUnsub = null;
      }
      const db = window.TVFirebase?.db;
      if (!db || !email) return;

      try {
        firestoreUnsub = db.collection('supercharts_workspaces').doc(this.getDocId(email)).onSnapshot((doc) => {
          if (doc.exists && !this.isApplyingRemote) {
            const remoteData = doc.data();
            const localVault = loadJSON(this.getVaultKey(email), null);
            if (!localVault || (remoteData.updatedAt || 0) >= (localVault.updatedAt || 0)) {
              saveJSON(this.getVaultKey(email), remoteData);
              this.applySnapshotPayload(remoteData);
            }
          }
        }, () => {});
      } catch (_) {}
    },

    async pullFromCloud(email) {
      if (!email) return false;
      const db = window.TVFirebase?.db;
      if (db) {
        try {
          const doc = await db.collection('supercharts_workspaces').doc(this.getDocId(email)).get();
          if (doc.exists) {
            const remoteData = doc.data();
            saveJSON(this.getVaultKey(email), remoteData);
            this.applySnapshotPayload(remoteData);
            return true;
          }
        } catch (_) {}
      }

      const vault = loadJSON(this.getVaultKey(email), null);
      if (vault) {
        this.applySnapshotPayload(vault);
        return true;
      }
      return false;
    },

    async signInWithVerifiedUser(firebaseUser) {
      const cleanEmail = String(firebaseUser.email || '').trim().toLowerCase();
      const name = (firebaseUser.displayName || cleanEmail.split('@')[0] || 'Trader').trim();
      const avatar = firebaseUser.photoURL || '';

      TVStore.currentUser = {
        uid: firebaseUser.uid,
        email: cleanEmail,
        name,
        avatar,
        verified: true,
        signedInAt: Date.now()
      };
      saveJSON(STORAGE_KEYS.USER_AUTH, TVStore.currentUser);

      const restored = await this.pullFromCloud(cleanEmail);
      if (!restored) {
        await this.pushToCloud();
      }
      this.attachFirestoreListener(cleanEmail);
      return TVStore.currentUser;
    },

    signOut() {
      if (firestoreUnsub) {
        try { firestoreUnsub(); } catch (_) {}
        firestoreUnsub = null;
      }
      TVStore.currentUser = null;
      localStorage.removeItem(STORAGE_KEYS.USER_AUTH);
      if (window.TVFirebase?.auth) {
        try { window.TVFirebase.auth.signOut(); } catch (_) {}
      }
    }
  };

  if (syncChannel) {
    syncChannel.onmessage = (e) => {
      if (e.data?.type === 'CLOUD_SYNC_UPDATE' && TVStore.currentUser?.email === e.data.email) {
        CloudSyncEngine.applySnapshotPayload(e.data.payload);
      }
    };
  }

  window.addEventListener('storage', (e) => {
    if (!TVStore.currentUser?.email) return;
    const expectedKey = CloudSyncEngine.getVaultKey(TVStore.currentUser.email);
    if (e.key === expectedKey && e.newValue) {
      try {
        CloudSyncEngine.applySnapshotPayload(JSON.parse(e.newValue));
      } catch (_) {}
    }
  });

  /* --------------------------------------------------------------------------
     5. QUANTITATIVE, ANCHORED VWAP, VOLUME PROFILE & SMART MONEY MATH
     -------------------------------------------------------------------------- */
  const QuantEngine = {
    calcEMA(arr, period) {
      if (!arr || !arr.length) return [];
      const p = Math.max(1, Number(period) || 9);
      const k = 2 / (p + 1);
      let ema = arr[0].close;
      return arr.map((c, i) => {
        ema = i === 0 ? c.close : c.close * k + ema * (1 - k);
        return ema;
      });
    },

    calcSMA(arr, period) {
      if (!arr || !arr.length) return [];
      const p = Math.max(1, Number(period) || 20);
      const out = [];
      let sum = 0;
      for (let i = 0; i < arr.length; i++) {
        sum += arr[i].close;
        if (i >= p) sum -= arr[i - p].close;
        out.push(i >= p - 1 ? sum / p : null);
      }
      return out;
    },

    calcHeikinAshi(arr) {
      const ha = [];
      for (let i = 0; i < arr.length; i++) {
        const c = arr[i];
        const haClose = (c.open + c.high + c.low + c.close) / 4;
        const haOpen = i === 0 ? (c.open + c.close) / 2 : (ha[i - 1].open + ha[i - 1].close) / 2;
        ha.push({
          time: c.time, open: haOpen, close: haClose,
          high: Math.max(c.high, haOpen, haClose), low: Math.min(c.low, haOpen, haClose), vol: c.vol || 1
        });
      }
      return ha;
    },

    calcBB(arr, period = 20, mult = 2) {
      const out = [];
      for (let i = 0; i < arr.length; i++) {
        if (i < period - 1) { out.push(null); continue; }
        let sum = 0;
        for (let j = 0; j < period; j++) sum += arr[i - j].close;
        const mean = sum / period;
        let sq = 0;
        for (let j = 0; j < period; j++) sq += Math.pow(arr[i - j].close - mean, 2);
        const std = Math.sqrt(sq / period);
        out.push({ mid: mean, upper: mean + mult * std, lower: mean - mult * std });
      }
      return out;
    },

    calcATR(arr, period = 14) {
      if (!arr || !arr.length) return [];
      const tr = arr.map((c, i) => {
        if (i === 0) return c.high - c.low;
        const pc = arr[i - 1].close;
        return Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
      });
      const atr = [];
      let sum = 0;
      for (let i = 0; i < arr.length; i++) {
        if (i < period) { sum += tr[i]; atr.push(sum / (i + 1)); }
        else atr.push((atr[i - 1] * (period - 1) + tr[i]) / period);
      }
      return atr;
    },

    calcSupertrend(arr, period = 10, mult = 3) {
      if (!arr || arr.length < period + 2) return [];
      const atr = this.calcATR(arr, period);
      const st = [];
      let dir = 1, upperBand = 0, lowerBand = 0;
      for (let i = 0; i < arr.length; i++) {
        const hl2 = (arr[i].high + arr[i].low) / 2;
        const bUp = hl2 + mult * atr[i];
        const bLo = hl2 - mult * atr[i];
        if (i === 0) { upperBand = bUp; lowerBand = bLo; }
        else {
          upperBand = (bUp < upperBand || arr[i - 1].close > upperBand) ? bUp : upperBand;
          lowerBand = (bLo > lowerBand || arr[i - 1].close < lowerBand) ? bLo : lowerBand;
        }
        if (i > 0) {
          if (dir === 1 && arr[i].close < lowerBand) dir = -1;
          else if (dir === -1 && arr[i].close > upperBand) dir = 1;
        }
        st.push({ val: dir === 1 ? lowerBand : upperBand, dir });
      }
      return st;
    },

    calcRSI(arr, period = 14) {
      const rsi = new Array(arr.length).fill(null);
      if (!arr || arr.length <= period) return rsi;
      let gains = 0, losses = 0;
      for (let i = 1; i <= period; i++) {
        const d = arr[i].close - arr[i - 1].close;
        if (d >= 0) gains += d; else losses -= d;
      }
      let ag = gains / period, al = losses / period;
      rsi[period] = al === 0 ? 100 : 100 - (100 / (1 + ag / al));
      for (let i = period + 1; i < arr.length; i++) {
        const d = arr[i].close - arr[i - 1].close;
        ag = (ag * (period - 1) + (d > 0 ? d : 0)) / period;
        al = (al * (period - 1) + (d < 0 ? -d : 0)) / period;
        rsi[i] = al === 0 ? 100 : 100 - (100 / (1 + ag / al));
      }
      return rsi;
    },

    calcMACD(arr, fast = 12, slow = 26, sig = 9) {
      const eFast = this.calcEMA(arr, fast);
      const eSlow = this.calcEMA(arr, slow);
      const macdLine = arr.map((_, i) => eFast[i] - eSlow[i]);
      const k = 2 / (sig + 1);
      let s = macdLine[0] || 0;
      const sigLine = macdLine.map((v, i) => { s = i === 0 ? v : v * k + s * (1 - k); return s; });
      const hist = macdLine.map((v, i) => v - sigLine[i]);
      return { macdLine, sigLine, hist };
    },

    calcAnchoredVWAP(arr, startIdx) {
      if (!arr || !arr.length) return [];
      const sIdx = Math.max(0, Math.min(arr.length - 1, Math.round(startIdx)));
      const pts = [];
      let cumPV = 0;
      let cumV = 0;
      for (let i = sIdx; i < arr.length; i++) {
        const b = arr[i];
        const typical = (b.high + b.low + b.close) / 3;
        const vol = Math.max(1, b.vol || 1);
        cumPV += typical * vol;
        cumV += vol;
        pts.push({ idx: i, time: b.time, val: cumPV / cumV });
      }
      return pts;
    },

    calcVPVR(visibleBars, bins = 24) {
      if (!visibleBars || !visibleBars.length) return null;
      let minP = Infinity, maxP = -Infinity;
      visibleBars.forEach(b => {
        if (b.low < minP) minP = b.low;
        if (b.high > maxP) maxP = b.high;
      });
      if (!isFinite(minP) || maxP <= minP) return null;

      const step = (maxP - minP) / bins;
      const profile = Array.from({ length: bins }, (_, idx) => ({
        low: minP + idx * step,
        high: minP + (idx + 1) * step,
        mid: minP + (idx + 0.5) * step,
        bullVol: 0, bearVol: 0, totalVol: 0
      }));

      visibleBars.forEach(b => {
        const vol = b.vol || 1;
        const isBull = b.close >= b.open;
        const startBin = Math.max(0, Math.min(bins - 1, Math.floor((b.low - minP) / step)));
        const endBin = Math.max(0, Math.min(bins - 1, Math.floor((b.high - minP) / step)));
        const share = vol / ((endBin - startBin) + 1);
        for (let k = startBin; k <= endBin; k++) {
          if (isBull) profile[k].bullVol += share;
          else profile[k].bearVol += share;
          profile[k].totalVol += share;
        }
      });

      let maxVol = 0, pocPrice = profile[0].mid;
      profile.forEach(bin => {
        if (bin.totalVol > maxVol) { maxVol = bin.totalVol; pocPrice = bin.mid; }
      });
      return { profile, maxVol, pocPrice };
    },

    detectKillzones(arr) {
      if (!arr || !arr.length) return [];
      const zones = [];
      let curZone = null;
      const getSessionType = (utcHour) => {
        if (utcHour >= 0 && utcHour < 5) return { name: 'ASIA', color: 'rgba(156, 39, 176, 0.14)', border: 'rgba(156, 39, 176, 0.55)' };
        if (utcHour >= 7 && utcHour < 10) return { name: 'LONDON', color: 'rgba(41, 98, 255, 0.14)', border: 'rgba(41, 98, 255, 0.55)' };
        if (utcHour >= 12 && utcHour < 15) return { name: 'NEW YORK', color: 'rgba(8, 153, 129, 0.14)', border: 'rgba(8, 153, 129, 0.55)' };
        return null;
      };
      const startIdx = Math.max(0, arr.length - 250);
      for (let i = startIdx; i < arr.length; i++) {
        const d = new Date(arr[i].time * 1000);
        const h = d.getUTCHours();
        const dayKey = Math.floor(arr[i].time / 86400);
        const sess = getSessionType(h);
        if (sess) {
          const id = `${dayKey}_${sess.name}`;
          if (!curZone || curZone.id !== id) {
            if (curZone) zones.push(curZone);
            curZone = { id, name: sess.name, color: sess.color, border: sess.border, startIdx: i, endIdx: i, high: arr[i].high, low: arr[i].low };
          } else {
            curZone.endIdx = i;
            curZone.high = Math.max(curZone.high, arr[i].high);
            curZone.low = Math.min(curZone.low, arr[i].low);
          }
        } else if (curZone) {
          zones.push(curZone);
          curZone = null;
        }
      }
      if (curZone) zones.push(curZone);
      return zones.slice(-12);
    },

    detectMarketStructure(arr, swingLen = 4) {
      const structures = [], fvgs = [];
      if (!arr || arr.length < swingLen * 2 + 5) return { structures, fvgs };

      const fvgStart = Math.max(2, arr.length - 140);
      for (let i = fvgStart; i < arr.length; i++) {
        if (arr[i].low > arr[i - 2].high) fvgs.push({ type: 'bull', idx: i - 2, top: arr[i].low, bot: arr[i - 2].high });
        else if (arr[i].high < arr[i - 2].low) fvgs.push({ type: 'bear', idx: i - 2, top: arr[i - 2].low, bot: arr[i].high });
      }

      let lastSwingHigh = null, lastSwingLow = null, trend = 0;
      const start = Math.max(swingLen, arr.length - 180);
      for (let i = start; i < arr.length - swingLen; i++) {
        let isHigh = true, isLow = true;
        for (let k = 1; k <= swingLen; k++) {
          if (arr[i].high <= arr[i - k].high || arr[i].high < arr[i + k].high) isHigh = false;
          if (arr[i].low >= arr[i - k].low || arr[i].low > arr[i + k].low) isLow = false;
        }
        if (isHigh) lastSwingHigh = { idx: i, price: arr[i].high, broken: false };
        if (isLow) lastSwingLow = { idx: i, price: arr[i].low, broken: false };

        const curBar = arr[i + swingLen];
        if (lastSwingHigh && !lastSwingHigh.broken && curBar.close > lastSwingHigh.price) {
          lastSwingHigh.broken = true;
          const label = trend === -1 ? 'CHoCH' : 'BOS';
          trend = 1;
          structures.push({ type: 'bull', label, startIdx: lastSwingHigh.idx, endIdx: i + swingLen, price: lastSwingHigh.price });
        }
        if (lastSwingLow && !lastSwingLow.broken && curBar.close < lastSwingLow.price) {
          lastSwingLow.broken = true;
          const label = trend === 1 ? 'CHoCH' : 'BOS';
          trend = -1;
          structures.push({ type: 'bear', label, startIdx: lastSwingLow.idx, endIdx: i + swingLen, price: lastSwingLow.price });
        }
      }
      return { structures: structures.slice(-14), fvgs: fvgs.slice(-10) };
    },

    runBacktest(arr, indData, symMeta) {
      if (!arr || arr.length < 30 || !indData?.ema1 || !indData?.ema2) {
        return { netProfit: 0, totalTrades: 0, winRate: 0, profitFactor: 0, maxDrawdown: 0, trades: [] };
      }
      let pos = null;
      const trades = [];
      let equity = 0, peak = 0, maxDD = 0;

      for (let i = 21; i < arr.length; i++) {
        const e9 = indData.ema1[i], e20 = indData.ema2[i];
        const pe9 = indData.ema1[i - 1], pe20 = indData.ema2[i - 1];
        const c = arr[i];

        if (pe9 <= pe20 && e9 > e20) {
          if (pos && pos.side === 'SHORT') {
            const pnl = (pos.entry - c.close) * 0.1 * symMeta.contractSize;
            trades.push({ ...pos, exit: c.close, exitTime: c.time, pnl });
            equity += pnl;
          }
          pos = { side: 'LONG', entry: c.close, entryTime: c.time };
        } else if (pe9 >= pe20 && e9 < e20) {
          if (pos && pos.side === 'LONG') {
            const pnl = (c.close - pos.entry) * 0.1 * symMeta.contractSize;
            trades.push({ ...pos, exit: c.close, exitTime: c.time, pnl });
            equity += pnl;
          }
          pos = { side: 'SHORT', entry: c.close, entryTime: c.time };
        }
        if (equity > peak) peak = equity;
        if (peak - equity > maxDD) maxDD = peak - equity;
      }

      let grossWin = 0, grossLoss = 0, wins = 0;
      trades.forEach(t => {
        if (t.pnl > 0) { wins++; grossWin += t.pnl; }
        else { grossLoss += Math.abs(t.pnl); }
      });

      return {
        netProfit: equity,
        totalTrades: trades.length,
        winRate: trades.length ? (wins / trades.length) * 100 : 0,
        profitFactor: grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? 9.99 : 0),
        maxDrawdown: maxDD,
        trades: trades.slice(-20).reverse()
      };
    }
  };

  /* --------------------------------------------------------------------------
     6. LIVE DATA FEED PIPELINE
     -------------------------------------------------------------------------- */
  const DataFeed = {
    async fetchWithTimeout(url, ms = 4500) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), ms);
      try {
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return await res.json();
      } catch (err) {
        clearTimeout(timer);
        throw err;
      }
    },

    synthesizeSubMinuteBars(oneMinBars, tfSec) {
      if (!oneMinBars.length) return [];
      const subPerMin = Math.max(2, Math.floor(60 / tfSec));
      const recent = oneMinBars.slice(-Math.ceil(300 / subPerMin));
      const out = [];
      recent.forEach(bar => {
        let cur = bar.open;
        for (let s = 0; s < subPerMin; s++) {
          const isLast = s === subPerMin - 1;
          const target = isLast ? bar.close : bar.open + ((bar.close - bar.open) * ((s + 1) / subPerMin)) + (Math.random() - 0.5) * (bar.high - bar.low) * 0.35;
          const clamped = Math.max(bar.low, Math.min(bar.high, target));
          out.push({
            time: bar.time + s * tfSec,
            open: cur, high: Math.max(cur, clamped), low: Math.min(cur, clamped), close: clamped,
            vol: Math.max(1, Math.round((bar.vol || 10) / subPerMin))
          });
          cur = clamped;
        }
      });
      return out.slice(-300);
    },

    buildSyntheticHistory(sym, tfSec, meta) {
      const nowBucket = Math.floor(Date.now() / 1000 / tfSec) * tfSec;
      let p = TVStore.quotes[sym]?.last || meta.synthBase || 100;
      const bars = [];
      for (let i = 280; i >= 0; i--) {
        const t = nowBucket - i * tfSec;
        const o = p;
        const delta = (Math.random() - 0.495) * (p * 0.0011);
        const c = o + delta;
        bars.push({
          time: t, open: o,
          high: Math.max(o, c) + Math.abs(delta) * 0.45,
          low: Math.min(o, c) - Math.abs(delta) * 0.45,
          close: c, vol: Math.floor(40 + Math.random() * 180)
        });
        p = c;
      }
      return bars;
    },

    async loadHistorical(sym, tfSec) {
      const meta = TVStore.getSymMeta(sym);
      const tfStr = String(tfSec);
      const tfCfg = TF_MAP[tfStr] || {
        binance: tfSec < 60 ? '1m' : tfSec < 3600 ? '5m' : tfSec < 86400 ? '1h' : '1d',
        kraken: tfSec < 3600 ? '5' : tfSec < 86400 ? '60' : '1440',
        subMin: tfSec < 60
      };

      if (meta.binance) {
        try {
          const raw = await this.fetchWithTimeout(`https://data-api.binance.vision/api/v3/klines?symbol=${meta.binance}&interval=${tfCfg.binance}&limit=300`);
          const bars = raw.map(k => ({
            time: Math.floor(k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], vol: +k[5]
          }));
          return tfCfg.subMin ? this.synthesizeSubMinuteBars(bars, tfSec) : bars;
        } catch (_) {
          return this.buildSyntheticHistory(sym, tfSec, meta);
        }
      }

      if (meta.kraken) {
        try {
          const j = await this.fetchWithTimeout(`https://api.kraken.com/0/public/OHLC?pair=${meta.kraken}&interval=${tfCfg.kraken}`);
          const pk = Object.keys(j.result).find(k => k !== 'last');
          const bars = j.result[pk].slice(-300).map(k => ({
            time: Number(k[0]), open: +k[1], high: +k[2], low: +k[3], close: +k[4], vol: +k[6]
          }));
          return tfCfg.subMin ? this.synthesizeSubMinuteBars(bars, tfSec) : bars;
        } catch (_) {
          return this.buildSyntheticHistory(sym, tfSec, meta);
        }
      }

      return this.buildSyntheticHistory(sym, tfSec, meta);
    },

    subscribeLive(sym, onTick, registerCleanup) {
      const meta = TVStore.getSymMeta(sym);
      let closed = false;

      const addSocket = (url, onOpen, onMsg) => {
        if (closed) return;
        try {
          const ws = new WebSocket(url);
          ws.onopen = () => { if (!closed && onOpen) onOpen(ws); };
          ws.onmessage = (e) => { if (!closed) onMsg(JSON.parse(e.data)); };
          ws.onclose = () => {
            if (!closed) {
              const t = setTimeout(() => addSocket(url, onOpen, onMsg), 1500);
              registerCleanup(() => clearTimeout(t));
            }
          };
          registerCleanup(() => { try { ws.close(); } catch (_) {} });
        } catch (_) {}
      };

      if (meta.binance) {
        const bSym = meta.binance;
        const bLow = bSym.toLowerCase();
        addSocket(
          `wss://data-stream.binance.vision/stream?streams=${bLow}@bookTicker/${bLow}@depth5@100ms`,
          null,
          (msg) => {
            if (!msg.data) return;
            if (msg.stream.includes('@bookTicker') && msg.data.b) onTick(+msg.data.b, +msg.data.a);
            else if (msg.stream.includes('@depth5') && msg.data.bids?.[0]) onTick(+msg.data.bids[0][0], +msg.data.asks[0][0]);
          }
        );
        const poll = setInterval(async () => {
          if (closed) return;
          try {
            const t = await this.fetchWithTimeout(`https://data-api.binance.vision/api/v3/ticker/bookTicker?symbol=${bSym}`, 2000);
            onTick(+t.bidPrice, +t.askPrice);
          } catch (_) {}
        }, 700);
        registerCleanup(() => { closed = true; clearInterval(poll); });
        return;
      }

      if (meta.kraken) {
        if (meta.coinbase) {
          addSocket(
            'wss://ws-feed.exchange.coinbase.com',
            (s) => s.send(JSON.stringify({ type: 'subscribe', product_ids: [meta.coinbase], channels: ['ticker'] })),
            (m) => { if (m.type === 'ticker' && m.price) onTick(Number(m.best_bid || m.price), Number(m.best_ask || m.price)); }
          );
        }
        addSocket(
          'wss://ws.kraken.com/v2',
          (s) => s.send(JSON.stringify({ method: 'subscribe', params: { channel: 'ticker', symbol: [KRAKEN_WS_MAP[meta.kraken]] } })),
          (m) => { if (m.channel === 'ticker' && m.data?.[0]) onTick(Number(m.data[0].bid || m.data[0].last), Number(m.data[0].ask || m.data[0].last)); }
        );
        const poll = setInterval(async () => {
          if (closed) return;
          try {
            const js = await this.fetchWithTimeout(`https://api.kraken.com/0/public/Ticker?pair=${meta.kraken}`, 2000);
            const k = Object.keys(js.result)[0];
            onTick(+js.result[k].b[0], +js.result[k].a[0]);
          } catch (_) {}
        }, 800);
        registerCleanup(() => { closed = true; clearInterval(poll); });
        return;
      }

      let px = TVStore.quotes[sym]?.last || meta.synthBase || 100;
      const timer = setInterval(() => {
        if (closed) return;
        px += (Math.random() - 0.5) * (px * 0.00022);
        onTick(px, px + px * 0.00012);
      }, 650);
      registerCleanup(() => { closed = true; clearInterval(timer); });
    }
  };

  /* --------------------------------------------------------------------------
     7. PAPER TRADING & CSV EXPORT
     -------------------------------------------------------------------------- */
  const TradingEngine = {
    placeOrder(sym, side, type, lot, entryPrice, sl = null, tp = null) {
      const order = {
        id: 'ord_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
        sym, side, type,
        status: type === 'MARKET' ? 'OPEN' : 'PENDING',
        lot: Math.max(0.01, Number(lot) || 0.01),
        entry: Number(entryPrice),
        sl: sl ? Number(sl) : null,
        tp: tp ? Number(tp) : null,
        openedAt: new Date().toLocaleTimeString()
      };
      TVStore.paper.positions.push(order);
      TVStore.savePaper();
      return order;
    },

    closeOrder(orderId, closePrice) {
      const idx = TVStore.paper.positions.findIndex(p => p.id === orderId);
      if (idx === -1) return null;
      const pos = TVStore.paper.positions[idx];
      const pnl = pos.status === 'OPEN' ? this.calcUnrealizedPnL(pos, closePrice) : 0;
      if (pos.status === 'OPEN') {
        TVStore.paper.balance += pnl;
        TVStore.paper.history.unshift({ ...pos, closePrice, closedAt: new Date().toLocaleTimeString(), pnl });
        if (TVStore.paper.history.length > 40) TVStore.paper.history.pop();
      }
      TVStore.paper.positions.splice(idx, 1);
      TVStore.savePaper();
      return pnl;
    },

    calcUnrealizedPnL(pos, currentPrice) {
      if (pos.status !== 'OPEN') return 0;
      const meta = TVStore.getSymMeta(pos.sym);
      const diff = pos.side === 'BUY' ? (currentPrice - pos.entry) : (pos.entry - currentPrice);
      return diff * pos.lot * meta.contractSize;
    },

    processPriceTick(sym, currentPrice) {
      let updated = false;
      const toClose = [];
      TVStore.paper.positions.forEach(pos => {
        if (pos.sym !== sym) return;
        if (pos.status === 'PENDING') {
          if ((pos.side === 'BUY' && currentPrice <= pos.entry) || (pos.side === 'SELL' && currentPrice >= pos.entry)) {
            pos.status = 'OPEN';
            pos.openedAt = new Date().toLocaleTimeString();
            updated = true;
          }
        }
        if (pos.status === 'OPEN') {
          if (pos.sl != null && ((pos.side === 'BUY' && currentPrice <= pos.sl) || (pos.side === 'SELL' && currentPrice >= pos.sl))) {
            toClose.push({ id: pos.id, px: pos.sl, reason: 'Stop Loss' });
          }
          if (pos.tp != null && ((pos.side === 'BUY' && currentPrice >= pos.tp) || (pos.side === 'SELL' && currentPrice <= pos.tp))) {
            toClose.push({ id: pos.id, px: pos.tp, reason: 'Take Profit' });
          }
        }
      });
      toClose.forEach(c => {
        this.closeOrder(c.id, c.px);
        if (window.TVUI?.toast) window.TVUI.toast(`${c.reason} hit on ${sym} @ ${c.px}`);
        updated = true;
      });
      if (updated) TVStore.savePaper();
      return updated;
    }
  };

  function exportPaneToCSV(pane) {
    if (!pane || !pane.data.length) return;
    const prec = TVStore.getSymMeta(pane.sym).prec;
    const rows = ['Timestamp_UTC,Open,High,Low,Close,Volume,EMA9,EMA20,RSI14'];
    pane.data.forEach((b, i) => {
      rows.push([
        new Date(b.time * 1000).toISOString(),
        pane.disp(b.open).toFixed(prec),
        pane.disp(b.high).toFixed(prec),
        pane.disp(b.low).toFixed(prec),
        pane.disp(b.close).toFixed(prec),
        Math.round(b.vol || 1),
        pane.ind.ema1?.[i] != null ? pane.disp(pane.ind.ema1[i]).toFixed(prec) : '',
        pane.ind.ema2?.[i] != null ? pane.disp(pane.ind.ema2[i]).toFixed(prec) : '',
        pane.ind.rsi?.[i] != null ? pane.ind.rsi[i].toFixed(2) : ''
      ].join(','));
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pane.sym}_${TVStore.getTfLabel(pane.tf)}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function distToSegment(px, py, x1, y1, x2, y2) {
    const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
  }

  window.TVStore = TVStore;
  window.CloudSyncEngine = CloudSyncEngine;
  window.QuantEngine = QuantEngine;
  window.DataFeed = DataFeed;
  window.TradingEngine = TradingEngine;
  window.exportPaneToCSV = exportPaneToCSV;
  window.distToSegment = distToSegment;
})();
