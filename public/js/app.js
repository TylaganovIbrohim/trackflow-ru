/* ═══════════════════════════════════════════════════════════════
   TrackFlow · единый файл приложения
   Роли: по умолчанию водитель. Продавец/админ включается паролем.
   Пароль продавца пока: 1234
   ═══════════════════════════════════════════════════════════════ */
'use strict';

/* ═══════════ ЧАСТЬ 1 · ДАННЫЕ, ГЕО, СТОР, СИМУЛЯЦИЯ ═══════════ */

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
const SELLER_PASSWORD = '1234';

const STATUS = {
  new:        { label: 'Новый',        pill: 'pill-new' },
  accepted:   { label: 'Принят',       pill: 'pill-accepted' },
  delivering: { label: 'Доставляется', pill: 'pill-delivering' },
  arrived:    { label: 'Прибыл',       pill: 'pill-arrived' },
  done:       { label: 'Завершён',     pill: 'pill-done' }
};

const FLOW = ['new', 'accepted', 'delivering', 'arrived', 'done'];
const TRAFFIC_LABEL = { free: 'Свободно', slow: 'Плотное движение', jam: 'Пробка' };
const SPEEDS = { free: 36, slow: 18, jam: 7 };

function hashStr(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function mulberry(seed){let t=seed>>>0;return()=>{t+=0x6D2B79F5;let r=Math.imul(t^(t>>>15),1|t);r^=r+Math.imul(r^(r>>>7),61|r);return((r^(r>>>14))>>>0)/4294967296;};}
function hav(a,b){const R=6371,rad=Math.PI/180;const dLa=(b[0]-a[0])*rad,dLo=(b[1]-a[1])*rad;const s=Math.sin(dLa/2)**2+Math.cos(a[0]*rad)*Math.cos(b[0]*rad)*Math.sin(dLo/2)**2;return 2*R*Math.asin(Math.sqrt(s));}

const pathCache = new Map();

function syntheticPath(o){
  const r=mulberry(hashStr(o.id));
  const a=o.from,b=o.to,dx=b[0]-a[0],dy=b[1]-a[1];
  const len=Math.hypot(dx,dy)||1e-6,px=-dy/len,py=dx/len;
  const pts=[a];const n=8;
  for(let i=1;i<n;i++){
    const t=i/n;
    const amp=(r()-.5)*len*.55*Math.sin(Math.PI*t);
    pts.push([a[0]+dx*t+px*amp+(r()-.5)*len*.08,a[1]+dy*t+py*amp+(r()-.5)*len*.08]);
  }
  pts.push(b);
  const cum=[0];
  for(let i=1;i<pts.length;i++)cum.push(cum[i-1]+hav(pts[i-1],pts[i]));
  return {pts,cum,total:cum[cum.length-1]||1e-9};
}

function pathFor(o){
  if(!pathCache.has(o.id))pathCache.set(o.id,syntheticPath(o));
  return pathCache.get(o.id);
}

async function fetchRealRoute(o){
  if(!navigator.onLine)return;
  try{
    const c=new AbortController();
    const t=setTimeout(()=>c.abort(),4500);
    const url=`https://router.project-osrm.org/route/v1/driving/${o.from[1]},${o.from[0]};${o.to[1]},${o.to[0]}?overview=full&geometries=geojson`;
    const res=await fetch(url,{signal:c.signal});
    clearTimeout(t);
    if(!res.ok)return;
    const j=await res.json();
    const route=j.routes&&j.routes[0];
    if(!route||!route.geometry)return;
    const pts=route.geometry.coordinates.map(p=>[p[1],p[0]]);
    const cum=[0];
    for(let i=1;i<pts.length;i++)cum.push(cum[i-1]+hav(pts[i-1],pts[i]));
    pathCache.set(o.id,{pts,cum,total:(route.distance/1000)||cum[cum.length-1]||1e-9});
    if(window.App&&App.onRouteUpdated)App.onRouteUpdated(o.id);
  }catch(e){}
}

function pointAt(path,t){
  t=Math.max(0,Math.min(1,t));
  const target=t*path.total;
  for(let i=0;i<path.cum.length-1;i++){
    if(path.cum[i+1]>=target){
      const span=(path.cum[i+1]-path.cum[i])||1e-9;
      const k=(target-path.cum[i])/span;
      const a=path.pts[i],b=path.pts[i+1];
      return [a[0]+(b[0]-a[0])*k,a[1]+(b[1]-a[1])*k];
    }
  }
  return path.pts[path.pts.length-1];
}

function segLatLngs(path,aPct,bPct){
  const a=aPct/100,b=bPct/100;
  const out=[pointAt(path,a)];
  for(let i=1;i<path.pts.length-1;i++){
    const t=path.cum[i]/path.total;
    if(t>a&&t<b)out.push(path.pts[i]);
  }
  out.push(pointAt(path,b));
  return out;
}

function trafficAt(o,pct){
  let acc=0;
  for(const s of o.traffic){
    acc+=s.w;
    if(pct<acc)return s.t;
  }
  return o.traffic[o.traffic.length-1].t;
}

function distKm(o){return pathFor(o).total;}

function etaMin(o){
  if(o.status==='arrived'||o.status==='done')return 0;
  const total=distKm(o);
  let acc=0,min=0;
  for(const s of o.traffic){
    const start=acc,end=acc+s.w;
    acc=end;
    const from=Math.max(o.progress,start),to=end;
    if(to>from)min+=((to-from)/100*total)/SPEEDS[s.t]*60;
  }
  return Math.max(1,Math.round(min));
}

function trafficColor(t){
  const mono={free:'#f2f2ef',slow:'#8f8f8c',jam:'#4a4a4e'};
  const color={free:'#22c55e',slow:'#eab308',jam:'#ef4444'};
  return (Store.state.trafficMode==='color'?color:mono)[t];
}

function randTraffic(seed){
  const r=mulberry(seed>>>0);
  const n=3+Math.floor(r()*2);
  const pool=['free','free','free','slow','slow','jam'];
  const segs=[];
  let left=100;
  for(let i=0;i<n;i++){
    const t=pool[Math.floor(r()*pool.length)];
    const w=i===n-1?left:Math.max(12,Math.min(left-(n-i-1)*12,Math.round(15+r()*30)));
    segs.push({t,w});
    left-=w;
  }
  return segs;
}

function seedState(){
  const now=Date.now(),M=60e3;
  const mk=(num,fi,ti,drvId,status,progress,traffic,price,ageMin,productName)=>{
    const drv=drvId?DRIVERS.find(d=>d.id===drvId):null;
    const createdAt=now-ageMin*M;
    const chain=FLOW.slice(0,FLOW.indexOf(status)+1);
    const history=chain.map((s,i)=>({s,at:createdAt+Math.round(ageMin*M*i/Math.max(1,chain.length))}));
    return {
      id:'TF-'+num,
      productName:productName||'Товар / груз',
      comment:'',
      fromName:LOCATIONS[fi].name,
      toName:LOCATIONS[ti].name,
      from:[...LOCATIONS[fi].coords],
      to:[...LOCATIONS[ti].coords],
      driverId:drv?drv.id:null,
      driverName:drv?drv.name:null,
      car:drv?drv.car:null,
      plate:drv?drv.plate:null,
      status,
      progress,
      traffic,
      price,
      createdAt,
      history
    };
  };

  return {
    v:5,
    counter:2849,
    trafficMode:'mono',
    speed:30,
    role:'driver',
    me:{online:true,profile:null},
    orders:[
      mk(2841,0,6,'d2','delivering',62,[{t:'free',w:30},{t:'slow',w:25},{t:'jam',w:15},{t:'free',w:30}],1290,34,'Документы'),
      mk(2842,1,7,'d3','delivering',35,[{t:'free',w:40},{t:'slow',w:25},{t:'free',w:20},{t:'slow',w:15}],1490,22,'Продукты'),
      mk(2843,2,8,'d5','accepted',0,[{t:'jam',w:30},{t:'slow',w:30},{t:'free',w:40}],990,9,'Горячий заказ'),
      mk(2844,4,9,'d6','delivering',80,[{t:'free',w:70},{t:'slow',w:30}],790,16,'Посылка'),
      mk(2845,3,10,'d4','arrived',100,[{t:'free',w:40},{t:'slow',w:35},{t:'free',w:25}],1190,48,'Лекарства'),
      mk(2846,5,10,null,'new',0,[{t:'slow',w:20},{t:'free',w:50},{t:'jam',w:30}],1690,6,'Пицца'),
      mk(2847,0,8,null,'new',0,[{t:'free',w:60},{t:'slow',w:40}],890,3,'Документы'),
      mk(2848,1,6,'d5','done',100,[{t:'free',w:50},{t:'jam',w:20},{t:'free',w:30}],1090,360,'Товары')
    ]
  };
}

const LS_KEY='trackflow-v5';

const Store={
  state:null,
  listeners:new Set(),
  lastRemoved:null,
  _saveTimer:null,

  init(){
    let local=null;
    try{
      const raw=localStorage.getItem(LS_KEY);
      const p=raw?JSON.parse(raw):null;
      if(p&&p.v===5&&Array.isArray(p.orders))local=p;
    }catch(e){}

    this.state=local||seedState();
    this.migrate();
    this.saveLocal();
    this.pull();
  },

  migrate(){
    if(!this.state.role)this.state.role='driver';
    if(!this.state.me)this.state.me={online:true,profile:null};
    if(this.state.me.profile===undefined)this.state.me.profile=null;

    this.state.orders.forEach(o=>{
      if(!o.productName)o.productName='Товар / груз';
      if(o.comment===undefined)o.comment='';
      if(o.status==='new'){
        o.driverId=null;
        o.driverName=null;
        o.car=null;
        o.plate=null;
      }
    });
  },

  async pull(){
    try{
      const res=await fetch('/api/state',{cache:'no-store'});
      if(!res.ok)return;
      const j=await res.json();
      if(j.state&&j.state.v===5&&Array.isArray(j.state.orders)){
        this.state=j.state;
        this.migrate();
        this.saveLocal();
        this.notify({structural:true});
      }else{
        this.push();
      }
    }catch(e){}
  },

  saveLocal(){
    try{localStorage.setItem(LS_KEY,JSON.stringify(this.state));}catch(e){}
  },

  push(){
    clearTimeout(this._saveTimer);
    this._saveTimer=setTimeout(()=>{
      fetch('/api/state',{
        method:'PUT',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({state:this.state})
      }).catch(()=>{});
    },700);
  },

  subscribe(fn){this.listeners.add(fn);},

  notify(meta={}){
    this.listeners.forEach(fn=>{
      try{fn(this.state,meta);}catch(e){console.error(e);}
    });
  },

  set(mut,meta={structural:true}){
    mut(this.state);
    this.saveLocal();
    this.push();
    this.notify(meta);
  },

  order(id){return this.state.orders.find(o=>o.id===id);},

  createOrder(data){
    if(this.state.role!=='seller')return null;

    const id='TF-'+this.state.counter;
    const now=Date.now();

    const order={
      id,
      productName:data.productName,
      comment:data.comment||'',
      fromName:data.fromName,
      toName:data.toName,
      from:data.from,
      to:data.to,
      driverId:null,
      driverName:null,
      car:null,
      plate:null,
      status:'new',
      progress:0,
      traffic:randTraffic(hashStr(id)+now%997),
      price:data.price,
      createdAt:now,
      history:[{s:'new',at:now}]
    };

    this.set(s=>{
      s.counter++;
      s.orders.unshift(order);
    });

    fetchRealRoute(order);
    return order;
  },

  removeOrders(ids){
    const removed=[];
    this.set(s=>{
      ids.forEach(id=>{
        const idx=s.orders.findIndex(o=>o.id===id);
        if(idx>-1)removed.push({order:s.orders[idx],index:idx});
      });
      s.orders=s.orders.filter(o=>!ids.includes(o.id));
    });
    removed.sort((a,b)=>a.index-b.index);
    this.lastRemoved=removed;
    return removed;
  },

  undoRemove(){
    if(!this.lastRemoved||!this.lastRemoved.length)return 0;
    const n=this.lastRemoved.length;
    this.set(s=>{
      this.lastRemoved.forEach(({order,index})=>{
        if(!s.orders.find(o=>o.id===order.id)){
          s.orders.splice(Math.min(index,s.orders.length),0,order);
        }
      });
    });
    this.lastRemoved=null;
    return n;
  },

  reset(){
    pathCache.clear();
    this.lastRemoved=null;
    this.state=seedState();
    this.saveLocal();
    fetch('/api/state',{method:'DELETE'}).catch(()=>{});
    this.push();
    this.notify({structural:true});
    this.state.orders.forEach(o=>fetchRealRoute(o));
  }
};

const Sim={
  timer:null,
  start(){if(this.timer)return;this.timer=setInterval(()=>this.tick(),1000);},
  tick(){
    const delivering=Store.state.orders.filter(o=>o.status==='delivering');
    if(!delivering.length)return;
    const arrived=[];
    Store.set(s=>{
      const mul=s.speed||30;
      delivering.forEach(o=>{
        const v=SPEEDS[trafficAt(o,o.progress)]*mul;
        o.progress=Math.min(100,o.progress+(v/3600)/distKm(o)*100);
        if(o.progress>=100){
          o.progress=100;
          o.status='arrived';
          o.history.push({s:'arrived',at:Date.now()});
          arrived.push(o.id);
        }
      });
    },{tick:true,arrived});
  }
};

/* ═══════════ ЧАСТЬ 2 · MINIMAP ═══════════ */

class MiniMap{
  constructor(el,opts={}){
    this.el=el;
    this.interactive=!!opts.interactive;
    this.center=[55.7518,37.6173];
    this.zoom=opts.zoom||12;
    this.route=null;
    this.order=null;
    this.carT=0;
    this.you=null;

    el.classList.add('tfmap');
    if(this.interactive)el.classList.add('interactive');
    el.innerHTML='<svg class="tfmap-svg" xmlns="http://www.w3.org/2000/svg"></svg>';
    this.svg=el.querySelector('svg');

    if(this.interactive){
      const z=document.createElement('div');
      z.className='map-zoom';
      z.innerHTML='<button class="btn-icon" type="button" data-z="1" aria-label="Приблизить">+</button><button class="btn-icon" type="button" data-z="-1" aria-label="Отдалить">−</button>';
      el.appendChild(z);

      z.addEventListener('click',e=>{
        const b=e.target.closest('[data-z]');
        if(!b)return;
        this.zoom=Math.max(9,Math.min(17,this.zoom+ +b.dataset.z));
        this.render();
      });

      const cr=document.createElement('div');
      cr.className='map-credit';
      cr.textContent='TrackFlow Maps · схема';
      el.appendChild(cr);

      let drag=null;

      el.addEventListener('pointerdown',e=>{
        if(e.target.closest('.map-zoom'))return;
        drag={x:e.clientX,y:e.clientY,c:[...this.center]};
        el.setPointerCapture(e.pointerId);
      });

      el.addEventListener('pointermove',e=>{
        if(!drag)return;
        const ppd=256*Math.pow(2,this.zoom)/360;
        const cos=Math.cos(this.center[0]*Math.PI/180);
        this.center=[
          drag.c[0]+(e.clientY-drag.y)/ppd,
          drag.c[1]-(e.clientX-drag.x)/(ppd*cos)
        ];
        this.render();
      });

      el.addEventListener('pointerup',()=>drag=null);
      el.addEventListener('pointercancel',()=>drag=null);

      el.addEventListener('wheel',e=>{
        e.preventDefault();
        this.zoom=Math.max(9,Math.min(17,this.zoom+(e.deltaY<0?1:-1)));
        this.render();
      },{passive:false});
    }

    this._ro=new ResizeObserver(()=>this.render());
    this._ro.observe(el);
    this.render();
  }

  proj(lat,lng){
    const ppd=256*Math.pow(2,this.zoom)/360;
    const w=this.el.clientWidth||300,h=this.el.clientHeight||150;
    const cos=Math.cos(this.center[0]*Math.PI/180);
    return [w/2+(lng-this.center[1])*ppd*cos,h/2-(lat-this.center[0])*ppd];
  }

  setRoute(order){
    this.order=order;
    this.route=pathFor(order);
    this.carT=order.progress/100;
    this.fit();
  }

  fit(){
    if(!this.route)return;
    const pts=this.route.pts.concat(this.you?[this.you]:[]);
    let minLa=90,maxLa=-90,minLo=180,maxLo=-180;

    pts.forEach(p=>{
      minLa=Math.min(minLa,p[0]);
      maxLa=Math.max(maxLa,p[0]);
      minLo=Math.min(minLo,p[1]);
      maxLo=Math.max(maxLo,p[1]);
    });

    this.center=[(minLa+maxLa)/2,(minLo+maxLo)/2];

    const w=this.el.clientWidth||300,h=this.el.clientHeight||150;
    const cos=Math.cos(this.center[0]*Math.PI/180);
    const dLo=Math.max(1e-4,(maxLo-minLo)*cos);
    const dLa=Math.max(1e-4,maxLa-minLa);
    const ppd=Math.min(w*.72/dLo,h*.66/dLa);

    this.zoom=Math.max(9,Math.min(17,Math.log2(ppd*360/256)));
    this.render();
  }

  setCar(t){
    this.carT=Math.max(0,Math.min(1,t));
    if(this._carEl&&this.route){
      const p=this.proj(...pointAt(this.route,this.carT));
      this._carEl.style.transform=`translate(${p[0]-8}px,${p[1]-8}px)`;
    }else{
      this.render();
    }
  }

  setYou(pos){
    this.you=pos?[pos.lat,pos.lng]:null;
    this.render();
  }

  clear(){
    this.route=null;
    this.order=null;
    this.you=null;
    this.render();
  }

  destroy(){
    this._ro.disconnect();
    this.el.innerHTML='';
    this.el.classList.remove('tfmap','interactive');
  }

  render(){
    const w=this.el.clientWidth||300,h=this.el.clientHeight||150;
    if(w<10||h<10)return;

    const svg=this.svg;
    svg.setAttribute('viewBox',`0 0 ${w} ${h}`);

    const parts=[];
    const step=Math.max(26,256*Math.pow(2,this.zoom)/360*0.004);
    const ox=((this.center[1]*1e4)%step+step)%step;
    const oy=((this.center[0]*1e4)%step+step)%step;

    let grid='';
    for(let x=-ox;x<w+step;x+=step)grid+=`M${x.toFixed(1)} 0V${h}`;
    for(let y=-oy;y<h+step;y+=step)grid+=`M0 ${y.toFixed(1)}H${w}`;
    parts.push(`<path d="${grid}" stroke="rgba(255,255,255,.05)" stroke-width="1" fill="none"/>`);

    const r=mulberry(hashStr(`${Math.round(this.center[0]*500)}:${Math.round(this.center[1]*500)}:${Math.round(this.zoom)}`));
    for(let i=0;i<14;i++){
      const bx=r()*w,by=r()*h,bw=14+r()*46,bh=10+r()*34;
      parts.push(`<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="rgba(255,255,255,.028)"/>`);
    }

    if(this.route){
      const P=this.route.pts.map(p=>this.proj(p[0],p[1]));
      const dAll=P.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join('');
      parts.push(`<path d="${dAll}" stroke="rgba(0,0,0,.65)" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);

      let acc=0;
      this.order.traffic.forEach(s=>{
        const ll=segLatLngs(this.route,acc,acc+s.w);
        acc+=s.w;
        const d=ll.map((p,i)=>{
          const q=this.proj(p[0],p[1]);
          return (i?'L':'M')+q[0].toFixed(1)+' '+q[1].toFixed(1);
        }).join('');

        parts.push(`<path d="${d}" stroke="${trafficColor(s.t)}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);

        if(s.t==='jam'&&Store.state.trafficMode==='mono'){
          parts.push(`<path d="${d}" stroke="#fff" stroke-width="1.6" fill="none" stroke-dasharray="2 7" opacity=".85"/>`);
        }
      });

      const a=this.proj(...this.order.from);
      const b=this.proj(...this.order.to);

      parts.push(`<g transform="translate(${a[0]},${a[1]})"><circle r="7" fill="rgba(0,0,0,.65)" stroke="#fff" stroke-width="3"/></g>`);
      parts.push(`<g transform="translate(${b[0]},${b[1]}) rotate(45)"><rect x="-6" y="-6" width="12" height="12" rx="3" fill="#fff" stroke="rgba(0,0,0,.65)" stroke-width="2"/></g>`);
    }

    svg.innerHTML=parts.join('');

    this.el.querySelectorAll('.mk-holder').forEach(n=>n.remove());

    const add=(cls,pos,size)=>{
      const hold=document.createElement('div');
      hold.className='mk-holder';
      hold.style.cssText=`position:absolute;left:0;top:0;z-index:10;pointer-events:none;transform:translate(${pos[0]-size/2}px,${pos[1]-size/2}px)`;
      hold.innerHTML=`<div class="mk ${cls}"></div>`;
      this.el.appendChild(hold);
      return hold;
    };

    if(this.route){
      const cp=this.proj(...pointAt(this.route,this.carT));
      this._carEl=add('mk-car',cp,16);
    }else{
      this._carEl=null;
    }

    if(this.you){
      const yp=this.proj(this.you[0],this.you[1]);
      add('mk-you',yp,11);

      const rad=Math.min(120,256*Math.pow(2,this.zoom)/360*0.001);
      const ring=document.createElement('div');
      ring.className='mk-holder';
      ring.style.cssText=`position:absolute;left:0;top:0;z-index:9;pointer-events:none;width:${rad*2}px;height:${rad*2}px;border:1px solid rgba(255,255,255,.25);border-radius:50%;background:rgba(255,255,255,.04);transform:translate(${yp[0]-rad}px,${yp[1]-rad}px)`;
      this.el.appendChild(ring);
    }
  }
}

