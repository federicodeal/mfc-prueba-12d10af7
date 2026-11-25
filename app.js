/* Mala Fama Control · fase 1 + cierres (prueba). Supabase Auth + datos con RLS. */
(function () {
  const CATS = ["Cocina", "Barra", "Cocina y Barra", "Otros"];
  const STOCK_CATS = { admin: ["Cocina", "Barra", "Cocina y Barra"], encargado: ["Cocina", "Barra", "Cocina y Barra"],
    stock: ["Cocina", "Barra", "Cocina y Barra"], cocina: ["Cocina", "Cocina y Barra"], barra: ["Barra", "Cocina y Barra"] };
  const ROL_LABEL = { admin: "Administración", encargado: "Encargado", cocina: "Cocina", barra: "Barra", stock: "Tablet de stock", ingesta: "Carga automática" };
  const DOW = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const MES = ["", "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
  const MES_L = ["", "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const sb = window.supabase.createClient(MF_CONFIG.url, MF_CONFIG.key, { auth: { persistSession: true } });
  const $ = (s, el = document) => el.querySelector(s);
  const app = $("#app");
  const S = { perfil: null, items: null, nov: null, cierres: null, cDia: null, cPer: "14d", cCharts: {},
    catOn: "Todas", prov: "", q: "", stockCat: null, stockQ: "", shown: 60, qty: {}, fecha: hoy(), quien: "" };

  function hoy() { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
  const pill = (c) => ({ Cocina: "ok", Barra: "bar", "Cocina y Barra": "mid", Otros: "bad" }[c] || "");
  const nf = (n) => (n || 0).toLocaleString("es-UY", { maximumFractionDigits: 0 });
  const $u = (n, mon) => (mon === "USD" ? "US$ " : "$ ") + (n == null ? "—" : Number(n).toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const $r = (n) => (n == null ? "—" : "$" + Math.round(n).toLocaleString("es-UY"));
  const $k = (n) => {
    if (n == null) return "—";
    const a = Math.abs(n);
    if (a >= 1e6) return "$" + (n / 1e6).toLocaleString("es-UY", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " M";
    if (a >= 1e4) return "$" + Math.round(n / 1e3).toLocaleString("es-UY") + " mil";
    return $r(n);
  };
  const dmy = (s) => (!s ? "—" : s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4));
  const dow = (iso) => { const [y, m, d] = iso.split("-").map(Number); return DOW[new Date(y, m - 1, d).getDay()]; };
  const addDays = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); const x = new Date(Date.UTC(y, m - 1, d + n)); return x.toISOString().slice(0, 10); };
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const rol = () => S.perfil && S.perfil.rol;
  const can = (sec) => {
    const r = rol(); if (!r) return false;
    if (sec === "cierres") return r === "admin";
    if (sec === "stock") return !!STOCK_CATS[r];
    return r === "admin" || r === "encargado";
  };

  function toast(msg, ok) {
    let t = $("#toast"); if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
    t.className = "toast show " + (ok ? "ok" : "bad"); t.textContent = msg;
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 4500);
  }

  async function fetchAll(table, select, filter) {
    let out = [], from = 0;
    for (;;) {
      let q = sb.from(table).select(select).range(from, from + 999);
      if (filter) q = filter(q);
      const { data, error } = await q;
      if (error) throw error;
      out = out.concat(data); if (data.length < 1000) return out; from += 1000;
    }
  }
  async function loadItems() {
    if (S.items) return S.items;
    const rows = await fetchAll("v_articulos", "*", (q) => q.order("monto_uyu", { ascending: false }).order("id"));
    S.items = rows; return rows;
  }

  async function loadCierres() {
    if (S.cierres) return S.cierres;
    const rows = await fetchAll("cierres", "caja,jornada,estado,comensales,comprobantes,total_ventas,efectivo_en_caja,pagos,secciones,mozos,movimientos", (q) => q.order("jornada").order("caja"));
    const byDay = {};
    const jc = {};
    let histTotal = 0, cMin = Infinity, cMax = -Infinity;
    const cajaSet = new Set();
    for (const r of rows) {
      const c = Number(r.caja);
      cajaSet.add(c);
      if (c < cMin) cMin = c;
      if (c > cMax) cMax = c;
      (jc[c] = jc[c] || []).push(r.jornada);
      const tot = Number(r.total_ventas || 0);
      histTotal += tot;
      const d = byDay[r.jornada] || (byDay[r.jornada] = {
        d: r.jornada, tot: 0, cm: 0, cp: 0, cajas: [], pagos: {}, secs: {}, mozos: {}, mv: []
      });
      d.tot += tot;
      d.cm += Number(r.comensales || 0);
      d.cp += Number(r.comprobantes || 0);
      d.cajas.push(c);
      for (const [k, p] of Object.entries(r.pagos || {})) d.pagos[k] = (d.pagos[k] || 0) + Number(p.total || 0);
      for (const [k, p] of Object.entries(r.secciones || {})) d.secs[k] = (d.secs[k] || 0) + Number(p.ventas || 0);
      for (const [k, p] of Object.entries(r.mozos || {})) {
        const m = d.mozos[k] || (d.mozos[k] = { ops: 0, ventas: 0 });
        m.ops += Number(p.ops || 0);
        m.ventas += Number(p.ventas || 0);
      }
      for (const x of (r.movimientos || [])) d.mv.push({ caja: c, tipo: x.tipo, detalle: x.detalle, monto: Number(x.monto || 0) });
    }
    const days = Object.values(byDay).sort((a, b) => a.d.localeCompare(b.d));
    const gaps = [];
    for (let c = cMin; c <= cMax; c++) if (!cajaSet.has(c)) gaps.push(c);
    const gapRanges = [];
    for (const c of gaps) {
      if (gapRanges.length && c === gapRanges[gapRanges.length - 1][1] + 1) gapRanges[gapRanges.length - 1][1] = c;
      else gapRanges.push([c, c]);
    }
    const gapsTxt = gapRanges.map(([a, b]) => (a === b ? String(a) : `${a}–${b}`)).join(", ");
    S.cierres = { rows, days, byDay, nCierres: rows.length, histTotal, cMin, cMax, gapsTxt };
    return S.cierres;
  }

  async function route() {
    const h = (location.hash || "#/inicio").replace(/^#/, "");
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return renderLogin();
    if (!S.perfil) {
      const { data, error } = await sb.from("perfiles").select("nombre,rol,activo").eq("id", session.user.id).maybeSingle();
      if (error || !data || !data.activo) { await sb.auth.signOut(); return renderLogin("Tu usuario no tiene acceso. Pedíselo a administración."); }
      S.perfil = data;
    }
    try {
      if (h === "/cierres" && can("cierres")) return await renderCierres();
      if (h === "/catalogo" && can("catalogo")) return await renderCatalogo();
      if (h === "/stock" && can("stock")) return await renderStock();
      if (h === "/novedades" && can("novedades")) return await renderNovedades();
      if (!can("catalogo") && can("stock") && h !== "/inicio") { location.hash = "#/stock"; return; }
      return await renderHome();
    } catch (e) { console.error(e); app.innerHTML = `<div class="wrap"><div class="alert warn">No se pudieron cargar los datos: ${esc(e.message || e)}</div></div>`; }
  }

  function shell(title, sub, body, extra, wide) {
    const links = [["#/inicio", "Inicio", true], ["#/cierres", "Cierres", can("cierres")],
      ["#/catalogo", "Catálogo", can("catalogo")], ["#/stock", "Ingreso de stock", can("stock")],
      ["#/novedades", "Novedades", can("novedades")]].filter((x) => x[2]);
    const here = location.hash || "#/inicio";
    return `<header class="top"><div class="toprow"><div>
      <h1>Mala Fama PDE · <span>${esc(title)}</span> <span class="badge">prueba</span></h1>
      <div class="sub">${sub}</div></div>
      <div class="who">${esc(S.perfil.nombre)}<br><b>${esc(ROL_LABEL[rol()] || rol())}</b><br><a href="#" id="salir">Salir</a></div></div>
      <nav class="nav">${links.map(([h, l]) => `<a href="${h}" class="${here === h ? "on" : ""}">${l}</a>`).join("")}</nav>
      ${extra || ""}</header>${body}`;
  }
  function bindSalir() {
    const a = $("#salir"); if (a) a.onclick = async (e) => { e.preventDefault(); await sb.auth.signOut(); S.perfil = null; S.items = null; S.nov = null; S.cierres = null; S.cDia = null; location.hash = "#/inicio"; route(); };
  }

  function renderLogin(msg) {
    app.innerHTML = `<div class="login"><div class="loginbox">
      <h1>Mala Fama PDE · <span>Control</span> <span class="badge">prueba</span></h1>
      <div class="sub">Entrá con tu usuario y contraseña. Lo que podés ver depende de tu rol.</div>
      ${msg ? `<div class="alert warn" style="margin-top:12px">${esc(msg)}</div>` : ""}
      <form id="fLogin" autocomplete="on">
        <div class="field"><label for="email">Usuario o correo</label><input id="email" type="text" autocapitalize="none" autocomplete="username" required></div>
        <div class="field"><label for="pass">Contraseña</label><input id="pass" type="password" autocomplete="current-password" required></div>
        <button class="btn" type="submit" id="bEntrar">Entrar</button>
      </form></div></div>`;
    $("#fLogin").onsubmit = async (e) => {
      e.preventDefault();
      let u = $("#email").value.trim().toLowerCase();
      if (!u.includes("@")) u += "@malafama.local";
      $("#bEntrar").disabled = true;
      const { error } = await sb.auth.signInWithPassword({ email: u, password: $("#pass").value });
      if (error) { $("#bEntrar").disabled = false; return renderLogin("Usuario o contraseña incorrectos."); }
      S.perfil = null; location.hash = "#/inicio"; route();
    };
  }

  async function renderHome() {
    const cards = [];
    if (can("cierres")) {
      let ultTxt = "Entrar para ver el detalle";
      let ultVal = "";
      try {
        const { data } = await sb.from("cierres").select("jornada,total_ventas").order("jornada", { ascending: false }).limit(5);
        if (data && data.length) {
          const d0 = data[0].jornada;
          const sum = data.filter((x) => x.jornada === d0).reduce((a, x) => a + Number(x.total_ventas || 0), 0);
          ultVal = $r(sum);
          ultTxt = `Último cierre, ${dow(d0)} ${dmy(d0)}`;
        }
      } catch (_) {}
      cards.push(`<a class="opt" href="#/cierres"><div class="ic">💵</div><div class="t">Cierres de caja</div>
        <div class="d">Lo que entra cada noche, medios de pago, secciones y comparación con el año pasado.</div>
        ${ultVal ? `<div class="kpi-mini">${ultVal}<span>${ultTxt}</span></div>` : ""}
        <div class="go">Entrar →</div></a>`);
      cards.push(`<a class="opt soon" href="#"><div class="ic">🍕</div><div class="t">Ventas <span class="tag">paso 2</span></div>
        <div class="d">Lo que se vende por familia y producto con los CSV de Vectio.</div><div class="go">Próximamente</div></a>`);
      cards.push(`<a class="opt soon" href="#"><div class="ic">⚖️</div><div class="t">Consumos vs compras <span class="tag">paso 3</span></div>
        <div class="d">El cruce entre FacturaExpress y las ventas arranca después de Ventas.</div><div class="go">Próximamente</div></a>`);
    }
    if (can("catalogo")) cards.push(`<a class="opt" href="#/catalogo"><div class="ic">🏷️</div><div class="t">Catálogo</div>
      <div class="d">Artículos de FacturaExpress en Cocina, Barra, Cocina y Barra u Otros. Acá se acomodan los "a revisar".</div><div class="go">Entrar →</div></a>`);
    if (can("stock")) cards.push(`<a class="opt" href="#/stock"><div class="ic">📦</div><div class="t">Ingreso de stock</div>
      <div class="d">Recuento de mercadería por categoría, pensado para la tablet.</div><div class="go">Entrar →</div></a>`);
    if (can("novedades")) cards.push(`<a class="opt" href="#/novedades"><div class="ic">🆕</div><div class="t">Novedades de la semana</div>
      <div class="d">Proveedores y artículos que aparecen por primera vez en la última carga.</div><div class="go">Entrar →</div></a>`);
    if (!can("cierres") && can("catalogo")) {
      cards.push(`<a class="opt soon" href="#"><div class="ic">⚖️</div><div class="t">Consumos vs compras <span class="tag">próximamente</span></div>
        <div class="d">El cruce con ventas y recetas viene después.</div><div class="go">Más adelante</div></a>`);
    }
    const wide = can("cierres");
    app.innerHTML = shell("Inicio", "Versión de prueba de la herramienta nueva. El dashboard actual sigue igual.",
      `<div class="wrap${wide ? " wide" : ""}"><div class="opts${wide ? " tres" : ""}">${cards.join("")}</div></div>`);
    bindSalir();
  }

  function varHtml(a, b) {
    if (!b) return "";
    const p = ((a - b) / b) * 100;
    return `<span class="${p >= 0 ? "up" : "down"}">${p >= 0 ? "+" : ""}${p.toFixed(0)}%</span>`;
  }

  async function renderCierres() {
    app.innerHTML = shell("Cierres de caja", "Cargando datos desde Supabase…", `<div class="wrap wide"><p class="sub">Leyendo cierres…</p></div>`);
    bindSalir();
    const C = await loadCierres();
    const { days, byDay } = C;
    const first = days[0], last = days[days.length - 1];
    if (!S.cDia || !byDay[S.cDia]) S.cDia = last.d;
    const yr = Number(last.d.slice(0, 4)), prevYr = yr - 1;
    const curMm = Number(last.d.slice(5, 7)), curDd = Number(last.d.slice(8, 10));
    const ymNow = last.d.slice(0, 7);
    const ymPrev = `${prevYr}-${last.d.slice(5, 7)}`;

    const rng = (a, b) => {
      const ds = days.filter((x) => x.d >= a && x.d <= b);
      return { tot: ds.reduce((s, x) => s + x.tot, 0), n: ds.length, cm: ds.reduce((s, x) => s + x.cm, 0), cp: ds.reduce((s, x) => s + x.cp, 0) };
    };
    const wIni = addDays(last.d, -6), wPrevIni = `${prevYr}${wIni.slice(4)}`, wPrevFin = `${prevYr}${last.d.slice(4)}`;
    const sem = rng(wIni, last.d), semPrev = rng(wPrevIni, wPrevFin);
    const mes = rng(`${ymNow}-01`, last.d), mesPrev = rng(`${ymPrev}-01`, `${ymPrev}-${String(curDd).padStart(2, "0")}`);
    const ytd = rng(`${yr}-01-01`, last.d), ytdPrev = rng(`${prevYr}-01-01`, `${prevYr}-${last.d.slice(5)}`);

    const u14 = [];
    for (let i = 13; i >= 0; i--) {
      const iso = addDays(last.d, -i);
      u14.push(byDay[iso] || { d: iso, tot: null, cm: 0, cp: 0, secs: {} });
    }
    const meses = [];
    for (let m = 1; m <= curMm; m++) {
      const mm = String(m).padStart(2, "0");
      const cut = m === curMm ? String(curDd).padStart(2, "0") : "31";
      const rA = rng(`${prevYr}-${mm}-01`, `${prevYr}-${mm}-${cut}`);
      const rB = rng(`${yr}-${mm}-01`, `${yr}-${mm}-${cut}`);
      meses.push({ m, yA: rA.tot, nA: rA.n, yB: rB.tot, nB: rB.n });
    }
    const allMonths = [...new Set(days.map((x) => x.d.slice(0, 7)))].sort().reverse();
    const ticket = last.cp ? Math.round(last.tot / last.cp) : 0;
    const por = last.cm ? Math.round(last.tot / last.cm) : 0;

    app.innerHTML = shell(
      "Cierres de caja",
      `Datos reales del ${dmy(first.d)} al ${dmy(last.d)} · ${nf(C.nCierres)} cierres (${nf(days.length)} jornadas) · Solo administración.`,
      `<div class="wrap wide">
        <div class="alert">Los datos vienen de la tabla <b>cierres</b> en Supabase. Solo vos los ves. El dashboard anterior sigue funcionando en paralelo hasta que me digas que lo apague.</div>
        <div class="kpis">
          <div class="kpi"><div class="l">Último cierre</div><div class="v">${$r(last.tot)}</div><div class="s">${dow(last.d)} ${dmy(last.d)} · ${nf(last.cm)} comensales · ticket ${$r(ticket)} · ${$r(por)} por persona</div></div>
          <div class="kpi"><div class="l">Semana ${wIni.slice(8, 10)} al ${last.d.slice(8, 10)}/${last.d.slice(5, 7)}</div><div class="v">${$k(sem.tot)}</div><div class="s">${sem.n} noches · ${nf(sem.cm)} comensales · ${varHtml(sem.tot, semPrev.tot)} vs ${prevYr} (${semPrev.n} noches con cierre)</div></div>
          <div class="kpi"><div class="l">${MES_L[curMm]} (1 al ${curDd})</div><div class="v">${$k(mes.tot)}</div><div class="s">${mes.n} días con cierre · ${varHtml(mes.tot, mesPrev.tot)} vs ${prevYr} (${mesPrev.n} días con cierre)</div></div>
          <div class="kpi"><div class="l">${yr}, hasta el ${last.d.slice(8, 10)}/${last.d.slice(5, 7)}</div><div class="v">${$k(ytd.tot)}</div><div class="s">${ytd.n} días con cierre · ${varHtml(ytd.tot, ytdPrev.tot)} vs ${prevYr} (${ytdPrev.n} días). En ${prevYr} faltan cierres; no son noches de $0.</div></div>
        </div>
        <div class="charts">
          <div class="card"><h3>Últimos 14 días</h3><p class="hint">Total del día, en pesos.</p><div class="chartbox"><canvas id="c14"></canvas></div></div>
          <div class="card"><h3>Mes contra mes</h3><p class="hint">${yr} frente a ${prevYr}. ${MES_L[curMm]} hasta el día ${curDd}. Solo días con cierre recibido.</p><div class="chartbox"><canvas id="cmes"></canvas></div></div>
        </div>
        <div class="card">
          <div class="cardhead">
            <div><h3>Detalle por día</h3><p class="hint" style="margin:0">Tocá un día para ver sus medios de pago, mozos y movimientos de caja abajo.</p></div>
            <select class="fil" id="cPerSel">
              <option value="14d"${S.cPer === "14d" ? " selected" : ""}>Últimos 14 días</option>
              ${allMonths.map((m) => `<option value="${m}"${S.cPer === m ? " selected" : ""}>${MES_L[Number(m.slice(5))]} ${m.slice(0, 4)}</option>`).join("")}
            </select>
          </div>
          <div class="scroll"><table>
            <thead><tr><th class="l">Día</th><th>Total</th><th>Mesas</th><th>Delivery</th><th>Comensales</th><th>Comprobantes</th><th>Ticket</th></tr></thead>
            <tbody id="cDaysBody"></tbody>
          </table></div>
        </div>
        <div class="charts" id="cDet"></div>
        <div id="cMov"></div>
        <p class="foot">Total histórico en la base: ${$r(C.histTotal)} en ${nf(C.nCierres)} cajas (N° ${C.cMin}–${C.cMax}).${C.gapsTxt ? ` Faltan cierres N° ${C.gapsTxt} (no llegaron por mail).` : ""}</p>
      </div>`
    );
    bindSalir();

    function drawTable() {
      const rows = S.cPer === "14d" ? u14 : days.filter((x) => x.d.startsWith(S.cPer));
      $("#cDaysBody").innerHTML = rows.map((r) => {
        if (r.tot == null) return `<tr><td class="l">${dmy(r.d)} <span class="dow">${dow(r.d)}</span></td><td colspan="6" class="muted">Sin cierre recibido</td></tr>`;
        const on = r.d === S.cDia ? " on" : "";
        return `<tr class="pick${on}" data-d="${r.d}"><td class="l">${dmy(r.d)} <span class="dow">${dow(r.d)}</span></td>
          <td>${$r(r.tot)}</td><td>${$r(r.secs.MESAS || 0)}</td><td>${$r(r.secs.DELIVERY || 0)}</td>
          <td>${nf(r.cm)}</td><td>${nf(r.cp)}</td><td>${r.cp ? $r(r.tot / r.cp) : "—"}</td></tr>`;
      }).join("");
    }

    function drawDayDetail() {
      const sel = byDay[S.cDia] || last;
      const pagos = Object.entries(sel.pagos).sort((a, b) => b[1] - a[1]);
      const mozos = Object.entries(sel.mozos).sort((a, b) => b[1].ventas - a[1].ventas);
      $("#cDet").innerHTML = `
        <div class="card">
          <h3>Medios de pago · ${dmy(sel.d)}</h3>
          <p class="hint">${dow(sel.d)} · Total ${$r(sel.tot)} (${sel.cajas.map((c) => "caja " + c).join(", ")})</p>
          <table><thead><tr><th class="l">Medio</th><th>Total</th></tr></thead>
          <tbody>${pagos.map(([k, v]) => `<tr><td class="l">${esc(k)}</td><td>${$r(v)}</td></tr>`).join("")}</tbody></table>
        </div>
        <div class="card">
          <h3>Mozos · ${dmy(sel.d)}</h3>
          <p class="hint">Ventas por mozo o estación, ese mismo día.</p>
          <table><thead><tr><th class="l">Mozo</th><th>Ops</th><th>Ventas</th></tr></thead>
          <tbody>${mozos.map(([k, m]) => `<tr><td class="l">${esc(k)}</td><td>${nf(m.ops)}</td><td>${$r(m.ventas)}</td></tr>`).join("")}</tbody></table>
        </div>`;
      $("#cMov").innerHTML = sel.mv.length ? `<div class="card">
        <h3>Movimientos de caja · ${dmy(sel.d)}</h3>
        <p class="hint">Entradas y salidas registradas en caja (no son ventas).</p>
        <table><thead><tr><th class="l">Tipo</th><th class="l">Detalle</th><th>Monto</th></tr></thead>
        <tbody>${sel.mv.map((x) => `<tr><td class="l">${esc(x.tipo)}</td><td class="l">${esc(x.detalle)}</td><td>${$r(x.monto)}</td></tr>`).join("")}</tbody></table>
      </div>` : "";
    }

    drawTable();
    drawDayDetail();
    $("#cPerSel").onchange = (e) => { S.cPer = e.target.value; drawTable(); };
    $("#cDaysBody").onclick = (e) => {
      const tr = e.target.closest("tr.pick"); if (!tr) return;
      S.cDia = tr.dataset.d;
      drawTable();
      drawDayDetail();
    };

    if (window.Chart) {
      Object.values(S.cCharts).forEach((ch) => ch && ch.destroy && ch.destroy());
      const tick = { color: "#8b93a7", font: { size: 11 } };
      const grid = { color: "#262a35" };
      const money = (v) => (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + " M" : Math.abs(v) >= 1e3 ? Math.round(v / 1e3) + " mil" : String(v));
      S.cCharts.c14 = new Chart($("#c14"), {
        type: "bar",
        data: {
          labels: u14.map((r) => r.d.slice(8) + "/" + r.d.slice(5, 7)),
          datasets: [{ data: u14.map((r) => r.tot), backgroundColor: "#f5b301", borderRadius: 4, maxBarThickness: 28 }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => (x.raw == null ? "Sin cierre" : $r(x.raw)) } } },
          scales: { x: { ticks: tick, grid: { display: false } }, y: { ticks: { ...tick, callback: money }, grid } },
        },
      });
      S.cCharts.cmes = new Chart($("#cmes"), {
        type: "bar",
        data: {
          labels: meses.map((m) => MES[m.m]),
          datasets: [
            { label: String(prevYr), data: meses.map((m) => m.yA), backgroundColor: "#8b93a7", borderRadius: 3, maxBarThickness: 16 },
            { label: String(yr), data: meses.map((m) => m.yB), backgroundColor: "#f5b301", borderRadius: 3, maxBarThickness: 16 },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: "#e8ebf2", boxWidth: 12 } },
            tooltip: { callbacks: { label: (x) => `${x.dataset.label}: ${$r(x.raw)}` } },
          },
          scales: { x: { ticks: tick, grid: { display: false } }, y: { ticks: { ...tick, callback: money }, grid } },
        },
      });
    }
  }

  function selCat(it) {
    return `<select class="cat" data-id="${it.id}">${CATS.map((c) => `<option${c === it.categoria ? " selected" : ""}>${c}</option>`).join("")}</select>`;
  }
  function estPill(e) {
    return e === "a_revisar" ? `<span class="pill w">a revisar</span>` : e === "confirmado" ? `<span class="pill ok">confirmado</span>` : `<span class="pill">auto</span>`;
  }
  function rowItem(it, edit) {
    return `<tr data-id="${it.id}"><td class="l"><div class="prod">${esc(it.producto)}</div>
      <div class="meta">${esc(it.razon_social)}${it.unidad ? " · " + esc(it.unidad) : ""}${it.motivo ? " · " + esc(it.motivo) : ""}</div></td>
      <td>${edit ? selCat(it) : `<span class="pill ${pill(it.categoria)}">${esc(it.categoria)}</span>`}<span class="est">${estPill(it.estado)}</span></td>
      <td>${it.ultimo_precio == null ? "—" : $u(it.ultimo_precio, it.moneda_ultimo)}</td><td>${$u(it.monto_uyu, "UYU")}</td></tr>`;
  }
  function bindEdits(root) {
    root.querySelectorAll("select.cat").forEach((el) => {
      el.onchange = async () => {
        const id = +el.dataset.id, cat = el.value;
        el.disabled = true;
        const { error } = await sb.from("articulos").update({ categoria: cat, estado: "confirmado" }).eq("id", id);
        el.disabled = false;
        if (error) return toast("No se pudo guardar: " + error.message, false);
        const it = S.items && S.items.find((x) => x.id === id);
        if (it) { it.categoria = cat; it.estado = "confirmado"; }
        const tr = el.closest("tr"); if (tr) tr.querySelector(".est").innerHTML = estPill("confirmado");
        toast("Guardado: " + cat, true);
      };
    });
  }

  async function renderCatalogo() {
    app.innerHTML = shell("Catálogo de compras", "Cargando artículos…", `<div class="wrap"><div class="empty">Cargando…</div></div>`); bindSalir();
    const items = await loadItems();
    const provs = [...new Map(items.map((i) => [i.rut, i.razon_social])).entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
    const k = {}; CATS.forEach((c) => (k[c] = 0)); items.forEach((i) => (k[i.categoria] = (k[i.categoria] || 0) + 1));
    const revisa = items.filter((i) => i.estado === "a_revisar");
    const fechas = items.map((i) => i.ultima_fecha).filter(Boolean).sort();
    app.innerHTML = shell("Catálogo de compras",
      `Artículos desde FacturaExpress${fechas.length ? ", hasta el " + dmy(fechas[fechas.length - 1]) : ""}. Cambiar la categoría la guarda al momento y la marca como confirmada.`,
      `<div class="wrap">
      <div class="kpis">
        <div class="kpi"><div class="l">Artículos</div><div class="v">${nf(items.length)}</div><div class="s">${nf(provs.length)} proveedores</div></div>
        ${CATS.map((c) => `<div class="kpi"><div class="l">${c}</div><div class="v">${nf(k[c])}</div><div class="s">${c === "Otros" ? "No entran al recuento" : "Para la lista de stock"}</div></div>`).join("")}
        <div class="kpi warn"><div class="l">A revisar</div><div class="v" id="kRev">${nf(revisa.length)}</div><div class="s">Hay que acomodarlos</div></div>
      </div>
      <div class="card" id="cardRevisar"><h3>A revisar</h3>
        <div class="hint">La clasificación automática no está segura. Elegí la categoría y queda confirmada.</div>
        ${revisa.length ? `<div class="scroll"><table><thead><tr><th class="l">Artículo / proveedor</th><th>Categoría</th><th>Último precio</th><th>Monto</th></tr></thead>
        <tbody>${revisa.map((i) => rowItem(i, true)).join("")}</tbody></table></div>` : `<div class="empty">No hay artículos en duda. 🎉</div>`}
      </div>
      <div class="card"><h3>Catálogo completo</h3><div class="hint">Filtrá por categoría, proveedor o nombre. Podés cambiar la categoría de cualquier artículo.</div>
        <div class="barf"><div class="seg" id="segCat"></div>
          <select class="fil" id="filProv"><option value="">Todos los proveedores</option>${provs.map(([r, n]) => `<option value="${esc(r)}">${esc(n)}</option>`).join("")}</select>
          <input type="search" id="qCat" placeholder="Buscar artículo…" autocomplete="off"></div>
        <div class="scroll" id="tblCat"></div></div></div>`);
    bindSalir(); bindEdits($("#cardRevisar"));
    $("#filProv").value = S.prov; $("#qCat").value = S.q;
    const draw = () => {
      const seg = $("#segCat"); seg.innerHTML = "";
      ["Todas", "A revisar", ...CATS].forEach((l) => { const b = document.createElement("button"); b.textContent = l; b.className = l === S.catOn ? "on" : ""; b.onclick = () => { S.catOn = l; draw(); }; seg.appendChild(b); });
      const q = S.q.trim().toLowerCase();
      const rows = items.filter((i) => (!S.prov || i.rut === S.prov) && (S.catOn !== "A revisar" || i.estado === "a_revisar")
        && (!CATS.includes(S.catOn) || i.categoria === S.catOn) && (!q || (i.producto + " " + i.razon_social).toLowerCase().includes(q)));
      const show = rows.slice(0, 300);
      $("#tblCat").innerHTML = `<table><thead><tr><th class="l">Artículo / proveedor (${nf(rows.length)}${rows.length > 300 ? ", se muestran 300; filtrá para ver más" : ""})</th><th>Categoría</th><th>Último precio</th><th>Monto</th></tr></thead>
        <tbody>${show.map((i) => rowItem(i, true)).join("")}</tbody></table>`;
      bindEdits($("#tblCat"));
    };
    $("#qCat").oninput = (e) => { S.q = e.target.value; draw(); };
    $("#filProv").onchange = (e) => { S.prov = e.target.value; draw(); };
    draw();
  }

  async function renderNovedades() {
    app.innerHTML = shell("Novedades de la semana", "Cargando…", `<div class="wrap"><div class="empty">Cargando…</div></div>`); bindSalir();
    const { data: ing } = await sb.from("ingestas").select("*").order("id", { ascending: false }).limit(1);
    const last = ing && ing[0];
    if (!last) { app.innerHTML = shell("Novedades de la semana", "Todavía no hay cargas semanales.", ""); return bindSalir(); }
    const nov = await fetchAll("novedades", "tipo,rut,articulo_id,primera_fecha", (q) => q.eq("ingesta_id", last.id));
    const items = await loadItems(); const byId = new Map(items.map((i) => [i.id, i]));
    const provRows = await fetchAll("v_proveedores", "rut,razon_social,categoria_default,estado,monto_uyu", (q) => q.in("rut", nov.filter((n) => n.tipo === "proveedor").map((n) => n.rut).concat(["-"])));
    const arts = nov.filter((n) => n.tipo === "articulo").map((n) => byId.get(n.articulo_id)).filter(Boolean).sort((a, b) => b.monto_uyu - a.monto_uyu);
    const fp = Object.fromEntries(nov.filter((n) => n.tipo === "proveedor").map((n) => [n.rut, n.primera_fecha]));
    app.innerHTML = shell("Novedades de la semana",
      `Primera aparición entre ${dmy(last.desde)} y ${dmy(last.hasta)} · archivo cargado el ${dmy((last.creado_en || "").slice(0, 10))} (${nf(last.leidas)} líneas, ${nf(last.nuevas)} nuevas).`,
      `<div class="wrap"><div class="kpis"><div class="kpi"><div class="l">Proveedores nuevos</div><div class="v">${provRows.length}</div></div>
        <div class="kpi"><div class="l">Artículos nuevos</div><div class="v">${arts.length}</div></div></div>
      <div class="card"><h3>Proveedores nuevos (${provRows.length})</h3>${provRows.length ? `<table><thead><tr><th class="l">Proveedor</th><th>Categoría sugerida</th><th>Primera compra</th><th>Monto año</th></tr></thead><tbody>
        ${provRows.map((s) => `<tr><td class="l"><div class="prod">${esc(s.razon_social)}</div><div class="meta">${esc(s.rut)}</div></td><td><span class="pill ${pill(s.categoria_default)}">${esc(s.categoria_default || "—")}</span>${s.estado === "a_revisar" ? ' <span class="pill w">a revisar</span>' : ""}</td><td>${dmy(fp[s.rut])}</td><td>${$u(s.monto_uyu, "UYU")}</td></tr>`).join("")}
        </tbody></table>` : `<div class="empty">No hay.</div>`}</div>
      <div class="card" id="cardNovA"><h3>Artículos nuevos (${arts.length})</h3><div class="hint">Vienen con una categoría sugerida; si está mal, cambiala acá mismo.</div>
        <div class="scroll"><table><thead><tr><th class="l">Artículo / proveedor</th><th>Categoría</th><th>Último precio</th><th>Monto</th></tr></thead>
        <tbody>${arts.map((i) => rowItem(i, true)).join("")}</tbody></table></div></div></div>`);
    bindSalir(); bindEdits($("#cardNovA"));
  }

  async function renderStock() {
    const cats = STOCK_CATS[rol()];
    if (!S.stockCat || !cats.includes(S.stockCat)) S.stockCat = cats[0];
    if (!S.stock) {
      app.innerHTML = shell("Ingreso de stock", "Cargando artículos…", ""); bindSalir();
      S.stock = await fetchAll("articulos", "id,rut,producto,categoria,unidad,proveedores(razon_social)", (q) => q.in("categoria", cats).order("producto"));
    }
    const extra = `<div class="barstock"><label>Fecha</label><input type="date" id="fecha" value="${S.fecha}">
      <label>Quién cuenta</label><input type="text" id="quien" placeholder="Nombre" value="${esc(S.quien)}" autocomplete="off">
      <input type="search" id="qStock" placeholder="Buscar producto…" value="${esc(S.stockQ)}" autocomplete="off" style="min-width:180px;flex:1"></div>
      <div class="tabs" id="tabs"></div>`;
    app.innerHTML = shell("Ingreso de stock", "Contá lo que hay y guardá. Se guarda solo lo que tenga cantidad.",
      `<div class="stock"><main id="list"></main><div class="footfix"><span class="sub" id="stat"></span><button class="btn" type="button" id="guardar">Guardar recuento</button></div></div>`, extra);
    bindSalir();
    $("#fecha").onchange = (e) => (S.fecha = e.target.value);
    $("#quien").oninput = (e) => (S.quien = e.target.value);
    $("#qStock").oninput = (e) => { S.stockQ = e.target.value; S.shown = 60; draw(); };
    cats.forEach((c) => { const b = document.createElement("button"); b.textContent = `${c} (${S.stock.filter((i) => i.categoria === c).length})`; b.className = c === S.stockCat ? "on" : ""; b.onclick = () => { S.stockCat = c; S.shown = 60; renderStock(); }; $("#tabs").appendChild(b); });
    const filled = () => Object.entries(S.qty).filter(([, v]) => v !== "" && v != null && Number(v) >= 0);
    function draw() {
      const q = S.stockQ.trim().toLowerCase();
      const rows = q ? S.stock.filter((i) => (i.producto + " " + (i.proveedores?.razon_social || "")).toLowerCase().includes(q)) : S.stock.filter((i) => i.categoria === S.stockCat);
      const show = rows.slice(0, S.shown);
      $("#list").innerHTML = show.map((it) => `<div class="row" data-id="${it.id}"><div class="meta"><div class="prod" style="font-weight:700;font-size:16px">${esc(it.producto)}</div>
        <div class="meta">${esc(it.proveedores?.razon_social || "")}${it.unidad ? " · " + esc(it.unidad) : ""} · ${esc(it.categoria)}</div></div>
        <div class="qty"><button type="button" data-op="-">−</button><input type="number" min="0" step="any" inputmode="decimal" value="${S.qty[it.id] ?? ""}"><button type="button" data-op="+">+</button></div></div>`).join("")
        + (rows.length > show.length ? `<button class="more" type="button" id="more">Mostrar más (${show.length} de ${rows.length})</button>` : rows.length ? "" : `<div class="empty">No hay artículos con esa búsqueda.</div>`);
      $("#stat").textContent = `${filled().length} con cantidad`;
      if ($("#more")) $("#more").onclick = () => { S.shown += 80; draw(); };
    }
    $("#list").onclick = (e) => {
      const b = e.target.closest("button[data-op]"); if (!b) return;
      const row = b.closest(".row"), inp = row.querySelector("input");
      let n = Number(inp.value || 0); n = b.dataset.op === "+" ? n + 1 : Math.max(0, n - 1);
      inp.value = n; S.qty[row.dataset.id] = n; $("#stat").textContent = `${filled().length} con cantidad`;
    };
    $("#list").oninput = (e) => { const inp = e.target.closest("input"); if (!inp) return; S.qty[inp.closest(".row").dataset.id] = inp.value; $("#stat").textContent = `${filled().length} con cantidad`; };
    draw();
    $("#guardar").onclick = async () => {
      const f = filled(); if (!f.length) return toast("Cargá al menos una cantidad.", false);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(S.fecha)) return toast("Falta la fecha.", false);
      const byId = new Map(S.stock.map((i) => [String(i.id), i]));
      const rows = f.map(([id, v]) => ({ fecha: S.fecha, articulo_id: +id, categoria: byId.get(String(id)).categoria, cantidad: Number(v), cargado_por_nombre: S.quien || null }));
      $("#guardar").disabled = true;
      const { error } = await sb.from("recuentos_stock").insert(rows);
      $("#guardar").disabled = false;
      if (error) return toast("No se pudo guardar: " + error.message, false);
      S.qty = {}; draw(); toast(`Guardado: ${rows.length} productos del ${dmy(S.fecha)}.`, true);
    };
  }

  window.addEventListener("hashchange", route);
  sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT") { S.perfil = null; } });
  route();
})();
