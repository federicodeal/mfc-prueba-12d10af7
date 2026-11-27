/* Mala Fama Control · Compras (tablero). Solo admin; datos de compra_lineas, v_articulos y proveedores (RLS). */
(function () {
  const INSUMOS = { Cocina: 1, Barra: 1, "Cocina y Barra": 1 };
  const STOP = { salsa: 1, para: 1, con: 1, del: 1, de: 1, la: 1, el: 1, los: 1, las: 1, un: 1, una: 1, x: 1, kg: 1, g: 1, ml: 1, cc: 1, l: 1, lt: 1, litro: 1, litros: 1, botella: 1, botellas: 1, pack: 1, packs: 1, caja: 1, cajas: 1, bolsa: 1, bolsas: 1, monte: 1, cudine: 1, ow: 1, barril: 1, barriles: 1, honorarios: 1, profesionales: 1, arancel: 1, cobranza: 1, propia: 1, servicio: 1, servicios: 1, importe: 1, gravado: 1, aceite: 1, vino: 1, cerveza: 1, factura: 1, mes: 1 };
  const C = { lineas: null, byKey: null, D: null, per: "anio", top: 15, M: null };

  function fetchPages(sb, makeQ) {
    return (async () => {
      const first = await makeQ().range(0, 999);
      if (first.error) throw first.error;
      let out = first.data || [];
      const total = first.count == null ? out.length : first.count;
      if (out.length < 1000 || total <= 1000) return out;
      const starts = [];
      for (let f = 1000; f < total; f += 1000) starts.push(f);
      const pages = new Array(starts.length);
      let next = 0;
      const worker = async () => {
        while (next < starts.length) {
          const i = next++;
          const { data, error } = await makeQ().range(starts[i], starts[i] + 999);
          if (error) throw error;
          pages[i] = data;
        }
      };
      await Promise.all(Array.from({ length: 8 }, worker));
      pages.forEach((p) => { out = out.concat(p); });
      return out;
    })();
  }

  const mon = (l) => Number(l.monto != null ? l.monto : l.total) || 0;
  const addM = (iso, n) => {
    const [y, m] = iso.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return d.toISOString().slice(0, 7);
  };
  const mesFin = (ym) => {
    const [y, m] = ym.split("-").map(Number);
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  };
  function pctTxt(a, b) {
    if (!b) return "";
    const p = ((a - b) / b) * 100;
    return `<span class="${p >= 0 ? "up" : "down"}">${p >= 0 ? "+" : ""}${p.toLocaleString("es-UY", { maximumFractionDigits: 1 })}%</span>`;
  }
  function prettyProv(s) {
    let x = String(s || "").replace(/\s+/g, " ").trim();
    if (/^Administraci[oó]n Nacional de Usinas y Transmisiones El[eé]ctricas/i.test(x)) return "UTE";
    if (/^DELIVERY HERO URUGUAY MARKETPLACE/i.test(x)) return "PedidosYa";
    if (/^BANCO ITAU/i.test(x)) return "Banco Itaú";
    x = x.replace(/\s*(S\.?\s*A\.?\s*S\.?|S\.?\s*R\.?\s*L\.?|S\.?\s*A\.?)\s*$/i, "").trim();
    if (x && x === x.toUpperCase()) {
      x = x.toLowerCase().replace(/(^|[\s(])\S/g, (c) => c.toUpperCase());
    }
    return x;
  }
  function fmtCant(cant, unidad, producto) {
    const n = Number(cant) || 0;
    const u = (unidad || "").toLowerCase();
    const p = (producto || "").toLowerCase();
    let lab = "un.";
    if (/barril/.test(u) || /barril/.test(p)) lab = n === 1 ? "barril" : "barriles";
    else if (/keg/.test(u) || /keg/.test(p)) lab = n === 1 ? "keg" : "kegs";
    else if (/bolsa/.test(p) || /bolsa/.test(u)) lab = n === 1 ? "bolsa" : "bolsas";
    else if (/pack/.test(u)) lab = n === 1 ? "pack" : "packs";
    else if (/botella/.test(u) || /750/.test(u)) lab = n === 1 ? "botella" : "botellas";
    else if (u === "kg" || /\bkg\b/.test(u)) lab = "kg";
    else if (u === "l" || /\blitro/.test(u) || /\b l$/.test(u)) lab = "L";
    const d = Math.abs(n - Math.round(n)) < 1e-6 ? 0 : 1;
    return n.toLocaleString("es-UY", { maximumFractionDigits: d }) + " " + lab;
  }
  function tokens(s) {
    const compact = (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/macycheddar/g, "mac cheddar")
      .replace(/[^a-z0-9]+/g, " ");
    return compact.split(/\s+/).filter((w) => w.length >= 3 && !STOP[w]);
  }
  function similarName(a, b) {
    const ta = tokens(a), tb = tokens(b);
    if (!ta.length || !tb.length) return false;
    const sb = new Set(tb);
    const inter = ta.filter((t) => sb.has(t));
    if (inter.length >= 2) return true;
    if (inter.length === 1 && inter[0].length >= 8) return true;
    const ca = ta.join(""), cb = tb.join("");
    if (ca.length >= 8 && cb.length >= 8 && (ca.includes(cb) || cb.includes(ca))) return true;
    return false;
  }

  function compute(lineas, byKey) {
    let minF = "9999", maxF = "0000";
    const uyu = [], usd = [];
    for (const l of lineas) {
      const f = l.fecha_emision; if (!f) continue;
      if (f < minF) minF = f; if (f > maxF) maxF = f;
      const row = { l, f, m: mon(l), cant: Number(l.cant) || 0, pu: Number(l.precio_unitario) || 0, moned: l.moneda || "UYU" };
      if (row.moned === "USD") usd.push(row); else uyu.push(row);
    }
    const year = maxF.slice(0, 4);
    const y0 = year + "-01-01";
    const mes = maxF.slice(0, 7);
    const mes0 = mes + "-01";
    const prevM = addM(mes + "-01", -1);
    const prev0 = prevM + "-01";
    const prev1 = mesFin(prevM);
    const prevY0 = String(+year - 1) + "-01-01";
    const prevY1 = String(+year - 1) + "-12-31";
    const sumR = (arr, a, b) => arr.reduce((s, r) => (r.f >= a && r.f <= b ? s + r.m : s), 0);
    const anio = sumR(uyu, y0, maxF);
    const nov = sumR(uyu, mes0, maxF);
    const oct = sumR(uyu, prev0, prev1);
    const anioAnt = sumR(uyu, prevY0, prevY1);
    const usdAnio = sumR(usd, y0, maxF);
    const insumosAnio = uyu.reduce((s, r) => {
      if (r.f < y0 || r.f > maxF) return s;
      const it = byKey.get(r.l.rut + "|" + r.l.producto_key);
      return s + (it && INSUMOS[it.categoria] ? r.m : 0);
    }, 0);
    const factMes = new Set();
    uyu.forEach((r) => { if (r.f >= mes0 && r.f <= maxF) factMes.add((r.l.tipo || "") + "|" + (r.l.serie || "") + "|" + (r.l.numero || "") + "|" + r.l.rut); });

    function rankProd(a, b) {
      const g = new Map();
      for (const r of uyu) {
        if (r.f < a || r.f > b) continue;
        const it = byKey.get(r.l.rut + "|" + r.l.producto_key);
        if (!it || !INSUMOS[it.categoria]) continue;
        const k = r.l.rut + "|" + r.l.producto_key;
        const o = g.get(k) || { it, cant: 0, monto: 0 };
        o.cant += r.cant; o.monto += r.m; g.set(k, o);
      }
      return [...g.values()].sort((x, y) => y.monto - x.monto).map((o) => ({
        producto: o.it.producto, proveedor: prettyProv(o.it.razon_social),
        cantTxt: fmtCant(o.cant, o.it.unidad, o.it.producto), monto: o.monto,
      }));
    }
    function rankProv(a, b) {
      const g = new Map();
      for (const r of uyu) {
        if (r.f < a || r.f > b) continue;
        const it = byKey.get(r.l.rut + "|" + r.l.producto_key);
        const nom = prettyProv((it && it.razon_social) || r.l.rut);
        const k = r.l.rut;
        const o = g.get(k) || { proveedor: nom, monto: 0, facts: new Set() };
        o.monto += r.m;
        o.facts.add((r.l.tipo || "") + "|" + (r.l.serie || "") + "|" + (r.l.numero || ""));
        g.set(k, o);
      }
      return [...g.values()].sort((x, y) => y.monto - x.monto);
    }

    const hist = new Map();
    for (const r of uyu) {
      if (!(r.cant > 0) || !(r.pu > 0)) continue;
      const k = r.l.rut + "|" + r.l.producto_key;
      (hist.get(k) || (hist.set(k, []), hist.get(k))).push(r);
    }
    const same = [];
    for (const [k, arr] of hist) {
      arr.sort((a, b) => a.f.localeCompare(b.f) || String(a.l.clave).localeCompare(String(b.l.clave)));
      for (let i = 1; i < arr.length; i++) {
        const cur = arr[i], prev = arr[i - 1];
        if (!(prev.pu >= 10) || !(cur.pu > prev.pu * 1.10)) continue;
        const it = byKey.get(k);
        if (!it || !INSUMOS[it.categoria]) continue;
        const pres = cur.pu >= prev.pu * 2;
        same.push({
          f: cur.f, prevF: prev.f, pu: cur.pu, prevPu: prev.pu,
          cant: cur.cant, monto: cur.m, impacto: (cur.pu - prev.pu) * cur.cant,
          pct: (cur.pu / prev.pu - 1) * 100, pres,
          producto: (it && it.producto) || cur.l.producto,
          proveedor: prettyProv((it && it.razon_social) || cur.l.rut),
          unidad: (it && it.unidad) || "",
          tipo: "precio", key: k,
        });
      }
    }

    const d60 = (() => {
      const [y, m, d] = maxF.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d - 60)).toISOString().slice(0, 10);
    })();
    const firstOf = new Map();
    for (const [k, arr] of hist) firstOf.set(k, arr[0].f);
    const lastByKey = new Map();
    for (const [k, arr] of hist) lastByKey.set(k, arr[arr.length - 1]);
    const keys = [...lastByKey.keys()];
    const byRut = new Map();
    keys.forEach((k) => {
      const rut = k.split("|")[0];
      (byRut.get(rut) || (byRut.set(rut, []), byRut.get(rut))).push(k);
    });
    const sim = [];
    const seenSim = new Set();
    for (const [rut, ks] of byRut) {
      for (let i = 0; i < ks.length; i++) {
        for (let j = 0; j < ks.length; j++) {
          if (i === j) continue;
          const ka = ks[i], kb = ks[j];
          const ia = byKey.get(ka), ib = byKey.get(kb);
          if (!ia || !ib || !INSUMOS[ia.categoria] || !INSUMOS[ib.categoria]) continue;
          const na = ia.producto || lastByKey.get(ka).l.producto;
          const nb = ib.producto || lastByKey.get(kb).l.producto;
          if (!similarName(na, nb)) continue;
          const a = lastByKey.get(ka), b = lastByKey.get(kb);
          if (!(b.pu >= 10) || !(a.pu >= b.pu * 2) || !(a.m >= 10000)) continue;
          if (a.f < b.f) continue;
          // solo códigos nuevos (primera compra en 60 días): evita barril vs lata que conviven todo el año
          if ((firstOf.get(ka) || a.f) < d60) continue;
          const id = ka + ">" + kb;
          if (seenSim.has(id)) continue;
          seenSim.add(id);
          sim.push({
            f: a.f, prevF: b.f, pu: a.pu, prevPu: b.pu,
            cant: a.cant, monto: a.m, impacto: a.m,
            pct: (a.pu / b.pu - 1) * 100, pres: true,
            producto: na, proveedor: prettyProv((ia && ia.razon_social) || rut),
            unidad: (ia && ia.unidad) || "",
            tipo: "sku", otro: nb, key: ka,
          });
        }
      }
    }

    const raw = same.filter((x) => x.f >= d60);
    const rawN = new Set(raw.map((x) => x.key)).size;
    const show = [];
    const used = new Set();
    const consider = same.filter((x) => x.pres || x.f >= d60).concat(sim);
    consider.sort((a, b) => (b.pres - a.pres) || (b.impacto - a.impacto) || b.f.localeCompare(a.f));
    for (const a of consider) {
      if (used.has(a.key)) continue;
      const material = a.tipo === "sku" || (a.pres && (a.impacto >= 1000 || a.monto >= 5000)) || (!a.pres && a.f >= d60 && a.impacto >= 1000);
      if (!material) continue;
      used.add(a.key);
      show.push(a);
    }

    const MES_L = ["", "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    return {
      minF, maxF, year, mesNom: MES_L[+mes.slice(5, 7)],
      prevMesNom: MES_L[+prevM.slice(5, 7)],
      anio, mesMonto: nov, prevMes: oct, anioAnt, usdAnio, insumosAnio,
      nFactMes: factMes.size,
      prodAnio: rankProd(y0, maxF), prodMes: rankProd(mes0, maxF),
      provAnio: rankProv(y0, maxF), provMes: rankProv(mes0, maxF),
      alerts: show, rawN,
    };
  }

  function alertRow(a, M) {
    const $r = M.$r, $u = M.$u, dmy = M.dmy, esc = M.esc;
    const pill = a.pres || a.tipo === "sku"
      ? `<span class="pill w">revisar presentación</span>`
      : `<span class="pill">suba de precio</span>`;
    let det;
    if (a.tipo === "sku") {
      det = `${dmy(a.f)} · ${M.nq(a.cant)} un. a ${$u(a.pu, "UYU")} <b>(${$r(a.monto)})</b> · antes, “${esc(a.otro)}” se pagaba ${$u(a.prevPu, "UYU")}. Puede ser un cambio de caja, pack o código, no una tarifa nueva.`;
    } else {
      det = `${dmy(a.f)} a ${$u(a.pu, "UYU")} vs ${$u(a.prevPu, "UYU")} el ${dmy(a.prevF)} <b>(+${a.pct.toLocaleString("es-UY", { maximumFractionDigits: 1 })}%)</b>`;
      det += ` · ${M.nq(a.cant)} un. (${$r(a.monto)}).`;
      if (a.pres) det += " El salto es tan grande que parece un cambio de unidad o un error de factura.";
    }
    return `<div class="alerta${a.pres || a.tipo === "sku" ? " pres" : ""}">
      <div class="t">${esc(a.producto)} · ${esc(a.proveedor)} ${pill}</div>
      <div class="m">${det}</div>
    </div>`;
  }

  function rankTable(rows, top, M) {
    const list = top === "todo" ? rows : rows.slice(0, top);
    if (!list.length) return `<div class="empty">No hay insumos en este período.</div>`;
    const mx = list[0].monto || 1;
    return `<div class="scroll" style="max-height:none"><table>
      <thead><tr><th></th><th class="l">Producto</th><th class="l">Proveedor</th><th class="l">Cantidad (monto)</th></tr></thead>
      <tbody>${list.map((r, i) => `<tr>
        <td class="rk">${i + 1}</td>
        <td class="l"><span class="prod">${M.esc(r.producto)}</span></td>
        <td class="l meta">${M.esc(r.proveedor)}</td>
        <td class="l"><span class="cant">${M.esc(r.cantTxt)}</span> <span class="muted">(${M.$r(r.monto)})</span>
          <div class="barline" style="width:${Math.max(4, r.monto / mx * 100)}%"></div></td>
      </tr>`).join("")}</tbody></table></div>`;
  }

  function provTable(rows, total, M, conPct) {
    const list = rows.slice(0, 10);
    if (!list.length) return `<div class="empty">Sin compras en el período.</div>`;
    const mx = list[0].monto || 1;
    return `<table><thead><tr><th></th><th class="l">Proveedor</th><th>Monto</th>${conPct ? "<th></th>" : ""}</tr></thead>
      <tbody>${list.map((r, i) => {
        const p = total ? (r.monto / total * 100) : 0;
        return `<tr>
          <td class="rk">${i + 1}</td>
          <td class="l prod">${M.esc(r.proveedor)}</td>
          <td>${M.$r(r.monto)}</td>
          ${conPct ? `<td class="l"><span class="barline" style="width:${Math.max(4, r.monto / mx * 100)}%;display:inline-block;vertical-align:middle"></span> <span class="muted">${p.toLocaleString("es-UY", { maximumFractionDigits: 1 })}%</span></td>` : ""}
        </tr>`;
      }).join("")}</tbody></table>`;
  }

  function dashHtml(M) {
    const D = C.D, $r = M.$r;
    const nAlert = D.alerts.length;
    const insPct = D.anio ? Math.round(D.insumosAnio / D.anio * 100) : 0;
    const cmpMes = D.prevMes
      ? `${pctTxt(D.mesMonto, D.prevMes)} vs ${D.prevMesNom} (${$r(D.prevMes)}) · ${M.nf(D.nFactMes)} facturas`
      : `${M.nf(D.nFactMes)} facturas`;
    const cmpAnio = D.anioAnt
      ? `${pctTxt(D.anio, D.anioAnt)} vs ${+D.year - 1} · insumos ${$r(D.insumosAnio)} (${insPct}%)`
      : `hasta el ${M.dmy(D.maxF)} · insumos $${(D.insumosAnio / 1e6).toLocaleString("es-UY", { maximumFractionDigits: 1 })} M (${insPct}%) · no hay ${+D.year - 1} para comparar`;
    const alerts = D.alerts.length
      ? D.alerts.map((a) => alertRow(a, M)).join("")
      : `<div class="empty">No hay alertas de precio para revisar ahora.</div>`;
    const extra = D.rawN > D.alerts.length
      ? ` Hay ${M.nf(D.rawN)} productos que subieron más del 10% en 60 días; acá van solo las que más plata mueven o parecen un cambio de presentación.`
      : "";
    return `<div class="kpis">
      <div class="kpi"><div class="l">Este mes (${D.mesNom.slice(0, 3)}.)</div><div class="v">${$r(D.mesMonto)}</div><div class="s">${cmpMes}</div></div>
      <div class="kpi"><div class="l">Este año</div><div class="v">${$r(D.anio)}</div><div class="s">${cmpAnio}</div></div>
      <div class="kpi${nAlert ? " warn" : ""}"><div class="l">Alertas de precio</div><div class="v">${M.nf(nAlert)}</div><div class="s">a revisar · umbral +10% vs la compra anterior · solo en la app</div></div>
      ${D.usdAnio ? `<div class="kpi mid"><div class="l">En dólares</div><div class="v">US$ ${Math.round(D.usdAnio).toLocaleString("es-UY")}</div><div class="s">en el año · no se suma a los rankings en $</div></div>` : ""}
    </div>
    <div class="card">
      <div class="cardhead"><div>
        <h3>Alertas de precio</h3>
        <div class="hint">Si el precio unitario sube más del 10% contra la compra anterior del mismo producto. Las de “revisar presentación” suelen ser un cambio de caja, pack o unidad, no una suba de tarifa.${extra}</div>
      </div></div>
      <div class="alertas">${alerts}</div>
    </div>
    <div class="card">
      <div class="cardhead"><div>
        <h3>Productos más comprados</h3>
        <div class="hint">Insumos de cocina y barra, en pesos. La cantidad va adelante y el monto entre paréntesis. No se rankea solo por cantidad: se mezclarían kilos, barriles y packs. Quedan afuera cambios de moneda, aranceles, luz y honorarios (eso se ve en proveedores).</div>
      </div>
      <div class="filters">
        <div class="seg" id="cPer">
          <button type="button" data-p="anio" class="${C.per === "anio" ? "on" : ""}">Este año</button>
          <button type="button" data-p="mes" class="${C.per === "mes" ? "on" : ""}">Este mes</button>
        </div>
        <div class="seg" id="cTop">
          <button type="button" data-n="15" class="${C.top === 15 ? "on" : ""}">Top 15</button>
          <button type="button" data-n="30" class="${C.top === 30 ? "on" : ""}">Top 30</button>
          <button type="button" data-n="todo" class="${C.top === "todo" ? "on" : ""}">Todo</button>
        </div>
      </div></div>
      <div id="cRank"></div>
    </div>
    <div class="two">
      <div class="card">
        <h3>Proveedores por compra</h3>
        <div class="hint">Todo lo gastado en el año, en pesos. El % es sobre ${$r(D.anio)}.</div>
        ${provTable(D.provAnio, D.anio, M, true)}
      </div>
      <div class="card">
        <h3>Este mes, por proveedor</h3>
        <div class="hint">${D.mesNom[0].toUpperCase() + D.mesNom.slice(1)}, hasta el ${M.dmy(D.maxF)}.</div>
        ${provTable(D.provMes, D.mesMonto, M, false)}
      </div>
    </div>`;
  }

  function paintRank(M) {
    const el = document.getElementById("cRank");
    if (!el) return;
    const rows = C.per === "mes" ? C.D.prodMes : C.D.prodAnio;
    el.innerHTML = rankTable(rows, C.top, M);
  }

  function bind(M) {
    const per = document.getElementById("cPer");
    const top = document.getElementById("cTop");
    if (per) per.querySelectorAll("button").forEach((b) => {
      b.onclick = () => {
        C.per = b.dataset.p;
        per.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
        paintRank(M);
      };
    });
    if (top) top.querySelectorAll("button").forEach((b) => {
      b.onclick = () => {
        C.top = b.dataset.n === "todo" ? "todo" : +b.dataset.n;
        top.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
        paintRank(M);
      };
    });
    paintRank(M);
  }

  async function load(M) {
    C.M = M;
    const byKey = new Map();
    (M.items || []).forEach((i) => {
      if (i.rut && i.producto_key) byKey.set(i.rut + "|" + i.producto_key, i);
    });
    C.byKey = byKey;
    if (!C.lineas) {
      C.lineas = await fetchPages(M.sb, () => M.sb.from("compra_lineas")
        .select("clave,fecha_emision,rut,producto,producto_key,cant,precio_unitario,total,monto,moneda,tipo,serie,numero", { count: "exact" })
        .order("clave"));
    }
    C.D = compute(C.lineas, byKey);
    return {
      max: C.D.maxF,
      min: C.D.minF,
      html: () => dashHtml(M),
      bind: () => bind(M),
    };
  }

  window.MF_comprasDash = { load };
})();
