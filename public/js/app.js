/* ═══════════ TrackFlow · Каркас: навигация, drawer, модалка, тосты, GPS ═══════════ */

const App = {
  view: 'seller',
  views: {},
  drawerId: null,
  drawerMap: null,
  drawerCar: null,
  modalOpen: false,
  toastTimer: null,
  lastFocus: null,

  /* ── Форматирование ── */
  esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  money(n) { return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + ' ₽'; },
  km(n) { return n.toFixed(1).replace('.', ',') + ' км'; },
  time(t) { return new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); },
  etaText(o) {
    if (o.status === 'arrived') return 'Прибыл';
    if (o.status === 'done') return 'Завершён';
    return '≈ ' + etaMin(o) + ' мин';
  },
  debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },

  icon(name, size = 16) {
    const p = {
      check: '<path d="M4 12.5l5 5L20 6.5"/>',
      x: '<path d="M6 6l12 12M18 6L6 18"/>',
      trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
      box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
      truck: '<path d="M1 7h11v9H1z"/><path d="M12 10h4l3 3v3h-7z"/><circle cx="5.5" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/>',
      undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
      info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/>',
      edit: '<path d="M4 20l4-1L20 7l-3-3L5 16l-1 4z"/>'
    }[name] || '';
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  },

  countUp(el, to) {
    const from = parseInt(String(el.textContent).replace(/\D/g, '')) || 0;
    if (from === to) { el.textContent = to; return; }
    const t0 = performance.now(), dur = 600;
    const step = now => {
      const k = Math.min(1, (now - t0) / dur);
      el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },

  /* ── Инициализация ── */
  init() {
    this.views = { seller: Seller, driver: Driver, admin: Admin };
    document.body.dataset.traffic = Store.state.trafficMode;

    document.querySelectorAll('[data-view]').forEach(btn => {
      if (btn.tagName === 'BUTTON') btn.addEventListener('click', () => this.switchView(btn.dataset.view));
    });
    document.querySelectorAll('[data-traffic-switch]').forEach(seg => {
      seg.addEventListener('click', e => {
        const b = e.target.closest('.ms-btn'); if (!b) return;
        Store.set(s => { s.trafficMode = b.dataset.mode; });
      });
    });
    document.getElementById('scrim').addEventListener('click', () => { this.closeModal(); this.closeDrawer(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { if (this.modalOpen) this.closeModal(); else this.closeDrawer(); }
    });
    document.getElementById('header-add').addEventListener('click', () => Seller.openCreate());

    Store.subscribe((state, meta) => {
      document.body.dataset.traffic = state.trafficMode;
      this.syncTrafficSwitches();
      const v = this.views[this.view];
      if (v && v.refresh) v.refresh(meta);
      if (this.drawerId) this.refreshDrawer(meta);
      if (meta.arrived && meta.arrived.length) {
        meta.arrived.forEach(id => {
          const o = Store.order(id);
          if (o && o.driverId === ME_ID) this.toast(`Вы прибыли: ${o.id}`, { icon: 'check' });
        });
      }
    });

    this.syncTrafficSwitches();
    this.switchView('seller');
    Sim.start();

    window.addEventListener('resize', this.debounce(() => this.placeThumb(), 150));
    window.addEventListener('load', () => this.placeThumb());
    setTimeout(() => this.placeThumb(), 350);
  },

  syncTrafficSwitches() {
    document.querySelectorAll('[data-traffic-switch] .ms-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === Store.state.trafficMode);
    });
  },

  placeThumb() {
    const active = document.querySelector('#top-nav .seg-btn.active');
    const thumb = document.getElementById('seg-thumb');
    if (!active || !thumb || !active.offsetWidth) return;
    thumb.style.left = active.offsetLeft + 'px';
    thumb.style.width = active.offsetWidth + 'px';
  },

  switchView(name) {
    if (!this.views[name]) return;
    const prev = this.views[this.view];
    if (prev && prev.unmount) prev.unmount();
    this.view = name;
    document.body.dataset.view = name;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + name).classList.add('active');
    document.querySelectorAll('#top-nav .seg-btn, #bottom-nav .bn-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.view === name);
    });
    this.placeThumb();
    const v = this.views[name];
    v.mount();
    setTimeout(() => { if (v.onShow) v.onShow(); }, 90);
  },

  /* ── Тост ── */
  toast(msg, opts = {}) {
    const t = document.getElementById('toast');
    const ic = document.getElementById('toast-ic');
    const m = document.getElementById('toast-msg');
    const act = document.getElementById('toast-act');
    clearTimeout(this.toastTimer);
    ic.innerHTML = this.icon(opts.icon || 'check');
    m.textContent = msg;
    if (opts.action) {
      act.style.display = 'inline-flex';
      act.textContent = opts.action.label;
      act.onclick = () => { opts.action.fn(); t.classList.remove('show'); };
    } else { act.style.display = 'none'; act.onclick = null; }
    t.classList.add('show');
    this.toastTimer = setTimeout(() => t.classList.remove('show'), opts.duration || (opts.action ? 6000 : 3200));
  },

  /* ── Модалка ── */
  openModal(html) {
    this.lastFocus = document.activeElement;
    document.getElementById('modal-card').innerHTML = html;
    document.getElementById('modal-root').classList.add('show');
    document.getElementById('scrim').classList.add('show');
    this.modalOpen = true;
    const first = document.querySelector('#modal-card input, #modal-card select, #modal-card button');
    if (first) setTimeout(() => first.focus(), 120);
    document.querySelectorAll('#modal-card [data-close]').forEach(b => b.addEventListener('click', () => this.closeModal()));
  },
  closeModal() {
    if (!this.modalOpen) return;
    this.modalOpen = false;
    document.getElementById('modal-root').classList.remove('show');
    if (!this.drawerId) document.getElementById('scrim').classList.remove('show');
    if (this.lastFocus) this.lastFocus.focus();
  },

  /* ── Drawer заказа ── */
  openDrawer(id) {
    const o = Store.order(id); if (!o) return;
    this.drawerId = id;
    this.buildDrawer(o);
    document.getElementById('drawer').classList.add('open');
    document.getElementById('scrim').classList.add('show');
    setTimeout(() => {
      this.initDrawerMap(o);
      const c = document.querySelector('#drawer-inner .btn-icon'); if (c) c.focus();
    }, 120);
  },
  closeDrawer() {
    if (!this.drawerId) return;
    this.drawerId = null;
    document.getElementById('drawer').classList.remove('open');
    if (!this.modalOpen) document.getElementById('scrim').classList.remove('show');
    if (this.drawerMap) { this.drawerMap.remove(); this.drawerMap = null; this.drawerCar = null; }
  },

  buildDrawer(o) {
    const st = STATUS[o.status];
    const total = distKm(o);
    const histMap = {}; o.history.forEach(h => histMap[h.s] = h.at);
    const curIdx = FLOW.indexOf(o.status);
    const editable = o.status !== 'done';

    const timeline = FLOW.map((s, i) => {
      const cls = i < curIdx ? 'done' : i === curIdx ? 'active' : '';
      const at = histMap[s];
      return `<div class="tl-item ${cls}"><span class="tl-dot"></span><span class="tl-line"></span><div><div class="tl-label">${STATUS[s].label}</div><div class="tl-time">${at ? this.time(at) : '—'}</div></div></div>`;
    }).join('');

    const trafficRows = o.traffic.map(s =>
      `<div class="tl-row"><i class="sw sw-${s.t}"></i><span class="tl-name">${TRAFFIC_LABEL[s.t]}</span><span class="tl-pct">${s.w}%</span><span class="tl-km">${this.km(s.w / 100 * total)}</span></div>`
    ).join('');

    const drvOptions = ['<option value="">Не назначен</option>']
      .concat(DRIVERS.map(d => `<option value="${d.id}" ${o.driverId === d.id ? 'selected' : ''}>${this.esc(d.name)} · ${this.esc(d.car)}</option>`)).join('');

    const editBlock = editable ? `
      <div class="sec-title">Редактирование</div>
      <div class="edit-grid">
        <div><label class="f-label">Марка машины</label><input class="f-input" id="ed-car" value="${this.esc(o.car || '')}" placeholder="Hyundai Solaris"></div>
        <div><label class="f-label">Номер</label><input class="f-input" id="ed-plate" value="${this.esc(o.plate || '')}" placeholder="А777МР 77"></div>
        ${o.status === 'new' ? `<div class="full"><label class="f-label">Водитель</label><select class="f-input" id="ed-driver">${drvOptions}</select></div>` : ''}
        <div class="full"><button class="btn btn-primary" id="ed-save" type="button">${this.icon('edit', 14)} Сохранить</button></div>
      </div>` : '';

    document.getElementById('drawer-inner').innerHTML = `
      <div class="drawer-head">
        <span class="dots"><i></i><i></i><i></i></span>
        <span class="card-id">${o.id}</span>
        <span class="pill ${st.pill}" id="dw-pill">${st.label}</span>
        <button class="btn-icon" id="dw-close" type="button" aria-label="Закрыть">${this.icon('x')}</button>
      </div>
      <div class="drawer-map" id="drawer-map"></div>
      <div class="route-line">
        <div class="rl"><i class="rl-a"></i>${this.esc(o.fromName)}</div>
        <div class="rl"><i class="rl-b"></i>${this.esc(o.toName)}</div>
      </div>
      <div class="pbar"><div class="pbar-track">${o.traffic.map(s => `<div class="seg-t seg-${s.t}" style="width:${s.w}%"></div>`).join('')}</div><div class="ind" id="dw-ind" style="left:${o.progress}%"></div></div>
      <div class="meta-grid">
        <div class="meta-item"><b>Водитель</b><span>${this.esc(o.driverName || 'Не назначен')}</span></div>
        <div class="meta-item"><b>Машина</b><span>${this.esc(o.car || '—')} · ${this.esc(o.plate || '')}</span></div>
        <div class="meta-item"><b>Расстояние</b><span>${this.km(total)}</span></div>
        <div class="meta-item"><b>ETA</b><span id="dw-eta">${this.etaText(o)}</span></div>
        <div class="meta-item"><b>Стоимость</b><span>${this.money(o.price)}</span></div>
        <div class="meta-item"><b>Создан</b><span>${this.time(o.createdAt)}</span></div>
      </div>
      <div class="sec-title">Маршрут по пробкам</div>
      <div class="traffic-list">${trafficRows}</div>
      <div class="sec-title">История статусов</div>
      <div class="timeline">${timeline}</div>
      ${editBlock}
      <div class="drawer-foot">
        <button class="btn btn-ghost" id="dw-del" type="button">${this.icon('trash', 14)} Удалить</button>
        <button class="btn btn-primary" id="dw-ok" type="button">Закрыть</button>
      </div>`;

    document.getElementById('dw-close').onclick = () => this.closeDrawer();
    document.getElementById('dw-ok').onclick = () => this.closeDrawer();
    document.getElementById('dw-del').onclick = () => {
      const id = o.id;
      this.closeDrawer();
      Store.removeOrders([id]);
      this.toast(`Заказ ${id} удалён`, {
        icon: 'trash',
        action: { label: 'Отменить', fn: () => { const n = Store.undoRemove(); if (n) this.toast('Заказ восстановлен', { icon: 'undo' }); } }
      });
    };
    const save = document.getElementById('ed-save');
    if (save) save.onclick = () => {
      const car = document.getElementById('ed-car').value.trim();
      const plate = document.getElementById('ed-plate').value.trim();
      if (!car || !plate) { this.toast('Заполните марку и номер', { icon: 'info' }); return; }
      const drvSel = document.getElementById('ed-driver');
      Store.set(() => {
        const ord = Store.order(id); if (!ord) return;
        ord.car = car; ord.plate = plate;
        if (drvSel && drvSel.value) {
          const d = DRIVERS.find(x => x.id === drvSel.value);
          ord.driverId = d.id; ord.driverName = d.name;
          ord.car = d.car; ord.plate = d.plate;
          if (ord.status === 'new') { ord.status = 'accepted'; ord.history.push({ s: 'accepted', at: Date.now() }); }
        }
      });
      this.toast('Изменения сохранены');
    };
  },

  initDrawerMap(o) {
    const el = document.getElementById('drawer-map');
    if (!el) return;
    if (this.drawerMap) { this.drawerMap.remove(); this.drawerMap = null; }
    if (!window.L) { el.innerHTML = '<div class="map-fallback">Карта недоступна без сети</div>'; return; }
    const map = L.map(el, { attributionControl: true, zoomControl: true });
    map.attributionControl.setPrefix(false);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19, attribution: '© OpenStreetMap · CARTO' }).addTo(map);
    drawRoute(map, o);
    const path = pathFor(o);
    this.drawerCar = L.marker(pointAt(path, o.progress / 100), { icon: carIcon(), zIndexOffset: 500 }).addTo(map);
    map.fitBounds(L.latLngBounds(path.pts), { padding: [34, 34] });
    this.drawerMap = map;
    setTimeout(() => map.invalidateSize(), 160);
  },

  refreshDrawer(meta) {
    const o = Store.order(this.drawerId);
    if (!o) { this.closeDrawer(); return; }
    if (meta.tick && !meta.arrived) {
      const ind = document.getElementById('dw-ind');
      const eta = document.getElementById('dw-eta');
      if (ind) ind.style.left = o.progress + '%';
      if (eta) eta.textContent = this.etaText(o);
      if (this.drawerCar) this.drawerCar.setLatLng(pointAt(pathFor(o), o.progress / 100));
      return;
    }
    if (this.drawerMap) { this.drawerMap.remove(); this.drawerMap = null; this.drawerCar = null; }
    this.buildDrawer(o);
    this.initDrawerMap(o);
  },

  /* ── GPS водителя ── */
  Geo: {
    pos: null, started: false, watchId: null,
    start() {
      if (this.started || !navigator.geolocation) return;
      this.started = true;
      this.watchId = navigator.geolocation.watchPosition(
        p => { this.pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy || 40 }; if (window.Driver) Driver.onGeo(this.pos); },
        () => { this.pos = null; if (window.Driver) Driver.onGeo(null); },
        { enableHighAccuracy: true, maximumAge: 4000, timeout: 12000 }
      );
    }
  }
};

