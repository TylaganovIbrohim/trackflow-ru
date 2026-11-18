/* ═══════════ TrackFlow · Вид продавца ═══════════ */

const Seller = {
  mounted: false,
  bound: false,
  query: '',
  filter: 'all',
  sort: 'eta',
  maps: {},
  cars: {},

  mount() {
    this.mounted = true;
    if (!this.bound) this.bind();
    this.rebuild();
  },
  onShow() { Object.values(this.maps).forEach(m => m.invalidateSize()); },
  unmount() { this.mounted = false; },

  bind() {
    this.bound = true;
    const search = document.getElementById('seller-search');
    search.addEventListener('input', App.debounce(() => { this.query = search.value.trim().toLowerCase(); this.rebuild(); }, 220));

    document.getElementById('seller-chips').addEventListener('click', e => {
      const c = e.target.closest('.chip'); if (!c) return;
      this.filter = c.dataset.f;
      document.querySelectorAll('#seller-chips .chip').forEach(x => x.classList.toggle('active', x === c));
      this.rebuild();
    });
    document.getElementById('seller-sort').addEventListener('change', e => { this.sort = e.target.value; this.rebuild(); });
    document.getElementById('btn-new').addEventListener('click', () => this.openCreate());
    document.getElementById('orders-grid').addEventListener('click', e => {
      const card = e.target.closest('.card'); if (!card) return;
      App.openDrawer(card.dataset.id);
    });
  },

  refresh(meta) {
    if (!this.mounted) return;
    if (meta.tick && !meta.arrived) this.live();
    else this.rebuild();
  },

  filtered() {
    let list = Store.state.orders.filter(o => o.status !== 'done');
    if (this.filter !== 'all') list = list.filter(o => o.status === this.filter);
    if (this.query) {
      list = list.filter(o =>
        [o.id, o.car, o.plate, o.driverName, o.fromName, o.toName]
          .filter(Boolean).join(' ').toLowerCase().includes(this.query)
      );
    }
    const byEta = o => (o.status === 'arrived' ? 1e9 : etaMin(o));
    if (this.sort === 'eta') list.sort((a, b) => byEta(a) - byEta(b));
    else if (this.sort === 'progress') list.sort((a, b) => b.progress - a.progress);
    else list.sort((a, b) => b.createdAt - a.createdAt);
    return list;
  },

  stats(animate) {
    const all = Store.state.orders.filter(o => o.status !== 'done');
    const deliv = all.filter(o => o.status === 'delivering');
    const arr = all.filter(o => o.status === 'arrived');
    const avg = deliv.length ? Math.round(deliv.reduce((s, o) => s + etaMin(o), 0) / deliv.length) : null;
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (animate && typeof val === 'number') App.countUp(el, val);
      else el.textContent = val;
    };
    set('st-total', all.length);
    set('st-deliv', deliv.length);
    set('st-arr', arr.length);
    set('st-eta', avg === null ? '—' : avg);
  },

  destroyMaps() {
    Object.values(this.maps).forEach(m => m.remove());
    this.maps = {}; this.cars = {};
  },

  rebuild() {
    this.destroyMaps();
    this.stats(true);
    const grid = document.getElementById('orders-grid');
    const list = this.filtered();

    if (!list.length) {
      grid.innerHTML = `<div class="glass empty" style="grid-column:1/-1">${App.icon('box', 30)}<span>Ничего не найдено. Измените фильтр или создайте новый заказ.</span></div>`;
      return;
    }

    grid.innerHTML = list.map((o, i) => {
      const st = STATUS[o.status];
      return `
      <article class="card glass" data-id="${o.id}" style="--i:${i}">
        <div class="card-head">
          <span class="dots"><i></i><i></i><i></i></span>
          <span class="card-id">${o.id}</span>
          <span class="pill ${st.pill}" data-pill>${st.label}</span>
        </div>
        <div class="card-map" id="sm-${o.id}"></div>
        <div class="card-body">
          <div class="car-row">
            <div class="car-ic">${App.icon('truck', 19)}</div>
            <div class="car-info">
              <div class="car-name">${App.esc(o.car || 'Машина не назначена')}</div>
              <div class="car-sub">${App.esc(o.plate || '—')} · ${App.esc(o.driverName || 'ожидает водителя')}</div>
            </div>
          </div>
          <div class="prog-labels"><span class="pl-a"><i></i>Старт</span><span class="pl-b"><i></i>Финиш</span></div>
          <div class="pbar">
            <div class="pbar-track">${o.traffic.map(s => `<div class="seg-t seg-${s.t}" style="width:${s.w}%"></div>`).join('')}</div>
            <div class="ind" data-ind style="left:${o.progress}%"></div>
          </div>
          <div class="card-foot">
            <span class="eta">Прибытие: <strong data-eta>${App.etaText(o)}</strong></span>
            <span class="dist">${App.km(distKm(o))}</span>
            <span class="price">${App.money(o.price)}</span>
          </div>
        </div>
      </article>`;
    }).join('');

    list.forEach(o => this.initMap(o));
  },

  initMap(o) {
    const el = document.getElementById('sm-' + o.id);
    if (!el) return;
    if (!window.L) { el.innerHTML = `<div class="map-fallback">${App.esc(o.fromName)} → ${App.esc(o.toName)}</div>`; return; }
    const map = L.map(el, {
      zoomControl: false, attributionControl: false, dragging: false,
      scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false, boxZoom: false, keyboard: false, tap: false
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
    const path = drawRoute(map, o);
    this.cars[o.id] = L.marker(pointAt(path, o.progress / 100), { icon: carIcon(), zIndexOffset: 500 }).addTo(map);
    map.fitBounds(L.latLngBounds(path.pts), { padding: [26, 26] });
    this.maps[o.id] = map;
    setTimeout(() => map.invalidateSize(), 120);
  },

  live() {
    this.stats(false);
    this.filtered().forEach(o => {
      const card = document.querySelector(`.card[data-id="${o.id}"]`);
      if (!card) return;
      const ind = card.querySelector('[data-ind]');
      const eta = card.querySelector('[data-eta]');
      const pill = card.querySelector('[data-pill]');
      if (ind) ind.style.left = o.progress + '%';
      if (eta) eta.textContent = App.etaText(o);
      if (pill) { pill.className = 'pill ' + STATUS[o.status].pill; pill.textContent = STATUS[o.status].label; }
      if (this.cars[o.id]) this.cars[o.id].setLatLng(pointAt(pathFor(o), o.progress / 100));
    });
  },

  /* ── Создание заказа ── */
  openCreate() {
    const locOpts = LOCATIONS.map((l, i) => `<option value="${i}">${App.esc(l.name)}</option>`).join('');
    const drvOpts = '<option value="">Назначить позже</option>' +
      DRIVERS.map(d => `<option value="${d.id}">${App.esc(d.name)} · ${App.esc(d.car)}</option>`).join('');

    App.openModal(`
      <div class="modal-head">
        <h3>Новый заказ</h3>
        <button class="btn-icon" data-close type="button" aria-label="Закрыть">${App.icon('x')}</button>
      </div>
      <form id="create-form" class="form-grid" novalidate>
        <div class="full"><label class="f-label">Откуда</label><select class="f-input" id="cf-from">${locOpts}</select></div>
        <div class="full"><label class="f-label">Куда</label><select class="f-input" id="cf-to">${locOpts}</select></div>
        <div><label class="f-label">Марка машины</label><input class="f-input" id="cf-car" placeholder="Hyundai Solaris" required></div>
        <div><label class="f-label">Номер</label><input class="f-input" id="cf-plate" placeholder="А123ВС 77" required></div>
        <div><label class="f-label">Водитель</label><select class="f-input" id="cf-driver">${drvOpts}</select></div>
        <div><label class="f-label">Цена, ₽</label><input class="f-input" id="cf-price" type="number" min="1" value="990" required></div>
        <div class="full err" id="cf-err"></div>
        <div class="full form-foot">
          <button class="btn btn-ghost" data-close type="button">Отмена</button>
          <button class="btn btn-primary" type="submit">Создать заказ</button>
        </div>
      </form>`);

    document.getElementById('cf-to').selectedIndex = 6;
    document.getElementById('create-form').addEventListener('submit', e => {
      e.preventDefault();
      const fi = +document.getElementById('cf-from').value;
      const ti = +document.getElementById('cf-to').value;
      const car = document.getElementById('cf-car').value.trim();
      const plate = document.getElementById('cf-plate').value.trim();
      const price = +document.getElementById('cf-price').value;
      const err = document.getElementById('cf-err');
      const fail = msg => { err.textContent = msg; err.classList.add('show'); };
      if (fi === ti) return fail('Точки отправления и назначения совпадают.');
      if (!car || !plate) return fail('Укажите марку машины и номер.');
      if (!price || price <= 0) return fail('Укажите корректную цену.');
      const order = Store.createOrder({
        fromName: LOCATIONS[fi].name, toName: LOCATIONS[ti].name,
        from: [...LOCATIONS[fi].coords], to: [...LOCATIONS[ti].coords],
        car, plate, price: Math.round(price),
        driverId: document.getElementById('cf-driver').value || null
      });
      App.closeModal();
      App.toast(`Заказ ${order.id} создан`, { icon: 'box' });
      setTimeout(() => {
        const card = document.querySelector(`.card[data-id="${order.id}"]`);
        if (card) { card.classList.add('flash'); card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
      }, 150);
    });
  }
};