/* ═══════════ TrackFlow · Вид водителя ═══════════ */

const Driver = {
  mounted: false,
  bound: false,
  map: null,
  routeLayer: null,
  carMarker: null,
  youMarker: null,
  youCircle: null,
  selectedId: null,
  currentId: null,
  lastDrawnId: null,
  lastMode: null,

  me() { return DRIVERS.find(d => d.id === ME_ID); },

  mount() {
    this.mounted = true;
    if (!this.bound) this.bind();
    this.initMap();
    this.full();
    App.Geo.start();
    this.onGeo(App.Geo.pos);
  },
  onShow() { if (this.map) this.map.invalidateSize(); },
  unmount() { this.mounted = false; },

  bind() {
    this.bound = true;
    document.getElementById('online-sw').addEventListener('change', e => {
      Store.set(s => { s.me.online = e.target.checked; });
      App.toast(e.target.checked ? 'Вы онлайн — заказы доступны' : 'Вы офлайн', { icon: 'info' });
    });
    document.getElementById('btn-accept').addEventListener('click', () => this.accept());
    document.getElementById('btn-start').addEventListener('click', () => this.start());
    document.getElementById('btn-refuse').addEventListener('click', () => this.refuse());
    document.getElementById('btn-arrived').addEventListener('click', () => this.arrive(true));
    document.getElementById('btn-complete').addEventListener('click', () => this.complete());
    document.getElementById('btn-center').addEventListener('click', () => this.center());
    document.getElementById('speed-sel').addEventListener('change', e => {
      Store.set(s => { s.speed = +e.target.value; }, { speed: true });
    });
    document.getElementById('avail-list').addEventListener('click', e => {
      const item = e.target.closest('.avail-item'); if (!item) return;
      this.selectedId = item.dataset.id;
      this.full();
    });
  },

  initMap() {
    const el = document.getElementById('driver-map');
    if (!window.L) { el.innerHTML = '<div class="map-fallback">Карта недоступна без сети.<br>Все действия с заказом работают.</div>'; return; }
    if (this.map) return;
    this.map = L.map(el, { zoomControl: true, attributionControl: true }).setView([55.7518, 37.6173], 12);
    this.map.attributionControl.setPrefix(false);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19, attribution: '© OpenStreetMap · CARTO' }).addTo(this.map);
    this.routeLayer = L.layerGroup().addTo(this.map);
    setTimeout(() => this.map.invalidateSize(), 150);
  },

  refresh(meta) {
    if (!this.mounted) return;
    if (meta.tick && !meta.arrived) this.live();
    else if (!meta.speed) this.full();
  },

  currentOrder() {
    let o = this.currentId ? Store.order(this.currentId) : null;
    if (o && ['accepted', 'delivering', 'arrived'].includes(o.status) && o.driverId === ME_ID) return o;
    this.currentId = null;
    o = Store.state.orders.find(x => x.driverId === ME_ID && ['accepted', 'delivering', 'arrived'].includes(x.status));
    if (o) { this.currentId = o.id; return o; }
    return null;
  },
  targetOrder() {
    return this.currentOrder() || (this.selectedId ? Store.order(this.selectedId) : null);
  },

  full() {
    const me = this.me();
    const online = Store.state.me.online;
    const sw = document.getElementById('online-sw');
    if (sw.checked !== online) sw.checked = online;
    document.getElementById('me-sub').textContent = `${me.car} · ${me.plate}`;
    document.getElementById('speed-sel').value = String(Store.state.speed);

    this.renderCurrent();
    this.renderAvail();
    this.redraw();
    this.gpsBadge();
  },

  renderCurrent() {
    const body = document.getElementById('current-body');
    const o = this.targetOrder();
    const btns = { accept: false, start: false, refuse: false, arrived: false, complete: false };

    if (!o) {
      body.innerHTML = `<div class="empty">${App.icon('box', 28)}<span>Выберите заказ из списка ниже,<br>чтобы принять его в работу</span></div>`;
    } else {
      const isMine = o.driverId === ME_ID;
      const flow = ['accepted', 'delivering', 'arrived', 'done'];
      const labels = ['Принят', 'В пути', 'Прибыл', 'Готово'];
      const idx = flow.indexOf(o.status);
      const steps = flow.map((s, i) => {
        const cls = i < idx ? 'done' : i === idx ? 'active' : '';
        const line = i < flow.length - 1 ? `<span class="sline ${i < idx ? 'done' : ''}"></span>` : '';
        return `<span class="step ${cls}"><span class="sd"></span><span class="sl">${labels[i]}</span></span>${line}`;
      }).join('');

      const remain = distKm(o) * (1 - o.progress / 100);
      body.innerHTML = `
        <div class="route-line">
          <div class="rl"><i class="rl-a"></i>${App.esc(o.fromName)}</div>
          <div class="rl"><i class="rl-b"></i>${App.esc(o.toName)}</div>
        </div>
        <div class="steps">${steps}</div>
        <div class="pbar" style="margin-bottom:6px">
          <div class="pbar-track">${o.traffic.map(s => `<div class="seg-t seg-${s.t}" style="width:${s.w}%"></div>`).join('')}</div>
          <div class="ind" id="cb-ind" style="left:${o.progress}%"></div>
        </div>
        <div class="info-row"><span class="info-label">Заказ</span><span class="info-value">${o.id}</span></div>
        <div class="info-row"><span class="info-label">Осталось</span><span class="info-value" id="cb-dist">${App.km(remain)}</span></div>
        <div class="info-row"><span class="info-label">ETA</span><span class="info-value" id="cb-eta">${App.etaText(o)}</span></div>
        <div class="info-row"><span class="info-label">Выплата</span><span class="info-value">${App.money(o.price)}</span></div>`;

      if (o.status === 'new') btns.accept = true;
      else if (isMine && o.status === 'accepted') { btns.start = true; btns.refuse = true; }
      else if (isMine && o.status === 'delivering') btns.arrived = true;
      else if (isMine && o.status === 'arrived') btns.complete = true;
    }

    const show = (id, on, disabled = false) => {
      const b = document.getElementById(id);
      b.style.display = on ? 'flex' : 'none';
      b.disabled = disabled;
    };
    show('btn-accept', btns.accept, !Store.state.me.online);
    show('btn-start', btns.start);
    show('btn-refuse', btns.refuse);
    show('btn-arrived', btns.arrived);
    show('btn-complete', btns.complete);
  },

  renderAvail() {
    const list = document.getElementById('avail-list');
    const online = Store.state.me.online;
    const avail = Store.state.orders.filter(o => o.status === 'new');
    document.getElementById('avail-count').textContent = avail.length;

    if (!online) {
      list.innerHTML = `<div class="empty">${App.icon('info', 26)}<span>Вы офлайн.<br>Включите переключатель в профиле, чтобы видеть заказы.</span></div>`;
      return;
    }
    if (!avail.length) {
      list.innerHTML = `<div class="empty">${App.icon('box', 26)}<span>Свободных заказов пока нет</span></div>`;
      return;
    }
    list.innerHTML = avail.map(o => `
      <div class="avail-item ${this.selectedId === o.id && !this.currentOrder() ? 'selected' : ''}" data-id="${o.id}">
        <div class="ai-head"><span class="ai-id">${o.id}</span><span class="ai-pay">${App.money(o.price)}</span></div>
        <div class="ai-route"><span>${App.esc(o.fromName)}</span><b>→</b><span>${App.esc(o.toName)}</span></div>
        <div class="ai-meta"><span>${App.km(distKm(o))}</span><span>${App.etaText(o)}</span></div>
      </div>`).join('');
  },

  redraw() {
    if (!this.map) return;
    const o = this.targetOrder();
    const mode = Store.state.trafficMode;
    const id = o ? o.id : null;
    if (id === this.lastDrawnId && mode === this.lastMode) {
      if (o && this.carMarker) this.carMarker.setLatLng(pointAt(pathFor(o), o.progress / 100));
      return;
    }
    this.lastDrawnId = id; this.lastMode = mode;
    this.routeLayer.clearLayers();
    this.carMarker = null;
    if (!o) return;

    const path = pathFor(o);
    let acc = 0;
    o.traffic.forEach(s => {
      const latlngs = segLatLngs(path, acc, acc + s.w);
      L.polyline(latlngs, { color: trafficColor(s.t), weight: 6, opacity: .95, lineCap: 'round' }).addTo(this.routeLayer);
      if (s.t === 'jam' && mode === 'mono') {
        L.polyline(latlngs, { color: '#ffffff', weight: 1.8, opacity: .85, dashArray: '2 7' }).addTo(this.routeLayer);
      }
      acc += s.w;
    });
    L.marker(o.from, { icon: startIcon() }).addTo(this.routeLayer);
    L.marker(o.to, { icon: endIcon() }).addTo(this.routeLayer);
    this.carMarker = L.marker(pointAt(path, o.progress / 100), { icon: carIcon(), zIndexOffset: 600 }).addTo(this.routeLayer);
    this.map.fitBounds(L.latLngBounds(path.pts), { padding: [56, 56] });
  },

  live() {
    const o = this.currentOrder();
    if (!o) return;
    const ind = document.getElementById('cb-ind');
    const eta = document.getElementById('cb-eta');
    const dist = document.getElementById('cb-dist');
    if (ind) ind.style.left = o.progress + '%';
    if (eta) eta.textContent = App.etaText(o);
    if (dist) dist.textContent = App.km(distKm(o) * (1 - o.progress / 100));
    if (this.carMarker) this.carMarker.setLatLng(pointAt(pathFor(o), o.progress / 100));
  },

  center() {
    if (!this.map) return;
    const o = this.targetOrder();
    if (o) this.map.fitBounds(L.latLngBounds(pathFor(o).pts), { padding: [56, 56] });
    else if (App.Geo.pos) this.map.setView([App.Geo.pos.lat, App.Geo.pos.lng], 15);
    else this.map.setView([55.7518, 37.6173], 12);
  },

  /* ── Действия ── */
  accept() {
    const o = this.selectedId ? Store.order(this.selectedId) : null;
    if (!o || o.status !== 'new') { App.toast('Заказ уже недоступен', { icon: 'info' }); this.full(); return; }
    if (!Store.state.me.online) { App.toast('Сначала включите онлайн', { icon: 'info' }); return; }
    const me = this.me();
    Store.set(() => {
      o.status = 'accepted';
      o.driverId = ME_ID; o.driverName = me.name; o.car = me.car; o.plate = me.plate;
      o.history.push({ s: 'accepted', at: Date.now() });
    });
    this.currentId = o.id; this.selectedId = null;
    App.toast(`Заказ ${o.id} принят`, { icon: 'check' });
    this.full();
  },
  start() {
    const o = this.currentOrder(); if (!o || o.status !== 'accepted') return;
    Store.set(() => { o.status = 'delivering'; o.history.push({ s: 'delivering', at: Date.now() }); });
    App.toast('Доставка начата — движение по маршруту', { icon: 'truck' });
    this.full();
  },
  refuse() {
    const o = this.currentOrder(); if (!o || o.status !== 'accepted') return;
    Store.set(() => {
      o.status = 'new'; o.driverId = null; o.driverName = null; o.car = null; o.plate = null;
      o.history.push({ s: 'new', at: Date.now() });
    });
    this.currentId = null;
    App.toast(`Вы отказались от ${o.id}`, { icon: 'undo' });
    this.full();
  },
  arrive(manual) {
    const o = this.currentOrder(); if (!o || o.status !== 'delivering') return;
    Store.set(() => {
      o.status = 'arrived'; o.progress = 100;
      o.history.push({ s: 'arrived', at: Date.now() });
    }, { structural: true, arrived: manual ? [o.id] : [] });
    if (manual) App.toast(`Вы прибыли: ${o.id}`, { icon: 'check' });
    this.full();
  },
  complete() {
    const o = this.currentOrder(); if (!o || o.status !== 'arrived') return;
    Store.set(() => { o.status = 'done'; o.history.push({ s: 'done', at: Date.now() }); });
    this.currentId = null; this.selectedId = null; this.lastDrawnId = undefined;
    App.toast(`Заказ ${o.id} завершён · ${App.money(o.price)}`, { icon: 'check' });
    this.full();
    this.center();
  },

  /* ── GPS ── */
  gpsBadge() {
    const dot = document.getElementById('gps-dot');
    const txt = document.getElementById('gps-text');
    const on = !!App.Geo.pos;
    dot.classList.toggle('on', on);
    txt.textContent = on ? 'GPS активен' : 'GPS: симуляция';
  },
  onGeo(pos) {
    if (!this.mounted) return;
    this.gpsBadge();
    if (!this.map) return;
    if (!pos) {
      if (this.youMarker) { this.map.removeLayer(this.youMarker); this.youMarker = null; }
      if (this.youCircle) { this.map.removeLayer(this.youCircle); this.youCircle = null; }
      return;
    }
    const ll = [pos.lat, pos.lng];
    if (!this.youMarker) this.youMarker = L.marker(ll, { icon: youIcon(), zIndexOffset: 7length;
    const rev = orders.reduce((s, o) => s + o.price, 0);
    const avg = deliv.length ? Math.round(deliv.reduce((s, o) => s + etaMin(o), 0) / deliv.length) : null;
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (animate && typeof v === 'number') App.countUp(el, v);
      else el.textContent = v;
    };
    set('k-orders', orders.length);
    set('k-drivers', online);
    set('k-rev', rev);
    set('k-eta', avg === null ? '—' : avg);
  },

  chart() {
    const hours = []; for (let h = 9; h <= 19; h++) hours.push(h);
    const counts = hours.map(h => Store.state.orders.filter(o => new Date(o.createdAt).getHours() === h).length);
    const max = Math.max(1, ...counts);
    const chart = document.getElementById('chart');
    chart.innerHTML = counts.map((c, i) =>
      `<div class="bar ${c === max && c > 0 ? 'max' : ''}" style="height:3px" title="${hours[i]}:00 — заказов: ${c}"><b>${c}</b></div>`
    ).join('');
    document.getElementById('chart-x').innerHTML = hours.map(h => `<span>${h}</span>`).join('');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      chart.querySelectorAll('.bar').forEach((b, i) => {
        b.style.height = Math.max(3, counts[i] / max * 100) + '%';
      });
    }));
  },

  drivers() {
    document.getElementById('drivers-list').innerHTML = DRIVERS.map(d => {
      const online = d.id === ME_ID ? Store.state.me.online : d.online;
      const busy = Store.state.orders.find(o => o.driverId === d.id && ['accepted', 'delivering'].includes(o.status));
      return `
      <div class="drv">
        <span class="drv-dot ${online ? 'on' : ''}"></span>
        <div class="drv-info">
          <div class="drv-name">${App.esc(d.name)}${d.id === ME_ID ? ' · вы' : ''}</div>
          <div class="drv-sub">${App.esc(d.car)} · ${App.esc(d.plate)}</div>
        </div>
        <div class="drv-right">
          <span class="star">★ ${d.rating.toFixed(1)}</span>
          <span class="chip-mini ${busy ? 'busy' : ''}">${busy ? busy.id : (online ? 'Свободен' : 'Офлайн')}</span>
        </div>
      </div>`;
    }).join('');
  },

  renderTable() {
    document.querySelectorAll('#admin-thead th[data-sort]').forEach(th => {
      const active = th.dataset.sort === this.sortKey;
      th.classList.toggle('sorted', active);
      th.querySelector('.arr').textContent = active ? (this.sortDir === 1 ? '↑' : '↓') : '↕';
    });

    const list = this.filtered();
    const tbody = document.getElementById('admin-tbody');
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty">${App.icon('box', 26)}<span>Заказы не найдены</span></div></td></tr>`;
      return;
    }
    tbody.innerHTML = list.map(o => {
      const st = STATUS[o.status];
      return `
      <tr data-id="${o.id}">
        <td class="th-check"><input type="checkbox" class="row-check" data-id="${o.id}" ${this.selected.has(o.id) ? 'checked' : ''} aria-label="Выбрать ${o.id}"></td>
        <td class="t-id">${o.id}<div class="t-sub">${App.time(o.createdAt)}</div></td>
        <td>${App.esc(o.driverName || '—')}<div class="t-sub">${App.esc(o.car || '')} ${App.esc(o.plate || '')}</div></td>
        <td class="t-route" title="${App.esc(o.fromName)} → ${App.esc(o.toName)}">${App.esc(o.fromName)} → ${App.esc(o.toName)}</td>
        <td><span class="pill ${st.pill}" data-pill>${st.label}</span></td>
        <td><div class="mini-wrap"><div class="mini-pbar">${o.traffic.map(s => `<div class="seg-t seg-${s.t}" style="width:${s.w}%"></div>`).join('')}<div class="mini-fill" data-fill style="width:${o.progress}%"></div></div><span class="mini-pct" data-pct>${Math.round(o.progress)}%</span></div></td>
        <td class="t-price">${App.money(o.price)}</td>
        <td><button class="btn-icon row-del" data-id="${o.id}" type="button" title="Удалить">${App.icon('trash', 14)}</button></td>
      </tr>`;
    }).join('');
  },

  live() {
    this.kpis(false);
    Store.state.orders.forEach(o => {
      const tr = document.querySelector(`#admin-tbody tr[data-id="${o.id}"]`);
      if (!tr) return;
      const fill = tr.querySelector('[data-fill]');
      const pct = tr.querySelector('[data-pct]');
      const pill = tr.querySelector('[data-pill]');
      if (fill) fill.style.width = o.progress + '%';
      if (pct) pct.textContent = Math.round(o.progress) + '%';
      if (pill) { pill.className = 'pill ' + STATUS[o.status].pill; pill.textContent = STATUS[o.status].label; }
    });
  }
};