/* ═══════════ TrackFlow · Данные, гео-математика, стор, симуляция ═══════════
   Пробки сейчас генерируются локально. Для боевого режима подключите
   Яндекс.Карты JS API v3 + слой пробок (нужен API-ключ) и замените
   traffic-сегменты заказа данными из API — вся отрисовка уже готова. */

const LOCATIONS = [
  { name: 'Склад «Центр», ул. Ленина 45', coords: [55.7558, 37.6173] },
  { name: 'ТЦ «Европейский»', coords: [55.7441, 37.5654] },
  { name: 'Ресторан «Урюк», Тверская', coords: [55.7649, 37.6053] },
  { name: 'Аптека «Ригла», Арбат', coords: [55.7494, 37.5912] },
  { name: 'Маркет «Перекрёсток», Садовая', coords: [55.7392, 37.6512] },
  { name: 'Пиццерия «Додо», Пятницкая', coords: [55.7412, 37.6284] },
  { name: 'ул. Пушкина 12', coords: [55.7650, 37.6400] },
  { name: 'ул. Гагарина 8', coords: [55.7100, 37.5500] },
  { name: 'ул. Чехова 3', coords: [55.7800, 37.6000] },
  { name: 'ул. Садовая 22', coords: [55.7480, 37.6600] },
  { name: 'БЦ «Москва-Сити»', coords: [55.7473, 37.5377] }
];

const DRIVERS = [
  { id: 'd1', name: 'Алексей К.', car: 'Hyundai Solaris', plate: 'А777МР 77', rating: 4.9, online: true },
  { id: 'd2', name: 'Дмитрий С.', car: 'Kia Rio', plate: 'В123ОЕ 99', rating: 4.7, online: true },
  { id: 'd3', name: 'Иван П.', car: 'Toyota Camry', plate: 'Е456КТ 150', rating: 4.8, online: true },
  { id: 'd4', name: 'Сергей М.', car: 'VW Polo', plate: 'К789НХ 50', rating: 4.6, online: false },
  { id: 'd5', name: 'Андрей В.', car: 'Skoda Octavia', plate: 'М321ТР 77', rating: 4.9, online: true },
  { id: 'd6', name: 'Максим Д.', car: 'Renault Logan', plate: 'О555АС 99', rating: 4.5, online: true }
];
const ME_ID = 'd1';

const STATUS = {
  new:        { label: 'Новый',        pill: 'pill-new' },
  accepted:   { label: 'Принят',       pill: 'pill-accepted' },
  delivering: { label: 'Доставляется', pill: 'pill-delivering' },
  arrived:    { label: 'Прибыл',       pill: 'pill-arrived' },
  done:       { label: 'Завершён',     pill: 'pill-done' }
};
const FLOW = ['new', 'accepted', 'delivering', 'arrived', 'done'];
const TRAFFIC_LABEL = { free: 'Свободно', slow: 'Плотное движение', jam: 'Пробка' };
const SPEEDS = { free: 36, slow: 18, jam: 7 }; // км/ч