/* ═══════════ ЧАСТЬ 3 · APP ═══════════ */

const App={
  view:'driver',
  views:{},
  drawerId:null,
  drawerMap:null,
  modalOpen:false,
  toastTimer:null,
  lastFocus:null,

  isSeller(){return Store.state.role==='seller';},

  requireSeller(){
    if(this.isSeller())return true;
    this.toast('Этот раздел доступен только продавцу. Введите пароль в настройках.',{icon:'info'});
    this.openSettings();
    return false;
  },

  setRole(role){
    Store.set(s=>{s.role=role;});
    document.body.dataset.role=role;

    if(role==='driver'){
      this.switchView('driver');
      this.toast('Режим водителя включён',{icon:'truck'});
    }else{
      this.switchView('seller');
      this.toast('Режим продавца включён',{icon:'check'});
    }
  },

  openSettings(){
    const seller=this.isSeller();

    this.openModal(`
      <div class="modal-head">
        <h3>Настройки</h3>
        <button class="btn-icon" data-close type="button" aria-label="Закрыть">${this.icon('x')}</button>
      </div>

      <div class="settings-list">
        <div class="settings-card">
          <h4>Текущий режим</h4>
          <p>${seller?'Продавец / админ: можно создавать заказы и смотреть управление.':'Водитель: можно принимать заказы и выполнять доставку.'}</p>
          <span class="role-badge">${seller?'Продавец / админ':'Водитель'}</span>
        </div>

        ${seller?`
          <div class="settings-card">
            <h4>Режим водителя</h4>
            <p>Вернуться к обычному экрану водителя. Создание заказов и админка будут скрыты.</p>
            <div class="settings-actions">
              <button class="btn btn-primary" id="set-driver-mode" type="button">Выйти в режим водителя</button>
            </div>
          </div>
        `:`
          <div class="settings-card">
            <h4>Включить режим продавца / админа</h4>
            <p>Для создания заказов и доступа к админ-панели введите пароль. Временный пароль: <b>1234</b>.</p>
            <label class="f-label">Пароль</label>
            <input class="f-input" id="seller-pass" type="password" placeholder="Введите пароль" autocomplete="current-password">
            <div class="err" id="seller-pass-err" style="margin-top:10px"></div>
            <div class="settings-actions" style="margin-top:12px">
              <button class="btn btn-primary" id="enable-seller-mode" type="button">Включить режим продавца</button>
            </div>
          </div>
        `}
      </div>
    `);

    const driverBtn=document.getElementById('set-driver-mode');
    if(driverBtn){
      driverBtn.onclick=()=>{
        this.closeModal();
        this.setRole('driver');
      };
    }

    const enableBtn=document.getElementById('enable-seller-mode');
    if(enableBtn){
      const input=document.getElementById('seller-pass');
      const err=document.getElementById('seller-pass-err');

      const submit=()=>{
        if(input.value===SELLER_PASSWORD){
          this.closeModal();
          this.setRole('seller');
        }else{
          err.textContent='Неверный пароль';
          err.classList.add('show');
          input.focus();
          input.select();
        }
      };

      enableBtn.onclick=submit;
      input.addEventListener('keydown',e=>{
        if(e.key==='Enter')submit();
      });
    }
  },

  esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));},
  money(n){return new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(n)+' ₽';},
  km(n){return n.toFixed(1).replace('.',',')+' км';},
  time(t){return new Date(t).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});},
  etaText(o){
    if(o.status==='arrived')return 'Прибыл';
    if(o.status==='done')return 'Завершён';
    return '≈ '+etaMin(o)+' мин';
  },
  debounce(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};},

  icon(name,size=16){
    const p={
      check:'<path d="M4 12.5l5 5L20 6.5"/>',
      x:'<path d="M6 6l12 12M18 6L6 18"/>',
      trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
      box:'<path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
      truck:'<path d="M1 7h11v9H1z"/><path d="M12 10h4l3 3v3h-7z"/><circle cx="5.5" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/>',
      undo:'<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
      info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/>',
      edit:'<path d="M4 20l4-1L20 7l-3-3L5 16l-1 4z"/>'
    }[name]||'';

    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  },

  countUp(el,to){
    const from=parseInt(String(el.textContent).replace(/\D/g,''))||0;
    if(from===to){el.textContent=to;return;}
    const t0=performance.now(),dur=600;
    const step=now=>{
      const k=Math.min(1,(now-t0)/dur);
      el.textContent=Math.round(from+(to-from)*(1-Math.pow(1-k,3)));
      if(k<1)requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },

  init(){
    Store.init();
    this.views={seller:Seller,driver:Driver,admin:Admin};

    document.body.dataset.traffic=Store.state.trafficMode;
    document.body.dataset.role=Store.state.role||'driver';

    document.querySelectorAll('#top-nav .seg-btn, #bottom-nav .bn-btn').forEach(btn=>{
      btn.addEventListener('click',()=>this.switchView(btn.dataset.view));
    });

    document.querySelectorAll('[data-traffic-switch]').forEach(seg=>{
      seg.addEventListener('click',e=>{
        const b=e.target.closest('.ms-btn');
        if(!b)return;
        Store.set(s=>{s.trafficMode=b.dataset.mode;});
      });
    });

    document.getElementById('scrim').addEventListener('click',()=>{
      this.closeModal();
      this.closeDrawer();
    });

    document.addEventListener('keydown',e=>{
      if(e.key==='Escape'){
        if(this.modalOpen)this.closeModal();
        else this.closeDrawer();
      }
    });

    document.getElementById('header-add').addEventListener('click',()=>{
      if(this.requireSeller())Seller.openCreate();
    });

    document.getElementById('header-settings').addEventListener('click',()=>this.openSettings());

    Store.subscribe((state,meta)=>{
      document.body.dataset.traffic=state.trafficMode;
      document.body.dataset.role=state.role||'driver';
      this.syncTrafficSwitches();

      const v=this.views[this.view];
      if(v&&v.refresh)v.refresh(meta);

      if(this.drawerId)this.refreshDrawer(meta);

      if(meta.arrived&&meta.arrived.length){
        meta.arrived.forEach(id=>{
          const o=Store.order(id);
          if(o&&o.driverId===ME_ID)this.toast(`Вы прибыли: ${o.id}`,{icon:'check'});
        });
      }
    });

    this.syncTrafficSwitches();

    if(Store.state.role==='seller')this.switchView('seller');
    else this.switchView('driver');

    Sim.start();
    Store.state.orders.forEach(o=>fetchRealRoute(o));

    window.addEventListener('resize',this.debounce(()=>this.placeThumb(),150));
    setTimeout(()=>this.placeThumb(),300);
  },

  onRouteUpdated(id){
    const v=this.views[this.view];
    if(v&&v.onRoute)v.onRoute(id);

    if(this.drawerId===id&&this.drawerMap){
      const o=Store.order(id);
      if(o){
        this.drawerMap.setRoute(o);
        this.drawerMap.setCar(o.progress/100);
      }
    }
  },

  syncTrafficSwitches(){
    document.querySelectorAll('[data-traffic-switch] .ms-btn').forEach(b=>{
      b.classList.toggle('active',b.dataset.mode===Store.state.trafficMode);
    });
  },

  placeThumb(){
    const active=document.querySelector('#top-nav .seg-btn.active');
    const thumb=document.getElementById('seg-thumb');
    if(!active||!thumb||!active.offsetWidth)return;
    thumb.style.left=active.offsetLeft+'px';
    thumb.style.width=active.offsetWidth+'px';
  },

  switchView(name){
    if(!this.views[name])return;

    if((name==='seller'||name==='admin')&&!this.isSeller()){
      this.toast('Сначала включите режим продавца в настройках',{icon:'info'});
      this.openSettings();
      return;
    }

    const prev=this.views[this.view];
    if(prev&&prev.unmount)prev.unmount();

    this.view=name;
    document.body.dataset.view=name;

    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
    document.getElementById('view-'+name).classList.add('active');

    document.querySelectorAll('#top-nav .seg-btn, #bottom-nav .bn-btn').forEach(b=>{
      b.classList.toggle('active',b.dataset.view===name);
    });

    this.placeThumb();

    const v=this.views[name];
    v.mount();

    setTimeout(()=>{
      if(v.onShow)v.onShow();
    },90);
  },

  toast(msg,opts={}){
    const t=document.getElementById('toast');
    const ic=document.getElementById('toast-ic');
    const m=document.getElementById('toast-msg');
    const act=document.getElementById('toast-act');

    clearTimeout(this.toastTimer);

    ic.innerHTML=this.icon(opts.icon||'check');
    m.textContent=msg;

    if(opts.action){
      act.style.display='inline-flex';
      act.textContent=opts.action.label;
      act.onclick=()=>{
        opts.action.fn();
        t.classList.remove('show');
      };
    }else{
      act.style.display='none';
      act.onclick=null;
    }

    t.classList.add('show');

    this.toastTimer=setTimeout(()=>{
      t.classList.remove('show');
    },opts.duration||(opts.action?6000:3200));
  },

  openModal(html){
    this.lastFocus=document.activeElement;
    document.getElementById('modal-card').innerHTML=html;
    document.getElementById('modal-root').classList.add('show');
    document.getElementById('scrim').classList.add('show');
    this.modalOpen=true;

    const first=document.querySelector('#modal-card input, #modal-card select, #modal-card button');
    if(first)setTimeout(()=>first.focus(),120);

    document.querySelectorAll('#modal-card [data-close]').forEach(b=>{
      b.addEventListener('click',()=>this.closeModal());
    });
  },

  closeModal(){
    if(!this.modalOpen)return;
    this.modalOpen=false;
    document.getElementById('modal-root').classList.remove('show');
    if(!this.drawerId)document.getElementById('scrim').classList.remove('show');
    if(this.lastFocus&&this.lastFocus.focus)this.lastFocus.focus();
  },

  openDrawer(id){
    const o=Store.order(id);
    if(!o)return;

    this.drawerId=id;
    this.buildDrawer(o);

    document.getElementById('drawer').classList.add('open');
    document.getElementById('scrim').classList.add('show');

    setTimeout(()=>{
      const el=document.getElementById('drawer-map');
      if(el){
        if(this.drawerMap)this.drawerMap.destroy();
        this.drawerMap=new MiniMap(el,{interactive:true});
        this.drawerMap.setRoute(o);
        this.drawerMap.setCar(o.progress/100);
      }

      const c=document.querySelector('#drawer-inner .btn-icon');
      if(c)c.focus();
    },120);
  },

  closeDrawer(){
    if(!this.drawerId)return;
    this.drawerId=null;
    document.getElementById('drawer').classList.remove('open');
    if(!this.modalOpen)document.getElementById('scrim').classList.remove('show');
    if(this.drawerMap){
      this.drawerMap.destroy();
      this.drawerMap=null;
    }
  },

  buildDrawer(o){
    const st=STATUS[o.status];
    const total=distKm(o);
    const histMap={};
    o.history.forEach(h=>histMap[h.s]=h.at);
    const curIdx=FLOW.indexOf(o.status);

    const timeline=FLOW.map((s,i)=>{
      const cls=i<curIdx?'done':i===curIdx?'active':'';
      const at=histMap[s];
      return `<div class="tl-item ${cls}"><span class="tl-dot"></span><span class="tl-line"></span><div><div class="tl-label">${STATUS[s].label}</div><div class="tl-time">${at?this.time(at):'—'}</div></div></div>`;
    }).join('');

    const trafficRows=o.traffic.map(s=>{
      return `<div class="tl-row"><i class="sw sw-${s.t}"></i><span class="tl-name">${TRAFFIC_LABEL[s.t]}</span><span class="tl-pct">${s.w}%</span><span class="tl-km">${this.km(s.w/100*total)}</span></div>`;
    }).join('');

    document.getElementById('drawer-inner').innerHTML=`
      <div class="drawer-head">
        <span class="dots"><i></i><i></i><i></i></span>
        <span class="card-id">${o.id}</span>
        <span class="pill ${st.pill}" id="dw-pill">${st.label}</span>
        <button class="btn-icon" id="dw-close" type="button" aria-label="Закрыть">${this.icon('x')}</button>
      </div>

      <div class="drawer-map" id="drawer-map"></div>

      <div class="route-line">
        <div class="rl"><i class="rl-a"></i>${this.esc(o.productName||'Товар / груз')}</div>
        <div class="rl"><i class="rl-a"></i>${this.esc(o.fromName)}</div>
        <div class="rl"><i class="rl-b"></i>${this.esc(o.toName)}</div>
      </div>

      <div class="pbar">
        <div class="pbar-track">${o.traffic.map(s=>`<div class="seg-t seg-${s.t}" style="width:${s.w}%"></div>`).join('')}</div>
        <div class="ind" id="dw-ind" style="left:${o.progress}%"></div>
      </div>

      <div class="meta-grid">
        <div class="meta-item"><b>Водитель</b><span>${this.esc(o.driverName||'Не назначен')}</span></div>
        <div class="meta-item"><b>Машина</b><span>${this.esc(o.car||'—')} · ${this.esc(o.plate||'')}</span></div>
        <div class="meta-item"><b>Расстояние</b><span id="dw-dist">${this.km(total)}</span></div>
        <div class="meta-item"><b>ETA</b><span id="dw-eta">${this.etaText(o)}</span></div>
        <div class="meta-item"><b>Стоимость</b><span>${this.money(o.price)}</span></div>
        <div class="meta-item"><b>Создан</b><span>${this.time(o.createdAt)}</span></div>
      </div>

      ${o.comment?`<div class="locked-note">Комментарий: ${this.esc(o.comment)}</div>`:''}

      <div class="sec-title">Маршрут по пробкам</div>
      <div class="traffic-list">${trafficRows}</div>

      <div class="sec-title">История статусов</div>
      <div class="timeline">${timeline}</div>

      <div class="locked-note" style="margin-top:14px">
        Машину, марку и номер указывает водитель при принятии заказа.
      </div>

      <div class="drawer-foot">
        ${this.isSeller()?`<button class="btn btn-ghost" id="dw-del" type="button">${this.icon('trash',14)} Удалить</button>`:''}
        <button class="btn btn-primary" id="dw-ok" type="button">Закрыть</button>
      </div>
    `;

    document.getElementById('dw-close').onclick=()=>this.closeDrawer();
    document.getElementById('dw-ok').onclick=()=>this.closeDrawer();

    const del=document.getElementById('dw-del');
    if(del){
      del.onclick=()=>{
        const id=o.id;
        this.closeDrawer();
        Store.removeOrders([id]);
        this.toast(`Заказ ${id} удалён`,{
          icon:'trash',
          action:{
            label:'Отменить',
            fn:()=>{
              const n=Store.undoRemove();
              if(n)this.toast('Заказ восстановлен',{icon:'undo'});
            }
          }
        });
      };
    }
  },

  refreshDrawer(meta){
    const o=Store.order(this.drawerId);
    if(!o){
      this.closeDrawer();
      return;
    }

    if(meta.tick&&!meta.arrived){
      const ind=document.getElementById('dw-ind');
      const eta=document.getElementById('dw-eta');
      if(ind)ind.style.left=o.progress+'%';
      if(eta)eta.textContent=this.etaText(o);
      if(this.drawerMap)this.drawerMap.setCar(o.progress/100);
      return;
    }

    if(this.drawerMap){
      this.drawerMap.destroy();
      this.drawerMap=null;
    }

    this.buildDrawer(o);

    const el=document.getElementById('drawer-map');
    if(el){
      this.drawerMap=new MiniMap(el,{interactive:true});
      this.drawerMap.setRoute(o);
      this.drawerMap.setCar(o.progress/100);
    }
  },

  Geo:{
    pos:null,
    started:false,
    watchId:null,

    start(){
      if(this.started||!navigator.geolocation)return;
      this.started=true;

      this.watchId=navigator.geolocation.watchPosition(
        p=>{
          this.pos={lat:p.coords.latitude,lng:p.coords.longitude,acc:p.coords.accuracy||40};
          if(window.Driver)Driver.onGeo(this.pos);
        },
        ()=>{
          this.pos=null;
          if(window.Driver)Driver.onGeo(null);
        },
        {enableHighAccuracy:true,maximumAge:4000,timeout:12000}
      );
    }
  }
};