/* ─── Общие помощники карт ─── */
function carIcon() { return L.divIcon({ className: 'tf-marker', html: '<div class="mk mk-car"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }); }
function startIcon() { return L.divIcon({ className: 'tf-marker', html: '<div class="mk mk-start"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }); }
function endIcon() { return L.divIcon({ className: 'tf-marker', html: '<div class="mk mk-end"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }); }
function youIcon() { return L.divIcon({ className: 'tf-marker', html: '<div class="mk mk-you"></div>', iconSize: [11, 11], iconAnchor: [5.5, 5.5] }); }

function drawRoute(map, o) {
  const path = pathFor(o);
  let acc = 0;
  o.traffic.forEach(s => {
    const latlngs = segLatLngs(path, acc, acc + s.w);
    L.polyline(latlngs, { color: trafficColor(s.t), weight: 5, opacity: .95, lineCap: 'round' }).addTo(map);
    if (s.t === 'jam' && Store.state.trafficMode === 'mono') {
      L.polyline(latlngs, { color: '#ffffff', weight: 1.6, opacity: .85, dashArray: '2 7' }).addTo(map);
    }
    acc += s.w;
  });
  L.marker(o.from, { icon: startIcon() }).addTo(map);
  L.marker(o.to, { icon: endIcon() }).addTo(map);
  return path;
}

document.addEventListener('DOMContentLoaded', () => App.init());