/* ─── Утилиты ─── */
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry(seed) { let t = seed >>> 0; return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
function hav(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLa = (b[0] - a[0]) * rad, dLo = (b[1] - a[1]) * rad;
  const s = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/* Псевло-дорожный путь (детерминирован по id) */
const pathCache = new Map();
function pathFor(o) {
  if (pathCache.has(o.id)) return pathCache.get(o.id);
  const r = mulberry(hashStr(o.id));
  const a = o.from, b = o.to;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1e-6;
  const px = -dy / len, py = dx / len;
  const pts = [a];
  const n = 8;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const amp = (r() - .5) * len * .55 * Math.sin(Math.PI * t);
    pts.push([
      a[0] + dx * t + px * amp + (r() - .5) * len * .08,
      a[1] + dy * t + py * amp + (r() - .5) * len * .08
    ]);
  }
  pts.push(b);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + hav(pts[i - 1], pts[i]));
  const path = { pts, cum, total: cum[cum.length - 1] || 1e-9 };
  pathCache.set(o.id, path);
  return path;
}
function pointAt(path, t) {
  t = Math.max(0, Math.min(1, t));
  const target = t * path.total;
  for (let i = 0; i < path.cum.length - 1; i++) {
    if (path.cum[i + 1] >= target) {
      const span = (path.cum[i + 1] - path.cum[i]) || 1e-9;
      const k = (target - path.cum[i]) / span;
      const a = path.pts[i], b = path.pts[i + 1];
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    }
  }
  return path.pts[path.pts.length - 1];
}
function segLatLngs(path, aPct, bPct) {
  const a = aPct / 100, b = bPct / 100;
  const out = [pointAt(path, a)];
  for (let i = 1; i < path.pts.length - 1; i++) {
    const t = path.cum[i] / path.total;
    if (t > a && t < b) out.push(path.pts[i]);
  }
  out.push(pointAt(path, b));
  return out;
}
function trafficAt(o, pct) {
  let acc = 0;
  for (const s of o.traffic) { acc += s.w; if (pct < acc) return s.t; }
  return o.traffic[o.traffic.length - 1].t;
}
function distKm(o) { return pathFor(o).total; }
function etaMin(o) {
  if (o.status === 'arrived' || o.status === 'done') return 0;
  const total = distKm(o);
  let acc = 0, min = 0;
  for (const s of o.traffic) {
    const start = acc, end = acc + s.w; acc = end;
    const from = Math.max(o.progress, start), to = end;
    if (to > from) min += ((to - from) / 100 * total) / SPEEDS[s.t] * 60;
  }
  return Math.max(1, Math.round(min));
}
function trafficColor(t) {
  const mono = { free: '#f2f2ef', slow: '#8f8f8c', jam: '#4a4a4e' };
  const color = { free: '#22c55e', slow: '#eab308', jam: '#ef4444' };
  return (Store.state.trafficMode === 'color' ? color : mono)[t];
}
function randTraffic(seed) {
  const r = mulberry(seed >>> 0);
  const n = 3 + Math.floor(r() * 2);
  const pool = ['free', 'free', 'free', 'slow', 'slow', 'jam'];
  const segs = [];
  let left = 100;
  for (let i = 0; i < n; i++) {
    const t = pool[Math.floor(r() * pool.length)];
    const w = i === n - 1 ? left : Math.max(12, Math.min(left - (n - i - 1) * 12, Math.round(15 + r() * 30)));
    segs.push({ t, w }); left -= w;
  }
  return segs;
}

/* ─── Сид ─── */
function seedState() {
  const now = Date.now(), M = 60e3;
  const mk = (num, fromI, toI, drvId, status, progress, traffic, price, ageMin) => {
    const drv = drvId ? DRIVERS.find(d => d.id === drvId) : null;
    const createdAt = now - ageMin * M;
    const chain = FLOW.slice(0, FLOW.indexOf(status) + 1);
    const history = chain.map((s, i) => ({ s, at: createdAt + Math.round(ageMin * M * i / Math.max(1, chain.length)) }));
    return {
      id: 'TF-' + num,
      fromName: LOCATIONS[fromI].name, toName: LOCATIONS[toI].name,
      from: [...LOCATIONS[fromI].coords], to: [...LOCATIONS[toI].coords],
      driverId: drv ? drv.id : null,
      driverName: drv ? drv.name : null,
      car: drv ? drv.car : null, plate: drv ? drv.plate : null,
      status, progress, traffic, price, createdAt, history
    };
  };
  return {
    v: 3, counter: 2849, trafficMode: 'mono', speed: 30, me: { online: true },
    orders: [
      mk(2841, 0, 6, 'd2', 'delivering', 62, [{ t: 'free', w: 30 }, { t: 'slow', w: 25 }, { t: 'jam', w: 15 }, { t: 'free', w: 30 }], 1290, 34),
      mk(2842, 1, 7, 'd3', 'delivering', 35, [{ t: 'free', w: 40 }, { t: 'slow', w: 25 }, { t: 'free', w: 20 }, { t: 'slow', w: 15 }], 1490, 22),
      mk(2843, 2, 8, 'd5', 'accepted', 0, [{ t: 'jam', w: 30 }, { t: 'slow', w: 30 }, { t: 'free', w: 40 }], 990, 9),
      mk(2844, 4, 9, 'd6', 'delivering', 80, [{ t: 'free', w: 70 }, { t: 'slow', w: 30 }], 790, 16),
      mk(2845, 3, 10, 'd4', 'arrived', 100, [{ t: 'free', w: 40 }, { t: 'slow', w: 35 }, { t: 'free', w: 25 }], 1190, 48),
      mk(2846, 5, 10, null, 'new', 0, [{ t: 'slow', w: 20 }, { t: 'free', w: 50 }, { t: 'jam', w: 30 }], 1690, 6),
      mk(2847, 0, 8, null, 'new', 0, [{ t: 'free', w: 60 }, { t: 'slow', w: 40 }], 890, 3),
      mk(2848, 1, 6, 'd5', 'done', 100, [{ t: 'free', w: 50 }, { t: 'jam', w: 20 }, { t: 'free', w: 30 }], 1090, 360)
    ]
  };
}