/* ═══════════ ЧАСТЬ 4 · ПРОДАВЕЦ ═══════════ */

const Seller={
  mounted:false,
  bound:false,
  query:'',
  filter:'all',
  sort:'eta',
  maps:{},

  mount(){
    if(!App.isSeller())return;
    this.mounted=true;
    if(!this.bound)this.bind();
    this.rebuild();
  },

  onShow(){Object.values(this.maps).forEach(m=>m.render());},
  unmount(){this.mounted=false;},

  bind(){
    this.bound=true;

    const search=document.getElementById('seller-search');
    search.addEventListener('input',App.debounce(()=>{
      this.query=search.value.trim().toLowerCase();
      this.rebuild();
    },220));

    document.getElementById('seller-chips').addEventListener('click',e=>{
      const c=e.target.closest('.chip');
      if(!c)return;
      this.filter=c.dataset.f;
      document.querySelectorAll('#seller-chips .chip').forEach(x=>x.classList.toggle('active',x===c));
      this.rebuild();
    });

    document.getElementById('seller-sort').addEventListener('change',e=>{
      this.sort=e.target.value;
      this.rebuild();
    });

    document.getElementById('btn-new').addEventListener('click',()=>this.openCreate());

    document.getElementById('orders-grid').addEventListener('click',e=>{
      const card=e.target.closest('.card');
      if(!card)return;
      App.openDrawer(card.dataset.id);
    });
  },

  refresh(meta){
    if(!this.mounted)return;
    if(meta.tick&&!meta.arrived)this.live();
    else this.rebuild();
  },

  onRoute(id){
    const o=Store.order(id);
    if(o&&this.maps[id]){
      this.maps[id].setRoute(o);
      this.maps[id].setCar(o.progress/100);
    }
    if(this.mounted)this.live();
  },

  filtered(){
    let list=Store.state.orders.filter(o=>o.status!=='done');

    if(this.filter!=='all')list=list.filter(o=>o.status===this.filter);

    if(this.query){
      list=list.filter(o=>{
        return [o.id,o.productName,o.comment,o.car,o.plate,o.driverName,o.fromName,o.toName]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(this.query);
      });
    }

    const byEta=o=>(o.status==='arrived'?1e9:etaMin(o));

    if(this.sort==='eta')list.sort((a,b)=>byEta(a)-byEta(b));
    else if(this.sort==='progress')list.sort((a,b)=>b.progress-a.progress);
    else list.sort((a,b)=>b.createdAt-a.createdAt);

    return list;
  },

  stats(animate){
    const all=Store.state.orders.filter(o=>o.status!=='done');
    const deliv=all.filter(o=>o.status==='delivering');
    const arr=all.filter(o=>o.status==='arrived');
    const avg=deliv.length?Math.round(deliv.reduce((s,o)=>s+etaMin(o),0)/deliv.length):null;

    const set=(id,val)=>{
      const el=document.getElementById(id);
      if(animate&&typeof val==='number')App.countUp(el,val);
      else el.textContent=val;
    };

    set('st-total',all.length);
    set('st-deliv',deliv.length);
    set('st-arr',arr.length);
    set('st-eta',avg===null?'—':avg);
  },

  destroyMaps(){
    Object.values(this.maps).forEach(m=>m.destroy());
    this.maps={};
  },

  rebuild(){
    if(!App.isSeller())return;

    this.destroyMaps();
    this.stats(true);

    const grid=document.getElementById('orders-grid');
    const list=this.filtered();

    if(!list.length){
      grid.innerHTML=`<div class="glass empty" style="grid-column:1/-1">${App.icon('box',30)}<span>Ничего не найдено. Измените фильтр или создайте новый заказ.</span></div>`;
      return;
    }

    grid.innerHTML=list.map((o,i)=>{
      const st=STATUS[o.status];

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
            <div class="car-ic">${App.icon('box',19)}</div>
            <div class="car-info">
              <div class="car-name">${App.esc(o.productName||'Товар / груз')}</div>
              <div class="car-sub">
                ${o.car?`${App.esc(o.car)} · ${App.esc(o.plate||'')}`:'Ожидает водителя'}
                ${o.driverName?` · ${App.esc(o.driverName)}`:''}
              </div>
            </div>
          </div>

          <div class="prog-labels"><span class="pl-a"><i></i>Старт</span><span class="pl-b"><i></i>Финиш</span></div>

          <div class="pbar">
            <div class="pbar-track">${o.traffic.map(s=>`<div class="seg-t seg-${s.t}" style="width:${s.w}%"></div>`).join('')}</div>
            <div class="ind" data-ind style="left:${o.progress}%"></div>
          </div>

          <div class="card-foot">
            <span class="eta">Прибытие: <strong data-eta>${App.etaText(o)}</strong></span>
            <span class="dist" data-dist>${App.km(distKm(o))}</span>
            <span class="price">${App.money(o.price)}</span>
          </div>
        </div>
      </article>`;
    }).join('');

    list.forEach(o=>{
      const el=document.getElementById('sm-'+o.id);
      if(!el)return;
      const m=new MiniMap(el,{interactive:false});
      m.setRoute(o);
      m.setCar(o.progress/100);
      this.maps[o.id]=m;
    });
  },

  live(){
    this.stats(false);

    Store.state.orders.forEach(o=>{
      const card=document.querySelector(`.card[data-id="${o.id}"]`);
      if(!card)return;

      const ind=card.querySelector('[data-ind]');
      const eta=card.querySelector('[data-eta]');
      const pill=card.querySelector('[data-pill]');
      const dist=card.querySelector('[data-dist]');

      if(ind)ind.style.left=o.progress+'%';
      if(eta)eta.textContent=App.etaText(o);
      if(dist)dist.textContent=App.km(distKm(o));
      if(pill){
        pill.className='pill '+STATUS[o.status].pill;
        pill.textContent=STATUS[o.status].label;
      }
      if(this.maps[o.id])this.maps[o.id].setCar(o.progress/100);
    });
  },

  openCreate(){
    if(!App.requireSeller())return;

    const locOpts=LOCATIONS.map((l,i)=>`<option value="${i}">${App.esc(l.name)}</option>`).join('');

    App.openModal(`
      <div class="modal-head">
        <h3>Новый заказ</h3>
        <button class="btn-icon" data-close type="button" aria-label="Закрыть">${App.icon('x')}</button>
      </div>

      <form id="create-form" class="form-grid" novalidate>
        <div class="full">
          <label class="f-label">Продукт / груз</label>
          <input class="f-input" id="cf-product" placeholder="Например: документы, пицца, лекарства">
        </div>

        <div class="full">
          <label class="f-label">Откуда</label>
          <select class="f-input" id="cf-from">${locOpts}</select>
        </div>

        <div class="full">
          <label class="f-label">Куда</label>
          <select class="f-input" id="cf-to">${locOpts}</select>
        </div>

        <div>
          <label class="f-label">Цена, ₽</label>
          <input class="f-input" id="cf-price" type="number" min="1" value="990">
        </div>

        <div>
          <label class="f-label">Комментарий</label>
          <input class="f-input" id="cf-comment" placeholder="Необязательно">
        </div>

        <div class="full locked-note">
          Машину, марку и номер указывает водитель, когда принимает заказ.
        </div>

        <div class="full err" id="cf-err"></div>

        <div class="full form-foot">
          <button class="btn btn-ghost" data-close type="button">Отмена</button>
          <button class="btn btn-primary" type="submit">Создать заказ</button>
        </div>
      </form>
    `);

    document.getElementById('cf-to').selectedIndex=6;

    document.getElementById('create-form').addEventListener('submit',e=>{
      e.preventDefault();

      const productName=document.getElementById('cf-product').value.trim();
      const fi=+document.getElementById('cf-from').value;
      const ti=+document.getElementById('cf-to').value;
      const price=+document.getElementById('cf-price').value;
      const comment=document.getElementById('cf-comment').value.trim();

      const err=document.getElementById('cf-err');
      const fail=msg=>{
        err.textContent=msg;
        err.classList.add('show');
      };

      if(!productName)return fail('Укажите продукт или груз.');
      if(fi===ti)return fail('Точки отправления и назначения совпадают.');
      if(!price||price<=0)return fail('Укажите корректную цену.');

      const order=Store.createOrder({
        productName,
        comment,
        fromName:LOCATIONS[fi].name,
        toName:LOCATIONS[ti].name,
        from:[...LOCATIONS[fi].coords],
        to:[...LOCATIONS[ti].coords],
        price:Math.round(price)
      });

      if(!order){
        App.toast('Нет доступа продавца',{icon:'info'});
        return;
      }

      App.closeModal();
      App.toast(`Заказ ${order.id} создан`,{icon:'box'});

      setTimeout(()=>{
        const card=document.querySelector(`.card[data-id="${order.id}"]`);
        if(card){
          card.classList.add('flash');
          card.scrollIntoView({behavior:'smooth',block:'nearest'});
        }
      },150);
    });
  }
};

/* ═══════════ ЧАСТЬ 5 · ВОДИТЕЛЬ ═══════════ */

const Driver={
  mounted:false,
  bound:false,
  map:null,
  selectedId:null,
  currentId:null,
  lastDrawnId:null,
  lastMode:null,

  me(){return DRIVERS.find(d=>d.id===ME_ID);},

  profile(){
    const base=this.me();
    const p=Store.state.me.profile||{};
    return {
      ...base,
      name:p.name||'Водитель',
      car:p.car||'',
      plate:p.plate||''
    };
  },

  mount(){
    this.mounted=true;
    if(!this.bound)this.bind();

    if(!this.map){
      const el=document.getElementById('driver-map');
      this.map=new MiniMap(el,{interactive:true,zoom:12});
    }

    this.full();
    App.Geo.start();
    this.onGeo(App.Geo.pos);
  },

  onShow(){if(this.map)this.map.render();},
  unmount(){this.mounted=false;},

  bind(){
    this.bound=true;

    document.getElementById('online-sw').addEventListener('change',e=>{
      Store.set(s=>{s.me.online=e.target.checked;});
      App.toast(e.target.checked?'Вы онлайн — заказы доступны':'Вы офлайн',{icon:'info'});
    });

    document.getElementById('btn-accept').addEventListener('click',()=>this.accept());
    document.getElementById('btn-start').addEventListener('click',()=>this.start());
    document.getElementById('btn-refuse').addEventListener('click',()=>this.refuse());
    document.getElementById('btn-arrived').addEventListener('click',()=>this.arrive());
    document.getElementById('btn-complete').addEventListener('click',()=>this.complete());
    document.getElementById('btn-center').addEventListener('click',()=>this.center());

    document.getElementById('speed-sel').addEventListener('change',e=>{
      Store.set(s=>{s.speed=+e.target.value;},{speed:true});
      App.toast('Скорость демо: ×'+e.target.value,{icon:'info'});
    });

    document.getElementById('avail-list').addEventListener('click',e=>{
      const item=e.target.closest('.avail-item');
      if(!item)return;
      this.selectedId=item.dataset.id;
      this.full();
    });
  },

  refresh(meta){
    if(!this.mounted)return;
    if(meta.tick&&!meta.arrived)this.live();
    else if(!meta.speed)this.full();
  },

  onRoute(id){
    const t=this.targetOrder();
    if(t&&t.id===id&&this.map){
      this.map.setRoute(t);
      this.map.setCar(t.progress/100);
    }
    if(this.mounted)this.live();
  },

  currentOrder(){
    let o=this.currentId?Store.order(this.currentId):null;

    if(o&&['accepted','delivering','arrived'].includes(o.status)&&o.driverId===ME_ID)return o;

    this.currentId=null;
    o=Store.state.orders.find(x=>x.driverId===ME_ID&&['accepted','delivering','arrived'].includes(x.status));

    if(o){
      this.currentId=o.id;
      return o;
    }

    return null;
  },

  targetOrder(){
    return this.currentOrder()||(this.selectedId?Store.order(this.selectedId):null);
  },

  full(){
    const me=this.profile();
    const online=Store.state.me.online;
    const sw=document.getElementById('online-sw');

    if(sw.checked!==online)sw.checked=online;

    document.querySelector('.p-name').textContent=me.name;
    document.querySelector('.avatar').textContent=me.name.split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase()||'В';
    document.getElementById('me-sub').textContent=me.car?`${me.car} · ${me.plate}`:'Машина не указана';
    document.getElementById('speed-sel').value=String(Store.state.speed);

    this.renderCurrent();
    this.renderAvail();
    this.redraw();
    this.gpsBadge();
  },

  renderCurrent(){
    const body=document.getElementById('current-body');
    const o=this.targetOrder();
    const btns={accept:false,start:false,refuse:false,arrived:false,complete:false};

    if(!o){
      body.innerHTML=`<div class="empty">${App.icon('box',28)}<span>Выберите заказ из списка ниже,<br>чтобы принять его в работу</span></div>`;
    }else{
      const isMine=o.driverId===ME_ID;
      const flow=['accepted','delivering','arrived','done'];
      const labels=['Принят','В пути','Прибыл','Готово'];
      const idx=flow.indexOf(o.status);

      const steps=flow.map((s,i)=>{
        const cls=i<idx?'done':i===idx?'active':'';
        const line=i<flow.length-1?`<span class="sline ${i<idx?'done':''}"></span>`:'';
        return `<span class="step ${cls}"><span class="sd"></span><span class="sl">${labels[i]}</span></span>${line}`;
      }).join('');

      const remain=distKm(o)*(1-o.progress/100);
      const p=this.profile();

      body.innerHTML=`
        <div class="route-line">
          <div class="rl"><i class="rl-a"></i>${App.esc(o.productName||'Товар / груз')}</div>
          <div class="rl"><i class="rl-a"></i>${App.esc(o.fromName)}</div>
          <div class="rl"><i class="rl-b"></i>${App.esc(o.toName)}</div>
        </div>

        <div class="steps">${steps}</div>

        <div class="pbar" style="margin-bottom:6px">
          <div class="pbar-track">${o.traffic.map(s=>`<div class="seg-t seg-${s.t}" style="width:${s.w}%"></div>`).join('')}</div>
          <div class="ind" id="cb-ind" style="left:${o.progress}%"></div>
        </div>

        <div class="info-row"><span class="info-label">Заказ</span><span class="info-value">${o.id}</span></div>
        <div class="info-row"><span class="info-label">Осталось</span><span class="info-value" id="cb-dist">${App.km(remain)}</span></div>
        <div class="info-row"><span class="info-label">ETA</span><span class="info-value" id="cb-eta">${App.etaText(o)}</span></div>
        <div class="info-row"><span class="info-label">Выплата</span><span class="info-value">${App.money(o.price)}</span></div>
      `;

      if(o.status==='new'){
        body.innerHTML+=`
          <div class="driver-car-form">
            <div>
              <label class="f-label">Ваше имя</label>
              <input class="f-input" id="drv-name" value="${App.esc(p.name)}" placeholder="Имя водителя">
            </div>
            <div>
              <label class="f-label">Марка машины</label>
              <input class="f-input" id="drv-car" value="${App.esc(p.car)}" placeholder="Hyundai Solaris">
            </div>
            <div>
              <label class="f-label">Номер машины</label>
              <input class="f-input" id="drv-plate" value="${App.esc(p.plate)}" placeholder="А777МР 77">
            </div>
            <div class="locked-note">
              Эти данные увидит продавец после принятия заказа.
            </div>
          </div>
        `;
      }

      if(o.status==='new')btns.accept=true;
      else if(isMine&&o.status==='accepted'){btns.start=true;btns.refuse=true;}
      else if(isMine&&o.status==='delivering')btns.arrived=true;
      else if(isMine&&o.status==='arrived')btns.complete=true;
    }

    const show=(id,on,disabled=false)=>{
      const b=document.getElementById(id);
      b.style.display=on?'flex':'none';
      b.disabled=disabled;
    };

    show('btn-accept',btns.accept,!Store.state.me.online);
    show('btn-start',btns.start);
    show('btn-refuse',btns.refuse);
    show('btn-arrived',btns.arrived);
    show('btn-complete',btns.complete);
  },

  renderAvail(){
    const list=document.getElementById('avail-list');
    const online=Store.state.me.online;
    const avail=Store.state.orders.filter(o=>o.status==='new');

    document.getElementById('avail-count').textContent=avail.length;

    if(!online){
      list.innerHTML=`<div class="empty">${App.icon('info',26)}<span>Вы офлайн.<br>Включите переключатель в профиле, чтобы видеть заказы.</span></div>`;
      return;
    }

    if(!avail.length){
      list.innerHTML=`<div class="empty">${App.icon('box',26)}<span>Свободных заказов пока нет</span></div>`;
      return;
    }

    list.innerHTML=avail.map(o=>`
      <div class="avail-item ${this.selectedId===o.id&&!this.currentOrder()?'selected':''}" data-id="${o.id}">
        <div class="ai-head"><span class="ai-id">${o.id}</span><span class="ai-pay">${App.money(o.price)}</span></div>
        <div class="ai-route"><b>${App.esc(o.productName||'Товар / груз')}</b></div>
        <div class="ai-route"><span>${App.esc(o.fromName)}</span><b>→</b><span>${App.esc(o.toName)}</span></div>
        <div class="ai-meta"><span>${App.km(distKm(o))}</span><span>${App.etaText(o)}</span></div>
      </div>
    `).join('');
  },

  redraw(){
    if(!this.map)return;

    const o=this.targetOrder();
    const mode=Store.state.trafficMode;
    const id=o?o.id:null;

    if(id===this.lastDrawnId&&mode===this.lastMode){
      if(o)this.map.setCar(o.progress/100);
      return;
    }

    this.lastDrawnId=id;
    this.lastMode=mode;

    if(!o){
      this.map.clear();
      return;
    }

    this.map.setRoute(o);
    this.map.setCar(o.progress/100);
  },

  live(){
    const o=this.currentOrder();
    if(!o)return;

    const ind=document.getElementById('cb-ind');
    const eta=document.getElementById('cb-eta');
    const dist=document.getElementById('cb-dist');

    if(ind)ind.style.left=o.progress+'%';
    if(eta)eta.textContent=App.etaText(o);
    if(dist)dist.textContent=App.km(distKm(o)*(1-o.progress/100));
    if(this.map)this.map.setCar(o.progress/100);
  },

  center(){
    if(!this.map)return;

    const o=this.targetOrder();

    if(o)this.map.fit();
    else if(App.Geo.pos){
      this.map.center=[App.Geo.pos.lat,App.Geo.pos.lng];
      this.map.zoom=14;
      this.map.render();
    }else{
      this.map.center=[55.7518,37.6173];
      this.map.zoom=12;
      this.map.render();
    }
  },

  accept(){
    const o=this.selectedId?Store.order(this.selectedId):null;

    if(!o||o.status!=='new'){
      App.toast('Заказ уже недоступен',{icon:'info'});
      this.full();
      return;
    }

    if(!Store.state.me.online){
      App.toast('Сначала включите онлайн',{icon:'info'});
      return;
    }

    const nameEl=document.getElementById('drv-name');
    const carEl=document.getElementById('drv-car');
    const plateEl=document.getElementById('drv-plate');

    const driverName=nameEl?nameEl.value.trim():this.profile().name;
    const car=carEl?carEl.value.trim():'';
    const plate=plateEl?plateEl.value.trim():'';

    if(!driverName||!car||!plate){
      App.toast('Введите имя, марку машины и номер',{icon:'info'});
      return;
    }

    Store.set(s=>{
      o.status='accepted';
      o.driverId=ME_ID;
      o.driverName=driverName;
      o.car=car;
      o.plate=plate;
      o.history.push({s:'accepted',at:Date.now()});

      if(!s.me.profile)s.me.profile={};
      s.me.profile.name=driverName;
      s.me.profile.car=car;
      s.me.profile.plate=plate;
    });

    this.currentId=o.id;
    this.selectedId=null;

    App.toast(`Заказ ${o.id} принят`,{icon:'check'});
    this.full();
  },

  start(){
    const o=this.currentOrder();
    if(!o||o.status!=='accepted')return;

    Store.set(()=>{
      o.status='delivering';
      o.history.push({s:'delivering',at:Date.now()});
    });

    App.toast('Доставка начата — движение по маршруту',{icon:'truck'});
    this.full();
  },

  refuse(){
    const o=this.currentOrder();
    if(!o||o.status!=='accepted')return;

    Store.set(()=>{
      o.status='new';
      o.driverId=null;
      o.driverName=null;
      o.car=null;
      o.plate=null;
      o.history.push({s:'new',at:Date.now()});
    });

    this.currentId=null;
    this.lastDrawnId=undefined;

    App.toast(`Вы отказались от ${o.id}`,{icon:'undo'});
    this.full();
  },

  arrive(){
    const o=this.currentOrder();
    if(!o||o.status!=='delivering')return;

    Store.set(()=>{
      o.status='arrived';
      o.progress=100;
      o.history.push({s:'arrived',at:Date.now()});
    },{structural:true,arrived:[o.id]});

    this.full();
  },

  complete(){
    const o=this.currentOrder();
    if(!o||o.status!=='arrived')return;

    Store.set(()=>{
      o.status='done';
      o.history.push({s:'done',at:Date.now()});
    });

    this.currentId=null;
    this.selectedId=null;
    this.lastDrawnId=undefined;

    App.toast(`Заказ ${o.id} завершён · ${App.money(o.price)}`,{icon:'check'});
    this.full();
    this.center();
  },

  gpsBadge(){
    const dot=document.getElementById('gps-dot');
    const txt=document.getElementById('gps-text');
    const on=!!App.Geo.pos;

    dot.classList.toggle('on',on);
    txt.textContent=on?'GPS активен':'GPS: симуляция';
  },

  onGeo(pos){
    if(!this.mounted)return;
    this.gpsBadge();
    if(this.map)this.map.setYou(pos);
  }
};

/* ═══════════ ЧАСТЬ 6 · АДМИН ═══════════ */

const Admin={
  mounted:false,
  bound:false,
  query:'',
  filter:'all',
  sortKey:'createdAt',
  sortDir:-1,
  selected:new Set(),

  mount(){
    if(!App.isSeller())return;
    this.mounted=true;
    if(!this.bound)this.bind();
    this.full();
  },

  unmount(){this.mounted=false;},

  bind(){
    this.bound=true;

    const search=document.getElementById('admin-search');
    search.addEventListener('input',App.debounce(()=>{
      this.query=search.value.trim().toLowerCase();
      this.renderTable();
    },220));

    document.getElementById('admin-filter').addEventListener('change',e=>{
      this.filter=e.target.value;
      this.renderTable();
    });

    document.getElementById('admin-thead').addEventListener('click',e=>{
      const th=e.target.closest('th[data-sort]');
      if(!th)return;

      const key=th.dataset.sort;

      if(this.sortKey===key)this.sortDir*= -1;
      else{
        this.sortKey=key;
        this.sortDir=(key==='id'||key==='driverName')?1:-1;
      }

      this.renderTable();
    });

    document.getElementById('check-all').addEventListener('change',e=>{
      this.selected=e.target.checked?new Set(this.filtered().map(o=>o.id)):new Set();
      this.syncBulk();
      document.querySelectorAll('.row-check').forEach(c=>{c.checked=e.target.checked;});
    });

    const tbody=document.getElementById('admin-tbody');

    tbody.addEventListener('click',e=>{
      if(e.target.closest('.row-check'))return;

      const del=e.target.closest('.row-del');
      if(del){
        this.remove([del.dataset.id]);
        return;
      }

      const tr=e.target.closest('tr[data-id]');
      if(tr)App.openDrawer(tr.dataset.id);
    });

    tbody.addEventListener('change',e=>{
      const c=e.target.closest('.row-check');
      if(!c)return;

      if(c.checked)this.selected.add(c.dataset.id);
      else this.selected.delete(c.dataset.id);

      this.syncBulk();
    });

    document.getElementById('bulk-del').addEventListener('click',()=>this.remove([...this.selected]));

    document.getElementById('bulk-clear').addEventListener('click',()=>{
      this.selected.clear();
      this.syncBulk();
      document.querySelectorAll('.row-check').forEach(c=>c.checked=false);
      document.getElementById('check-all').checked=false;
    });

    document.getElementById('btn-reset').addEventListener('click',()=>{
      this.selected.clear();
      Store.reset();
      App.toast('Демо-данные сброшены',{icon:'undo'});
    });
  },

  refresh(meta){
    if(!this.mounted)return;
    if(meta.tick&&!meta.arrived)this.live();
    else this.full();
  },

  remove(ids){
    if(!ids.length)return;

    ids.forEach(id=>this.selected.delete(id));
    Store.removeOrders(ids);
    this.syncBulk();

    App.toast(ids.length===1?`Заказ ${ids[0]} удалён`:`Удалено заказов: ${ids.length}`,{
      icon:'trash',
      action:{
        label:'Отменить',
        fn:()=>{
          const n=Store.undoRemove();
          if(n)App.toast(`Восстановлено: ${n}`,{icon:'undo'});
        }
      }
    });
  },

  syncBulk(){
    document.getElementById('bulk-bar').classList.toggle('show',this.selected.size>0);
    document.getElementById('bulk-count').textContent=`${this.selected.size} выбрано`;
  },

  filtered(){
    let list=[...Store.state.orders];

    if(this.filter!=='all')list=list.filter(o=>o.status===this.filter);

    if(this.query){
      list=list.filter(o=>{
        return [o.id,o.productName,o.comment,o.car,o.plate,o.driverName,o.fromName,o.toName]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(this.query);
      });
    }

    const k=this.sortKey,dir=this.sortDir;

    list.sort((a,b)=>{
      let va,vb;

      if(k==='status'){
        va=FLOW.indexOf(a.status);
        vb=FLOW.indexOf(b.status);
      }else if(k==='driverName'){
        va=a.driverName||'';
        vb=b.driverName||'';
      }else{
        va=a[k];
        vb=b[k];
      }

      if(typeof va==='string')return va.localeCompare(vb,'ru')*dir;
      return (va-vb)*dir;
    });

    return list;
  },

  full(){
    this.kpis(true);
    this.chart();
    this.drivers();
    this.renderTable();
    this.syncBulk();
  },

  kpis(animate){
    const orders=Store.state.orders;
    const deliv=orders.filter(o=>o.status==='delivering');
    const online=DRIVERS.filter(d=>d.id===ME_ID?Store.state.me.online:d.online).length;
    const rev=orders.reduce((s,o)=>s+o.price,0);
    const avg=deliv.length?Math.round(deliv.reduce((s,o)=>s+etaMin(o),0)/deliv.length):null;

    const set=(id,v)=>{
      const el=document.getElementById(id);
      if(animate&&typeof v==='number')App.countUp(el,v);
      else el.textContent=v;
    };

    set('k-orders',orders.length);
    set('k-drivers',online);
    set('k-rev',rev);
    set('k-eta',avg===null?'—':avg);
  },

  chart(){
    const hours=[];
    for(let h=9;h<=19;h++)hours.push(h);

    const counts=hours.map(h=>Store.state.orders.filter(o=>new Date(o.createdAt).getHours()===h).length);
    const max=Math.max(1,...counts);
    const chart=document.getElementById('chart');

    chart.innerHTML=counts.map((c,i)=>{
      return `<div class="bar ${c===max&&c>0?'max':''}" style="height:3px" title="${hours[i]}:00 — заказов: ${c}"><b>${c}</b></div>`;
    }).join('');

    document.getElementById('chart-x').innerHTML=hours.map(h=>`<span>${h}</span>`).join('');

    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      chart.querySelectorAll('.bar').forEach((b,i)=>{
        b.style.height=Math.max(3,counts[i]/max*100)+'%';
      });
    }));
  },

  drivers(){
    document.getElementById('drivers-list').innerHTML=DRIVERS.map(d=>{
      const online=d.id===ME_ID?Store.state.me.online:d.online;
      const busy=Store.state.orders.find(o=>o.driverId===d.id&&['accepted','delivering'].includes(o.status));
      const profile=d.id===ME_ID?Driver.profile():d;

      return `
      <div class="drv">
        <span class="drv-dot ${online?'on':''}"></span>
        <div class="drv-info">
          <div class="drv-name">${App.esc(profile.name||d.name)}${d.id===ME_ID?' · вы':''}</div>
          <div class="drv-sub">${App.esc(profile.car||'Машина не указана')} · ${App.esc(profile.plate||'')}</div>
        </div>
        <div class="drv-right">
          <span class="star">★ ${d.rating.toFixed(1)}</span>
          <span class="chip-mini ${busy?'busy':''}">${busy?busy.id:(online?'Свободен':'Офлайн')}</span>
        </div>
      </div>`;
    }).join('');
  },

  renderTable(){
    document.querySelectorAll('#admin-thead th[data-sort]').forEach(th=>{
      const active=th.dataset.sort===this.sortKey;
      th.classList.toggle('sorted',active);
      th.querySelector('.arr').textContent=active?(this.sortDir===1?'↑':'↓'):'↕';
    });

    const list=this.filtered();
    const tbody=document.getElementById('admin-tbody');

    if(!list.length){
      tbody.innerHTML=`<tr><td colspan="8"><div class="empty">${App.icon('box',26)}<span>Заказы не найдены</span></div></td></tr>`;
      return;
    }

    tbody.innerHTML=list.map(o=>{
      const st=STATUS[o.status];

      return `
      <tr data-id="${o.id}">
        <td class="th-check"><input type="checkbox" class="row-check" data-id="${o.id}" ${this.selected.has(o.id)?'checked':''} aria-label="Выбрать ${o.id}"></td>
        <td class="t-id">${o.id}<div class="t-sub">${App.time(o.createdAt)}</div></td>
        <td>${App.esc(o.driverName||'—')}<div class="t-sub">${App.esc(o.car||'')} ${App.esc(o.plate||'')}</div></td>
        <td class="t-route" title="${App.esc(o.productName||'Товар')} · ${App.esc(o.fromName)} → ${App.esc(o.toName)}">${App.esc(o.productName||'Товар')} · ${App.esc(o.fromName)} → ${App.esc(o.toName)}</td>
        <td><span class="pill ${st.pill}" data-pill>${st.label}</span></td>
        <td><div class="mini-wrap"><div class="mini-pbar">${o.traffic.map(s=>`<div class="seg-t seg-${s.t}" style="width:${s.w}%"></div>`).join('')}<div class="mini-fill" data-fill style="width:${o.progress}%"></div></div><span class="mini-pct" data-pct>${Math.round(o.progress)}%</span></div></td>
        <td class="t-price">${App.money(o.price)}</td>
        <td><button class="btn-icon row-del" data-id="${o.id}" type="button" title="Удалить">${App.icon('trash',14)}</button></td>
      </tr>`;
    }).join('');
  },

  live(){
    this.kpis(false);

    Store.state.orders.forEach(o=>{
      const tr=document.querySelector(`#admin-tbody tr[data-id="${o.id}"]`);
      if(!tr)return;

      const fill=tr.querySelector('[data-fill]');
      const pct=tr.querySelector('[data-pct]');
      const pill=tr.querySelector('[data-pill]');

      if(fill)fill.style.width=o.progress+'%';
      if(pct)pct.textContent=Math.round(o.progress)+'%';
      if(pill){
        pill.className='pill '+STATUS[o.status].pill;
        pill.textContent=STATUS[o.status].label;
      }
    });
  }
};

/* ═══════════ ЗАПУСК ═══════════ */

document.addEventListener('DOMContentLoaded',()=>{
  try{
    App.init();
  }catch(e){
    console.error('Init error:',e);
    document.body.insertAdjacentHTML('beforeend',
      '<div style="position:fixed;bottom:20px;left:20px;right:20px;z-index:9999;background:#300;color:#fff;padding:14px;border-radius:12px;font-size:13px">Ошибка запуска: '+String(e.message||e)+'</div>');
  }
});
