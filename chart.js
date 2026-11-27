/* ============================================================================
   CHART.JS — TradingView Crosshair, Single Live Dotted Line, 1-Tap Settings,
              All Free & Pro/Paid Drawing Tools (Patterns, Pitchforks, VWAP, VP)
   ============================================================================ */

(function () {
  'use strict';

  const { TVStore, QuantEngine, DataFeed, TradingEngine, distToSegment } = window;

  const SINGLE_PT_TOOLS = new Set([
    'hline', 'hray', 'vline', 'crossline', 'cycliclines',
    'anchoredvwap',
    'text', 'anchoredtext', 'note', 'pricenote', 'callout', 'comment',
    'pricelabel', 'arrowmark', 'arrowup', 'arrowdown', 'flag'
  ]);

  const MULTI_PT_MAX = {
    triangle: 3,
    pitchfork: 3,
    schiffpitchfork: 3,
    modschiff: 3,
    insidepitchfork: 3,
    trendfib: 3,
    abcd: 4,
    elliottabc: 4,
    xabcd: 5,
    cypher: 5,
    threedrives: 6,
    elliott12345: 6,
    elliottabcde: 6,
    headshoulders: 7,
    path: 99
  };

  function playBeep() {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.15, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start();
      osc.stop(ac.currentTime + 0.35);
    } catch (_) {}
  }

  function computeCompactPriceTicks(minP, maxP, plotHeightPx) {
    const span = maxP - minP;
    if (!isFinite(span) || span <= 0) return [];
    const targetCount = Math.max(7, Math.min(20, Math.floor(plotHeightPx / 34)));
    const rawStep = span / targetCount;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const residual = rawStep / mag;
    let niceMult = 1;
    if (residual > 5) niceMult = 10;
    else if (residual > 2.5) niceMult = 5;
    else if (residual > 2) niceMult = 2.5;
    else if (residual > 1) niceMult = 2;
    const step = niceMult * mag;

    const firstTick = Math.ceil(minP / step) * step;
    const ticks = [];
    for (let v = firstTick; v < maxP; v += step) {
      ticks.push(v);
    }
    return ticks;
  }

  class SuperChartPane {
    constructor(id, defaultSym, defaultTf) {
      this.id = id;
      this.el = document.getElementById('pane' + id);
      this.canvas = document.getElementById('canvas' + id);
      this.ctx = this.canvas.getContext('2d');

      this.sym = defaultSym;
      this.tf = defaultTf;
      this.chartStyle = 'candles';
      this.fullData = [];
      this.data = [];
      this.renderBars = [];
      this.ind = {};

      this.drawings = [];
      this.undoStack = [];
      this.redoStack = [];
      this.draftDrawing = null;
      this.activeMultiDrawing = null;
      this.selectedDrawingId = null;
      this.alerts = [];

      this.lastBid = null;
      this.lastAsk = null;
      this.offset = 0;

      this.candleStep = 8;
      this.scrollOffset = 6;
      this.autoScale = true;
      this.pctScale = false;
      this.logScale = false;
      this.viewMinP = 0;
      this.viewMaxP = 1;

      this.crosshairActive = false;
      this.crossX = null;
      this.crossY = null;
      this.syncedTime = null;
      this.syncedPrice = null;

      this.replayWaitingPick = false;
      this.replayActive = false;
      this.replayIdx = 0;

      this.reqId = 0;
      this.cleanups = [];
      this._rafScheduled = false;

      this.bindEvents();
    }

    scheduleDraw() {
      if (this._rafScheduled) return;
      this._rafScheduled = true;
      requestAnimationFrame(() => {
        this._rafScheduled = false;
        this._renderFrame();
      });
    }

    draw() {
      this.scheduleDraw();
    }

    disp(v) {
      return v + this.offset;
    }

    isNavTool(t = TVStore.activeTool) {
      return ['cursor', 'dot', 'arrow'].includes(t);
    }

    zoomAtScreenX(newStep, anchorScreenX) {
      const clampedStep = Math.max(2.5, Math.min(48, newStep));
      const bars = this.renderBars.length ? this.renderBars : this.data;
      if (!bars.length) {
        this.candleStep = clampedStep;
        this.scheduleDraw();
        return;
      }
      const { plotW } = this.getLayoutMetrics();
      const safeAnchorX = anchorScreenX != null ? Math.max(0, Math.min(plotW, anchorScreenX)) : plotW * 0.5;
      const oldStep = this.candleStep;
      const oldRightFloatIdx = (bars.length - 1) + this.scrollOffset;

      const anchorBarIdx = oldRightFloatIdx - (plotW - safeAnchorX - oldStep / 2) / oldStep;
      const newRightFloatIdx = anchorBarIdx + (plotW - safeAnchorX - clampedStep / 2) / clampedStep;
      this.candleStep = clampedStep;
      this.scrollOffset = newRightFloatIdx - (bars.length - 1);
      this.scheduleDraw();
    }

    activateToolAimCrosshair() {
      const { plotW, mainH } = this.getLayoutMetrics();
      if (this.crossX === null || this.crossY === null) {
        this.crossX = Math.round(plotW * 0.5);
        this.crossY = Math.round(mainH * 0.48);
      }
      this.crosshairActive = true;
      this.scheduleDraw();
    }

    completeActiveMultiDrawing() {
      if (!this.activeMultiDrawing) return;
      const doneObj = this.activeMultiDrawing;
      this.activeMultiDrawing = null;
      document.getElementById('multiPtFinishBar')?.classList.add('hidden');
      if (doneObj.pts && doneObj.pts.length >= 2) {
        this.drawings.push(doneObj);
        this.saveDrawings();
        this.selectedDrawingId = doneObj.id;
        window.TVUI?.updateObjectEditBar?.();
      }
      if (!TVStore.stayInDrawingMode) {
        window.TVUI?.setActiveTool?.('cursor');
        this.crosshairActive = false;
        this.crossX = null;
        this.crossY = null;
      }
      this.scheduleDraw();
    }

    cancelActiveMultiDrawing() {
      this.activeMultiDrawing = null;
      document.getElementById('multiPtFinishBar')?.classList.add('hidden');
      this.scheduleDraw();
    }

    isDrawingVisibleOnTf(d) {
      if (d.hidden) return false;
      if (!d.visTfs || d.visTfs === 'all') return true;
      const curTf = Number(this.tf);
      if (curTf < 60) return d.visTfs.includes('sec');
      return d.visTfs.includes(String(curTf));
    }

    pushHistory() {
      this.undoStack.push(JSON.stringify(this.drawings));
      if (this.undoStack.length > 40) this.undoStack.shift();
      this.redoStack = [];
    }

    undo() {
      if (!this.undoStack.length) return false;
      this.redoStack.push(JSON.stringify(this.drawings));
      this.drawings = JSON.parse(this.undoStack.pop());
      this.selectedDrawingId = null;
      this.saveDrawings();
      window.TVUI?.updateObjectEditBar?.();
      this.scheduleDraw();
      return true;
    }

    redo() {
      if (!this.redoStack.length) return false;
      this.undoStack.push(JSON.stringify(this.drawings));
      this.drawings = JSON.parse(this.redoStack.pop());
      this.selectedDrawingId = null;
      this.saveDrawings();
      window.TVUI?.updateObjectEditBar?.();
      this.scheduleDraw();
      return true;
    }

    loadStoredMeta() {
      this.offset = TVStore.getOffset(this.sym);
      this.drawings = TVStore.getDrawings(this.sym);
      this.alerts = TVStore.getAlerts(this.sym);
      this.undoStack = [];
      this.redoStack = [];
      this.selectedDrawingId = null;
      this.draftDrawing = null;
      this.activeMultiDrawing = null;
      document.getElementById('multiPtFinishBar')?.classList.add('hidden');
      window.TVUI?.updateObjectEditBar?.();
    }

    saveDrawings() {
      TVStore.setDrawings(this.sym, this.drawings);
      window.TVUI?.renderObjectTree?.();
    }

    saveAlerts() {
      TVStore.setAlerts(this.sym, this.alerts);
      window.TVUI?.renderAlertsPanel?.();
    }

    resize() {
      if (!this.el || this.el.classList.contains('hidden')) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = this.el.clientWidth;
      const h = this.el.clientHeight;
      if (!w || !h) return;
      this.canvas.width = Math.floor(w * dpr);
      this.canvas.height = Math.floor(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.scheduleDraw();
    }

    recompute() {
      if (this.replayActive && this.fullData.length) {
        this.data = this.fullData.slice(0, this.replayIdx + 1);
      } else {
        this.data = this.fullData;
      }
      if (!this.data.length) return;

      this.renderBars = this.chartStyle === 'heikin'
        ? QuantEngine.calcHeikinAshi(this.data)
        : this.data;

      const cfg = TVStore.indicators;

      if (cfg.emaFast?.enabled) {
        const ef = cfg.emaFast?.params || { p1: 9, p2: 20 };
        this.ind.ema1 = QuantEngine.calcEMA(this.data, ef.p1);
        this.ind.ema2 = QuantEngine.calcEMA(this.data, ef.p2);
      } else {
        this.ind.ema1 = null;
        this.ind.ema2 = null;
      }

      if (cfg.emaSlow?.enabled) {
        const es = cfg.emaSlow?.params || { p1: 50, p2: 200 };
        this.ind.ema3 = QuantEngine.calcEMA(this.data, es.p1);
        this.ind.ema4 = QuantEngine.calcEMA(this.data, es.p2);
      } else {
        this.ind.ema3 = null;
        this.ind.ema4 = null;
      }

      if (cfg.sma?.enabled) {
        const sm = cfg.sma?.params || { p1: 20, p2: 50 };
        this.ind.sma1 = QuantEngine.calcSMA(this.data, sm.p1);
        this.ind.sma2 = QuantEngine.calcSMA(this.data, sm.p2);
      } else {
        this.ind.sma1 = null;
        this.ind.sma2 = null;
      }

      if (cfg.bb?.enabled) {
        const bbP = cfg.bb.params || { period: 20, mult: 2 };
        this.ind.bb = QuantEngine.calcBB(this.data, bbP.period, bbP.mult);
      } else {
        this.ind.bb = null;
      }

      if (cfg.st?.enabled) {
        const stP = cfg.st.params || { period: 10, mult: 3 };
        this.ind.st = QuantEngine.calcSupertrend(this.data, stP.period, stP.mult);
      } else {
        this.ind.st = null;
      }

      this.ind.killzones = cfg.killzones?.enabled ? QuantEngine.detectKillzones(this.data) : null;

      if (cfg.smc?.enabled) {
        const smcP = cfg.smc.params || { swingLen: 5 };
        this.ind.smc = QuantEngine.detectMarketStructure(this.data, smcP.swingLen);
      } else {
        this.ind.smc = null;
      }

      if (cfg.rsi?.enabled) {
        const rsiP = cfg.rsi.params || { period: 14 };
        this.ind.rsi = QuantEngine.calcRSI(this.data, rsiP.period);
      } else {
        this.ind.rsi = null;
      }

      if (cfg.macd?.enabled) {
        const macdP = cfg.macd.params || { fast: 12, slow: 26, sig: 9 };
        this.ind.macd = QuantEngine.calcMACD(this.data, macdP.fast, macdP.slow, macdP.sig);
      } else {
        this.ind.macd = null;
      }

      if (cfg.atr?.enabled) {
        const atrP = cfg.atr.params || { period: 14 };
        this.ind.atr = QuantEngine.calcATR(this.data, atrP.period);
      } else {
        this.ind.atr = null;
      }
    }

    timeToIdx(t) {
      if (!this.data.length) return 0;
      const tfSec = Number(this.tf);
      const firstT = this.data[0].time;
      const lastIdx = this.data.length - 1;
      const lastT = this.data[lastIdx].time;
      if (t >= lastT) return lastIdx + (t - lastT) / tfSec;
      if (t <= firstT) return (t - firstT) / tfSec;
      let lo = 0, hi = lastIdx;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (this.data[mid].time === t) return mid;
        if (this.data[mid].time < t) lo = mid + 1;
        else hi = mid - 1;
      }
      return hi + (t - this.data[hi].time) / tfSec;
    }

    idxToTime(idx) {
      if (!this.data.length) return Math.floor(Date.now() / 1000);
      const tfSec = Number(this.tf);
      const rIdx = Math.round(idx);
      if (rIdx >= 0 && rIdx < this.data.length) return this.data[rIdx].time + (idx - rIdx) * tfSec;
      if (rIdx < 0) return this.data[0].time + idx * tfSec;
      const lastIdx = this.data.length - 1;
      return this.data[lastIdx].time + (idx - lastIdx) * tfSec;
    }

    getActiveSubPanes() {
      const list = [];
      const cfg = TVStore.indicators;
      if (cfg.rsi?.enabled && !cfg.rsi?.hidden) list.push('rsi');
      if (cfg.macd?.enabled && !cfg.macd?.hidden) list.push('macd');
      if (cfg.atr?.enabled && !cfg.atr?.hidden) list.push('atr');
      return list;
    }

    getLayoutMetrics() {
      const W = this.el.clientWidth;
      const H = this.el.clientHeight;
      const axisRightW = 68;
      const axisBottomH = 22;
      const plotW = Math.max(50, W - axisRightW);
      const totalPlotH = Math.max(50, H - axisBottomH);
      const subPanes = this.getActiveSubPanes();
      const subEachH = subPanes.length ? Math.min(72, Math.floor((totalPlotH * 0.42) / subPanes.length)) : 0;
      const totalSubH = subEachH * subPanes.length;
      const mainH = Math.max(60, totalPlotH - totalSubH);
      return { W, H, axisRightW, axisBottomH, plotW, totalPlotH, mainH, subPanes, subEachH };
    }

    mapPriceToNorm(p) {
      if (this.logScale && p > 0) return Math.log(p);
      return p;
    }

    mapNormToPrice(n) {
      if (this.logScale) return Math.exp(n);
      return n;
    }

    screenToData(sx, sy, useMagnet = false) {
      const { plotW, mainH } = this.getLayoutMetrics();
      const rightFloatIdx = (this.data.length - 1) + this.scrollOffset;
      const idx = rightFloatIdx - (plotW - sx - this.candleStep / 2) / this.candleStep;
      let time = this.idxToTime(idx);
      const nMin = this.mapPriceToNorm(this.viewMinP);
      const nMax = this.mapPriceToNorm(this.viewMaxP);
      const normVal = nMin + ((mainH - sy) / mainH) * (nMax - nMin);
      let price = this.mapNormToPrice(normVal);

      if (useMagnet && TVStore.magnetLevel > 0 && this.data.length) {
        const nearIdx = Math.max(0, Math.min(this.data.length - 1, Math.round(idx)));
        const bar = this.data[nearIdx];
        if (bar) {
          const cands = [this.disp(bar.open), this.disp(bar.high), this.disp(bar.low), this.disp(bar.close)];
          let best = cands[0], bestD = Math.abs(price - best);
          cands.forEach(v => {
            const d = Math.abs(price - v);
            if (d < bestD) { bestD = d; best = v; }
          });
          const thresh = (this.viewMaxP - this.viewMinP) * (TVStore.magnetLevel === 2 ? 0.35 : 0.06);
          if (TVStore.magnetLevel === 2 || bestD <= thresh) {
            time = bar.time;
            price = best;
          }
        }
      }
      return { idx, time, price };
    }

    dataToScreen(time, price) {
      const { plotW, mainH } = this.getLayoutMetrics();
      const idx = this.timeToIdx(time);
      const rightFloatIdx = (this.data.length - 1) + this.scrollOffset;
      const x = plotW - (rightFloatIdx - idx) * this.candleStep - this.candleStep / 2;
      const nMin = this.mapPriceToNorm(this.viewMinP);
      const nMax = this.mapPriceToNorm(this.viewMaxP);
      const nVal = this.mapPriceToNorm(price);
      const y = mainH - ((nVal - nMin) / ((nMax - nMin) || 1)) * mainH;
      return { x, y, idx };
    }

    getHandles(d) {
      const { plotW } = this.getLayoutMetrics();
      const p1 = this.dataToScreen(d.t1, d.p1);
      if (d.type === 'hline') return [{ idx: 0, x: plotW * 0.5, y: p1.y }];
      if (d.type === 'vline') return [{ idx: 0, x: p1.x, y: 110 }];
      if (['hray', 'crossline', 'cycliclines', 'anchoredvwap'].includes(d.type)) {
        return [{ idx: 0, x: p1.x, y: p1.y }];
      }
      if (['text', 'anchoredtext', 'note', 'pricenote', 'callout', 'comment', 'pricelabel', 'arrowmark', 'arrowup', 'arrowdown', 'flag'].includes(d.type)) {
        return [{ idx: 0, x: p1.x, y: p1.y }];
      }
      if (d.pts?.length && d.type !== 'brush' && d.type !== 'highlighter') {
        return d.pts.map((pt, idx) => {
          const s = this.dataToScreen(pt.t, pt.p);
          return { idx, x: s.x, y: s.y };
        });
      }
      if (d.type === 'brush' || d.type === 'highlighter') {
        const last = d.pts?.[d.pts.length - 1] || { t: d.t1, p: d.p1 };
        const pEnd = this.dataToScreen(last.t, last.p);
        return [{ idx: 0, x: p1.x, y: p1.y }, { idx: 1, x: pEnd.x, y: pEnd.y }];
      }
      const p2 = this.dataToScreen(d.t2 ?? d.t1, d.p2 ?? d.p1);
      if (d.type === 'channel' || d.type === 'flattop' || d.type === 'disjoint') {
        const midT = (d.t1 + (d.t2 ?? d.t1)) / 2;
        const midP = ((d.p1 + (d.p2 ?? d.p1)) / 2) + (d.channelOffset || 0);
        const p3 = this.dataToScreen(midT, midP);
        return [{ idx: 0, x: p1.x, y: p1.y }, { idx: 1, x: p2.x, y: p2.y }, { idx: 2, x: p3.x, y: p3.y }];
      }
      if (['rect', 'rotrect', 'pricerange', 'daterange', 'datetime_range', 'fixedvp'].includes(d.type)) {
        return [
          { idx: 0, x: p1.x, y: p1.y }, { idx: 1, x: p2.x, y: p2.y },
          { idx: 2, x: p2.x, y: p1.y }, { idx: 3, x: p1.x, y: p2.y }
        ];
      }
      if (d.type === 'long' || d.type === 'short') {
        const p3 = this.dataToScreen(d.t2 ?? d.t1, d.p3 ?? d.p1);
        return [{ idx: 0, x: p1.x, y: p1.y }, { idx: 1, x: p2.x, y: p2.y }, { idx: 2, x: p2.x, y: p3.y }];
      }
      return [{ idx: 0, x: p1.x, y: p1.y }, { idx: 1, x: p2.x, y: p2.y }];
    }

    hitTest(sx, sy) {
      const { plotW } = this.getLayoutMetrics();

      for (const al of this.alerts) {
        if (!al.active) continue;
        const yAl = this.dataToScreen(this.idxToTime(0), al.price).y;
        if (Math.abs(sy - yAl) <= 15 && sx <= plotW) return { alertItem: al };
      }

      for (const pos of TVStore.paper.positions) {
        if (pos.sym !== this.sym) continue;
        const yEnt = this.dataToScreen(this.idxToTime(0), pos.entry).y;
        if (pos.sl != null) {
          const ySl = this.dataToScreen(this.idxToTime(0), pos.sl).y;
          if (Math.abs(sy - ySl) <= 15 && sx <= plotW) return { orderPos: pos, orderField: 'sl' };
        }
        if (pos.tp != null) {
          const yTp = this.dataToScreen(this.idxToTime(0), pos.tp).y;
          if (Math.abs(sy - yTp) <= 15 && sx <= plotW) return { orderPos: pos, orderField: 'tp' };
        }
        if (Math.abs(sy - yEnt) <= 13 && sx >= plotW - 150 && sx <= plotW) return { orderPos: pos, orderField: 'autoSlTp' };
      }

      if (TVStore.hideAllDrawings) return null;

      if (this.selectedDrawingId) {
        const sel = this.drawings.find(d => d.id === this.selectedDrawingId);
        if (sel && !sel.locked && this.isDrawingVisibleOnTf(sel)) {
          for (const h of this.getHandles(sel)) {
            if (Math.hypot(sx - h.x, sy - h.y) <= 24) return { drawing: sel, handleIdx: h.idx };
          }
        }
      }

      for (let i = this.drawings.length - 1; i >= 0; i--) {
        const d = this.drawings[i];
        if (!this.isDrawingVisibleOnTf(d)) continue;
        if (!d.locked) {
          for (const h of this.getHandles(d)) {
            if (Math.hypot(sx - h.x, sy - h.y) <= 22) return { drawing: d, handleIdx: h.idx };
          }
        }
        const p1 = this.dataToScreen(d.t1, d.p1);
        const p2 = this.dataToScreen(d.t2 ?? d.t1, d.p2 ?? d.p1);

        if (d.type === 'hline' && Math.abs(sy - p1.y) <= 18) return { drawing: d, handleIdx: null };
        if (d.type === 'hray' && Math.abs(sy - p1.y) <= 18 && sx >= p1.x - 10) return { drawing: d, handleIdx: null };
        if ((d.type === 'vline' || d.type === 'cycliclines') && Math.abs(sx - p1.x) <= 18) return { drawing: d, handleIdx: null };
        if (d.type === 'crossline' && (Math.abs(sy - p1.y) <= 16 || Math.abs(sx - p1.x) <= 16)) return { drawing: d, handleIdx: null };

        if (d.type === 'anchoredvwap') {
          if (Math.hypot(sx - p1.x, sy - p1.y) <= 24 || (sx >= p1.x && Math.abs(sy - p1.y) <= 35)) {
            return { drawing: d, handleIdx: null };
          }
        }

        if (d.pts?.length > 1) {
          for (let j = 1; j < d.pts.length; j++) {
            const a = this.dataToScreen(d.pts[j - 1].t, d.pts[j - 1].p);
            const b = this.dataToScreen(d.pts[j].t, d.pts[j].p);
            if (distToSegment(sx, sy, a.x, a.y, b.x, b.y) <= 18) return { drawing: d, handleIdx: null };
          }
        }

        if (['trend', 'infoline', 'trendangle', 'measure', 'channel', 'regression', 'flattop', 'disjoint', 'forecast'].includes(d.type)) {
          if (distToSegment(sx, sy, p1.x, p1.y, p2.x, p2.y) <= 20) return { drawing: d, handleIdx: null };
          if (d.type === 'channel' || d.type === 'flattop' || d.type === 'disjoint') {
            const p1b = this.dataToScreen(d.t1, d.p1 + (d.channelOffset || 0));
            const p2b = this.dataToScreen(d.t2 ?? d.t1, (d.p2 ?? d.p1) + (d.channelOffset || 0));
            if (distToSegment(sx, sy, p1b.x, p1b.y, p2b.x, p2b.y) <= 20) return { drawing: d, handleIdx: null };
          }
        }
        if (d.type === 'ray' || d.type === 'extline') {
          const dx = p2.x - p1.x, dy = p2.y - p1.y, len = Math.hypot(dx, dy) || 1;
          const sX = d.type === 'extline' ? p1.x - (dx / len) * 2000 : p1.x;
          const sY = d.type === 'extline' ? p1.y - (dy / len) * 2000 : p1.y;
          if (distToSegment(sx, sy, sX, sY, p1.x + (dx / len) * 2000, p1.y + (dy / len) * 2000) <= 20) {
            return { drawing: d, handleIdx: null };
          }
        }
        if (['rect', 'rotrect', 'fib', 'fibchannel', 'fibtimezone', 'fibfan', 'fibarc', 'fibcircles', 'gannbox', 'gannsquare', 'gannfan', 'circle', 'poly_triangle', 'curve', 'doublecurve', 'arc', 'pricerange', 'daterange', 'datetime_range', 'barspattern', 'ghostfeed', 'fixedvp'].includes(d.type)) {
          const minX = Math.min(p1.x, p2.x) - 14, maxX = Math.max(p1.x, p2.x, p1.x + 60) + 14;
          const minY = Math.min(p1.y, p2.y) - 14, maxY = Math.max(p1.y, p2.y) + 14;
          if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) return { drawing: d, handleIdx: null };
        }
        if (d.type === 'long' || d.type === 'short') {
          const p3 = this.dataToScreen(d.t2 ?? d.t1, d.p3 ?? d.p1);
          const minX = Math.min(p1.x, p2.x) - 14, maxX = Math.max(p1.x, p2.x, p1.x + 60) + 14;
          const minY = Math.min(p1.y, p2.y, p3.y) - 14, maxY = Math.max(p1.y, p2.y, p3.y) + 14;
          if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) return { drawing: d, handleIdx: null };
        }
        if (SINGLE_PT_TOOLS.has(d.type)) {
          if (sx >= p1.x - 18 && sx <= p1.x + 120 && sy >= p1.y - 26 && sy <= p1.y + 18) {
            return { drawing: d, handleIdx: null };
          }
        }
      }
      return null;
    }

    formatAxisTime(sec) {
      const d = new Date((sec + TVStore.tzOffsetSec) * 1000);
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const mon = TVStore.months[d.getUTCMonth()];
      const hh = String(d.getUTCHours()).padStart(2, '0');
      const mm = String(d.getUTCMinutes()).padStart(2, '0');
      const ss = String(d.getUTCSeconds()).padStart(2, '0');
      if (Number(this.tf) < 60) return `${hh}:${mm}:${ss}`;
      return `${dd} ${mon} ${hh}:${mm}`;
    }

    formatCrosshairBottomPill(sec) {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const d = new Date((sec + TVStore.tzOffsetSec) * 1000);
      const dow = days[d.getUTCDay()];
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const mon = TVStore.months[d.getUTCMonth()];
      const yy = String(d.getUTCFullYear()).slice(-2);
      const hh = String(d.getUTCHours()).padStart(2, '0');
      const mm = String(d.getUTCMinutes()).padStart(2, '0');
      return `${dow} ${dd} ${mon} '${yy} ${hh}:${mm}`;
    }

    getCountdown() {
      const tfSec = Number(this.tf);
      const rem = tfSec - (Math.floor(Date.now() / 1000) % tfSec);
      const h = Math.floor(rem / 3600);
      const m = Math.floor((rem % 3600) / 60);
      const s = rem % 60;
      return h > 0
        ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    _renderFrame() {
      const { W, H, axisRightW, axisBottomH, plotW, totalPlotH, mainH, subPanes, subEachH } = this.getLayoutMetrics();
      if (!W || !H) return;
      const ctx = this.ctx;
      const meta = TVStore.getSymMeta(this.sym);
      const prec = meta.prec;
      const stg = TVStore.settings;
      const indCfg = TVStore.indicators;
      const isLight = TVStore.theme === 'light';

      const canvasBg = isLight ? '#FFFFFF' : '#000000';
      const gridStroke = isLight ? '#F0F3FA' : '#161A25';
      const borderStroke = isLight ? '#E0E3EB' : '#2A2E39';
      const axisTextCol = '#787B86';

      ctx.fillStyle = canvasBg;
      ctx.fillRect(0, 0, W, H);

      const bars = this.renderBars.length ? this.renderBars : this.data;
      if (!bars.length) return;

      const rightFloatIdx = (bars.length - 1) + this.scrollOffset;
      const visibleBars = Math.ceil(plotW / this.candleStep) + 2;
      const endIdx = Math.min(bars.length - 1, Math.ceil(rightFloatIdx));
      const startIdx = Math.max(0, Math.floor(rightFloatIdx - visibleBars));

      if (this.autoScale) {
        let minP = Infinity, maxP = -Infinity;
        for (let i = startIdx; i <= endIdx; i++) {
          const b = bars[i];
          if (!b) continue;
          minP = Math.min(minP, this.disp(b.low));
          maxP = Math.max(maxP, this.disp(b.high));
          if (indCfg.emaFast?.enabled && !indCfg.emaFast?.hidden && this.ind.ema1?.[i]) {
            minP = Math.min(minP, this.disp(this.ind.ema1[i]));
            maxP = Math.max(maxP, this.disp(this.ind.ema1[i]));
          }
          if (indCfg.bb?.enabled && !indCfg.bb?.hidden && this.ind.bb?.[i]) {
            minP = Math.min(minP, this.disp(this.ind.bb[i].lower));
            maxP = Math.max(maxP, this.disp(this.ind.bb[i].upper));
          }
        }
        if (!isFinite(minP) || !isFinite(maxP)) {
          const lb = bars[bars.length - 1];
          minP = this.disp(lb.low); maxP = this.disp(lb.high);
        }
        const span = (maxP - minP) || (minP * 0.0005) || 0.5;
        this.viewMinP = Math.max(0.00001, minP - span * 0.14);
        this.viewMaxP = maxP + span * 0.14;
      }

      const nMin = this.mapPriceToNorm(this.viewMinP);
      const nMax = this.mapPriceToNorm(this.viewMaxP);
      const priceToY = (p) => mainH - ((this.mapPriceToNorm(p) - nMin) / ((nMax - nMin) || 1)) * mainH;
      const yToPrice = (y) => this.mapNormToPrice(nMin + ((mainH - y) / mainH) * (nMax - nMin));
      const idxToX = (i) => plotW - (rightFloatIdx - i) * this.candleStep - this.candleStep / 2;

      const compactPriceTicks = computeCompactPriceTicks(this.viewMinP, this.viewMaxP, mainH);

      if (stg.showGrid) {
        ctx.strokeStyle = gridStroke;
        ctx.lineWidth = 1;
        compactPriceTicks.forEach(pTick => {
          const y = Math.round(priceToY(pTick)) + 0.5;
          if (y > 4 && y < mainH - 4) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(plotW, y); ctx.stroke();
          }
        });
        const cols = 4;
        for (let j = 1; j < cols; j++) {
          const x = Math.round((plotW / cols) * j) + 0.5;
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, totalPlotH); ctx.stroke();
        }
      }

      if (stg.watermark) {
        ctx.save();
        ctx.fillStyle = isLight ? 'rgba(19, 23, 34, 0.05)' : 'rgba(209, 212, 220, 0.05)';
        ctx.font = 'bold 42px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${this.sym}, ${TVStore.getTfLabel(this.tf)}`, plotW / 2, mainH / 2);
        ctx.restore();
      }

      ctx.strokeStyle = borderStroke;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(plotW + 0.5, 0); ctx.lineTo(plotW + 0.5, H);
      ctx.moveTo(0, totalPlotH + 0.5); ctx.lineTo(W, totalPlotH + 0.5);
      subPanes.forEach((_, idx) => {
        const yDiv = mainH + idx * subEachH + 0.5;
        ctx.moveTo(0, yDiv); ctx.lineTo(W, yDiv);
      });
      ctx.stroke();

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, plotW, mainH);
      ctx.clip();

      if (indCfg.killzones?.enabled && !indCfg.killzones?.hidden && this.ind.killzones) {
        this.ind.killzones.forEach(kz => {
          if (kz.endIdx < startIdx || kz.startIdx > endIdx) return;
          const x1 = idxToX(kz.startIdx) - this.candleStep / 2;
          const x2 = idxToX(kz.endIdx) + this.candleStep / 2;
          const y1 = priceToY(this.disp(kz.high));
          const y2 = priceToY(this.disp(kz.low));
          ctx.fillStyle = kz.color;
          ctx.strokeStyle = kz.border;
          ctx.lineWidth = 1;
          ctx.fillRect(x1, y1, Math.max(4, x2 - x1), Math.max(4, y2 - y1));
          ctx.strokeRect(x1, y1, Math.max(4, x2 - x1), Math.max(4, y2 - y1));
          ctx.fillStyle = isLight ? '#131722' : '#D1D4DC';
          ctx.font = 'bold 9px Inter, sans-serif';
          ctx.fillText(kz.name, x1 + 4, y1 + 11);
        });
      }

      if (indCfg.smc?.enabled && !indCfg.smc?.hidden && this.ind.smc) {
        this.ind.smc.fvgs.forEach(f => {
          const x1 = idxToX(f.idx);
          const y1 = priceToY(this.disp(f.top));
          const y2 = priceToY(this.disp(f.bot));
          ctx.fillStyle = f.type === 'bull' ? 'rgba(8, 153, 129, 0.14)' : 'rgba(242, 54, 69, 0.14)';
          ctx.fillRect(x1, Math.min(y1, y2), plotW - x1, Math.max(2, Math.abs(y2 - y1)));
        });

        this.ind.smc.structures.forEach(st => {
          if (st.endIdx < startIdx) return;
          const x1 = idxToX(st.startIdx);
          const x2 = idxToX(st.endIdx);
          const y = priceToY(this.disp(st.price));
          const col = st.type === 'bull' ? stg.bodyBull : stg.bodyBear;
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = col;
          ctx.font = 'bold 9px Inter, sans-serif';
          ctx.fillText(st.label, (x1 + x2) / 2 - 10, st.type === 'bull' ? y - 4 : y + 11);
        });
      }

      if (indCfg.vpvr?.enabled && !indCfg.vpvr?.hidden) {
        const visibleSlice = bars.slice(startIdx, endIdx + 1);
        const vp = QuantEngine.calcVPVR(visibleSlice, indCfg.vpvr.params?.bins || 24);
        if (vp && vp.maxVol > 0) {
          const maxBarW = Math.min(110, plotW * 0.24);
          vp.profile.forEach(bin => {
            const yTop = priceToY(this.disp(bin.high));
            const yBot = priceToY(this.disp(bin.low));
            const bh = Math.max(1.5, Math.abs(yBot - yTop) - 1);
            const bullW = (bin.bullVol / vp.maxVol) * maxBarW;
            const bearW = (bin.bearVol / vp.maxVol) * maxBarW;
            ctx.fillStyle = 'rgba(8, 153, 129, 0.32)';
            ctx.fillRect(plotW - bullW - bearW, Math.min(yTop, yBot), bullW, bh);
            ctx.fillStyle = 'rgba(242, 54, 69, 0.32)';
            ctx.fillRect(plotW - bearW, Math.min(yTop, yBot), bearW, bh);
          });
          const yPoc = priceToY(this.disp(vp.pocPrice));
          ctx.strokeStyle = '#FF9800';
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(plotW - maxBarW - 20, yPoc); ctx.lineTo(plotW, yPoc); ctx.stroke();
          ctx.fillStyle = '#FF9800';
          ctx.font = 'bold 9px monospace';
          ctx.fillText('POC', plotW - maxBarW - 22, yPoc - 3);
        }
      }

      const drawSeries = (arr, color, w = 1.3, getter = (v) => v) => {
        if (!arr) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        ctx.beginPath();
        let started = false;
        for (let i = startIdx; i <= endIdx; i++) {
          const raw = arr[i];
          if (raw == null) { started = false; continue; }
          const val = getter(raw);
          if (val == null) { started = false; continue; }
          const x = idxToX(i), y = priceToY(this.disp(val));
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
      };

      if (indCfg.bb?.enabled && !indCfg.bb?.hidden && this.ind.bb) {
        drawSeries(this.ind.bb, 'rgba(41, 98, 255, 0.65)', 1, v => v?.upper);
        drawSeries(this.ind.bb, 'rgba(255, 152, 0, 0.65)', 1, v => v?.mid);
        drawSeries(this.ind.bb, 'rgba(41, 98, 255, 0.65)', 1, v => v?.lower);
      }

      if (indCfg.st?.enabled && !indCfg.st?.hidden && this.ind.st) {
        for (let i = Math.max(1, startIdx); i <= endIdx; i++) {
          const cur = this.ind.st[i], prev = this.ind.st[i - 1];
          if (!cur || !prev) continue;
          ctx.strokeStyle = cur.dir === 1 ? stg.bodyBull : stg.bodyBear;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(idxToX(i - 1), priceToY(this.disp(prev.val)));
          ctx.lineTo(idxToX(i), priceToY(this.disp(cur.val)));
          ctx.stroke();
        }
      }

      if (this.chartStyle === 'line' || this.chartStyle === 'linemarkers' || this.chartStyle === 'area') {
        ctx.strokeStyle = '#2962FF';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        let firstX = null, lastX = null;
        for (let i = startIdx; i <= endIdx; i++) {
          const x = idxToX(i), y = priceToY(this.disp(bars[i].close));
          if (firstX === null) { ctx.moveTo(x, y); firstX = x; } else ctx.lineTo(x, y);
          lastX = x;
        }
        ctx.stroke();
        if (this.chartStyle === 'linemarkers') {
          ctx.fillStyle = '#2962FF';
          for (let i = startIdx; i <= endIdx; i++) {
            const x = idxToX(i), y = priceToY(this.disp(bars[i].close));
            ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill();
          }
        }
        if (this.chartStyle === 'area' && firstX !== null) {
          ctx.lineTo(lastX, mainH); ctx.lineTo(firstX, mainH); ctx.closePath();
          const grad = ctx.createLinearGradient(0, 0, 0, mainH);
          grad.addColorStop(0, 'rgba(41, 98, 255, 0.35)');
          grad.addColorStop(1, 'rgba(41, 98, 255, 0.0)');
          ctx.fillStyle = grad;
          ctx.fill();
        }
      } else if (this.chartStyle === 'baseline') {
        const basePrice = this.disp(bars[startIdx]?.close || bars[0].close);
        const yBase = priceToY(basePrice);
        ctx.strokeStyle = '#787B86';
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(0, yBase); ctx.lineTo(plotW, yBase); ctx.stroke();
        ctx.setLineDash([]);
        for (let i = Math.max(1, startIdx); i <= endIdx; i++) {
          const x1 = idxToX(i - 1), y1 = priceToY(this.disp(bars[i - 1].close));
          const x2 = idxToX(i), y2 = priceToY(this.disp(bars[i].close));
          const isUp = this.disp(bars[i].close) >= basePrice;
          ctx.strokeStyle = isUp ? stg.bodyBull : stg.bodyBear;
          ctx.lineWidth = 1.8;
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        }
      } else if (this.chartStyle === 'bars') {
        const tickW = Math.max(2, Math.floor(this.candleStep * 0.38));
        for (let i = startIdx; i <= endIdx; i++) {
          const b = bars[i];
          if (!b) continue;
          const centerX = Math.floor(idxToX(i)) + 0.5;
          const isUp = stg.colorPrevClose && i > 0 ? b.close >= bars[i - 1].close : b.close >= b.open;
          const color = isUp ? stg.bodyBull : stg.bodyBear;
          const yH = priceToY(this.disp(b.high)), yL = priceToY(this.disp(b.low));
          const yO = priceToY(this.disp(b.open)), yC = priceToY(this.disp(b.close));
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.moveTo(centerX, yH); ctx.lineTo(centerX, yL);
          ctx.moveTo(centerX - tickW, yO); ctx.lineTo(centerX, yO);
          ctx.moveTo(centerX, yC); ctx.lineTo(centerX + tickW, yC);
          ctx.stroke();
        }
      } else {
        let maxVol = 1;
        if (this.chartStyle === 'volcandles') {
          for (let i = startIdx; i <= endIdx; i++) maxVol = Math.max(maxVol, bars[i]?.vol || 1);
        }

        for (let i = startIdx; i <= endIdx; i++) {
          const b = bars[i];
          if (!b) continue;

          const wickX = Math.floor(idxToX(i)) + 0.5;
          const isUp = stg.colorPrevClose && i > 0 ? b.close >= bars[i - 1].close : b.close >= b.open;

          const bodyCol = isUp ? stg.bodyBull : stg.bodyBear;
          const borderCol = isUp ? stg.borderBull : stg.borderBear;
          const wickCol = isUp ? stg.wickBull : stg.wickBear;

          const yHigh = priceToY(this.disp(b.high));
          const yLow = priceToY(this.disp(b.low));
          const yOpen = priceToY(this.disp(b.open));
          const yClose = priceToY(this.disp(b.close));

          const bodyTop = Math.min(yOpen, yClose);
          const bodyBottom = Math.max(yOpen, yClose);
          const bodyHeight = Math.max(1.2, bodyBottom - bodyTop);

          let rawBodyW = Math.max(2, this.candleStep * 0.68);
          if (this.chartStyle === 'volcandles') {
            const ratio = Math.max(0.25, Math.min(1.25, (b.vol || 1) / maxVol));
            rawBodyW = Math.max(2, this.candleStep * 0.9 * ratio);
          }
          const halfW = Math.max(1, Math.floor(rawBodyW / 2));
          const bodyLeft = Math.floor(wickX) - halfW;
          const bodyWidth = halfW * 2 + 1;

          if (stg.wickEnabled) {
            ctx.strokeStyle = wickCol;
            ctx.lineWidth = 1;
            ctx.beginPath();
            if (yHigh < bodyTop) {
              ctx.moveTo(wickX, yHigh);
              ctx.lineTo(wickX, bodyTop);
            }
            if (yLow > bodyBottom) {
              ctx.moveTo(wickX, bodyBottom);
              ctx.lineTo(wickX, yLow);
            }
            ctx.stroke();
          }

          if (stg.bodyEnabled && !(this.chartStyle === 'hollow' && isUp)) {
            ctx.fillStyle = bodyCol;
            ctx.fillRect(bodyLeft, bodyTop, bodyWidth, bodyHeight);
          }
          if (stg.borderEnabled || (this.chartStyle === 'hollow' && isUp)) {
            ctx.strokeStyle = borderCol;
            ctx.lineWidth = 1;
            ctx.strokeRect(bodyLeft + 0.5, bodyTop + 0.5, Math.max(1, bodyWidth - 1), Math.max(1, bodyHeight - 1));
          }
        }
      }

      if (TVStore.compareSymbol && TVStore.compareCloses.length && this.id === 0) {
        const baseMain = this.disp(bars[startIdx]?.close || bars[0].close);
        const baseCmp = TVStore.compareCloses[Math.min(startIdx, TVStore.compareCloses.length - 1)] || 1;
        ctx.strokeStyle = '#FF9800';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        let started = false;
        for (let i = startIdx; i <= endIdx; i++) {
          const cVal = TVStore.compareCloses[i];
          if (!cVal) continue;
          const mapped = baseMain * (cVal / baseCmp);
          const x = idxToX(i), y = priceToY(mapped);
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      if (indCfg.sma?.enabled && !indCfg.sma?.hidden) {
        drawSeries(this.ind.sma1, '#26C6DA', 1.3);
        drawSeries(this.ind.sma2, '#AB47BC', 1.4);
      }
      if (indCfg.emaFast?.enabled && !indCfg.emaFast?.hidden) {
        drawSeries(this.ind.ema1, isLight ? '#1E222D' : '#D1D4DC', 1.2);
        drawSeries(this.ind.ema2, '#2962FF', 1.4);
      }
      if (indCfg.emaSlow?.enabled && !indCfg.emaSlow?.hidden) {
        drawSeries(this.ind.ema3, '#FF9800', 1.4);
        drawSeries(this.ind.ema4, '#E040FB', 1.6);
      }

      this.alerts.forEach(al => {
        if (!al.active) return;
        const y = priceToY(al.price);
        ctx.strokeStyle = '#FF9800';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([5, 3]);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(plotW, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#FF9800';
        ctx.fillRect(4, y - 15, 96, 14);
        ctx.fillStyle = '#131722';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`ALERT ${al.price.toFixed(prec)} ⇕`, 7, y - 5);
      });

      const latestBar = this.data[this.data.length - 1];
      const curMarketPx = latestBar ? this.disp(this.lastBid ?? latestBar.close) : 0;

      TVStore.paper.positions.filter(p => p.sym === this.sym).forEach(pos => {
        const yEnt = priceToY(pos.entry);
        const col = pos.side === 'BUY' ? stg.bodyBull : stg.bodyBear;
        const pnl = TradingEngine.calcUnrealizedPnL(pos, curMarketPx);

        ctx.strokeStyle = col;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(0, yEnt); ctx.lineTo(plotW, yEnt); ctx.stroke();
        ctx.setLineDash([]);

        const tagText = pos.status === 'PENDING'
          ? `${pos.side} LIMIT ${pos.lot} @ ${pos.entry.toFixed(prec)}`
          : `${pos.side} ${pos.lot} | ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`;
        ctx.fillStyle = col;
        ctx.fillRect(plotW - 150, yEnt - 9, 146, 18);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(tagText, plotW - 146, yEnt + 3);

        if (pos.sl != null) {
          const ySl = priceToY(pos.sl);
          ctx.strokeStyle = stg.bodyBear;
          ctx.lineWidth = 1.2;
          ctx.setLineDash([4, 2]);
          ctx.beginPath(); ctx.moveTo(0, ySl); ctx.lineTo(plotW, ySl); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = stg.bodyBear;
          ctx.fillRect(plotW - 110, ySl - 8, 106, 16);
          ctx.fillStyle = '#fff';
          ctx.fillText(`SL ${pos.sl.toFixed(prec)} ⇕`, plotW - 106, ySl + 3);
        }

        if (pos.tp != null) {
          const yTp = priceToY(pos.tp);
          ctx.strokeStyle = stg.bodyBull;
          ctx.lineWidth = 1.2;
          ctx.setLineDash([4, 2]);
          ctx.beginPath(); ctx.moveTo(0, yTp); ctx.lineTo(plotW, yTp); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = stg.bodyBull;
          ctx.fillRect(plotW - 110, yTp - 8, 106, 16);
          ctx.fillStyle = '#fff';
          ctx.fillText(`TP ${pos.tp.toFixed(prec)} ⇕`, plotW - 106, yTp + 3);
        }
      });

      if (!TVStore.hideAllDrawings) {
        const list = [...this.drawings];
        if (this.draftDrawing) list.push(this.draftDrawing);
        if (this.activeMultiDrawing) list.push(this.activeMultiDrawing);
        list.forEach(d => {
          if (this.isDrawingVisibleOnTf(d)) {
            this.renderDrawing(d, plotW, mainH, prec, canvasBg, idxToX, priceToY);
          }
        });
      }

      // Single Dotted Line on Live Candle (Red spread line removed)
      if (latestBar) {
        const bidDisp = this.disp(this.lastBid ?? latestBar.close);
        const yBid = priceToY(bidDisp);
        const liveCol = latestBar.close >= latestBar.open ? '#089981' : '#F23645';
        ctx.strokeStyle = liveCol;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath(); ctx.moveTo(0, yBid); ctx.lineTo(plotW, yBid); ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.restore();

      // Right Price Axis Ticks
      ctx.fillStyle = axisTextCol;
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      const basePctPrice = this.disp(bars[startIdx]?.close || 1);
      compactPriceTicks.forEach(rawP => {
        const y = priceToY(rawP);
        if (y > 8 && y < mainH - 8) {
          const label = this.pctScale
            ? `${(((rawP - basePctPrice) / basePctPrice) * 100).toFixed(2)}%`
            : rawP.toFixed(prec);
          ctx.fillText(label, plotW + 6, y + 3);
        }
      });

      // Live Candle Price + Countdown Badge
      if (latestBar) {
        const bidDisp = this.disp(this.lastBid ?? latestBar.close);
        const yBid = Math.max(13, Math.min(mainH - 13, priceToY(bidDisp)));
        const tagCol = latestBar.close >= latestBar.open ? '#089981' : '#F23645';
        ctx.fillStyle = tagCol;
        ctx.fillRect(plotW + 1, yBid - 12, axisRightW - 2, 24);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px monospace';
        ctx.fillText(bidDisp.toFixed(prec), plotW + 5, yBid - 1);
        ctx.font = '9px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillText(this.getCountdown(), plotW + 5, yBid + 9);
      }

      subPanes.forEach((subKey, sIdx) => {
        const topY = mainH + sIdx * subEachH;
        this.renderSubPane(subKey, plotW, topY, subEachH, startIdx, endIdx, idxToX);
      });

      ctx.fillStyle = axisTextCol;
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      const labelEvery = Math.max(1, Math.floor(visibleBars / 3));
      for (let i = startIdx; i <= endIdx; i += labelEvery) {
        const x = idxToX(i);
        if (x > 42 && x < plotW - 42 && bars[i]) {
          ctx.fillText(this.formatAxisTime(bars[i].time), x, totalPlotH + 14);
        }
      }

      // Exact TradingView Crosshair: Gray-White in Dark Theme, Pure Black in Light Theme
      const isDrawingToolActive = !this.isNavTool(TVStore.activeTool) && TVStore.activeTool !== 'eraser';
      let activeCX = (this.crosshairActive || isDrawingToolActive) ? this.crossX : null;
      let activeCY = (this.crosshairActive || isDrawingToolActive) ? this.crossY : null;

      if (activeCX === null && TVStore.syncCrosshair && this.syncedTime !== null) {
        const sPt = this.dataToScreen(this.syncedTime, this.syncedPrice ?? this.viewMinP);
        activeCX = sPt.x;
        activeCY = sPt.y;
      }

      let inspected = latestBar;
      let inspIdx = bars.length - 1;

      if (activeCX !== null && activeCY !== null && activeCX >= 0 && activeCX < plotW && activeCY >= 0 && activeCY < totalPlotH) {
        const crossLineCol = isLight ? '#131722' : '#9598A1';
        const pillBgCol = isLight ? '#131722' : '#2A2E39';

        ctx.strokeStyle = crossLineCol;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(Math.floor(activeCX) + 0.5, 0); ctx.lineTo(Math.floor(activeCX) + 0.5, totalPlotH);
        ctx.moveTo(0, Math.floor(activeCY) + 0.5); ctx.lineTo(plotW, Math.floor(activeCY) + 0.5);
        ctx.stroke();
        ctx.setLineDash([]);

        if (isDrawingToolActive) {
          ctx.fillStyle = crossLineCol;
          ctx.beginPath(); ctx.arc(activeCX, activeCY, 3.2, 0, Math.PI * 2); ctx.fill();
        }

        if (activeCY <= mainH) {
          const cp = yToPrice(activeCY);
          // Circular (+) badge on price axis just like TradingView
          ctx.fillStyle = pillBgCol;
          ctx.beginPath();
          ctx.arc(plotW - 10, activeCY, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(plotW - 13, activeCY); ctx.lineTo(plotW - 7, activeCY);
          ctx.moveTo(plotW - 10, activeCY - 3); ctx.lineTo(plotW - 10, activeCY + 3);
          ctx.stroke();

          ctx.fillStyle = pillBgCol;
          ctx.fillRect(plotW + 1, activeCY - 9, axisRightW - 2, 18);
          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'left';
          ctx.font = 'bold 10px monospace';
          ctx.fillText(cp.toFixed(prec), plotW + 5, activeCY + 3);
        }

        const nearIdx = Math.round(rightFloatIdx - (plotW - activeCX - this.candleStep / 2) / this.candleStep);
        if (bars[nearIdx]) {
          inspected = bars[nearIdx];
          inspIdx = nearIdx;
        }

        const crossTimeSec = this.idxToTime(rightFloatIdx - (plotW - activeCX - this.candleStep / 2) / this.candleStep);
        const dateStr = this.formatCrosshairBottomPill(crossTimeSec);
        ctx.font = 'bold 10px monospace';
        const pillW = ctx.measureText(dateStr).width + 12;
        const pillX = Math.max(4, Math.min(plotW - pillW - 4, activeCX - pillW / 2));
        ctx.fillStyle = pillBgCol;
        ctx.fillRect(pillX, totalPlotH + 2, pillW, 18);
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText(dateStr, pillX + pillW / 2, totalPlotH + 14);
      }

      this.updateLegendDOM(inspected, inspIdx, prec);
    }

    updateLegendDOM(inspected, inspIdx, prec) {
      if (!inspected) return;
      const isUp = inspected.close >= inspected.open;
      const cHex = isUp ? '#089981' : '#F23645';

      const symEl = document.getElementById('legSym' + this.id);
      if (symEl) symEl.textContent = `${this.sym} · ${TVStore.getTfLabel(this.tf)}`;

      if (this.id === 0) {
        const q = TVStore.quotes[this.sym];
        const liveEl = document.getElementById('liveQuoteLine0');
        if (liveEl && q) {
          const chg = q.last - q.open;
          const pct = (chg / (q.open || 1)) * 100;
          const chgCol = chg >= 0 ? '#089981' : '#F23645';
          liveEl.innerHTML = `${q.last.toFixed(prec)} <span style="color:${chgCol}">${chg >= 0 ? '+' : ''}${chg.toFixed(prec)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)</span>`;
        }
      }

      const oEl = document.getElementById('legO' + this.id);
      const hEl = document.getElementById('legH' + this.id);
      const lEl = document.getElementById('legL' + this.id);
      const cEl = document.getElementById('legC' + this.id);
      const vEl = document.getElementById('legV' + this.id);

      if (oEl) {
        oEl.textContent = this.disp(inspected.open).toFixed(prec); oEl.style.color = cHex;
        hEl.textContent = this.disp(inspected.high).toFixed(prec); hEl.style.color = cHex;
        lEl.textContent = this.disp(inspected.low).toFixed(prec); lEl.style.color = cHex;
        cEl.textContent = this.disp(inspected.close).toFixed(prec); cEl.style.color = cHex;
      }
      if (vEl) {
        vEl.textContent = Math.round(inspected.vol || 1);
        vEl.style.color = cHex;
      }

      const indBox = document.getElementById('indLegend' + this.id);
      if (indBox) {
        const activeInds = TVStore.indicatorCatalog.filter(item => TVStore.indicators[item.key]?.enabled);
        indBox.innerHTML = activeInds.map(item => {
          const st = TVStore.indicators[item.key];
          return `<div class="ind-pill" style="opacity:${st.hidden ? '0.55' : '1'};">
            <span>${item.name}</span>
            <button type="button" data-ind-eye="${item.key}" title="Hide / Show">${st.hidden ? 'Show' : 'Eye'}</button>
            <button type="button" data-ind-gear="${item.key}" title="Settings">⚙</button>
            <button type="button" class="del-ind-btn" data-ind-del="${item.key}" title="Remove Indicator">🗑</button>
          </div>`;
        }).join('');

        indBox.querySelectorAll('[data-ind-eye]').forEach(btn => {
          btn.onpointerdown = (e) => e.stopPropagation();
          btn.ontouchstart = (e) => e.stopPropagation();
          btn.onclick = (e) => {
            e.stopPropagation();
            const k = btn.dataset.indEye;
            TVStore.indicators[k].hidden = !TVStore.indicators[k].hidden;
            TVStore.saveIndicators();
            window.TVUI?.renderObjectTree?.();
            TVStore.panes.forEach(p => { p.recompute(); p.scheduleDraw(); });
          };
        });
        indBox.querySelectorAll('[data-ind-gear]').forEach(btn => {
          btn.onpointerdown = (e) => e.stopPropagation();
          btn.ontouchstart = (e) => e.stopPropagation();
          btn.onclick = (e) => {
            e.stopPropagation();
            window.TVUI?.editIndicatorParams?.(btn.dataset.indGear);
          };
        });
        indBox.querySelectorAll('[data-ind-del]').forEach(btn => {
          btn.onpointerdown = (e) => e.stopPropagation();
          btn.ontouchstart = (e) => e.stopPropagation();
          btn.onclick = (e) => {
            e.stopPropagation();
            const k = btn.dataset.indDel;
            TVStore.indicators[k].enabled = false;
            TVStore.indicators[k].hidden = false;
            TVStore.saveIndicators();
            window.TVUI?.renderObjectTree?.();
            TVStore.panes.forEach(p => { p.recompute(); p.scheduleDraw(); });
            window.TVUI?.toast?.('Indicator removed');
          };
        });
      }
    }

    renderDrawingLabel(d, x1, y1, x2, y2, canvasBg = '#000000', isAngledLine = false) {
      if (!d.text) return;
      const ctx = this.ctx;
      const fs = Number(d.fontSize) || 12;
      ctx.save();
      ctx.font = `bold ${fs}px Inter, sans-serif`;

      const hAlign = d.textHAlign || 'center';
      const vAlign = d.textVAlign || 'top';

      if (isAngledLine) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        let angle = Math.atan2(dy, dx);
        if (angle > Math.PI / 2) angle -= Math.PI;
        if (angle < -Math.PI / 2) angle += Math.PI;

        let tRatio = 0.5;
        if (hAlign === 'left') tRatio = 0.12;
        else if (hAlign === 'right') tRatio = 0.88;

        const anchorX = x1 + dx * tRatio;
        const anchorY = y1 + dy * tRatio;

        let normalOffset = 0;
        if (vAlign === 'top') normalOffset = -(fs * 0.55 + 4);
        else if (vAlign === 'bottom') normalOffset = fs * 0.85 + 4;
        else normalOffset = fs * 0.32;

        ctx.translate(anchorX, anchorY);
        ctx.rotate(angle);
        ctx.textAlign = 'center';

        if (vAlign === 'middle') {
          const w = ctx.measureText(d.text).width + 8;
          ctx.fillStyle = canvasBg;
          ctx.fillRect(-w / 2, normalOffset - fs + 2, w, fs + 3);
        }

        ctx.fillStyle = d.textColor || d.color || '#D1D4DC';
        ctx.fillText(d.text, 0, normalOffset);
        ctx.restore();
        return;
      }

      const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
      const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
      const midX = (x1 + x2) / 2;

      let tx = midX;
      if (hAlign === 'left') { ctx.textAlign = 'left'; tx = minX + 4; }
      else if (hAlign === 'right') { ctx.textAlign = 'right'; tx = maxX - 4; }
      else { ctx.textAlign = 'center'; tx = midX; }

      let ty;
      if (vAlign === 'top') ty = minY - 5;
      else if (vAlign === 'bottom') ty = maxY + fs + 3;
      else ty = (minY + maxY) / 2 + fs / 3;

      ctx.fillStyle = d.textColor || d.color || '#D1D4DC';
      ctx.fillText(d.text, tx, ty);
      ctx.restore();
    }

    renderDrawing(d, plotW, mainH, prec, canvasBg = '#000000', idxToX, priceToY) {
      const ctx = this.ctx;
      const isSel = d.id === this.selectedDrawingId;
      const col = d.color || '#2962FF';
      const fillCol = d.fillColor || 'rgba(41, 98, 255, 0.2)';
      const lw = d.width || 1.8;
      const dash = d.dash === 'dashed' ? [6, 4] : (d.dash === 'dotted' ? [2, 3] : []);

      const p1 = this.dataToScreen(d.t1, d.p1);
      const p2 = d.t2 != null ? this.dataToScreen(d.t2, d.p2) : p1;

      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.setLineDash(dash);

      if (d.type === 'hline') {
        ctx.beginPath(); ctx.moveTo(0, p1.y); ctx.lineTo(plotW, p1.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = col;
        ctx.fillRect(4, p1.y - 14, 66, 14);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(d.p1.toFixed(prec), 7, p1.y - 4);
        this.renderDrawingLabel(d, 74, p1.y, plotW - 12, p1.y, canvasBg, true);
      } else if (d.type === 'hray') {
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(plotW, p1.y); ctx.stroke();
        ctx.setLineDash([]);
        this.renderDrawingLabel(d, p1.x, p1.y, plotW - 12, p1.y, canvasBg, true);
      } else if (d.type === 'vline') {
        ctx.beginPath(); ctx.moveTo(p1.x, 0); ctx.lineTo(p1.x, mainH); ctx.stroke();
        ctx.setLineDash([]);
        this.renderDrawingLabel(d, p1.x, 30, p1.x, 30, canvasBg, false);
      } else if (d.type === 'crossline') {
        ctx.beginPath();
        ctx.moveTo(0, p1.y); ctx.lineTo(plotW, p1.y);
        ctx.moveTo(p1.x, 0); ctx.lineTo(p1.x, mainH);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (d.type === 'cycliclines') {
        const periodPx = Math.max(24, this.candleStep * 10);
        for (let cx = p1.x; cx < plotW; cx += periodPx) {
          ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, mainH); ctx.stroke();
        }
      } else if (d.type === 'anchoredvwap') {
        const startI = Math.max(0, Math.min(this.data.length - 1, Math.round(p1.idx)));
        const vwapPts = QuantEngine.calcAnchoredVWAP(this.data, startI);
        if (vwapPts.length > 1) {
          ctx.beginPath();
          vwapPts.forEach((vp, i) => {
            const vx = idxToX(vp.idx);
            const vy = priceToY(this.disp(vp.val));
            if (i === 0) ctx.moveTo(vx, vy);
            else ctx.lineTo(vx, vy);
          });
          ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.fillStyle = col;
        ctx.font = 'bold 10px monospace';
        ctx.fillText('AVWAP', p1.x + 6, p1.y - 6);
      } else if (d.type === 'fixedvp') {
        const i1 = Math.max(0, Math.min(this.data.length - 1, Math.round(Math.min(p1.idx, p2.idx))));
        const i2 = Math.max(i1 + 1, Math.min(this.data.length - 1, Math.round(Math.max(p1.idx, p2.idx))));
        const slice = this.data.slice(i1, i2 + 1);
        const vp = QuantEngine.calcVPVR(slice, 20);
        const leftX = Math.min(p1.x, p2.x);
        const rightX = Math.max(p1.x, p2.x, leftX + 60);
        const boxW = rightX - leftX;
        ctx.strokeRect(leftX, Math.min(p1.y, p2.y), boxW, Math.abs(p2.y - p1.y));
        if (vp && vp.maxVol > 0) {
          vp.profile.forEach(bin => {
            const yT = priceToY(this.disp(bin.high));
            const yB = priceToY(this.disp(bin.low));
            const bh = Math.max(1.5, Math.abs(yB - yT) - 1);
            const wTotal = (bin.totalVol / vp.maxVol) * (boxW * 0.85);
            ctx.fillStyle = fillCol;
            ctx.fillRect(leftX, Math.min(yT, yB), wTotal, bh);
          });
          const yPoc = priceToY(this.disp(vp.pocPrice));
          ctx.strokeStyle = '#FF9800';
          ctx.beginPath(); ctx.moveTo(leftX, yPoc); ctx.lineTo(rightX, yPoc); ctx.stroke();
        }
      } else if (['trend', 'infoline', 'trendangle'].includes(d.type)) {
        let sx = p1.x, sy = p1.y, ex = p2.x, ey = p2.y;
        const dx = p2.x - p1.x, dy = p2.y - p1.y, len = Math.hypot(dx, dy) || 1;
        if (d.extLeft) { sx -= (dx / len) * 2000; sy -= (dy / len) * 2000; }
        if (d.extRight) { ex += (dx / len) * 2000; ey += (dy / len) * 2000; }
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.setLineDash([]);
        if (d.type === 'infoline') {
          const diff = d.p2 - d.p1;
          const pct = ((diff / (d.p1 || 1)) * 100).toFixed(2);
          ctx.fillStyle = col;
          ctx.font = 'bold 10px monospace';
          ctx.fillText(`${diff >= 0 ? '+' : ''}${diff.toFixed(prec)} (${pct}%)`, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2 - 8);
        } else if (d.type === 'trendangle') {
          const deg = (-Math.atan2(dy, dx) * (180 / Math.PI)).toFixed(1);
          ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p1.x + 45, p1.y); ctx.stroke();
          ctx.fillStyle = col;
          ctx.font = 'bold 10px monospace';
          ctx.fillText(`${deg}°`, p1.x + 22, p1.y - 6);
        }
        this.renderDrawingLabel(d, p1.x, p1.y, p2.x, p2.y, canvasBg, true);
      } else if (d.type === 'ray' || d.type === 'extline') {
        const dx = p2.x - p1.x, dy = p2.y - p1.y, len = Math.hypot(dx, dy) || 1;
        const sx = d.type === 'extline' ? p1.x - (dx / len) * 2500 : p1.x;
        const sy = d.type === 'extline' ? p1.y - (dy / len) * 2500 : p1.y;
        const ex = p1.x + (dx / len) * 2500;
        const ey = p1.y + (dy / len) * 2500;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.setLineDash([]);
        this.renderDrawingLabel(d, p1.x, p1.y, p2.x, p2.y, canvasBg, true);
      } else if (['channel', 'regression', 'flattop', 'disjoint'].includes(d.type)) {
        const off = d.channelOffset || ((this.viewMaxP - this.viewMinP) * 0.08);
        const p1b = this.dataToScreen(d.t1, d.p1 + off);
        const p2b = this.dataToScreen(d.t2 ?? d.t1, (d.type === 'flattop' ? d.p1 + off : (d.p2 ?? d.p1) + off));
        if (d.fillEnabled !== false) {
          ctx.fillStyle = fillCol;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
          ctx.lineTo(p2b.x, p2b.y); ctx.lineTo(p1b.x, p1b.y);
          ctx.closePath(); ctx.fill();
        }
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
        ctx.moveTo(p1b.x, p1b.y); ctx.lineTo(p2b.x, p2b.y);
        ctx.stroke();
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(p1.x, (p1.y + p1b.y) / 2);
        ctx.lineTo(p2.x, (p2.y + p2b.y) / 2);
        ctx.stroke();
        ctx.setLineDash([]);
        this.renderDrawingLabel(d, p1.x, p1.y, p2.x, p2.y, canvasBg, true);
      } else if (['pitchfork', 'schiffpitchfork', 'modschiff', 'insidepitchfork'].includes(d.type)) {
        const pts = d.pts && d.pts.length >= 2 ? d.pts.map(pt => this.dataToScreen(pt.t, pt.p)) : [p1, p2, p2];
        const a = pts[0];
        const b = pts[1] || p2;
        const c = pts[2] || p2;
        const midBC = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
        let origin = a;
        if (d.type === 'schiffpitchfork') origin = { x: a.x, y: (a.y + b.y) / 2 };
        else if (d.type === 'modschiff') origin = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        else if (d.type === 'insidepitchfork') origin = { x: (a.x + midBC.x) / 2, y: (a.y + midBC.y) / 2 };

        const dx = midBC.x - origin.x;
        const dy = midBC.y - origin.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = (dx / len) * 2000;
        const uy = (dy / len) * 2000;

        ctx.beginPath();
        ctx.moveTo(b.x, b.y); ctx.lineTo(c.x, c.y);
        ctx.moveTo(origin.x, origin.y); ctx.lineTo(origin.x + ux, origin.y + uy);
        ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + ux, b.y + uy);
        ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + ux, c.y + uy);
        ctx.stroke();
      } else if (['xabcd', 'cypher', 'abcd', 'triangle', 'threedrives', 'headshoulders', 'elliott12345', 'elliottabc', 'elliottabcde', 'path'].includes(d.type)) {
        const pts = d.pts && d.pts.length >= 2 ? d.pts.map(pt => this.dataToScreen(pt.t, pt.p)) : [p1, p2];
        if (d.type === 'triangle' && pts.length >= 3 && d.fillEnabled !== false) {
          ctx.fillStyle = fillCol;
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          ctx.lineTo(pts[1].x, pts[1].y);
          ctx.lineTo(pts[2].x, pts[2].y);
          ctx.closePath();
          ctx.fill();
        }
        ctx.beginPath();
        pts.forEach((pt, i) => {
          if (i === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        if (d.type === 'triangle' && pts.length >= 3) ctx.closePath();
        ctx.stroke();

        // Wave / Harmonic Point Labels
        const labelsMap = {
          xabcd: ['X', 'A', 'B', 'C', 'D'],
          cypher: ['X', 'A', 'B', 'C', 'D'],
          abcd: ['A', 'B', 'C', 'D'],
          elliott12345: ['(0)', '(1)', '(2)', '(3)', '(4)', '(5)'],
          elliottabc: ['(0)', '(A)', '(B)', '(C)'],
          elliottabcde: ['(0)', '(A)', '(B)', '(C)', '(D)', '(E)'],
          headshoulders: ['LS', '', 'HEAD', '', 'RS', '', '']
        };
        const lbls = labelsMap[d.type];
        if (lbls) {
          ctx.setLineDash([]);
          ctx.fillStyle = col;
          ctx.font = 'bold 11px sans-serif';
          pts.forEach((pt, idx) => {
            if (lbls[idx]) ctx.fillText(lbls[idx], pt.x - 6, pt.y - 7);
          });
        }
      } else if (d.type === 'rect' || d.type === 'pricerange' || d.type === 'daterange' || d.type === 'datetime_range') {
        const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y);
        const w = Math.max(4, Math.abs(p2.x - p1.x)), h = Math.max(4, Math.abs(p2.y - p1.y));
        if (d.fillEnabled !== false) {
          ctx.fillStyle = fillCol;
          ctx.fillRect(x, y, w, h);
        }
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
        this.renderDrawingLabel(d, x, y, x + w, y + h, canvasBg, false);
      } else if (d.type === 'rotrect') {
        const cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2;
        const rx = Math.abs(p2.x - p1.x) / 2, ry = Math.abs(p2.y - p1.y) / 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy - ry);
        ctx.lineTo(cx + rx, cy);
        ctx.lineTo(cx, cy + ry);
        ctx.lineTo(cx - rx, cy);
        ctx.closePath();
        if (d.fillEnabled !== false) { ctx.fillStyle = fillCol; ctx.fill(); }
        ctx.stroke();
      } else if (d.type === 'poly_triangle') {
        const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y);
        const w = Math.abs(p2.x - p1.x), h = Math.abs(p2.y - p1.y);
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        if (d.fillEnabled !== false) { ctx.fillStyle = fillCol; ctx.fill(); }
        ctx.stroke();
      } else if (d.type === 'curve' || d.type === 'arc') {
        const cx = (p1.x + p2.x) / 2;
        const cy = Math.min(p1.y, p2.y) - Math.abs(p2.x - p1.x) * 0.25;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.quadraticCurveTo(cx, cy, p2.x, p2.y);
        ctx.stroke();
      } else if (d.type === 'doublecurve') {
        const midX = (p1.x + p2.x) / 2;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.bezierCurveTo(midX, p1.y - 45, midX, p2.y + 45, p2.x, p2.y);
        ctx.stroke();
      } else if (d.type === 'circle') {
        const cx = (p1.x + p2.x) / 2, cy = (p1.y + p2.y) / 2;
        const rx = Math.max(6, Math.abs(p2.x - p1.x) / 2), ry = Math.max(6, Math.abs(p2.y - p1.y) / 2);
        ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        if (d.fillEnabled !== false) { ctx.fillStyle = fillCol; ctx.fill(); }
        ctx.stroke();
        ctx.setLineDash([]);
        this.renderDrawingLabel(d, cx - rx, cy - ry, cx + rx, cy + ry, canvasBg, false);
      } else if (['fib', 'trendfib', 'fibchannel', 'fibtimezone', 'fibfan', 'fibarc', 'fibcircles', 'gannbox', 'gannsquare', 'gannfan'].includes(d.type)) {
        const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
        const cols = ['#787B86', '#F23645', '#FF9800', '#089981', '#2962FF', '#00BCD4', '#787B86'];
        const x1 = Math.min(p1.x, p2.x), x2 = Math.max(p1.x, p2.x, p1.x + 85);
        ctx.textAlign = 'left';
        if (d.type === 'fibfan' || d.type === 'gannfan') {
          levels.forEach((lvl, idx) => {
            ctx.strokeStyle = cols[idx];
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p1.y + (p2.y - p1.y) * lvl);
            ctx.stroke();
          });
        } else if (d.type === 'fibcircles' || d.type === 'fibarc') {
          const baseR = Math.max(15, Math.hypot(p2.x - p1.x, p2.y - p1.y));
          [0.382, 0.5, 0.618, 1].forEach((lvl, idx) => {
            ctx.strokeStyle = cols[idx + 1];
            ctx.beginPath();
            ctx.arc(p1.x, p1.y, baseR * lvl, 0, d.type === 'fibarc' ? Math.PI : Math.PI * 2);
            ctx.stroke();
          });
        } else {
          if (d.type === 'gannbox' || d.type === 'gannsquare') {
            ctx.strokeRect(x1, Math.min(p1.y, p2.y), x2 - x1, Math.abs(p2.y - p1.y));
            ctx.beginPath();
            ctx.moveTo(x1, p1.y); ctx.lineTo(x2, p2.y);
            ctx.moveTo(x1, p2.y); ctx.lineTo(x2, p1.y);
            ctx.stroke();
          }
          levels.forEach((lvl, idx) => {
            const price = d.p1 + (d.p2 - d.p1) * lvl;
            const y = p1.y + (p2.y - p1.y) * lvl;
            ctx.strokeStyle = cols[idx]; ctx.lineWidth = 1.1;
            ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
            ctx.fillStyle = cols[idx]; ctx.font = '10px monospace';
            ctx.fillText(`${lvl} (${price.toFixed(prec)})`, x1 + 3, y - 2);
          });
        }
      } else if (d.type === 'forecast' || d.type === 'barspattern' || d.type === 'ghostfeed') {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo((p1.x + p2.x) * 0.45, (p1.y + p2.y) * 0.65);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.fillStyle = col;
        ctx.font = 'bold 10px monospace';
        ctx.fillText(`${d.type.toUpperCase()} → ${d.p2.toFixed(prec)}`, p2.x + 6, p2.y);
      } else if (d.type === 'long' || d.type === 'short') {
        const isLong = d.type === 'long';
        const entry = d.p1, tp = d.p2, sl = d.p3;
        const yEnt = this.dataToScreen(d.t1, entry).y;
        const yTp = this.dataToScreen(d.t1, tp).y;
        const ySl = this.dataToScreen(d.t1, sl).y;
        const x1 = Math.min(p1.x, p2.x), w = Math.max(70, Math.abs(p2.x - p1.x));

        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(8, 153, 129, 0.28)';
        ctx.fillRect(x1, Math.min(yEnt, yTp), w, Math.abs(yTp - yEnt));
        ctx.fillStyle = 'rgba(242, 54, 69, 0.28)';
        ctx.fillRect(x1, Math.min(yEnt, ySl), w, Math.abs(ySl - yEnt));

        ctx.strokeStyle = '#D1D4DC'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x1, yEnt); ctx.lineTo(x1 + w, yEnt); ctx.stroke();

        const reward = Math.abs(tp - entry);
        const risk = Math.abs(entry - sl) || 0.00001;
        const rr = (reward / risk).toFixed(2);

        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 10px monospace';
        ctx.fillText(`${isLong ? 'LONG' : 'SHORT'} R:R ${rr}`, x1 + 4, yEnt - 3);
        ctx.fillStyle = '#089981';
        ctx.fillText(`TP +${reward.toFixed(prec)}`, x1 + 4, yTp + (isLong ? 11 : -3));
        ctx.fillStyle = '#F23645';
        ctx.fillText(`SL -${risk.toFixed(prec)}`, x1 + 4, ySl + (isLong ? -3 : 11));
      } else if (d.type === 'measure') {
        ctx.setLineDash([]);
        const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y);
        const w = Math.abs(p2.x - p1.x), h = Math.abs(p2.y - p1.y);
        const diff = d.p2 - d.p1;
        const pct = ((diff / (d.p1 || 1)) * 100).toFixed(2);
        const barsCnt = Math.abs(Math.round(p2.idx - p1.idx));
        ctx.fillStyle = diff >= 0 ? 'rgba(41, 98, 255, 0.25)' : 'rgba(242, 54, 69, 0.25)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = diff >= 0 ? '#2962FF' : '#F23645';
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = '#1E222D';
        ctx.fillRect(x, Math.max(4, y - 22), 160, 18);
        ctx.fillStyle = '#D1D4DC'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'left';
        ctx.fillText(`${diff >= 0 ? '+' : ''}${diff.toFixed(prec)} (${pct}%) · ${barsCnt}b`, x + 4, Math.max(16, y - 9));
      } else if ((d.type === 'brush' || d.type === 'highlighter') && d.pts?.length > 1) {
        if (d.type === 'highlighter') { ctx.globalAlpha = 0.35; ctx.lineWidth = 11; }
        ctx.beginPath();
        d.pts.forEach((pt, idx) => {
          const s = this.dataToScreen(pt.t, pt.p);
          if (idx === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
        });
        ctx.stroke();
      } else if (SINGLE_PT_TOOLS.has(d.type)) {
        ctx.setLineDash([]);
        const fs = Number(d.fontSize) || 12;
        ctx.textAlign = 'left';
        if (d.type === 'arrowmark' || d.type === 'arrowup') {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p1.x - 7, p1.y + 12);
          ctx.lineTo(p1.x + 7, p1.y + 12);
          ctx.closePath();
          ctx.fill();
        } else if (d.type === 'arrowdown') {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p1.x - 7, p1.y - 12);
          ctx.lineTo(p1.x + 7, p1.y - 12);
          ctx.closePath();
          ctx.fill();
        } else if (d.type === 'flag') {
          ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p1.x, p1.y - 18); ctx.stroke();
          ctx.fillStyle = col;
          ctx.fillRect(p1.x, p1.y - 18, 14, 9);
        } else if (['callout', 'comment', 'note', 'pricenote', 'pricelabel'].includes(d.type)) {
          const txt = (d.type === 'pricelabel' || d.type === 'pricenote') ? `${d.text ? d.text + ' ' : ''}${d.p1.toFixed(prec)}` : (d.text || 'Note');
          ctx.font = `bold ${fs}px sans-serif`;
          const tw = ctx.measureText(txt).width + 12;
          ctx.fillStyle = col;
          ctx.fillRect(p1.x, p1.y - fs - 4, Math.max(48, tw), fs + 6);
          ctx.fillStyle = '#fff';
          ctx.fillText(txt, p1.x + 6, p1.y - 3);
        } else {
          ctx.fillStyle = d.textColor || col;
          ctx.font = `bold ${fs}px sans-serif`;
          ctx.fillText(d.text || 'Note', p1.x, p1.y);
        }
      }

      if (isSel) {
        ctx.setLineDash([]);
        this.getHandles(d).forEach(h => {
          ctx.fillStyle = '#131722';
          ctx.strokeStyle = d.locked ? '#FF9800' : '#2962FF';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.arc(h.x, h.y, 5.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
      }
      ctx.restore();
    }

    renderSubPane(subKey, plotW, top, subH, startIdx, endIdx, idxToX) {
      const ctx = this.ctx;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, top, plotW, subH);
      ctx.clip();

      if (subKey === 'rsi' && this.ind.rsi) {
        const y70 = top + subH * 0.3, y30 = top + subH * 0.7;
        ctx.strokeStyle = 'rgba(120, 123, 134, 0.35)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(0, y70); ctx.lineTo(plotW, y70); ctx.moveTo(0, y30); ctx.lineTo(plotW, y30); ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = '#7E57C2';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        let started = false;
        for (let i = startIdx; i <= endIdx; i++) {
          const v = this.ind.rsi[i];
          if (v == null) continue;
          const x = idxToX(i), y = top + subH - (v / 100) * subH;
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.fillStyle = '#787B86'; ctx.font = '10px monospace'; ctx.textAlign = 'left';
        ctx.fillText(`RSI(${TVStore.indicators.rsi.params?.period || 14})`, 6, top + 12);
      } else if (subKey === 'macd' && this.ind.macd) {
        const { macdLine, sigLine, hist } = this.ind.macd;
        let maxAbs = 0.0001;
        for (let i = startIdx; i <= endIdx; i++) {
          maxAbs = Math.max(maxAbs, Math.abs(macdLine[i] || 0), Math.abs(hist[i] || 0));
        }
        const midY = top + subH / 2;
        const bw = Math.max(1.5, this.candleStep * 0.55);
        for (let i = startIdx; i <= endIdx; i++) {
          const h = hist[i] || 0;
          const bh = (h / maxAbs) * (subH * 0.42);
          ctx.fillStyle = h >= 0 ? 'rgba(8, 153, 129, 0.6)' : 'rgba(242, 54, 69, 0.6)';
          ctx.fillRect(idxToX(i) - bw / 2, h >= 0 ? midY - bh : midY, bw, Math.abs(bh));
        }
        const plotM = (arr, col) => {
          ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.beginPath();
          for (let i = startIdx; i <= endIdx; i++) {
            const y = midY - ((arr[i] || 0) / maxAbs) * (subH * 0.42);
            if (i === startIdx) ctx.moveTo(idxToX(i), y); else ctx.lineTo(idxToX(i), y);
          }
          ctx.stroke();
        };
        plotM(macdLine, '#2962FF');
        plotM(sigLine, '#FF9800');
        ctx.fillStyle = '#787B86'; ctx.font = '10px monospace'; ctx.textAlign = 'left';
        ctx.fillText('MACD(12,26,9)', 6, top + 12);
      } else if (subKey === 'atr' && this.ind.atr) {
        let minA = Infinity, maxA = -Infinity;
        for (let i = startIdx; i <= endIdx; i++) {
          if (this.ind.atr[i] != null) {
            minA = Math.min(minA, this.ind.atr[i]);
            maxA = Math.max(maxA, this.ind.atr[i]);
          }
        }
        const span = (maxA - minA) || 0.0001;
        ctx.strokeStyle = '#FF7043'; ctx.lineWidth = 1.4; ctx.beginPath();
        let started = false;
        for (let i = startIdx; i <= endIdx; i++) {
          const v = this.ind.atr[i];
          if (v == null) continue;
          const x = idxToX(i);
          const y = top + subH - 6 - ((v - minA) / span) * (subH - 14);
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.fillStyle = '#787B86'; ctx.font = '10px monospace'; ctx.textAlign = 'left';
        ctx.fillText(`ATR(${TVStore.indicators.atr.params?.period || 14})`, 6, top + 12);
      }
      ctx.restore();
    }

    bindEvents() {
      let mode = null;
      let lastX = 0, lastY = 0;
      let startTimeMs = 0, movedDist = 0;
      let longPressTimer = null;
      let lastDataPt = null;
      let activeHandleIdx = null;
      let draggedOrder = null, draggedOrderField = null, draggedAlert = null;
      let pinchDist0 = 0, step0 = 8, pinchMidX0 = 0;
      let lastTouchEventTime = 0;
      let tappedAlreadySelectedId = null;

      let anchoredDrawing = null;
      let awaitingSecondTap = false;
      let lastPlacementTime = 0;

      const broadcastCrosshair = (time, price) => {
        if (!TVStore.syncCrosshair) return;
        TVStore.panes.forEach(p => {
          if (p.id !== this.id && !p.el.classList.contains('hidden')) {
            p.crosshairActive = false;
            p.crossX = null;
            p.crossY = null;
            p.syncedTime = time;
            p.syncedPrice = price;
            p.scheduleDraw();
          }
        });
      };

      const clearLongPress = () => {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      };

      const finalizeNewDrawing = (doneObj) => {
        this.drawings.push(doneObj);
        this.saveDrawings();
        anchoredDrawing = null;
        awaitingSecondTap = false;
        this.draftDrawing = null;
        if (doneObj.type !== 'measure') {
          this.selectedDrawingId = doneObj.id;
          window.TVUI?.updateObjectEditBar?.();
        }
        if (!TVStore.stayInDrawingMode) {
          window.TVUI?.setActiveTool?.('cursor');
          this.crosshairActive = false;
          this.crossX = null;
          this.crossY = null;
        }
        this.scheduleDraw();
      };

      const handleStart = (tx, ty) => {
        window.TVUI?.selectPane?.(this.id);
        window.TVUI?.closeAllPopovers?.();
        clearLongPress();

        const { plotW, totalPlotH } = this.getLayoutMetrics();
        lastX = tx;
        lastY = ty;
        startTimeMs = Date.now();
        movedDist = 0;
        tappedAlreadySelectedId = null;

        if (this.replayWaitingPick && this.fullData.length) {
          const dPt = this.screenToData(tx, ty, false);
          const pickIdx = Math.max(10, Math.min(this.fullData.length - 2, Math.round(dPt.idx)));
          this.replayWaitingPick = false;
          this.replayActive = true;
          this.replayIdx = pickIdx;
          this.scrollOffset = 6;
          this.recompute();
          this.scheduleDraw();
          document.getElementById('replayBar').classList.add('show');
          window.TVUI?.toast?.('Replay active: Press Play or +1');
          return;
        }

        if (tx > plotW) { mode = 'priceScale'; return; }
        if (ty > totalPlotH) { mode = 'timeScale'; return; }

        const tool = TVStore.activeTool;

        if (tool === 'eraser') {
          const hit = this.hitTest(tx, ty);
          if (hit?.drawing) {
            this.pushHistory();
            this.drawings = this.drawings.filter(x => x.id !== hit.drawing.id);
            if (this.selectedDrawingId === hit.drawing.id) this.selectedDrawingId = null;
            this.saveDrawings();
            window.TVUI?.updateObjectEditBar?.();
            this.scheduleDraw();
            window.TVUI?.toast?.('Drawing erased');
          }
          return;
        }

        if (!this.isNavTool(tool)) {
          if (this.crossX === null || this.crossY === null) {
            this.crossX = tx;
            this.crossY = ty;
          }
          this.crosshairActive = true;

          if (MULTI_PT_MAX[tool]) {
            mode = 'aimMultiPt';
            return;
          }

          if (tool === 'brush' || tool === 'highlighter') {
            mode = 'drawBrush';
            const pt = this.screenToData(this.crossX, this.crossY, true);
            const newId = 'd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5);
            this.pushHistory();
            this.draftDrawing = {
              id: newId, type: tool, t1: pt.time, p1: pt.price,
              pts: [{ t: pt.time, p: pt.price }],
              color: tool === 'highlighter' ? '#FFEB3B' : '#FF9800', width: 2, dash: 'solid', visTfs: 'all'
            };
            this.scheduleDraw();
            return;
          }

          if (awaitingSecondTap && anchoredDrawing) {
            mode = 'secondTapAim';
            return;
          }

          mode = 'firstTapAim';
          return;
        }

        const hit = this.hitTest(tx, ty);
        if (hit) {
          this.crosshairActive = false;
          if (hit.alertItem) { mode = 'dragAlert'; draggedAlert = hit.alertItem; return; }
          if (hit.orderPos) { mode = 'dragOrder'; draggedOrder = hit.orderPos; draggedOrderField = hit.orderField; return; }

          if (this.selectedDrawingId === hit.drawing.id && hit.handleIdx === null) {
            tappedAlreadySelectedId = hit.drawing.id;
          }

          this.selectedDrawingId = hit.drawing.id;
          window.TVUI?.updateObjectEditBar?.();
          window.TVUI?.renderObjectTree?.();
          lastDataPt = this.screenToData(tx, ty, false);

          if (hit.drawing.locked) {
            mode = 'pan';
            window.TVUI?.toast?.('Object is locked');
          } else {
            this.pushHistory();
            if (hit.handleIdx !== null) { mode = 'editHandle'; activeHandleIdx = hit.handleIdx; }
            else { mode = 'editMove'; }
          }
          this.scheduleDraw();
          return;
        }

        if (this.selectedDrawingId) {
          this.selectedDrawingId = null;
          window.TVUI?.updateObjectEditBar?.();
          window.TVUI?.renderObjectTree?.();
          this.scheduleDraw();
        }

        if (this.crosshairActive) {
          mode = 'crosshairDrag';
          return;
        }

        mode = 'pan';
        longPressTimer = setTimeout(() => {
          if (mode === 'pan' && movedDist < 8) {
            mode = 'crosshairDrag';
            this.crosshairActive = true;
            this.crossX = tx;
            this.crossY = ty;
            try { navigator.vibrate?.(22); } catch (_) {}
            const dPt = this.screenToData(tx, ty, false);
            broadcastCrosshair(dPt.time, dPt.price);
            this.scheduleDraw();
          }
        }, 320);
      };

      const handleMove = (tx, ty) => {
        const { mainH, plotW, totalPlotH } = this.getLayoutMetrics();
        const dx = tx - lastX;
        const dy = ty - lastY;
        lastX = tx;
        lastY = ty;
        movedDist += Math.hypot(dx, dy);

        if (movedDist > 8) clearLongPress();

        if (mode === 'pan') {
          this.scrollOffset -= dx / this.candleStep;
          if (Math.abs(dy) > 0.4) {
            this.autoScale = false;
            const nMin = this.mapPriceToNorm(this.viewMinP);
            const nMax = this.mapPriceToNorm(this.viewMaxP);
            const nPerPx = (nMax - nMin) / mainH;
            this.viewMinP = this.mapNormToPrice(nMin + dy * nPerPx);
            this.viewMaxP = this.mapNormToPrice(nMax + dy * nPerPx);
          }
          this.scheduleDraw();
        } else if (mode === 'crosshairDrag' || mode === 'firstTapAim' || mode === 'aimMultiPt') {
          this.crossX = Math.max(2, Math.min(plotW - 2, (this.crossX ?? tx) + dx));
          this.crossY = Math.max(2, Math.min(totalPlotH - 2, (this.crossY ?? ty) + dy));
          if (mode === 'crosshairDrag') {
            const dPt = this.screenToData(this.crossX, this.crossY, false);
            broadcastCrosshair(dPt.time, dPt.price);
          }
          this.scheduleDraw();
        } else if (mode === 'secondTapAim' && anchoredDrawing) {
          this.crossX = Math.max(2, Math.min(plotW - 2, (this.crossX ?? tx) + dx));
          this.crossY = Math.max(2, Math.min(mainH - 2, (this.crossY ?? ty) + dy));
          const pt = this.screenToData(this.crossX, this.crossY, true);
          anchoredDrawing.t2 = pt.time;
          anchoredDrawing.p2 = pt.price;
          if (['channel', 'regression', 'flattop', 'disjoint'].includes(anchoredDrawing.type)) {
            anchoredDrawing.channelOffset = (this.viewMaxP - this.viewMinP) * 0.08;
          }
          this.scheduleDraw();
        } else if (mode === 'drawBrush' && this.draftDrawing) {
          this.crossX = Math.max(2, Math.min(plotW - 2, (this.crossX ?? tx) + dx));
          this.crossY = Math.max(2, Math.min(mainH - 2, (this.crossY ?? ty) + dy));
          const pt = this.screenToData(this.crossX, this.crossY, true);
          this.draftDrawing.pts.push({ t: pt.time, p: pt.price });
          this.scheduleDraw();
        } else if (mode === 'priceScale') {
          this.autoScale = false;
          const nMin = this.mapPriceToNorm(this.viewMinP);
          const nMax = this.mapPriceToNorm(this.viewMaxP);
          const mid = (nMin + nMax) / 2;
          const factor = Math.max(0.2, Math.min(3, 1 + dy * 0.0085));
          const half = ((nMax - nMin) / 2) * factor;
          this.viewMinP = this.mapNormToPrice(mid - half);
          this.viewMaxP = this.mapNormToPrice(mid + half);
          this.scheduleDraw();
        } else if (mode === 'timeScale') {
          this.zoomAtScreenX(this.candleStep * (1 + dx * 0.006), plotW * 0.5);
        } else if (mode === 'dragAlert' && draggedAlert) {
          const pt = this.screenToData(tx, ty, false);
          draggedAlert.price = Number(pt.price.toFixed(TVStore.getSymMeta(this.sym).prec));
          this.scheduleDraw();
        } else if (mode === 'dragOrder' && draggedOrder) {
          const pt = this.screenToData(tx, ty, false);
          const newPx = Number(pt.price.toFixed(TVStore.getSymMeta(this.sym).prec));
          if (draggedOrderField === 'autoSlTp') {
            const isAbove = newPx > draggedOrder.entry;
            if ((draggedOrder.side === 'BUY' && isAbove) || (draggedOrder.side === 'SELL' && !isAbove)) draggedOrder.tp = newPx;
            else draggedOrder.sl = newPx;
          } else {
            draggedOrder[draggedOrderField] = newPx;
          }
          this.scheduleDraw();
        } else if (mode === 'editMove' && this.selectedDrawingId) {
          const d = this.drawings.find(x => x.id === this.selectedDrawingId);
          const curPt = this.screenToData(tx, ty, false);
          if (d && lastDataPt) {
            const dt = curPt.time - lastDataPt.time;
            const dp = curPt.price - lastDataPt.price;
            lastDataPt = curPt;
            d.t1 += dt; d.p1 += dp;
            if (d.t2 != null) d.t2 += dt;
            if (d.p2 != null) d.p2 += dp;
            if (d.p3 != null) d.p3 += dp;
            if (d.pts) d.pts.forEach(pt => { pt.t += dt; pt.p += dp; });
            this.scheduleDraw();
          }
        } else if (mode === 'editHandle' && this.selectedDrawingId) {
          const d = this.drawings.find(x => x.id === this.selectedDrawingId);
          const curPt = this.screenToData(tx, ty, true);
          if (d) {
            if (d.pts?.length && d.type !== 'brush' && d.type !== 'highlighter' && d.pts[activeHandleIdx]) {
              d.pts[activeHandleIdx] = { t: curPt.time, p: curPt.price };
              d.t1 = d.pts[0].t; d.p1 = d.pts[0].p;
              const lastPt = d.pts[d.pts.length - 1];
              d.t2 = lastPt.t; d.p2 = lastPt.p;
            } else if (activeHandleIdx === 0) {
              if (d.type === 'long' || d.type === 'short') {
                const dp = curPt.price - d.p1;
                d.t1 = curPt.time; d.p1 = curPt.price; d.p2 += dp; d.p3 += dp;
              } else { d.t1 = curPt.time; d.p1 = curPt.price; }
            } else if (activeHandleIdx === 1) {
              if (d.pts?.length) d.pts[d.pts.length - 1] = { t: curPt.time, p: curPt.price };
              else { d.t2 = curPt.time; d.p2 = curPt.price; }
            } else if (activeHandleIdx === 2) {
              if (['channel', 'regression', 'flattop', 'disjoint'].includes(d.type)) {
                d.channelOffset = curPt.price - ((d.p1 + (d.p2 ?? d.p1)) / 2);
              } else if (d.type === 'long' || d.type === 'short') {
                d.t2 = curPt.time; d.p3 = curPt.price;
              } else { d.t2 = curPt.time; d.p1 = curPt.price; }
            } else if (activeHandleIdx === 3) {
              d.t1 = curPt.time; d.p2 = curPt.price;
            }
            this.scheduleDraw();
          }
        }
      };

      const handleEnd = () => {
        clearLongPress();
        const elapsed = Date.now() - startTimeMs;
        const tool = TVStore.activeTool;
        const now = Date.now();

        // 1-Tap on an already-selected drawing opens its full Settings modal directly
        if (tappedAlreadySelectedId && movedDist < 7) {
          tappedAlreadySelectedId = null;
          this.undoStack.pop();
          window.TVUI?.openDrawingEditModal?.('style');
          mode = null;
          return;
        }

        if (mode === 'crosshairDrag' && movedDist < 7 && elapsed < 260) {
          this.crosshairActive = false;
          this.crossX = null;
          this.crossY = null;
          TVStore.panes.forEach(p => { p.syncedTime = null; p.syncedPrice = null; p.scheduleDraw(); });
        }

        if (mode === 'firstTapAim' && movedDist < 8 && now - lastPlacementTime > 180) {
          lastPlacementTime = now;
          const pt = this.screenToData(this.crossX, this.crossY, true);
          const newId = 'd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5);

          if (SINGLE_PT_TOOLS.has(tool)) {
            this.pushHistory();
            const isTextLike = ['text', 'anchoredtext', 'note', 'pricenote', 'callout', 'comment'].includes(tool);
            const dObj = {
              id: newId, type: tool, t1: pt.time, p1: pt.price,
              text: isTextLike ? 'Note' : '',
              color: '#2962FF',
              textColor: '#2962FF',
              fillColor: 'rgba(41, 98, 255, 0.2)',
              fillEnabled: true,
              width: 2,
              dash: 'solid',
              fontSize: 12,
              visTfs: 'all'
            };
            finalizeNewDrawing(dObj);
            if (isTextLike) window.TVUI?.openDrawingEditModal?.('text');
          } else if (tool === 'long' || tool === 'short') {
            this.pushHistory();
            const span = (this.viewMaxP - this.viewMinP) * 0.14;
            const tp = tool === 'long' ? pt.price + span : pt.price - span;
            const sl = tool === 'long' ? pt.price - span * 0.5 : pt.price + span * 0.5;
            const dObj = {
              id: newId, type: tool, t1: pt.time, p1: pt.price,
              t2: pt.time + Number(this.tf) * 12, p2: tp, p3: sl, color: '#2962FF', visTfs: 'all'
            };
            finalizeNewDrawing(dObj);
          } else {
            this.pushHistory();
            const dObj = {
              id: newId, type: tool, t1: pt.time, p1: pt.price,
              t2: pt.time + Number(this.tf) * 6, p2: pt.price,
              channelOffset: (this.viewMaxP - this.viewMinP) * 0.08,
              color: '#2962FF', fillColor: 'rgba(41, 98, 255, 0.2)', fillEnabled: true,
              width: 2, dash: 'solid', visTfs: 'all'
            };
            anchoredDrawing = dObj;
            this.draftDrawing = dObj;
            awaitingSecondTap = true;
            this.scheduleDraw();
          }
        } else if (mode === 'secondTapAim' && anchoredDrawing && movedDist < 8 && now - lastPlacementTime > 180) {
          lastPlacementTime = now;
          const pt = this.screenToData(this.crossX, this.crossY, true);
          anchoredDrawing.t2 = pt.time;
          anchoredDrawing.p2 = pt.price;
          finalizeNewDrawing(anchoredDrawing);
        } else if (mode === 'aimMultiPt' && MULTI_PT_MAX[tool] && movedDist < 8 && now - lastPlacementTime > 180) {
          lastPlacementTime = now;
          const pt = this.screenToData(this.crossX, this.crossY, true);
          const maxPts = MULTI_PT_MAX[tool];

          if (!this.activeMultiDrawing) {
            this.pushHistory();
            this.activeMultiDrawing = {
              id: 'd_' + Date.now(),
              type: tool,
              t1: pt.time,
              p1: pt.price,
              t2: pt.time,
              p2: pt.price,
              pts: [{ t: pt.time, p: pt.price }],
              color: '#2962FF',
              fillColor: 'rgba(41, 98, 255, 0.18)',
              fillEnabled: true,
              width: 2,
              dash: 'solid',
              visTfs: 'all'
            };
          } else {
            this.activeMultiDrawing.pts.push({ t: pt.time, p: pt.price });
            this.activeMultiDrawing.t2 = pt.time;
            this.activeMultiDrawing.p2 = pt.price;
          }

          const curCount = this.activeMultiDrawing.pts.length;
          if (curCount >= maxPts) {
            this.completeActiveMultiDrawing();
          } else {
            const bar = document.getElementById('multiPtFinishBar');
            const lbl = document.getElementById('multiPtLabel');
            if (bar && lbl) {
              lbl.textContent = maxPts < 50 ? `${tool.toUpperCase()} (${curCount}/${maxPts} pts)` : `Path (${curCount} pts)`;
              bar.classList.remove('hidden');
            }
            this.scheduleDraw();
          }
        } else if (mode === 'drawBrush' && this.draftDrawing) {
          const done = this.draftDrawing;
          finalizeNewDrawing(done);
        } else if (mode === 'editMove' || mode === 'editHandle') {
          if (movedDist < 5) this.undoStack.pop();
          this.saveDrawings();
        } else if (mode === 'dragOrder') {
          TVStore.savePaper();
          window.TVUI?.renderTradingView?.();
        } else if (mode === 'dragAlert' && draggedAlert) {
          this.saveAlerts();
          window.TVUI?.toast?.(`Alert moved to ${draggedAlert.price}`);
        }

        mode = null;
        activeHandleIdx = null;
        draggedOrder = null;
        draggedAlert = null;
        pinchDist0 = 0;
      };

      this.el.addEventListener('touchstart', (e) => {
        if (e.target.closest('button, .drag-grip')) return;
        e.preventDefault();
        lastTouchEventTime = Date.now();
        const rect = this.el.getBoundingClientRect();
        if (e.touches.length === 1) {
          handleStart(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top);
        } else if (e.touches.length === 2) {
          clearLongPress();
          mode = 'pinch';
          const x0 = e.touches[0].clientX - rect.left;
          const x1 = e.touches[1].clientX - rect.left;
          pinchDist0 = Math.hypot(x0 - x1, e.touches[0].clientY - e.touches[1].clientY);
          pinchMidX0 = (x0 + x1) / 2;
          step0 = this.candleStep;
        }
      }, { passive: false });

      this.el.addEventListener('touchmove', (e) => {
        if (e.target.closest('button, .drag-grip')) return;
        e.preventDefault();
        lastTouchEventTime = Date.now();
        const rect = this.el.getBoundingClientRect();
        if (e.touches.length === 1) {
          handleMove(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top);
        } else if (e.touches.length === 2 && mode === 'pinch' && pinchDist0 > 0) {
          const x0 = e.touches[0].clientX - rect.left;
          const x1 = e.touches[1].clientX - rect.left;
          const dist = Math.hypot(x0 - x1, e.touches[0].clientY - e.touches[1].clientY);
          const midX = (x0 + x1) / 2;
          this.zoomAtScreenX(step0 * (dist / pinchDist0), midX || pinchMidX0);
        }
      }, { passive: false });

      this.el.addEventListener('touchend', (e) => {
        if (e.target.closest('button, .drag-grip')) return;
        lastTouchEventTime = Date.now();
        handleEnd();
      });

      this.el.addEventListener('mousedown', (e) => {
        if (e.target.closest('button, .drag-grip')) return;
        if (Date.now() - lastTouchEventTime < 550) return;
        if (e.button !== 0) return;
        const rect = this.el.getBoundingClientRect();
        handleStart(e.clientX - rect.left, e.clientY - rect.top);
      });

      window.addEventListener('mousemove', (e) => {
        if (Date.now() - lastTouchEventTime < 550) return;
        const rect = this.el.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        if (!mode && !this.isNavTool(TVStore.activeTool) && mx >= 0 && mx <= rect.width && my >= 0 && my <= rect.height && !this.el.classList.contains('hidden')) {
          this.crossX = mx;
          this.crossY = my;
          if (awaitingSecondTap && anchoredDrawing) {
            const pt = this.screenToData(mx, my, true);
            anchoredDrawing.t2 = pt.time;
            anchoredDrawing.p2 = pt.price;
          }
          this.scheduleDraw();
          return;
        }

        if (!mode) return;
        handleMove(mx, my);
      });

      window.addEventListener('mouseup', () => {
        if (Date.now() - lastTouchEventTime < 550) return;
        if (mode) handleEnd();
      });

      this.el.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = this.el.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        this.zoomAtScreenX(this.candleStep * (e.deltaY < 0 ? 1.12 : 0.89), cursorX);
      }, { passive: false });
    }

    stopFeed() {
      this.reqId++;
      this.cleanups.forEach(fn => { try { fn(); } catch (_) {} });
      this.cleanups = [];
    }

    checkAlerts(prevP, newP) {
      if (prevP == null || !this.alerts.length) return;
      let changed = false;
      this.alerts = this.alerts.map(al => {
        if (!al.active) return al;
        const cond = al.condition || 'crossing';
        const hitUp = prevP < al.price && newP >= al.price;
        const hitDn = prevP > al.price && newP <= al.price;
        const triggered = cond === 'up' ? hitUp : (cond === 'down' ? hitDn : (hitUp || hitDn));
        if (triggered) {
          changed = true;
          playBeep();
          window.TVUI?.toast?.(`🔔 Alert: ${this.sym} ${al.msg || ''} @ ${al.price}`, 4500);
          return { ...al, active: false, triggeredAt: new Date().toLocaleTimeString() };
        }
        return al;
      });
      if (changed) this.saveAlerts();
    }

    applyTick(bid, ask) {
      if (!this.fullData.length || !bid || isNaN(bid)) return;
      const tfSec = Number(this.tf);
      const nowSec = Math.floor(Date.now() / 1000);
      const bucket = Math.floor(nowSec / tfSec) * tfSec;
      const last = this.fullData[this.fullData.length - 1];

      const prevDisp = this.lastBid != null ? this.disp(this.lastBid) : null;
      const newDisp = this.disp(bid);

      this.checkAlerts(prevDisp, newDisp);
      const orderUpdated = TradingEngine.processPriceTick(this.sym, newDisp);
      if (orderUpdated) window.TVUI?.renderTradingView?.();

      if (bucket > last.time) {
        this.fullData.push({ time: bucket, open: last.close, high: Math.max(last.close, bid), low: Math.min(last.close, bid), close: bid, vol: 1 });
      } else {
        last.high = Math.max(last.high, bid);
        last.low = Math.min(last.low, bid);
        last.close = bid;
        last.vol = (last.vol || 1) + 1;
      }

      if (TVStore.quotes[this.sym]) {
        TVStore.quotes[this.sym].prevLast = TVStore.quotes[this.sym].last;
        TVStore.quotes[this.sym].last = newDisp;
        TVStore.quotes[this.sym].high = Math.max(TVStore.quotes[this.sym].high, newDisp);
        TVStore.quotes[this.sym].low = Math.min(TVStore.quotes[this.sym].low, newDisp);
      }

      const meta = TVStore.getSymMeta(this.sym);
      const aDisp = this.disp(ask || bid);

      if (this.id === TVStore.selectedPaneIdx) {
        const sellPxEl = document.getElementById('qtFloatSellPx');
        const buyPxEl = document.getElementById('qtFloatBuyPx');
        if (sellPxEl) sellPxEl.textContent = newDisp.toFixed(meta.prec);
        if (buyPxEl) {
          const buyShown = aDisp > newDisp ? aDisp : newDisp + Math.pow(10, -meta.prec) * 2;
          buyPxEl.textContent = buyShown.toFixed(meta.prec);
        }
        if (document.getElementById('view-watchlist')?.classList.contains('active')) {
          window.TVUI?.updateSymbolDetailsCard?.();
        }
      }

      this.lastBid = bid;
      if (ask && !isNaN(ask)) this.lastAsk = ask;
      if (!this.replayActive) {
        this.recompute();
        this.scheduleDraw();
      }
    }

    async startFeed() {
      this.stopFeed();
      const rId = this.reqId;
      this.loadStoredMeta();
      this.lastBid = null;
      this.lastAsk = null;
      this.scrollOffset = 6;
      this.autoScale = true;
      this.scheduleDraw();

      try {
        const bars = await DataFeed.loadHistorical(this.sym, Number(this.tf));
        if (rId !== this.reqId || !bars.length) return;
        this.fullData = bars;
        this.recompute();
        const latestClose = this.fullData[this.fullData.length - 1].close;
        if (TVStore.quotes[this.sym]) {
          TVStore.quotes[this.sym].open = this.disp(this.fullData[0].open);
        }
        this.applyTick(latestClose, latestClose);

        DataFeed.subscribeLive(
          this.sym,
          (b, a) => { if (rId === this.reqId) this.applyTick(b, a); },
          (fn) => this.cleanups.push(fn)
        );
      } catch (_) {}
    }
  }

  window.SuperChartPane = SuperChartPane;
})();