/* ─── Стор ─── */
const LS_KEY = 'trackflow-v3';
const Store = {
  state: null,
  listeners: new Set(),
  lastRemoved: null,

  init() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      this.state = (parsed && parsed.v === 3 && Array.isArray(parsed.orders)) ? parsed : seedState();
    } catch { this.state = seedState(); }
    this.save();
  },
  save() { try { localStorage.setItem(LS_KEY, JSON.stringify(this.state)); } catch {} },
  subscribe(fn) { this.listeners.add(fn); },
  notify(meta = {}) { this.listeners.forEach(fn => fn(this.state, meta)); },
  set(mut, meta = { structural: true }) { mut(this.state); this.save(); this.notify(meta); },

  order(id) { return this.state.orders.find(o => o.id === id); },

  createOrder(data) {
    const id = 'TF-' + this.state.counter;
    const now = Date.now();
    const assigned = data.driverId ? DRIVERS.find(d => d.id === data.driverId) : null;
    const status = assigned ? 'accepted' : 'new';
    const history = [{ s: 'new', at: now }];
    if (assigned) history.push({ s: 'accepted', at: now });
    const order = {
      id, fromName: data.fromName, toName: data.toName,
      from: data.from, to: data.to,
      driverId: assigned ? assigned.id : null,
      driverName: assigned ? assigned.name : null,
      car: data.car, plate: data.plate,
      status, progress: 0,
      traffic: randTraffic(hashStr(id) + now % 997),
      price: data.price, createdAt: now, history
    };
    this.set(s => { s.counter++; s.orders.unshift(order); });
    return order;
  },

  removeOrders(ids) {
    const removed = [];
    this.set(s => {
      ids.forEach(id => {
        const idx = s.orders.findIndex(o => o.id === id);
        if (idx > -1) removed.push({ order: s.orders[idx], index: idx });
      });
      s.orders = s.orders.filter(o => !ids.includes(o.id));
    });
    removed.sort((a, b) => a.index - b.index);
    this.lastRemoved = removed;
    return removed;
  },
  undoRemove() {
    if (!this.lastRemoved || !this.lastRemoved.length) return 0;
    const n = this.lastRemoved.length;
    this.set(s => {
      this.lastRemoved.forEach(({ order, index }) => {
        if (!s.orders.find(o => o.id === order.id)) s.orders.splice(Math.min(index, s.orders.length), 0, order);
      });
    });
    this.lastRemoved = null;
    return n;
  },
  reset() {
    pathCache.clear();
    this.lastRemoved = null;
    this.state = seedState();
    this.save();
    this.notify({ structural: true });
  }
};
Store.init();

/* ─── Симуляция движения ─── */
const Sim = {
  timer: null,
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 1000);
  },
  tick() {
    const delivering = Store.state.orders.filter(o => o.status === 'delivering');
    if (!delivering.length) return;
    const arrived = [];
    Store.set(s => {
      const speedMul = s.speed || 30;
      delivering.forEach(o => {
        const v = SPEEDS[trafficAt(o, o.progress)] * speedMul; // км/ч
        const total = distKm(o);
        o.progress = Math.min(100, o.progress + (v / 3600) / total * 100);
        if (o.progress >= 100) {
          o.progress = 100;
          o.status = 'arrived';
          o.history.push({ s: 'arrived', at: Date.now() });
          arrived.push(o.id);
        }
      });
    }, { tick: true, arrived });
  }
};