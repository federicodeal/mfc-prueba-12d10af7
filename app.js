/* Mala Fama Control · fase 1 (prueba). Supabase Auth + datos con RLS. */
(function () {
  const CATS = ["Cocina", "Barra", "Cocina y Barra", "Otros"];
  const STOCK_CATS = { admin: ["Cocina", "Barra", "Cocina y Barra"], encargado: ["Cocina", "Barra", "Cocina y Barra"],
    stock: ["Cocina", "Barra", "Cocina y Barra"], cocina: ["Cocina", "Cocina y Barra"], barra: ["Barra", "Cocina y Barra"] };
  const ROL_LABEL = { admin: "Administración", encargado: "Encargado", cocina: "Cocina", barra: "Barra", stock: "Tablet de stock", ingesta: "Carga automática" };
  const sb = window.supabase.createClient(MF_CONFIG.url, MF_CONFIG.key, { auth: { persistSession: true } });
  const $ = (s, el = document) => el.querySelector(s);
  const app = $("#app");
  const S = { perfil: null, items: null, nov: null, catOn: "Todas", prov: "", q: "",
    stockCat: null, stockQ: "", shown: 60, qty: {}, fecha: hoy(), quien: "" };

  function hoy() { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
  const pill = (c) => ({ Cocina: "ok", Barra: "bar", "Cocina y Barra": "mid", Otros: "bad" }[c] || "");
  const nf = (n) => (n || 0).toLocaleString("es-UY", { maximumFractionDigits: 0 });
  const $u = (n, mon) => (mon === "USD" ? "US$ " : "$ ") + (n == null ? "—" : Number(n).toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const dmy = (s) => (!s ? "—" : s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4));
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const rol = () => S.perfil && S.perfil.rol;
  const can = (sec) => {
    const r = rol(); if (!r) return false;
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
      if (h === "/catalogo" && can("catalogo")) return await renderCatalogo();
      if (h === "/stock" && can("stock")) return await renderStock();
      if (h === "/novedades" && can("novedades")) return await renderNovedades();
      if (!can("catalogo") && can("stock") && h !== "/inicio") { location.hash = "#/stock"; return; }
      return renderHome();
    } catch (e) { console.error(e); app.innerHTML = `<div class="wrap"><div class="alert warn">No se pudieron cargar los datos: ${esc(e.message || e)}</div></div>`; }
  }

  function shell(title, sub, body, extra) {
    const links = [["#/inicio", "Inicio", true], ["#/catalogo", "Catálogo", can("catalogo")],
      ["#/stock", "Ingreso de stock", can("stock")], ["#/novedades", "Novedades", can("novedades")]].filter((x) => x[2]);
    const here = location.hash || "#/inicio";
    return `<header class="top"><div class="toprow"><div>
      <h1>Mala Fama PDE · <span>${esc(title)}</span> <span class="badge">prueba</span></h1>
      <div class="sub">${sub}</div></div>
      <div class="who">${esc(S.perfil.nombre)}<br><b>${esc(ROL_LABEL[rol()] || rol())}</b><br><a href="#" id="salir">Salir</a></div></div>
      <nav class="nav">${links.map(([h, l]) => `<a href="${h}" class="${here === h ? "on" : ""}">${l}</a>`).join("")}</nav>
      ${extra || ""}</header>${body}`;
  }
  function bindSalir() {
    const a = $("#salir"); if (a) a.onclick = async (e) => { e.preventDefault(); await sb.auth.signOut(); S.perfil = null; S.items = null; S.nov = null; location.hash = "#/inicio"; route(); };
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
    if (can("catalogo")) cards.push(`<a class="opt" href="#/catalogo"><div class="ic">🏷️</div><div class="t">Catálogo</div>
      <div class="d">Artículos de FacturaExpress en Cocina, Barra, Cocina y Barra u Otros. Acá se acomodan los "a revisar".</div><div class="go">Entrar →</div></a>`);
    if (can("stock")) cards.push(`<a class="opt" href="#/stock"><div class="ic">📦</div><div class="t">Ingreso de stock</div>
      <div class="d">Recuento de mercadería por categoría, pensado para la tablet.</div><div class="go">Entrar →</div></a>`);
    if (can("novedades")) cards.push(`<a class="opt" href="#/novedades"><div class="ic">🆕</div><div class="t">Novedades de la semana</div>
      <div class="d">Proveedores y artículos que aparecen por primera vez en la última carga.</div><div class="go">Entrar →</div></a>`);
    cards.push(`<a class="opt soon" href="#"><div class="ic">⚖️</div><div class="t">Consumos vs compras <span class="tag">fase 2</span></div>
      <div class="d">El cruce con ventas y recetas viene después.</div><div class="go">Más adelante</div></a>`);
    app.innerHTML = shell("Tablero", "Versión de prueba de la herramienta nueva. El dashboard actual sigue igual.",
      `<div class="wrap"><div class="opts">${cards.join("")}</div></div>`);
    bindSalir();
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
