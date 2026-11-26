/* Mala Fama Control · Carta / Recetas (prueba). Solo admin; los datos vienen de Supabase con RLS. */
(function () {
  const CATS_ORDER = ["preparados_cocina", "preparados_barra", "1_1", "entradas", "principales", "pizzas", "postres", "tragos", "vinos", "refrescos"];
  const FOOD = ["entradas", "principales", "pizzas", "postres"];
  const V = { tab: "carta", q: "", filtro: "todo", open: {}, data: null };
  const ESTADO = { completa: ["ok", "receta completa"], parcial: ["w", "receta incompleta"], pendiente: ["bad", "receta pendiente"], no_aplica: null };
  const money = (n) => (n == null ? "" : "$" + Math.round(n).toLocaleString("es-UY"));
  const norm = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  async function fetchAll(sb, table, select, order) {
    let out = [], from = 0;
    for (;;) {
      let q = sb.from(table).select(select).range(from, from + 999);
      if (order) q = q.order(order);
      const { data, error } = await q;
      if (error) throw error;
      out = out.concat(data);
      if (data.length < 1000) return out;
      from += 1000;
    }
  }

  async function load(M) {
    if (V.data) return V.data;
    const sb = M.sb;
    const [cats, items, recetas, links, conf, sync] = await Promise.all([
      fetchAll(sb, "carta_categorias", "*", "orden"),
      fetchAll(sb, "carta_items", "id,nombre,categoria,seccion_carta,precio,en_carta,aliases_vectio,alias_nombres,vectio_cant,vectio_monto,vectio_periodo,receta_estado,notas", "id"),
      fetchAll(sb, "recetas", "id,clave,nombre,categoria,rinde,estado,en_doc,confirmado,actualizado_en", "nombre"),
      fetchAll(sb, "item_recetas", "item_id,receta_id,rol", "item_id"),
      fetchAll(sb, "recetas_conflictos", "id,tipo,clave,detalle,creado_en,resuelto", "id"),
      sb.from("carta_sync").select("corrida_en,resumen").order("corrida_en", { ascending: false }).limit(1).then((r) => r.data || []),
    ]);
    V.data = { cats, items, recetas, links, conf, sync: sync[0] };
    return V.data;
  }

  function pill(estado) { const e = ESTADO[estado]; return e ? `<span class="pill ${e[0]}">${e[1]}</span>` : ""; }

  function itemRow(M, it) {
    const ventas = it.vectio_cant != null ? `${Math.round(it.vectio_cant).toLocaleString("es-UY")} vend.<small>${money(it.vectio_monto)}</small>` : "";
    return `<div class="irow" data-item="${it.id}"><span class="nm">${M.esc(it.nombre)} ${pill(it.receta_estado)}${it.en_carta ? "" : '<span class="pill off">fuera de la carta</span>'}</span>
      <span class="pr">${it.precio != null ? money(it.precio) : ""}${ventas ? (it.precio != null ? "<br>" : "") + ventas : ""}</span></div>`;
  }

  function matches(it) {
    if (V.q && !norm([it.nombre, ...(it.aliases_vectio || []), ...(it.alias_nombres || [])].join(" ")).includes(norm(V.q))) return false;
    if (V.filtro === "carta" && !it.en_carta) return false;
    if (V.filtro === "fuera" && it.en_carta) return false;
    if (V.filtro === "pend" && it.receta_estado !== "pendiente") return false;
    return true;
  }

  function cardCat(M, D, cat) {
    const its = D.items.filter((i) => i.categoria === cat.codigo && matches(i))
      .sort((a, b) => (b.en_carta - a.en_carta) || ((b.vectio_monto || 0) - (a.vectio_monto || 0)) || a.nombre.localeCompare(b.nombre));
    const all = D.items.filter((i) => i.categoria === cat.codigo);
    const rec = D.recetas.filter((r) => r.categoria === cat.codigo && (!V.q || norm(r.nombre).includes(norm(V.q))));
    const cls = cat.propuesta ? "ccard prop" : cat.interna ? "ccard int" : "ccard";
    const tag = cat.propuesta ? ' <span class="pill prop">categoría nueva</span>' : cat.interna ? ' <span class="pill int">interna, no sale en la carta</span>' : "";
    let body = "";
    if (cat.interna) {
      if (!rec.length) body = `<p class="cnote">${cat.codigo === "preparados_barra" ? "Todavía sin fórmulas: almíbar de jengibre, jugos y prebatch (1811, Guyunusa, Senaqué, Zapicán, Don José, Negroni). La planilla de barra es de recuento, no de recetas." : "Sin recetas."}</p>`;
      body += rec.slice(0, V.open[cat.codigo] ? 99 : 14).map((r) => `<div class="irow" data-rec="${r.id}"><span class="nm">${M.esc(r.nombre)} ${pill(r.estado === "completa" ? "completa" : "parcial")}</span><span class="pr">${r.rinde ? M.esc(r.rinde.slice(0, 28)) : ""}</span></div>`).join("");
      if (rec.length > 14 && !V.open[cat.codigo]) body += `<button class="more" data-more="${cat.codigo}">Ver las ${rec.length} →</button>`;
      return `<section class="${cls}"><h3><span>${cat.nombre}${tag}</span><span class="c">${rec.length} recetas</span></h3>${body}</section>`;
    }
    const lim = V.open[cat.codigo] ? 999 : 12;
    body = its.slice(0, lim).map((i) => itemRow(M, i)).join("") || '<p class="cnote">Nada con este filtro.</p>';
    if (its.length > lim) body += `<button class="more" data-more="${cat.codigo}">Ver los ${its.length} →</button>`;
    const pend = all.filter((i) => i.receta_estado === "pendiente").length;
    const extra = cat.codigo === "tragos" ? '<p class="cnote">Fernet, rones y whisky van como un solo ítem: la medida de la carta y el "con Coca" de Vectio.</p>' : cat.codigo === "pizzas" ? '<p class="cnote">Hay masa y salsa en el Doc; faltan los toppings de casi todas. Extra queso vegano +$100 (en 1-1).</p>' : "";
    return `<section class="${cls}"><h3><span>${cat.nombre}${tag}</span><span class="c">${all.length} ítems${pend ? ` · ${pend} sin receta` : ""}</span></h3>${body}${extra}</section>`;
  }

  function kpis(D) {
    const carta = D.items.filter((i) => i.en_carta);
    const food = carta.filter((i) => FOOD.includes(i.categoria));
    const conR = food.filter((i) => i.receta_estado === "completa" || i.receta_estado === "parcial").length;
    const pend = food.filter((i) => i.receta_estado === "pendiente").length;
    const tr = D.items.filter((i) => i.categoria === "tragos");
    const trR = tr.filter((i) => i.receta_estado !== "pendiente").length;
    const fuera = D.items.filter((i) => !i.en_carta).length;
    const open = D.conf.filter((c) => !c.resuelto).length;
    return `<div class="kpis5">
      <div class="kpi"><div class="l">Ítems en la carta</div><div class="v">${carta.length}</div><div class="s">en ${D.cats.length} categorías (2 nuevas)</div></div>
      <div class="kpi"><div class="l">Platos con receta</div><div class="v">${conR} / ${food.length}</div><div class="s">completa o a medias (pizzas sin toppings)</div></div>
      <div class="kpi ${pend ? "warn" : ""}"><div class="l">Platos con receta pendiente</div><div class="v">${pend}</div><div class="s">los escribe la jefa en el Doc</div></div>
      <div class="kpi ${trR ? "" : "bad"}"><div class="l">Tragos con receta</div><div class="v">${trR} / ${tr.length}</div><div class="s">sin cantidades no cierra el consumo de barra</div></div>
      <div class="kpi"><div class="l">Fuera de la carta (Vectio)</div><div class="v">${fuera}</div><div class="s">cervezas, refrescos, Negroni, Gin Tonic, Caipi…</div></div></div>`;
  }

  function tabs() {
    const T = [["carta", "Carta"], ["recetas", "Recetas del Doc"], ["conf", "Conflictos y sincronización"]];
    return `<div class="ctabs">${T.map(([k, l]) => `<button data-tab="${k}" class="${V.tab === k ? "on" : ""}">${l}</button>`).join("")}</div>`;
  }

  function viewCarta(M, D) {
    const per = (D.items.find((i) => i.vectio_periodo) || {}).vectio_periodo || "";
    return `<div class="alert">Cada ítem de la carta, en las 10 categorías. Las ventas son de Vectio (${M.esc(per)}). Tocá un ítem para ver sus alias, sus ingredientes y lo que falta.</div>
      ${kpis(D)}
      <div class="cfil"><input type="search" id="q" placeholder="Buscar por nombre o alias" value="${M.esc(V.q)}">
        <select id="fil"><option value="todo">Todo</option><option value="carta">Solo lo que está en la carta</option><option value="fuera">Solo lo de Vectio fuera de carta</option><option value="pend">Solo recetas pendientes</option></select></div>
      <div class="cats">${D.cats.map((c) => cardCat(M, D, c)).join("")}</div>`;
  }

  function viewRecetas(M, D) {
    const nom = Object.fromEntries(D.cats.map((c) => [c.codigo, c.nombre]));
    const itemsDe = {};
    for (const l of D.links) (itemsDe[l.receta_id] = itemsDe[l.receta_id] || []).push(D.items.find((i) => i.id === l.item_id));
    const rows = D.recetas.map((r) => `<tr data-rec="${r.id}" style="cursor:pointer"><td>${M.esc(r.nombre)}</td><td>${nom[r.categoria]}</td>
      <td>${pill(r.estado === "completa" ? "completa" : "parcial")}${r.confirmado ? ' <span class="pill ok">confirmada</span>' : ""}${r.en_doc ? "" : ' <span class="pill bad">ya no está en el Doc</span>'}</td>
      <td>${r.rinde ? M.esc(r.rinde) : '<span class="meta">falta</span>'}</td><td class="l">${(itemsDe[r.id] || []).filter(Boolean).map((i) => M.esc(i.nombre)).join(", ") || '<span class="meta">—</span>'}</td></tr>`).join("");
    const comp = D.recetas.filter((r) => r.estado === "completa").length;
    return `<div class="alert">${D.recetas.length} recetas leídas del Doc <b>Recetas cocina pde</b> (solo lectura): ${comp} completas (con todas las cantidades y el rinde), ${D.recetas.length - comp} incompletas (casi siempre falta el rinde o alguna cantidad).</div>
      <div class="card"><div class="scroll"><table><thead><tr><th>Receta</th><th>Categoría</th><th>Estado</th><th>Rinde</th><th class="l">Se usa en</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  function viewConf(M, D) {
    const abiertos = D.conf.filter((c) => !c.resuelto);
    const s = D.sync;
    const when = s ? new Date(s.corrida_en).toLocaleString("es-UY", { timeZone: "America/Montevideo" }) : "—";
    const r = (s && s.resumen) || {};
    return `<div class="alert"><b>Última sincronización con el Doc:</b> ${when}. ${s ? `Recetas leídas: ${r.recetas_en_doc ?? "—"} · nuevas ${r.nuevas ?? 0} · actualizadas ${r.actualizadas ?? 0} · sin cambios ${r.sin_cambios ?? 0}.` : "Todavía no corrió."}
      El Doc manda en la receta. Si algo choca con lo ya confirmado en la app, no se pisa: aparece acá.</div>
      <div class="card"><h3>Conflictos abiertos (${abiertos.length})</h3>
      ${abiertos.length ? `<table><thead><tr><th>Tipo</th><th>Receta o ítem</th><th class="l">Qué pasó</th></tr></thead><tbody>${abiertos.map((c) => `<tr><td>${M.esc(c.tipo.replace(/_/g, " "))}</td><td>${M.esc(c.clave)}</td><td class="l">${M.esc(c.detalle || "")}</td></tr>`).join("")}</tbody></table>` : '<p class="hint">Ninguno. La carta y el Doc coinciden con lo cargado.</p>'}</div>
      <div class="card"><h3>Pendientes de la jefa de cocina</h3><div class="hint">Platos de la carta sin receta en el Doc. Cuando los escriba con la plantilla, entran solos en la próxima sincronización.</div>
      <table><tbody>${D.items.filter((i) => i.en_carta && FOOD.includes(i.categoria) && i.receta_estado === "pendiente").map((i) => `<tr><td>${M.esc(i.nombre)}</td><td class="r">${i.vectio_cant != null ? Math.round(i.vectio_cant) + " vendidos" : ""}</td></tr>`).join("")}</tbody></table></div>`;
  }

  async function showItem(M, D, itemId, recId) {
    const sb = M.sb;
    let title, sub = "", ids = [], extra = "";
    if (itemId) {
      const it = D.items.find((x) => x.id === itemId);
      const cat = D.cats.find((c) => c.codigo === it.categoria);
      ids = D.links.filter((l) => l.item_id === itemId).sort((a, b) => (a.rol === "principal" ? -1 : 1)).map((l) => l);
      title = it.nombre;
      sub = `<div class="kv"><b>${cat.nombre}</b> · ${it.en_carta ? "En la carta" + (it.precio != null ? " a <b>" + money(it.precio) + "</b>" : "") : "Fuera de la carta impresa (viene de Vectio)"} ${pill(it.receta_estado)}</div>
        <div class="kv">Nombres en Vectio: ${(it.aliases_vectio || []).map((a) => `<b>${M.esc(a)}</b>`).join(", ") || "—"}${(it.alias_nombres || []).length ? `<br>Otros nombres: ${it.alias_nombres.map((a) => M.esc(a)).join(", ")}` : ""}
        ${it.vectio_cant != null ? `<br>Ventas (${M.esc(it.vectio_periodo)}): <b>${Math.round(it.vectio_cant).toLocaleString("es-UY")}</b> unidades · <b>${money(it.vectio_monto)}</b>` : ""}</div>
        ${it.notas ? `<div class="alert" style="margin-top:10px">${M.esc(it.notas)}</div>` : ""}`;
      if (it.receta_estado === "pendiente") extra = `<div class="alert warn">Receta pendiente: la jefa de cocina la escribe en el Doc y entra sola en la próxima sincronización.</div>`;
      if (it.receta_estado === "no_aplica") extra = `<p class="hint">Se compra y se vende tal cual (1-1 o vino): no lleva receta.</p>`;
    } else {
      ids = [{ receta_id: recId, rol: "principal" }];
      title = D.recetas.find((r) => r.id === recId).nombre; sub = '<div class="kv">Preparado de cocina (interno, no sale en la carta)</div>';
    }
    const rids = [...new Set(ids.map((l) => l.receta_id))];
    let ins = [];
    if (rids.length) { const { data } = await sb.from("receta_insumos").select("receta_id,orden,cantidad,unidad,insumo,editable,nota").in("receta_id", rids).order("orden"); ins = data || []; }
    const { data: full } = rids.length ? await sb.from("recetas").select("id,pasos").in("id", rids) : { data: [] };
    const pasos = Object.fromEntries((full || []).map((r) => [r.id, r.pasos]));
    const blocks = ids.map((l) => {
      const r = D.recetas.find((x) => x.id === l.receta_id); if (!r) return "";
      const li = ins.filter((x) => x.receta_id === r.id);
      return `<h4>${M.esc(r.nombre)} <span class="pill int">${l.rol === "componente" ? "preparado" : "receta"}</span> ${pill(r.estado === "completa" ? "completa" : "parcial")}</h4>
        <div class="kv">Rinde: <b>${r.rinde ? M.esc(r.rinde) : "falta"}</b></div>
        ${li.length ? `<table><thead><tr><th class="l">Cant.</th><th class="l">Ingrediente</th></tr></thead><tbody>${li.map((x) => `<tr><td class="l">${x.cantidad != null ? x.cantidad.toLocaleString("es-UY") + " " + (x.unidad || "") : '<span class="meta">sin cantidad</span>'}</td><td class="l">${M.esc(x.insumo)}${x.editable ? ' <span class="pill w">editable</span>' : ""}${x.nota ? `<div class="meta">${M.esc(x.nota)}</div>` : ""}</td></tr>`).join("")}</tbody></table>` : '<p class="hint">El Doc no trae ingredientes con cantidad para esta receta.</p>'}
        ${pasos[r.id] ? `<details><summary class="meta">Ver pasos del Doc</summary><pre>${M.esc(pasos[r.id])}</pre></details>` : ""}`;
    }).join("");
    const m = document.createElement("div"); m.className = "modal";
    m.innerHTML = `<div class="box"><button class="x">Cerrar</button><h2>${M.esc(title)}</h2>${sub}${extra}${blocks}</div>`;
    m.onclick = (e) => { if (e.target === m || e.target.classList.contains("x")) m.remove(); };
    document.body.appendChild(m);
  }

  async function render(M) {
    M.app.innerHTML = M.shell("Carta / Recetas", "La carta de clientes, las recetas del Doc de Drive y las ventas de Vectio, juntas.", `<div class="wrap cartawrap"><p class="sub">Leyendo…</p></div>`);
    M.bindSalir();
    const D = await load(M);
    const body = V.tab === "carta" ? viewCarta(M, D) : V.tab === "recetas" ? viewRecetas(M, D) : viewConf(M, D);
    M.app.innerHTML = M.shell("Carta / Recetas", "La carta de clientes, las recetas del Doc de Drive y las ventas de Vectio, juntas.", `<div class="wrap cartawrap">${tabs()}${body}</div>`);
    M.bindSalir();
    document.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => { V.tab = b.dataset.tab; render(M); }));
    document.querySelectorAll("[data-more]").forEach((b) => (b.onclick = () => { V.open[b.dataset.more] = true; render(M); }));
    document.querySelectorAll("[data-item]").forEach((b) => (b.onclick = () => showItem(M, D, Number(b.dataset.item))));
    document.querySelectorAll("[data-rec]").forEach((b) => (b.onclick = () => showItem(M, D, null, Number(b.dataset.rec))));
    const q = document.getElementById("q");
    if (q) { q.oninput = () => { V.q = q.value; clearTimeout(q._t); q._t = setTimeout(async () => { const pos = q.selectionStart; await render(M); const q2 = document.getElementById("q"); q2.focus(); q2.setSelectionRange(pos, pos); }, 250); }; }
    const fil = document.getElementById("fil");
    if (fil) { fil.value = V.filtro; fil.onchange = () => { V.filtro = fil.value; render(M); }; }
  }

  window.MF_carta = render;
})();
