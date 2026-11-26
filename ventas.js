/* Mala Fama Control · Ventas (prueba). Solo admin; datos de ventas_tickets, ventas_lineas, ventas_codigos y cierres (RLS). */
(function () {
  const TIPOS = { plato: "Platos", bebida: "Bebidas", trago: "Tragos", extra: "Extras", vaso: "Vasos", tabaco: "Tabaco / cigarrillos", otro: "Otros", invitacion: "Invitaciones", sin_clasificar: "Sin clasificar", envase: "Envases" };
  const DOW = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const V = { desde: null, hasta: null, canal: "todos", q: "alboroto", pd: null, ph: null, sel: null, data: null, key: "", codigos: null, max: null, min: null, charts: {}, det: null, detKey: "" };
  const fm = (n, d = 0) => {
    const neg = n < 0; n = Math.abs(n);
    const [i, f] = n.toFixed(d).split(".");
    return (neg ? "-" : "") + i.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (f ? "," + f : "");
  };
  const mo = (n) => (n < 0 ? "-$" : "$") + fm(Math.abs(n));
  const fd = (s) => s.slice(8) + "/" + s.slice(5, 7);
  const dow = (s) => DOW[new Date(s + "T12:00:00").getDay()];
  const norm = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const addDays = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

  // Trae todas las filas en páginas de 1000. La primera página trae el total (count) y las demás se piden en paralelo.
  async function fetchAll(q) {
    const first = await q().range(0, 999);
    if (first.error) throw first.error;
    let out = first.data;
    const total = first.count == null ? out.length : first.count;
    if (out.length < 1000 || total <= 1000) return out;
    const starts = [];
    for (let f = 1000; f < total; f += 1000) starts.push(f);
    const pages = new Array(starts.length);
    let next = 0;
    const worker = async () => {
      while (next < starts.length) {
        const i = next++;
        const { data, error } = await q().range(starts[i], starts[i] + 999);
        if (error) throw error;
        pages[i] = data;
      }
    };
    await Promise.all(Array.from({ length: 16 }, worker));
    pages.forEach((p) => { out = out.concat(p); });
    return out;
  }

  async function init(M) {
    const sb = M.sb;
    const [mx, mn, codigos] = await Promise.all([
      sb.from("ventas_tickets").select("fecha_emision").order("fecha_emision", { ascending: false }).limit(1),
      sb.from("ventas_tickets").select("fecha_emision").order("fecha_emision", { ascending: true }).limit(1),
      fetchAll(() => sb.from("ventas_codigos").select("codigo_pos,nombre_pos,tipo", { count: "exact" }).order("codigo_pos")),
    ]);
    if (mx.error) throw mx.error;
    V.max = mx.data[0] ? mx.data[0].fecha_emision : null;
    V.min = mn.data[0] ? mn.data[0].fecha_emision : null;
    V.codigos = {}; codigos.forEach((c) => (V.codigos[c.codigo_pos] = c));
    if (V.max && !V.desde) { V.hasta = V.max; V.desde = V.max.slice(0, 8) + "01"; V.ph = V.max; V.pd = addDays(V.max, -10) < V.desde ? V.desde : addDays(V.max, -10); }
  }

  async function load(M) {
    const key = V.desde + "|" + V.hasta;
    if (V.key === key && V.data) return V.data;
    const sb = M.sb;
    const [T, L, C] = await Promise.all([
      fetchAll(() => sb.from("ventas_tickets").select("clave,fecha_emision,canal,cerrado_en,mozo_nombre,es_nota_credito", { count: "exact" }).eq("es_venta", true).gte("fecha_emision", V.desde).lte("fecha_emision", V.hasta).order("clave")),
      fetchAll(() => sb.from("ventas_lineas").select("ticket_clave,fecha_emision,codigo_pos,nombre_pos,cantidad,total", { count: "exact" }).eq("es_venta", true).gte("fecha_emision", V.desde).lte("fecha_emision", V.hasta).order("clave")),
      fetchAll(() => sb.from("cierres").select("id,jornada,total_ventas", { count: "exact" }).gte("jornada", V.desde).lte("jornada", V.hasta).order("id")),
    ]);
    const tot = {};
    L.forEach((l) => { tot[l.ticket_clave] = (tot[l.ticket_clave] || 0) + Number(l.total); });
    const tickets = T.filter((t) => t.clave in tot).map((t) => ({ f: t.fecha_emision, canal: t.canal, h: t.cerrado_en ? +t.cerrado_en.slice(11, 13) : -1, mozo: t.mozo_nombre || "-", nc: t.es_nota_credito, v: tot[t.clave] }));
    const canalDe = {}; T.forEach((t) => (canalDe[t.clave] = t.canal));
    const lineas = L.filter((l) => l.ticket_clave in canalDe).map((l) => ({ f: l.fecha_emision, canal: canalDe[l.ticket_clave], c: l.codigo_pos, n: (l.nombre_pos || "").trim(), q: Number(l.cantidad), v: Number(l.total) }));
    const cie = {}; C.forEach((c) => { cie[c.jornada] = (cie[c.jornada] || 0) + Number(c.total_ventas); });
    V.data = { tickets, lineas, cie }; V.key = key;
    return V.data;
  }

  async function loadDet(M, code) {
    const key = [code, V.pd, V.ph].join("|");
    if (V.detKey === key) return V.det;
    const rows = await fetchAll(() => M.sb.from("ventas_lineas").select("clave,fecha_emision,cantidad,total,ventas_tickets!inner(canal,es_venta)", { count: "exact" }).eq("codigo_pos", code).eq("es_venta", true).eq("ventas_tickets.es_venta", true).gte("fecha_emision", V.pd).lte("fecha_emision", V.ph).order("clave"));
    V.det = rows.map((r) => ({ f: r.fecha_emision, canal: r.ventas_tickets.canal, q: Number(r.cantidad), v: Number(r.total) })); V.detKey = key;
    return V.det;
  }

  const okc = (c) => V.canal === "todos" || V.canal === c;

  function agg(D) {
    const T = D.tickets.filter((t) => okc(t.canal)), L = D.lineas.filter((l) => okc(l.canal));
    const ventas = T.reduce((a, t) => a + t.v, 0), nT = T.filter((t) => !t.nc).length;
    const dev = T.filter((t) => t.nc).reduce((a, t) => a + t.v, 0), nDev = T.filter((t) => t.nc).length;
    const noche = {}, nTn = {}, hora = {}, moz = {}, tipo = {}, prod = {};
    T.forEach((t) => {
      noche[t.f] = (noche[t.f] || 0) + t.v;
      if (!t.nc) nTn[t.f] = (nTn[t.f] || 0) + 1;
      if (t.h >= 0) hora[t.h] = (hora[t.h] || 0) + t.v;
      const m = moz[t.mozo] || (moz[t.mozo] = { v: 0, n: 0 }); m.v += t.v; if (!t.nc) m.n++;
    });
    L.forEach((l) => {
      const tp = (V.codigos[l.c] && V.codigos[l.c].tipo) || "sin_clasificar";
      tipo[tp] = (tipo[tp] || 0) + l.v;
      const p = prod[l.c] || (prod[l.c] = { n: l.n, t: tp, q: 0, v: 0 }); p.q += l.q; p.v += l.v;
    });
    return { ventas, nT, dev, nDev, noche, nTn, hora, moz, tipo, prod };
  }

  async function render(M) {
    const { esc } = M;
    M.app.innerHTML = M.shell("Ventas", "Leyendo ventas…", `<div class="wrap wide"><p class="sub">Leyendo…</p></div>`);
    M.bindSalir();
    if (!V.codigos) await init(M);
    if (!V.max) {
      M.app.innerHTML = M.shell("Ventas", "Todavía no hay ventas cargadas.", `<div class="wrap wide"><div class="alert">Todavía no hay ventas cargadas.</div></div>`);
      return M.bindSalir();
    }
    const D = await load(M);
    const A = agg(D);
    const all = V.canal === "todos";
    const days = Object.keys(A.noche).sort();
    let nBad = 0, tabla = "";
    days.forEach((d) => {
      const v = A.noche[d], c = D.cie[d];
      const dif = c != null ? v - c : null, pct = c ? (dif / c) * 100 : null, bad = c != null && Math.abs(pct) >= 2;
      if (bad && all) nBad++;
      const sh = all && c != null;
      tabla += `<tr class="${bad && all ? "hl" : ""}"><td class="l">${fd(d)}/${d.slice(0, 4)} <span class="dow">${dow(d)}</span></td><td>${mo(v)}</td><td>${sh ? mo(c) : "—"}</td><td class="${bad ? "dif-bad" : "dif-ok"}">${sh ? (dif > 0 ? "+" : "") + mo(dif) : "—"}</td><td class="${bad ? "dif-bad" : "dif-ok"}">${sh ? (pct > 0 ? "+" : "") + fm(pct, 1) + "%" : "—"}</td><td>${A.nTn[d] || 0}</td></tr>`;
    });
    const top = Object.values(A.prod).filter((p) => !["vaso", "invitacion"].includes(p.t)).sort((a, b) => b.v - a.v).slice(0, 12);
    const mx = (top[0] && top[0].v) || 1;
    const moz = Object.entries(A.moz).filter(([k]) => k !== "-").sort((a, b) => b[1].v - a[1].v);
    const mozMx = (moz[0] && moz[0][1].v) || 1;
    const tipos = Object.entries(A.tipo).sort((a, b) => b[1] - a[1]);
    const tt = tipos.reduce((a, x) => a + Math.max(x[1], 0), 0) || 1;
    // búsqueda: códigos que coinciden con el texto; totales del período cargado
    const pr = {}; D.lineas.forEach((l) => { if (okc(l.canal)) { const p = pr[l.c] || (pr[l.c] = { q: 0, v: 0 }); p.q += l.q; p.v += l.v; } });
    const res = Object.values(V.codigos).filter((c) => V.q.trim() && norm(c.nombre_pos).includes(norm(V.q))).map((c) => ({ c: c.codigo_pos, n: c.nombre_pos.trim(), t: c.tipo, q: (pr[c.codigo_pos] || {}).q || 0, v: (pr[c.codigo_pos] || {}).v || 0 })).sort((a, b) => b.v - a.v).slice(0, 6);
    const sel = res.find((p) => p.c === V.sel) || res[0];
    let det = "";
    if (sel) {
      const rows = (await loadDet(M, sel.c)).filter((r) => okc(r.canal));
      const byD = {}; rows.forEach((r) => { const x = byD[r.f] || (byD[r.f] = { q: 0, v: 0 }); x.q += r.q; x.v += r.v; });
      const q = Object.values(byD).reduce((a, r) => a + r.q, 0), v = Object.values(byD).reduce((a, r) => a + r.v, 0);
      det = `<div class="kpis" style="margin-top:12px"><div class="kpi"><div class="l">Unidades</div><div class="v">${fm(q)}</div><div class="s">${Object.keys(byD).length} noches con venta</div></div><div class="kpi"><div class="l">Ventas</div><div class="v">${mo(v)}</div><div class="s">con IVA, neto de devoluciones</div></div><div class="kpi"><div class="l">Precio promedio</div><div class="v">${q ? mo(v / q) : "—"}</div><div class="s">ventas dividido unidades</div></div></div>
      <div class="hint">${esc(sel.n)} · ${TIPOS[sel.t] || sel.t} · del ${fd(V.pd)}/${V.pd.slice(0, 4)} al ${fd(V.ph)}/${V.ph.slice(0, 4)}.</div>
      <div class="scroll" style="max-height:none"><table><thead><tr><th>Noche</th><th>Unidades</th><th>Ventas</th></tr></thead><tbody>${Object.keys(byD).sort().map((d) => `<tr><td class="l">${fd(d)}/${d.slice(0, 4)} <span class="dow">${dow(d)}</span></td><td>${fm(byD[d].q)}</td><td>${mo(byD[d].v)}</td></tr>`).join("") || `<tr><td class="l muted" colspan="3">Sin ventas en esas fechas.</td></tr>`}</tbody></table></div>`;
    }
    const sub = `Datos reales de la caja (Factura Express) · del ${fd(V.desde)}/${V.desde.slice(0, 4)} al ${fd(V.hasta)}/${V.hasta.slice(0, 4)} · hay ventas cargadas del ${fd(V.min)}/${V.min.slice(0, 4)} al ${fd(V.max)}/${V.max.slice(0, 4)} · Solo administración.`;
    const body = `<div class="wrap wide">
 <div class="filters"><div class="dl">Desde <input type="date" id="d1" value="${V.desde}" min="${V.min}" max="${V.max}"></div><div class="dl">Hasta <input type="date" id="d2" value="${V.hasta}" min="${V.min}" max="${V.max}"></div>
 <div class="seg">${[["todos", "Todos"], ["local", "Salón"], ["pedidosya", "PedidosYa"]].map(([k, l]) => `<button data-c="${k}" class="${V.canal === k ? "on" : ""}">${l}</button>`).join("")}</div>
 <span class="muted" style="font-size:12px">No incluye: acuerdo de tarjetas, comodín ni separadores.</span></div>
 <div class="kpis">
  <div class="kpi"><div class="l">Ventas netas</div><div class="v">${mo(A.ventas)}</div><div class="s">con IVA · ya descontadas las devoluciones</div></div>
  <div class="kpi"><div class="l">Tickets</div><div class="v">${fm(A.nT)}</div><div class="s">${fm(A.nT / Math.max(days.length, 1))} por noche en promedio</div></div>
  <div class="kpi"><div class="l">Ticket promedio</div><div class="v">${mo(A.nT ? (A.ventas - A.dev) / A.nT : 0)}</div><div class="s">por comprobante</div></div>
  <div class="kpi ${A.dev < -5000 ? "warn" : ""}"><div class="l">Devoluciones</div><div class="v">${mo(Math.abs(A.dev))}</div><div class="s">${A.nDev} notas de crédito · ${fm(A.ventas ? (Math.abs(A.dev) / (A.ventas - A.dev)) * 100 : 0, 1)}% de lo vendido</div></div>
 </div>
 <div class="card"><div class="cardhead"><div><h3>Ventas por noche</h3><div class="hint">Barras: caja (Factura Express). Línea: cierres de caja. ${all ? "" : "Con un canal filtrado la comparación con cierres no aplica."}</div></div></div><div class="chartbox"><canvas id="cn"></canvas></div></div>
 <div class="card"><h3>Cuadre con los cierres</h3><div class="hint">Noche por noche. Resaltadas las que se apartan 2% o más (${all ? nBad + " noches" : "solo con Todos"}). La diferencia puede ser propina, venta fuera del export u horario.</div>
 <div class="scroll"><table><thead><tr><th>Noche</th><th>Ventas caja</th><th>Cierres</th><th>Diferencia</th><th>%</th><th>Tickets</th></tr></thead><tbody>${tabla}</tbody></table></div></div>
 <div class="two"><div class="card"><h3>Ventas por hora</h3><div class="hint">Hora de cierre del ticket; noche de 18 a 03 h.</div><div class="chartbox sm"><canvas id="ch"></canvas></div></div>
 <div class="card"><h3>Ventas por tipo</h3><div class="hint">Lo que no está unido a la carta igual cuenta por tipo.</div><table><tbody>${tipos.map(([k, v]) => `<tr><td class="l">${TIPOS[k] || k}</td><td>${mo(v)}</td><td style="width:40%"><span class="barline" style="width:${(Math.max(v, 0) / tt) * 140}%"></span> <span class="muted">${fm((v / tt) * 100, 1)}%</span></td></tr>`).join("")}</tbody></table></div></div>
 <div class="two"><div class="card"><h3>Productos más vendidos</h3><div class="hint">Por plata, sin vasos ni invitaciones.</div><table><thead><tr><th>Producto</th><th>Unid.</th><th>Ventas</th></tr></thead><tbody>${top.map((p) => `<tr><td class="l"><span class="prod">${esc(p.n)}</span> <span class="pill">${TIPOS[p.t] || p.t}</span><br><span class="barline" style="width:${(p.v / mx) * 100}%;height:5px"></span></td><td>${fm(p.q)}</td><td>${mo(p.v)}</td></tr>`).join("")}</tbody></table></div>
 <div class="card"><h3>Ventas por mozo</h3><div class="hint">Del ticket (delivery no tiene mozo).</div><table><thead><tr><th>Mozo</th><th>Tickets</th><th>Ventas</th><th>Ticket prom.</th></tr></thead><tbody>${moz.map(([k, m]) => `<tr><td class="l"><span class="prod">${esc(k)}</span><br><span class="barline" style="width:${(m.v / mozMx) * 100}%;height:5px"></span></td><td>${m.n}</td><td>${mo(m.v)}</td><td>${mo(m.n ? m.v / m.n : 0)}</td></tr>`).join("")}</tbody></table></div></div>
 <div class="card" id="busq"><h3>Ventas por producto</h3><div class="hint">Buscá un producto y mirá cuánto se vendió entre dos fechas, como en el historial de compras.</div>
 <div class="barf"><input type="search" id="q" value="${esc(V.q)}" placeholder="Buscar producto…" style="flex:1;min-width:200px"><div class="dl">Desde <input type="date" id="p1" value="${V.pd}" min="${V.min}" max="${V.max}"></div><div class="dl">Hasta <input type="date" id="p2" value="${V.ph}" min="${V.min}" max="${V.max}"></div></div>
 <ul class="res">${res.map((p) => `<li class="${sel && p.c === sel.c ? "on" : ""}" data-p="${esc(p.c)}"><span><b>${esc(p.n)}</b> <span class="pill">${TIPOS[p.t] || p.t}</span></span><span class="muted">${fm(p.q)} unid. en el período de arriba · ${mo(p.v)}</span></li>`).join("") || '<li class="muted">Sin resultados</li>'}</ul>${det}</div>
 <div class="foot">Fuente: ventas de la caja (tickets, líneas y códigos) y cierres. El dashboard anterior sigue funcionando en paralelo.</div></div>`;
    M.app.innerHTML = M.shell("Ventas", sub, body);
    M.bindSalir();
    drawCharts(days, all, D, A);
    const redo = () => render(M).catch((e) => { console.error(e); M.app.innerHTML = `<div class="wrap"><div class="alert warn">No se pudieron cargar las ventas: ${esc(e.message || e)}</div></div>`; });
    const ok = (a, b) => a && b && a <= b;
    const $ = (s) => M.app.querySelector(s);
    $("#d1").onchange = (e) => { if (ok(e.target.value, V.hasta)) { V.desde = e.target.value; redo(); } };
    $("#d2").onchange = (e) => { if (ok(V.desde, e.target.value)) { V.hasta = e.target.value; redo(); } };
    M.app.querySelectorAll("[data-c]").forEach((b) => (b.onclick = () => { V.canal = b.dataset.c; redo(); }));
    let t = null;
    $("#q").oninput = (e) => { V.q = e.target.value; V.sel = null; clearTimeout(t); t = setTimeout(async () => { await redo(); const q = $("#q"); if (q) { q.focus(); const n = q.value.length; q.setSelectionRange(n, n); } }, 300); };
    $("#p1").onchange = (e) => { if (ok(e.target.value, V.ph)) { V.pd = e.target.value; redo(); } };
    $("#p2").onchange = (e) => { if (ok(V.pd, e.target.value)) { V.ph = e.target.value; redo(); } };
    M.app.querySelectorAll("[data-p]").forEach((li) => (li.onclick = () => { V.sel = li.dataset.p; redo(); }));
  }

  function drawCharts(days, all, D, A) {
    if (!window.Chart) return;
    Object.values(V.charts).forEach((c) => c && c.destroy && c.destroy());
    const grid = { color: "#262a35" }, tick = { color: "#8b93a7" };
    const yc = (x) => (x >= 1000 ? x / 1000 + " mil" : x);
    const ds = [{ type: "bar", label: "Caja", data: days.map((d) => A.noche[d]), backgroundColor: "#f5b301" }];
    if (all) ds.push({ type: "line", label: "Cierres", data: days.map((d) => (D.cie[d] != null ? D.cie[d] : null)), borderColor: "#9aa3b8", backgroundColor: "#9aa3b8", pointRadius: 3, borderWidth: 2 });
    V.charts.n = new Chart(document.querySelector("#cn"), { data: { labels: days.map(fd), datasets: ds }, options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { labels: { color: "#c8cdd8" } } }, scales: { x: { ticks: tick, grid: { display: false } }, y: { ticks: { ...tick, callback: yc }, grid } } } });
    const hs = [18, 19, 20, 21, 22, 23, 0, 1, 2, 3];
    V.charts.h = new Chart(document.querySelector("#ch"), { type: "bar", data: { labels: hs.map((h) => String(h).padStart(2, "0") + "h"), datasets: [{ data: hs.map((h) => A.hora[h] || 0), backgroundColor: "#f5b301" }] }, options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } }, scales: { x: { ticks: tick, grid: { display: false } }, y: { ticks: { ...tick, callback: yc }, grid } } } });
  }

  window.MF_ventas = (M) => render(M);
})();
