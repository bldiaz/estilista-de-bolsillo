import * as db from "./db.js";
import * as ai from "./ai.js";
import { figura, AV, AV_DEFAULT, safeHex, guessTipo, calcMorfologia, calcProporcion, alturaRango } from "./figura.js";

const { CATS, TIPOS, ESTAMPADOS, TEJIDOS } = ai;

/* ---------- utilidades ---------- */
const $ = id => document.getElementById(id);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v; else if (k === "style") el.style.cssText = v; else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) { if (c == null || c === false) continue; el.append(c instanceof Node ? c : document.createTextNode(String(c))); }
  return el;
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clamp10 = n => Math.max(0, Math.min(10, Number(n) || 0));
const names = a => (a || []).map(c => c.nombre).join(", ");
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const eur = n => (Number.isFinite(n) ? n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }) : "—");
const price = s => { const n = parseFloat(String(s || "").replace(/[^\d,.]/g, "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
const fmtDate = s => new Date(s + "T12:00:00").toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
const lsGet = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
function showErr(el, msg) { el.textContent = msg || ""; el.hidden = !msg; }
const errMsg = e => (e && e.code === "cancelled" ? "" : (e && e.message) || "Algo falló. Vuelve a intentarlo.");

/* ---------- estado ---------- */
const state = {
  closet: [], outfits: [], shopping: [], diario: [], perfil: null, avatar: null, cuerpo: null,
  modo: lsGet("ebo.modo", "diario") === "noche" ? "noche" : "diario", filter: "Todas", loaded: false,
};
const OCASIONES = {
  diario: ["Trabajo o universidad", "Fin de semana", "Recados y café", "Comida familiar", "Viaje"],
  noche: ["Noche en Madrid: cena y copas", "Terraza y afterwork", "Discoteca", "Boda o evento", "Cena especial", "Cumpleaños en casa"],
};
const MODO_TXT = {
  diario: "MODO DIARIO: looks cómodos y pulidos para el día a día, fáciles de repetir. Maquillaje natural.",
  noche: "MODO ARREGLADA / NOCHE EN MADRID: looks para salir arreglada (cenas, copas por Chamberí, Salamanca o Malasaña, terrazas, discoteca, bodas). Texturas nobles y brillo contenido (satén, seda, piel, terciopelo, lúrex), tacón o bota, joyería visible en su metal, labio marcado. Elegante y con intención, nunca disfrazada.",
};
const SYSTEM = "Eres una estilista y asesora de imagen experta en colorimetría estacional (sistema de 12 estaciones), morfología corporal y estilismo. Hablas en español de España, con consejos concretos, realistas y amables, pensando en prendas que se puedan comprar en las tiendas habituales de la clienta. Evalúas con honestidad: si algo no le favorece, lo dices y propones alternativa.";
const ESTACIONES = ["Primavera Clara", "Primavera Cálida", "Primavera Brillante", "Verano Claro", "Verano Frío", "Verano Suave", "Otoño Suave", "Otoño Cálido", "Otoño Profundo", "Invierno Profundo", "Invierno Frío", "Invierno Brillante"];
const avatar = () => Object.assign({}, AV_DEFAULT, state.avatar || {}, state.cuerpo && state.cuerpo.medidas ? { medidas: state.cuerpo.medidas } : {});
const label = (list, k) => (AV[list].find(x => x[0] === k) || [k, k])[1];

function perfilText() {
  const p = state.perfil, a = avatar();
  if (!p) return "";
  return `Clienta: ${p.nombre || "mujer"}${p.edad ? ", " + p.edad + " años" : ""}.
Colorimetría: ${p.estacion}. ${p.descripcion || ""} Subtono: ${p.subtono || ""}. Contraste: ${p.contraste || ""}. Ojos: ${p.ojos || ""}. Metal: ${p.metal || ""}.
Neutros que le favorecen: ${names(p.neutros)}. Acentos: ${names(p.acentos)}.
Evitar junto a la cara: ${names(p.evitar)}.
Reglas: ${(p.reglas || []).join(" ")}
Maquillaje que le favorece: labios ${p.maquillaje?.labios || ""}; ojos ${p.maquillaje?.ojos || ""}; colorete ${p.maquillaje?.colorete || ""}.
Rostro: ${p.rostro || ""}. Silueta: ${label("silueta", a.silueta)}. Altura: ${label("altura", a.altura)}.
${cuerpoText()}
Estilo que busca: ${p.estilo || ""}. Tiendas habituales: ${p.tiendas || "Zara, Mango"}.${p.notas ? " Notas: " + p.notas : ""}`;
}
function closetText() {
  if (!state.closet.length) return "(armario vacío)";
  return state.closet.map(c => `- id:${c.id} | ${c.categoria} | tipo:${c.tipo || guessTipo(c.nombre) || "?"} | ${c.nombre} | ${c.color} (${c.hex}) | ${c.estampado || "liso"} | ${c.tejido || "?"}`).join("\n");
}
function runner(btn, stop, status) {
  let ctl = null;
  stop.addEventListener("click", () => ctl && ctl.abort());
  return async (fn, msg) => {
    ctl = new AbortController(); btn.disabled = true; stop.hidden = false; status.textContent = msg;
    try { return await fn(ctl.signal); } finally { btn.disabled = false; stop.hidden = true; status.textContent = ""; }
  };
}
function ready(errEl) {
  if (!ai.getKey()) { showErr(errEl, "Falta tu clave de Claude."); openOnb("clave", true); return false; }
  if (!state.perfil) { showErr(errEl, "Primero haz tu diagnóstico de color."); openOnb("diagnostico", true); return false; }
  return true;
}

/* ---------- piezas y looks ---------- */
function resolvePieza(p) {
  const own = p.id && state.closet.find(c => c.id === p.id);
  return own ? { ...p, own, nombre: own.nombre, tipo: own.tipo || p.tipo, hex: own.hex || p.hex, estampado: own.estampado || p.estampado, tejido: own.tejido || p.tejido } : { ...p, id: "" };
}
function pieceEl(p) {
  if (p.own) return h("span", { class: "piece" }, p.own.thumb ? h("img", { src: p.own.thumb, alt: "" }) : h("span", { class: "sw", style: "background:" + safeHex(p.own.hex) }), p.own.nombre);
  return h("span", { class: "piece missing" }, h("span", { class: "sw", style: "background:" + safeHex(p.hex) }), p.nombre,
    h("button", { type: "button", onclick: async ev => { ev.target.textContent = "Añadida"; ev.target.disabled = true; await addShopping({ prenda: p.nombre, color: p.color || "", hex: p.hex, prioridad: "media", por_que: "Completa un look propuesto.", buscar: p.nombre, tienda: "" }); } }, "+ compras"));
}
function figEl(piezas, belleza, small) {
  const el = h("div", { class: "fig" });
  const lab = belleza && belleza.labios_hex ? belleza.labios_hex : null;
  el.innerHTML = figura(piezas, avatar(), { labios: lab, pendientes: belleza && /pendiente|aro/i.test(belleza.joyas || ""), label: small ? "Look del día" : undefined });
  return el;
}
function outfitEl(o, mode) {
  const piezas = (o.piezas || []).map(resolvePieza);
  const b = o.belleza;
  return h("div", { class: "outfit" }, figEl(piezas, b),
    h("div", { class: "txt" },
      h("span", { class: "t" }, o.titulo || "Look"), o.ocasion ? h("span", { class: "status" }, o.ocasion) : null,
      o.por_que ? h("p", { class: "why" }, o.por_que) : null,
      h("div", { class: "pieces" }, piezas.map(pieceEl)),
      b ? h("div", { class: "beauty" },
        h("span", {}, "Labios"), h("b", { style: "font-weight:500" }, h("span", { class: "sw", style: "background:" + safeHex(b.labios_hex) }), " ", b.labios || ""),
        h("span", {}, "Ojos"), h("b", { style: "font-weight:500" }, b.ojos || ""),
        h("span", {}, "Joyas"), h("b", { style: "font-weight:500" }, b.joyas || "")) : null,
      mode === "example" ? null : h("div", { class: "row" },
        mode === "saved" ? h("button", { class: "linkbtn", type: "button", onclick: () => db.del("outfits", o.id) }, "Quitar")
          : h("button", { class: "linkbtn", type: "button", onclick: async ev => { ev.target.disabled = true; ev.target.textContent = "Guardado"; await db.put("outfits", { id: uid(), titulo: o.titulo || "Look", ocasion: o.ocasion || "", por_que: o.por_que || "", piezas: o.piezas || [], belleza: b || null, modo: state.modo, creado: Date.now() }); } }, "Guardar"),
        h("button", { class: "linkbtn", type: "button", onclick: async ev => { ev.target.disabled = true; ev.target.textContent = "Apuntado en el diario"; await db.put("diario", { id: uid(), fecha: today(), titulo: o.titulo || "", nota: o.ocasion || "", piezas: o.piezas || [], belleza: b || null, modo: state.modo, creado: Date.now() }); } }, "Me lo pongo hoy"))));
}

/* ---------- modo ---------- */
function setModo(m) {
  state.modo = m; lsSet("ebo.modo", m);
  document.body.classList.toggle("noche", m === "noche");
  $("modeDiario").setAttribute("aria-pressed", String(m === "diario")); $("modeNoche").setAttribute("aria-pressed", String(m === "noche"));
  $("ofOcasion").replaceChildren(...OCASIONES[m].map(o => h("option", {}, o)));
  $("ofTitle").textContent = m === "noche" ? "¿Qué me pongo esta noche?" : "¿Qué me pongo hoy?";
  $("shLead").textContent = m === "noche" ? "Piezas para salir arreglada que le faltan a tu armario, en colores de tu paleta." : "Lo que le falta a tu armario, en colores de tu paleta y ordenado por cuántos looks desbloquea.";
  renderSaved();
  if (!$("ofResult").childElementCount || $("ofResult").dataset.example) renderLooksExample();
}
$("modeDiario").addEventListener("click", () => setModo("diario"));
$("modeNoche").addEventListener("click", () => setModo("noche"));

/* ---------- pestañas ---------- */
const TABS = ["looks", "analizar", "armario", "diario", "yo"];
function show(t) {
  if (!TABS.includes(t)) t = "looks";
  TABS.forEach(x => { $("view-" + x).hidden = x !== t; });
  document.querySelectorAll(".tabbar button").forEach(b => { if (b.dataset.tab === t) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  lsSet("ebo.tab", t); window.scrollTo(0, 0);
}
document.querySelectorAll(".tabbar button").forEach(b => b.addEventListener("click", () => show(b.dataset.tab)));

/* ---------- QUÉ ME PONGO ---------- */
const PIEZAS_REGLA = "Cada look lleva prenda superior o vestido, parte inferior si procede, calzado y al menos un accesorio. Usa sobre todo prendas de su armario con su id exacto; si falta algo, deja id vacío y descríbelo para comprarlo en sus tiendas, en un color de su paleta. Indica siempre tipo, hex, estampado y tejido de cada pieza. Ten en cuenta su morfología, medidas, proporción y ficha de cortes al elegir cortes, largos y volúmenes. Añade maquillaje (labios con hex) y joyas en su metal, adaptados al modo.";
function renderLooksExample() {
  const ex = state.modo === "noche"
    ? { titulo: "Cena y copas en Chamberí", ocasion: "Ejemplo · noche", por_que: "Satén burdeos con bota alta: brillo contenido y una línea que alarga.", piezas: [{ nombre: "Jersey fino cuello alto chocolate", tipo: "cuello_alto", hex: "#3B2A20", tejido: "punto" }, { nombre: "Falda midi satén burdeos", tipo: "falda_midi", hex: "#6B2233", tejido: "saten" }, { nombre: "Botas altas espresso", tipo: "botas_altas", hex: "#2B1D15", tejido: "piel" }, { nombre: "Clutch dorado", tipo: "bolso_mano", hex: "#B8913E" }], belleza: { labios: "Rojo ladrillo mate", labios_hex: "#9A3B2E", ojos: "Ahumado suave en bronce", joyas: "Aros dorados medianos" } }
    : { titulo: "Oficina sobria", ocasion: "Ejemplo · diario", por_que: "Un tono profundo abajo da estructura a un punto claro.", piezas: [{ nombre: "Jersey cremallera taupe", tipo: "jersey", hex: "#8F7A64", tejido: "punto" }, { nombre: "Pantalón recto chocolate", tipo: "pantalon_recto", hex: "#5C3A21", tejido: "lana" }, { nombre: "Mocasines burdeos", tipo: "mocasines", hex: "#6B2233", tejido: "piel" }, { nombre: "Bolso camel", tipo: "bolso", hex: "#B5835A", tejido: "piel" }, { nombre: "Colgante dorado", tipo: "collar", hex: "#C9A24A" }], belleza: { labios: "Rosa amarronado", labios_hex: "#A0605A", ojos: "Máscara marrón", joyas: "Colgante fino dorado" } };
  $("ofResult").replaceChildren(h("div", { class: "card looks" }, h("h3", {}, "Así se verán tus looks"), outfitEl(ex, "example")));
  $("ofResult").dataset.example = "1";
}
const ofRun = runner($("ofGo"), $("ofStop"), $("ofStatus"));
$("ofGo").addEventListener("click", async () => {
  if (!ready($("ofErr"))) return;
  showErr($("ofErr"), "");
  const ancla = state.closet.find(i => i.id === $("ofAncla").value), quiero = $("ofQuiero").value.trim();
  const base = ancla ? `Cada look debe incluir su prenda id:${ancla.id} (${ancla.nombre}).` : quiero ? `Cada look debe incluir lo que quiere ponerse: "${quiero}". Si coincide con una prenda de su armario usa su id; si no, id vacío con su color más probable.` : "";
  const prompt = `Propón exactamente 3 looks distintos y completos para esta clienta.\n\n${perfilText()}\n\n${MODO_TXT[state.modo]}\nOcasión: ${$("ofOcasion").value}. Temporada: ${$("ofTemp").value}. ${base}\n\nSu armario:\n${closetText()}\n\n${PIEZAS_REGLA}`;
  try {
    const r = await ofRun(signal => ai.ask({ system: SYSTEM, prompt, schema: ai.S_LOOKS, signal }), "Vistiendo tu monigote…");
    delete $("ofResult").dataset.example;
    $("ofResult").replaceChildren(h("div", { class: "card looks" }, (r.outfits || []).map(o => outfitEl(o))));
  } catch (e) { showErr($("ofErr"), errMsg(e)); }
});
function renderSaved() {
  const list = state.outfits.filter(o => (o.modo || "diario") === state.modo).sort((a, b) => (b.creado || 0) - (a.creado || 0));
  $("savedWrap").hidden = !list.length;
  $("savedList").replaceChildren(...list.map(o => outfitEl(o, "saved")));
}

/* ---------- ¿ME LA QUEDO? ---------- */
let anFiles = [];
$("anFiles").addEventListener("change", e => {
  anFiles = [...e.target.files].slice(0, 3);
  $("anPreviews").replaceChildren(...anFiles.map(f => h("img", { src: URL.createObjectURL(f), alt: "Vista previa" })));
  $("anGo").disabled = !anFiles.length; showErr($("anErr"), "");
});
const anRun = runner($("anGo"), $("anStop"), $("anStatus"));
$("anGo").addEventListener("click", async () => {
  if (!ready($("anErr"))) return;
  if (!anFiles.length) { showErr($("anErr"), "Elige al menos una foto de la prenda."); return; }
  showErr($("anErr"), "");
  const prompt = `Analiza la prenda de las fotos para esta clienta.\n\n${perfilText()}\n\n${MODO_TXT[state.modo]}\n\nDatos de compra: precio ${$("anPrecio").value || "desconocido"} €, tienda ${$("anTienda").value || "desconocida"}. Notas: ${$("anNotas").value || "ninguna"}.\n\nSu armario:\n${closetText()}\n\nLas fotos pueden ser capturas de la web (la luz de estudio altera el color: tenlo en cuenta) o fotos de ella con la prenda puesta (valora entonces ajuste y cómo le queda).\nPuntúa de 0 a 10, con el mismo peso: color (armonía con su colorimetría, sobre todo junto a la cara), estilo (encaje con lo que busca y con el modo actual), versatilidad (cuántos looks permite con su armario) y calidad_precio.\nVeredicto: "quedatela" si la media es 7 o más y ningún criterio baja de 5; "devuelvela" si la media es menor de 5,5; si no, "con_matices".\nPropón exactamente 3 looks con esta prenda (inclúyela en cada uno con id vacío). ${PIEZAS_REGLA}`;
  try {
    const thumbP = ai.resizeToDataURL(anFiles[0], 360, 0.74).catch(() => "");
    const images = await Promise.all(anFiles.map(f => ai.imageBlock(f)));
    const r = await anRun(signal => ai.ask({ system: SYSTEM, prompt, images, schema: ai.S_ANALISIS, signal }), "Analizando color, corte y combinaciones…");
    renderAnalysis(r, await thumbP);
  } catch (e) { showErr($("anErr"), errMsg(e)); }
});
function renderAnalysis(r, thumb) {
  const p = r.puntuaciones || {}, keys = [["color", "Color"], ["estilo", "Estilo"], ["versatilidad", "Versatilidad"], ["calidad_precio", "Calidad-precio"]];
  const avg = keys.reduce((s, [k]) => s + clamp10(p[k]), 0) / 4;
  const v = r.veredicto === "quedatela" ? ["ok", "Quédatela"] : r.veredicto === "devuelvela" ? ["bad", "Devuélvela"] : ["warn", "Con matices"];
  const precio = price($("anPrecio").value), tienda = $("anTienda").value.trim();
  $("anResult").replaceChildren(h("div", { class: "card" },
    h("div", { class: "result-head" },
      thumb ? h("img", { src: thumb, alt: "" }) : h("div", { class: "ph", style: "background:" + safeHex(r.hex) }, r.color || ""),
      h("div", { style: "display:flex;flex-direction:column;gap:8px;min-width:0" },
        h("div", { class: "row" }, h("span", { class: "pill " + v[0] }, v[1]), h("span", { class: "status" }, h("span", { class: "sw", style: "background:" + safeHex(r.hex) }), " ", r.color || "")),
        h("b", { style: "font-size:1.05rem" }, r.prenda || ""),
        h("div", { class: "big" }, avg.toFixed(1).replace(".", ","), h("small", {}, " / 10")))),
    r.titular ? h("p", { style: "font-weight:500" }, r.titular) : null,
    h("div", { class: "bars" }, keys.map(([k, l]) => [h("span", {}, l), h("div", { class: "bar" }, h("i", { style: "width:" + clamp10(p[k]) * 10 + "%" })), h("span", { class: "num" }, clamp10(p[k]))])),
    r.colorimetria ? h("div", {}, h("h3", {}, "Colorimetría"), h("p", {}, r.colorimetria)) : null,
    r.silueta ? h("div", {}, h("h3", {}, "Tu silueta"), h("p", {}, r.silueta)) : null,
    r.talla ? h("div", {}, h("h3", {}, "Talla"), h("p", {}, r.talla)) : null,
    r.estilo ? h("div", {}, h("h3", {}, "Estilo"), h("p", {}, r.estilo)) : null,
    (r.como_llevarla || []).length ? h("div", {}, h("h3", {}, "Cómo sacarle partido"), h("ul", { class: "tips" }, r.como_llevarla.map(t => h("li", {}, t)))) : null,
    (r.outfits || []).length ? h("div", { class: "looks" }, h("h3", {}, "Así quedaría"), r.outfits.map(o => outfitEl(o))) : null,
    h("div", { class: "row" },
      h("button", { class: "btn small", type: "button", onclick: async ev => { ev.target.disabled = true; ev.target.textContent = "En tu armario"; await db.put("closet", { id: uid(), nombre: r.prenda || "Prenda", categoria: r.categoria, tipo: r.tipo, color: r.color || "", hex: safeHex(r.hex), estampado: r.estampado, tejido: r.tejido, precio, tienda, thumb: thumb || "", creado: Date.now() }); } }, "Me la quedo: al armario"),
      h("button", { class: "btn small ghost", type: "button", onclick: async ev => { ev.target.disabled = true; ev.target.textContent = "En compras"; await addShopping({ prenda: r.prenda || "Prenda", color: r.color || "", hex: r.hex, prioridad: "media", por_que: r.titular || "", buscar: r.prenda || "", tienda }); } }, "Pensármela: a compras"))));
}

/* ---------- ARMARIO ---------- */
const fillSel = (el, vals, lab) => el.replaceChildren(...vals.map(v => h("option", { value: v }, lab ? lab(v) : v)));
const pretty = s => s.replace(/_/g, " ").replace(/^./, c => c.toUpperCase());
fillSel($("addCat"), CATS); fillSel($("addTipo"), TIPOS, pretty); fillSel($("addEst"), ESTAMPADOS, pretty); fillSel($("addTej"), TEJIDOS, v => pretty(v).replace("Algodon", "Algodón").replace("Saten", "Satén"));
let addThumb = "";
function segArmario(p) { $("segPrendas").setAttribute("aria-pressed", String(p)); $("segCompras").setAttribute("aria-pressed", String(!p)); $("prendasPane").hidden = !p; $("comprasPane").hidden = p; }
$("segPrendas").addEventListener("click", () => segArmario(true));
$("segCompras").addEventListener("click", () => segArmario(false));
$("addOpen").addEventListener("click", () => { $("addForm").hidden = false; $("addNombre").focus(); });
$("addCancel").addEventListener("click", resetAdd);
function resetAdd() { $("addForm").hidden = true; addThumb = ""; $("addPreview").replaceChildren(); ["addNombre", "addColor", "addPrecio", "addTienda"].forEach(i => { $(i).value = ""; }); $("addStatus").textContent = ""; showErr($("addErr"), ""); $("addFile").value = ""; }
$("addNombre").addEventListener("change", () => { const t = guessTipo($("addNombre").value); if (t) $("addTipo").value = t; });
$("addFile").addEventListener("change", async e => {
  const f = e.target.files[0]; if (!f) return;
  addThumb = await ai.resizeToDataURL(f, 360, 0.74).catch(() => "");
  $("addPreview").replaceChildren(h("img", { src: addThumb || URL.createObjectURL(f), alt: "Vista previa" }));
  if (!ai.getKey()) return;
  $("addStatus").textContent = "Identificando la prenda…";
  try {
    const r = await ai.ask({ system: SYSTEM, prompt: "Identifica la prenda principal de la foto.", images: [await ai.imageBlock(f, 800)], schema: ai.S_IDENT, modelo: "economico", effort: "low", maxTokens: 4000 });
    $("addNombre").value = r.nombre || ""; $("addCat").value = r.categoria; $("addTipo").value = r.tipo; $("addColor").value = r.color || "";
    $("addHex").value = safeHex(r.hex); $("addEst").value = r.estampado; $("addTej").value = r.tejido;
    $("addStatus").textContent = "Revisa los datos y guarda.";
  } catch (err) { $("addStatus").textContent = ""; showErr($("addErr"), errMsg(err) + " Puedes rellenarlo a mano."); }
});
$("addSave").addEventListener("click", async () => {
  const nombre = $("addNombre").value.trim();
  if (!nombre) { showErr($("addErr"), "Ponle un nombre a la prenda antes de guardarla."); return; }
  await db.put("closet", { id: uid(), nombre, categoria: $("addCat").value, tipo: $("addTipo").value, color: $("addColor").value.trim(), hex: safeHex($("addHex").value), estampado: $("addEst").value, tejido: $("addTej").value, precio: price($("addPrecio").value), tienda: $("addTienda").value.trim(), thumb: addThumb, creado: Date.now() });
  resetAdd();
});
$("addNombre").addEventListener("input", () => showErr($("addErr"), ""));
function usos() {
  const m = {};
  for (const d of state.diario) for (const p of d.piezas || []) if (p.id) { const u = m[p.id] || (m[p.id] = { n: 0, last: "" }); u.n++; if (d.fecha > u.last) u.last = d.fecha; }
  return m;
}
function renderCloset() {
  const n = state.closet.length, U = usos();
  $("closetCount").textContent = state.loaded ? (n ? `${n} prenda${n > 1 ? "s" : ""}` : "Aún no hay prendas.") : "Cargando tus prendas…";
  const cats = ["Todas", ...CATS.filter(c => state.closet.some(i => i.categoria === c))];
  if (!cats.includes(state.filter)) state.filter = "Todas";
  $("catFilters").replaceChildren(...(n ? cats.map(c => h("button", { class: "chip", type: "button", "aria-pressed": String(c === state.filter), onclick: () => { state.filter = c; renderCloset(); } }, c)) : []));
  const items = state.closet.filter(i => state.filter === "Todas" || i.categoria === state.filter).sort((a, b) => CATS.indexOf(a.categoria) - CATS.indexOf(b.categoria));
  if (!n && state.loaded) {
    $("closetGrid").replaceChildren(h("div", { class: "empty", style: "grid-column:1/-1" }, h("p", {}, "Tu armario aparecerá aquí con foto, color, usos y coste por uso de cada prenda. Empieza con «Añadir prenda» o guardando una prenda que hayas analizado.")));
  } else {
    $("closetGrid").replaceChildren(...items.map(i => {
      const u = U[i.id] || { n: 0 }, cpu = i.precio ? i.precio / Math.max(1, u.n) : null;
      return h("div", { class: "item" },
        i.thumb ? h("img", { class: "img", src: i.thumb, alt: i.nombre }) : h("div", { class: "img", style: "background:" + safeHex(i.hex) }),
        h("div", { class: "meta" }, h("b", {}, i.nombre), h("span", {}, h("span", { class: "sw", style: "background:" + safeHex(i.hex) }), " ", i.color || ""),
          h("span", {}, u.n ? `${u.n} uso${u.n > 1 ? "s" : ""}` : "Sin estrenar", cpu != null ? ` · ${eur(cpu)}/uso` : "")),
        h("div", { class: "acts" },
          h("button", { class: "linkbtn", type: "button", onclick: () => { $("ofAncla").value = i.id; $("ofQuiero").value = ""; show("looks"); } }, "Ponérmela"),
          h("button", { class: "linkbtn", type: "button", onclick: ev => { if (ev.target.dataset.c) db.del("closet", i.id); else { ev.target.dataset.c = "1"; ev.target.textContent = "¿Seguro?"; } } }, "Quitar")));
    }));
  }
  const sel = $("ofAncla"), cur = sel.value;
  sel.replaceChildren(h("option", { value: "" }, "Ninguna en concreto"), ...state.closet.map(i => h("option", { value: i.id }, i.nombre)));
  sel.value = state.closet.some(i => i.id === cur) ? cur : "";
  renderPick();
}

/* ---------- COMPRAS ---------- */
async function addShopping(it) {
  if (state.shopping.find(s => String(s.prenda).toLowerCase() === String(it.prenda).toLowerCase())) return;
  await db.put("shopping", { id: uid(), ...it, hex: safeHex(it.hex), comprado: false, modo: state.modo, creado: Date.now() });
}
const shRun = runner($("shGo"), $("shStop"), $("shStatus"));
$("shGo").addEventListener("click", async () => {
  if (!ready($("shErr"))) return;
  showErr($("shErr"), "");
  const pend = state.shopping.filter(s => !s.comprado).map(s => "- " + s.prenda).join("\n") || "(ninguna)";
  const prompt = `Detecta qué prendas le faltan a esta clienta para multiplicar sus looks.\n\n${perfilText()}\n\n${MODO_TXT[state.modo]}\n\nSu armario:\n${closetText()}\n\nYa en su lista (no repetir):\n${pend}\n\nPropón entre 6 y 9 prendas para el modo actual, en colores de su paleta y con cortes que favorezcan su silueta, realistas para sus tiendas. Prioridad "alta" para las que más looks desbloquean. En "tienda" pon una de sus tiendas habituales.`;
  try {
    const r = await shRun(signal => ai.ask({ system: SYSTEM, prompt, schema: ai.S_COMPRAS, signal }), "Revisando huecos del armario…");
    for (const it of r.items || []) await addShopping(it);
  } catch (e) { showErr($("shErr"), errMsg(e)); }
});
function storeLinks(it) {
  const q = encodeURIComponent(it.buscar || it.prenda), t = (it.tienda || "").toLowerCase();
  const links = [];
  if (!t || t.includes("zara")) links.push(h("a", { href: "https://www.zara.com/es/es/search?searchTerm=" + q + "&section=WOMAN", target: "_blank", rel: "noopener" }, "Zara"));
  if (!t || t.includes("mango")) links.push(h("a", { href: "https://shop.mango.com/es/es/search/mujer?q=" + q, target: "_blank", rel: "noopener" }, "Mango"));
  if (t && !t.includes("zara") && !t.includes("mango")) links.push(h("a", { href: "https://www.google.com/search?q=" + encodeURIComponent((it.buscar || it.prenda) + " " + it.tienda), target: "_blank", rel: "noopener" }, it.tienda));
  return links;
}
function renderShopping() {
  const order = { alta: 0, media: 1, baja: 2 };
  const list = [...state.shopping].sort((a, b) => (a.comprado - b.comprado) || ((order[a.prioridad] ?? 1) - (order[b.prioridad] ?? 1)));
  if (!list.length) { $("shList").replaceChildren(h("p", { class: "status" }, "Aquí verás cada prenda que te falta, con su color, por qué te conviene y enlaces para buscarla. Pulsa «Detectar lo que me falta» o añade piezas desde un look.")); return; }
  $("shList").replaceChildren(...list.map(it => h("div", { class: "shop" + (it.comprado ? " done" : "") },
    h("span", { class: "sw", style: "background:" + safeHex(it.hex) }),
    h("div", { style: "display:flex;flex-direction:column;gap:4px;min-width:0" },
      h("span", { class: "prio " + (it.prioridad || "media") }, "Prioridad " + (it.prioridad || "media") + (it.modo === "noche" ? " · noche" : "")),
      h("b", {}, it.prenda), it.color ? h("span", { class: "status" }, it.color) : null,
      it.por_que ? h("p", { style: "font-size:.88rem" }, it.por_que) : null,
      h("div", { class: "acts" }, ...storeLinks(it),
        h("button", { class: "linkbtn", type: "button", onclick: () => db.put("shopping", { ...it, comprado: !it.comprado }) }, it.comprado ? "Desmarcar" : "Comprada"),
        h("button", { class: "linkbtn", type: "button", onclick: () => db.del("shopping", it.id) }, "Quitar"))))));
}

/* ---------- DIARIO ---------- */
const picked = new Set();
$("diFecha").value = today();
function renderPick() {
  if (!state.closet.length) { $("diPick").replaceChildren(h("p", { class: "status", style: "grid-column:1/-1" }, "Añade prendas a tu armario para poder registrarlas.")); return; }
  $("diPick").replaceChildren(...state.closet.map(i => h("button", { type: "button", class: "pick", "aria-pressed": String(picked.has(i.id)), onclick: ev => { picked.has(i.id) ? picked.delete(i.id) : picked.add(i.id); ev.currentTarget.setAttribute("aria-pressed", String(picked.has(i.id))); } },
    h("div", { class: "im", style: i.thumb ? `background-image:url(${i.thumb})` : "background:" + safeHex(i.hex) }), h("span", {}, i.nombre))));
}
$("diSave").addEventListener("click", async () => {
  if (!picked.size) { showErr($("diErr"), "Toca al menos una prenda."); return; }
  showErr($("diErr"), "");
  const piezas = [...picked].map(id => state.closet.find(c => c.id === id)).filter(Boolean).map(c => ({ id: c.id, nombre: c.nombre, tipo: c.tipo, hex: c.hex, estampado: c.estampado, tejido: c.tejido, color: c.color }));
  await db.put("diario", { id: uid(), fecha: $("diFecha").value || today(), nota: $("diNota").value.trim(), piezas, modo: state.modo, creado: Date.now() });
  picked.clear(); $("diNota").value = ""; renderPick(); $("diStatus").textContent = "Día guardado."; setTimeout(() => { $("diStatus").textContent = ""; }, 2500);
});
function renderDiario() {
  const U = usos(), items = state.closet;
  const sinEstrenar = items.filter(i => !U[i.id]);
  const limite = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
  const olvidadas = items.filter(i => U[i.id] && U[i.id].last < limite);
  const conPrecio = items.filter(i => i.precio).map(i => ({ i, n: (U[i.id] || { n: 0 }).n, cpu: i.precio / Math.max(1, (U[i.id] || { n: 0 }).n) })).sort((a, b) => b.cpu - a.cpu);
  const media = conPrecio.length ? conPrecio.reduce((s, x) => s + x.cpu, 0) / conPrecio.length : null;
  const stats = h("div", { class: "stats" },
    h("div", { class: "stat" }, h("b", {}, state.diario.length), h("span", {}, "días apuntados")),
    h("div", { class: "stat" }, h("b", {}, sinEstrenar.length), h("span", {}, "prendas sin estrenar")),
    h("div", { class: "stat" }, h("b", {}, media != null ? eur(media) : "—"), h("span", {}, "coste medio por uso")));
  const extra = [];
  if (olvidadas.length || sinEstrenar.length) extra.push(h("div", { class: "card" }, h("h3", {}, "En la percha"),
    h("p", { class: "status" }, [...sinEstrenar.map(i => i.nombre + " (sin estrenar)"), ...olvidadas.map(i => i.nombre + " (más de 60 días)")].slice(0, 8).join(" · ")),
    h("p", { style: "font-size:.85rem" }, "Pide un look con alguna de ellas en «Qué me pongo» para darles uso.")));
  if (conPrecio.length) extra.push(h("div", { class: "card" }, h("h3", {}, "Coste por uso"),
    h("div", { style: "overflow-x:auto" }, h("table", { class: "cpu" }, h("thead", {}, h("tr", {}, h("th", {}, "Prenda"), h("th", { class: "n" }, "Precio"), h("th", { class: "n" }, "Usos"), h("th", { class: "n" }, "€/uso"))),
      h("tbody", {}, conPrecio.slice(0, 10).map(x => h("tr", {}, h("td", {}, x.i.nombre), h("td", { class: "n" }, eur(x.i.precio)), h("td", { class: "n" }, x.n), h("td", { class: "n" }, eur(x.cpu)))))))));
  $("diStats").replaceChildren(h("div", { class: "stack" }, stats, ...extra));
  const list = [...state.diario].sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "") || (b.creado - a.creado)).slice(0, 40);
  $("diList").replaceChildren(...(list.length ? [h("h3", {}, "Últimos días"), ...list.map(d => {
    const piezas = (d.piezas || []).map(resolvePieza);
    return h("div", { class: "day" }, figEl(piezas, d.belleza, true),
      h("div", { style: "min-width:0;display:flex;flex-direction:column;gap:2px" }, h("span", { class: "d" }, fmtDate(d.fecha) + (d.modo === "noche" ? " · noche" : "")), d.titulo || d.nota ? h("p", {}, [d.titulo, d.nota].filter(Boolean).join(" · ")) : null, h("p", {}, piezas.map(p => p.nombre).join(", "))),
      h("button", { class: "linkbtn", type: "button", onclick: () => db.del("diario", d.id) }, "Quitar"));
  })] : [h("p", { class: "status" }, "Cuando apuntes días, aquí verás cada look dibujado con su fecha.")]));
}

/* ---------- MONIGOTE (editor reutilizable) ---------- */
const PREVIEW_LOOK = [{ tipo: "jersey", hex: "#EDE3CF", tejido: "punto" }, { tipo: "pantalon_recto", hex: "#3B2A20" }, { tipo: "mocasines", hex: "#5C3A21", tejido: "piel" }, { tipo: "collar" }];
function avatarEditor(container, draft, onChange) {
  const prev = h("div", { class: "fig" });
  const ctrls = h("div", { class: "ctrls" });
  const paint = () => {
    prev.innerHTML = figura(PREVIEW_LOOK, draft);
    const sw = (key, title) => h("div", {}, h("h3", {}, title), h("div", { class: "swrow" }, AV[key].map(([c, n]) => h("button", { type: "button", class: "swb", style: "background:" + c, "aria-label": n, title: n, "aria-pressed": String(String(draft[key]).toLowerCase() === c.toLowerCase()), onclick: () => { draft[key] = c; onChange && onChange(); paint(); } }))));
    const ch = (key, title) => h("div", {}, h("h3", {}, title), h("div", { class: "chips" }, AV[key].map(([k, n]) => h("button", { type: "button", class: "chip", "aria-pressed": String(draft[key] === k), onclick: () => { draft[key] = k; onChange && onChange(); paint(); } }, n))));
    ctrls.replaceChildren(sw("piel", "Tono de piel"), sw("pelo", "Color de pelo"), ch("peinado", "Peinado"), sw("ojos", "Ojos"), ...(draft.medidas && draft.medidas.pecho ? [h("p", { class: "status" }, "Tu silueta y altura salen de tus medidas reales (sección Mi cuerpo).")] : [ch("silueta", "Silueta"), ch("altura", "Altura")]));
  };
  paint();
  container.replaceChildren(h("div", { class: "avatar" }, prev, ctrls));
}
let avDraft = { ...AV_DEFAULT };
$("avSave").addEventListener("click", async () => { const a = { ...avDraft }; delete a.medidas; await db.setKV("avatar", a); $("avStatus").textContent = "Guardado. Así saldrás en tus looks."; });

/* ---------- PERFIL ---------- */
const pal = a => (a || []).map(c => h("div", {}, h("i", { style: "background-color:" + safeHex(c.hex) }), c.nombre || ""));
function renderPerfil() {
  const p = state.perfil;
  $("hdrSub").textContent = p ? `${p.nombre ? p.nombre + " · " : ""}${p.estacion}` : "Tu colorimetría, tu armario y tus looks";
  if (!p) { $("perfilView").replaceChildren(h("div", { class: "empty" }, h("p", {}, "Aún no tienes diagnóstico de color."), h("button", { class: "btn small", type: "button", onclick: () => openOnb("diagnostico", true) }, "Hacer mi diagnóstico"))); return; }
  const conf = { alta: ["ok", "Confianza alta"], media: ["warn", "Confianza media"], baja: ["bad", "Confianza baja"] }[p.confianza] || null;
  $("perfilView").replaceChildren(h("div", { class: "stack" },
    h("div", { class: "card" },
      h("div", {}, h("h2", {}, p.estacion), conf ? h("span", { class: "pill " + conf[0], style: "margin-top:6px" }, conf[1]) : null),
      h("p", { class: "lead" }, p.descripcion || ""),
      p.motivo_confianza ? h("p", { class: "status" }, p.motivo_confianza + (p.alternativa && p.confianza !== "alta" ? ` Estación vecina posible: ${p.alternativa}.` : "")) : null,
      h("div", { class: "facts" }, [["Subtono", p.subtono], ["Contraste", p.contraste], ["Ojos", p.ojos], ["Metal", p.metal], ["Rostro", p.rostro], ["Estilo", p.estilo]].filter(x => x[1]).map(([k, val]) => h("div", {}, h("span", {}, k), val)))),
    h("div", { class: "card" }, h("h3", {}, "Neutros base"), h("div", { class: "pal" }, pal(p.neutros)), h("h3", {}, "Acentos"), h("div", { class: "pal" }, pal(p.acentos))),
    h("div", { class: "card" }, h("h3", {}, "Evitar junto a la cara"), h("div", { class: "pal avoid" }, pal(p.evitar))),
    h("div", { class: "card" }, h("h3", {}, "Reglas rápidas"), h("ul", { class: "tips" }, (p.reglas || []).map(t => h("li", {}, t))),
      p.maquillaje ? [h("h3", {}, "Maquillaje"), h("ul", { class: "tips" }, h("li", {}, "Labios: " + p.maquillaje.labios), h("li", {}, "Ojos: " + p.maquillaje.ojos), h("li", {}, "Colorete: " + p.maquillaje.colorete))] : null),
    h("div", {}, h("button", { class: "btn ghost small", type: "button", onclick: () => openOnb("diagnostico", true) }, "Repetir diagnóstico"))));
}

/* ---------- MI CUERPO ---------- */
const MORF_TXT = { reloj: "Reloj de arena", pera: "Pera (triángulo)", triangulo_invertido: "Triángulo invertido", rectangulo: "Rectángulo", ovalado: "Ovalado" };
const MEDIDAS = [["altura", "Altura (cm)", "165"], ["pecho", "Pecho (cm)", "90"], ["cintura", "Cintura (cm)", "70"], ["cadera", "Cadera (cm)", "96"], ["hombros", "Hombros (cm)", "38"], ["entrepierna", "Entrepierna (cm)", "76"], ["peso", "Peso (kg, opcional)", ""]];
const TALLAS = [["zara_sup", "Zara arriba", "S"], ["zara_inf", "Zara abajo", "38"], ["mango_sup", "Mango arriba", "S"], ["mango_inf", "Mango abajo", "38"], ["zapato", "Calzado (EU)", "38"]];
function cuerpoText() {
  const c = state.cuerpo; if (!c) return "";
  const m = c.medidas || {}, t = c.tallas || {};
  const med = [["altura", "altura", "cm"], ["pecho", "pecho", "cm"], ["cintura", "cintura", "cm"], ["cadera", "cadera", "cm"], ["hombros", "ancho de hombros", "cm"], ["entrepierna", "entrepierna", "cm"]].filter(([k]) => m[k]).map(([k, n, u]) => `${n} ${m[k]} ${u}`).join(", ");
  const tal = TALLAS.filter(([k]) => t[k]).map(([k, n]) => `${n} ${t[k]}`).join(", ");
  const f = c.ficha;
  return [med && `Medidas: ${med}.${m.peso ? ` Peso ${m.peso} kg (dato que ha querido indicar; úsalo solo para ajuste y tallas).` : ""}`,
    c.morfologia && `Morfología: ${MORF_TXT[c.morfologia]}.`, c.proporcion && `Proporción: ${c.proporcion}.`,
    tal && `Tallas habituales: ${tal}.`, c.notas && `Notas de ajuste: ${c.notas}.`,
    f && `Ficha de cortes: ${(f.zonas || []).map(z => `${z.zona}: favorece ${z.favorece}; evitar ${z.evitar}`).join(" | ")}. Largos: ${f.largos}`].filter(Boolean).join("\n");
}
let cfSeq = 0;
function cuerpoForm(c, pre) {
  pre = pre || "cu" + (++cfSeq);
  const m = c.medidas || {}, t = c.tallas || {};
  const inputs = {}, tallas = {};
  const morfOut = h("div", { class: "row" });
  const update = () => {
    const d = read();
    const mo = calcMorfologia(d.medidas), pr = calcProporcion(d.medidas);
    morfOut.replaceChildren(...[mo && h("span", { class: "pill ok" }, MORF_TXT[mo]), pr && h("span", { class: "pill warn" }, pr)].filter(Boolean));
  };
  const field = ([k, l, ph], store, val, num) => { const i = h("input", { id: pre + "-" + k, inputmode: num ? "decimal" : "text", placeholder: ph, value: val ?? "", oninput: update }); store[k] = i; return h("label", { class: "f", for: pre + "-" + k }, l, i); };
  let foto = null;
  const fotoPrev = h("div", { class: "previews" });
  const notas = h("textarea", { id: pre + "-notas", placeholder: "Siempre me sobra cintura en los pantalones, tengo mucho pecho para las camisas…" }, c.notas || "");
  function read() {
    const medidas = {}; for (const [k] of MEDIDAS) { const v = price(inputs[k].value); if (v) medidas[k] = v; }
    const ta = {}; for (const [k] of TALLAS) { const v = tallas[k].value.trim(); if (v) ta[k] = v; }
    return { medidas, tallas: ta, notas: notas.value.trim() };
  }
  const el = h("div", { class: "stack" },
    h("details", { class: "note" }, h("summary", { style: "cursor:pointer;font-weight:600;color:var(--ink)" }, "Cómo medirte"),
      h("ul", { class: "tips", style: "margin-top:8px" },
        h("li", {}, "Con cinta métrica de costura, en ropa interior, sin apretar."),
        h("li", {}, "Pecho: por la parte más prominente, con la cinta horizontal."),
        h("li", {}, "Cintura: la parte más estrecha del tronco, por encima del ombligo."),
        h("li", {}, "Cadera: la parte más ancha de los glúteos."),
        h("li", {}, "Hombros: de un hueso del hombro al otro, por la espalda."),
        h("li", {}, "Entrepierna: desde la ingle hasta el suelo, descalza."))),
    h("div", { class: "grid2" }, MEDIDAS.map(f => field(f, inputs, m[f[0]], true))),
    morfOut,
    h("h3", {}, "Tus tallas habituales"),
    h("div", { class: "grid2" }, TALLAS.map(f => field(f, tallas, t[f[0]], false))),
    h("label", { class: "f", for: pre + "-notas" }, "Cómo te suele quedar la ropa (opcional)", notas),
    h("label", { class: "drop", for: pre + "-foto" }, h("strong", {}, "Foto de cuerpo entero (opcional)"), h("span", {}, "De frente, ropa ajustada y luz uniforme. Solo se usa para tu ficha y no se guarda."),
      h("input", { type: "file", id: pre + "-foto", accept: "image/*", hidden: true, onchange: e => { foto = e.target.files[0] || null; fotoPrev.replaceChildren(...(foto ? [h("img", { src: URL.createObjectURL(foto), alt: "Foto de cuerpo entero" })] : [])); } })),
    fotoPrev);
  update();
  return { el, read, get foto() { return foto; } };
}
async function saveCuerpo(form, er) {
  const d = form.read(), m = d.medidas;
  const bad = (k, a, b) => m[k] && (m[k] < a || m[k] > b);
  if (bad("altura", 120, 215)) { showErr(er, "Revisa la altura: escríbela en centímetros, por ejemplo 165."); return false; }
  if (["pecho", "cintura", "cadera"].some(k => bad(k, 45, 200))) { showErr(er, "Revisa pecho, cintura y cadera: van en centímetros, por ejemplo 90, 70 y 96."); return false; }
  if (bad("peso", 30, 250)) { showErr(er, "Revisa el peso: va en kilos."); return false; }
  showErr(er, "");
  const prev = state.cuerpo || {};
  const morfologia = calcMorfologia(m) || prev.morfologia || null;
  const cuerpo = { ...d, morfologia, proporcion: calcProporcion(m), ficha: prev.ficha || null, actualizado: Date.now() };
  await db.setKV("cuerpo", cuerpo);
  const av = { ...avatar() }; delete av.medidas;
  if (morfologia) av.silueta = morfologia;
  if (alturaRango(m.altura)) av.altura = alturaRango(m.altura);
  await db.setKV("avatar", av);
  if (ai.getKey() && (Object.keys(m).length || form.foto)) generarFicha(form.foto);
  return true;
}
let fichaBusy = false;
async function generarFicha(foto) {
  if (fichaBusy) return; fichaBusy = true;
  const st = $("fichaStatus"); if (st) st.textContent = "Preparando tu ficha de cortes…";
  try {
    const images = foto ? [await ai.imageBlock(foto, 1400)] : [];
    const r = await ai.ask({ system: SYSTEM, images, schema: ai.S_FICHA,
      prompt: `Crea la ficha de cortes y morfología de esta clienta.\n\n${cuerpoText()}\nEstilo que busca: ${state.perfil?.estilo || "no indicado"}. Tiendas: ${state.perfil?.tiendas || "Zara, Mango"}.\n${foto ? "Hay una foto de cuerpo entero: úsala para afinar la morfología y las proporciones (hombros, cintura, longitud de piernas). Si contradice las medidas, confía más en las medidas." : ""}\nHabla siempre en positivo: el objetivo es equilibrar proporciones y realzar, nunca adelgazar ni ocultar defectos. No hagas comentarios sobre el peso.` });
    await db.setKV("cuerpo", { ...(state.cuerpo || {}), ficha: r, actualizado: Date.now() });
    if ($("fichaStatus")) $("fichaStatus").textContent = "";
  } catch (e) { if ($("fichaStatus")) $("fichaStatus").textContent = errMsg(e) || "No se pudo crear la ficha."; }
  fichaBusy = false;
}
function renderCuerpo() {
  const c = state.cuerpo, f = c && c.ficha, m = (c && c.medidas) || {};
  const form = cuerpoForm(c || {});
  const er = h("p", { class: "err", hidden: true }), ok = h("span", { class: "status" });
  const formWrap = h("div", { class: "stack", hidden: !!c }, form.el, er,
    h("div", { class: "row" }, h("button", { class: "btn", type: "button", onclick: async () => { if (await saveCuerpo(form, er)) ok.textContent = "Guardado."; } }, "Guardar"), ok));
  const summary = c ? h("div", { class: "row" },
    c.morfologia ? h("span", { class: "pill ok" }, MORF_TXT[c.morfologia]) : null,
    c.proporcion ? h("span", { class: "pill warn" }, c.proporcion) : null,
    m.altura ? h("span", { class: "status" }, `${m.altura} cm`) : null) : null;
  put($("cuerpoView"),
    h("div", {}, h("h2", {}, "Mi cuerpo"), h("p", { class: "lead" }, c ? (f ? f.resumen : "Guarda tus medidas para recibir tu ficha de cortes.") : "Tus medidas ajustan el monigote y los consejos de corte, largo y talla. Todo es opcional.")),
    summary,
    f ? h("div", { class: "stack" },
      h("div", {}, h("h3", {}, "Para realzar"), h("ul", { class: "tips" }, (f.realzar || []).map(t => h("li", {}, t)))),
      ...(f.zonas || []).map(z => h("div", { class: "zona" }, h("b", {}, z.zona), h("p", {}, h("span", { class: "fav" }, "Te favorece: "), z.favorece), h("p", {}, h("span", { class: "evi" }, "Menos: "), z.evitar))),
      h("div", {}, h("h3", {}, "Largos"), h("p", {}, f.largos)),
      h("div", {}, h("h3", {}, "Tallas"), h("p", {}, f.tallas))) : null,
    h("span", { class: "status", id: "fichaStatus" }, fichaBusy ? "Preparando tu ficha de cortes…" : ""),
    c ? h("div", { class: "row" },
      h("button", { class: "btn ghost small", type: "button", onclick: ev => { formWrap.hidden = !formWrap.hidden; ev.target.textContent = formWrap.hidden ? "Editar mis medidas" : "Ocultar medidas"; } }, "Editar mis medidas"),
      ai.getKey() ? h("button", { class: "linkbtn", type: "button", onclick: () => generarFicha(null) }, f ? "Rehacer la ficha" : "Crear mi ficha") : null) : null,
    formWrap);
}

/* ---------- AJUSTES ---------- */
fillSel($("modelSel"), Object.keys(ai.MODELOS), k => ai.MODELOS[k].nombre);
$("modelSel").value = ai.getModelo();
$("modelSel").addEventListener("change", e => ai.setModelo(e.target.value));
function renderKey() { const k = ai.getKey(); $("keyMask").textContent = k ? k.slice(0, 10) + "…" + k.slice(-4) : "Sin clave"; }
$("keyChange").addEventListener("click", () => openOnb("clave", true));
$("expBtn").addEventListener("click", async () => {
  const data = JSON.stringify(await db.exportAll());
  const name = `estilista-copia-${today()}.json`;
  const file = new File([data], name, { type: "application/json" });
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: "Copia de Estilista de Bolsillo" }); $("bkStatus").textContent = "Copia lista. Guárdala en Archivos o iCloud."; return; } } catch (e) { if (e.name === "AbortError") return; }
  const a = h("a", { href: URL.createObjectURL(file), download: name }); document.body.append(a); a.click(); a.remove();
  $("bkStatus").textContent = "Copia descargada.";
});
$("impFile").addEventListener("change", async e => {
  const f = e.target.files[0]; if (!f) return;
  try { await db.importAll(JSON.parse(await f.text())); $("bkStatus").textContent = "Copia importada."; } catch (err) { $("bkStatus").textContent = err.message || "No se pudo leer la copia."; }
  e.target.value = "";
});
$("wipeBtn").addEventListener("click", async ev => {
  if (!ev.target.dataset.c) { ev.target.dataset.c = "1"; ev.target.textContent = "Pulsa otra vez para borrarlo todo (no se puede deshacer)"; return; }
  await db.wipe(); ai.setKey(""); delete ev.target.dataset.c; ev.target.textContent = "Borrar todos mis datos"; renderKey(); openOnb("bienvenida");
});

/* ---------- BIENVENIDA Y CONFIGURACIÓN ---------- */
const STEPS = ["bienvenida", "clave", "monigote", "cuerpo", "diagnostico", "telas", "listo"];
let onb = { step: "bienvenida", single: false, draft: null, files: [], result: null, answers: {} };
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
let installEvt = null;
addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; renderInstallTip(); });
function installHint() {
  if (standalone()) return null;
  if (installEvt) return h("button", { class: "btn ghost small", type: "button", onclick: async () => { installEvt.prompt(); installEvt = null; renderInstallTip(); } }, "Instalar la app");
  if (isIOS) return h("p", { class: "note" }, "Para tenerla como app: en Safari pulsa el botón Compartir y elige «Añadir a pantalla de inicio».");
  return null;
}
function renderInstallTip() { const t = installHint(); $("installTip").hidden = !t; $("installTip").replaceChildren(...(t ? [t] : [])); }

function openOnb(step, single) { onb = { ...onb, step, single: !!single, result: step === "telas" ? onb.result : null, files: [], answers: {} }; $("onb").hidden = false; document.body.style.overflow = "hidden"; renderOnb(); }
function closeOnb() { $("onb").hidden = true; document.body.style.overflow = ""; }
function next() {
  if (onb.single && onb.step !== "diagnostico" && onb.step !== "telas") return closeOnb();
  if (onb.single && onb.step === "telas") return closeOnb();
  const i = STEPS.indexOf(onb.step); onb.step = STEPS[i + 1] || "listo"; renderOnb();
}
function stepsBar() { const i = STEPS.indexOf(onb.step); return h("div", { class: "steps", "aria-hidden": "true" }, STEPS.slice(1, 6).map((s, k) => h("i", { class: k < i ? "on" : "" }))); }
function renderOnb() {
  const box = $("onbIn"), s = onb.step;
  const close = onb.single ? h("button", { class: "linkbtn", type: "button", onclick: closeOnb, style: "align-self:flex-end" }, "Cerrar") : null;
  if (s === "bienvenida") {
    const hero = h("div", { class: "hero-figs" });
    hero.innerHTML = [
      figura([{ tipo: "blazer", hex: "#B5835A", tejido: "lana" }, { tipo: "camisa", hex: "#EDE3CF" }, { tipo: "vaquero", hex: "#3E5A7A", tejido: "denim" }, { tipo: "mocasines", hex: "#3B2A20", tejido: "piel" }], { piel: "#EBC6A8", pelo: "#7A5232", peinado: "largo", ojos: "#4C7A4E" }),
      figura([{ tipo: "vestido_midi", hex: "#6B2233", tejido: "saten" }, { tipo: "tacones", hex: "#1E1B18" }, { tipo: "bolso_mano", hex: "#B8913E" }], { piel: "#E2BFA0", pelo: "#2B1D15", peinado: "recogido" }, { labios: "#9A3B2E", pendientes: true }),
      figura([{ tipo: "abrigo_largo", hex: "#4F5B2E", estampado: "pata_de_gallo", tejido: "lana" }, { tipo: "cuello_alto", hex: "#EDE3CF", tejido: "punto" }, { tipo: "pantalon_ancho", hex: "#2B2B2B" }, { tipo: "botines", hex: "#3B2A20" }], { piel: "#9A6644", pelo: "#0F0B09", peinado: "rizado", ojos: "#3A2416" }),
    ].join("");
    const tip = installHint();
    put(box, hero, h("h2", {}, "Tu estilista de bolsillo"),
      h("p", { class: "lead" }, "Descubre tu colorimetría, decide si te quedas una prenda y pide looks completos dibujados en tu propio monigote, para el día a día o para salir por Madrid."),
      h("ul", { class: "check" }, h("li", {}, "Todo se guarda solo en tu móvil: fotos, armario y clave."), h("li", {}, "Usa tu propia clave de Claude: cada análisis cuesta unos céntimos de tu saldo."), h("li", {}, "Configurarla lleva unos 5 minutos.")),
      tip, h("button", { class: "btn block", type: "button", onclick: next }, "Empezar"),
      h("label", { class: "linkbtn", for: "onbImp", style: "align-self:center" }, "Tengo una copia de seguridad", h("input", { type: "file", id: "onbImp", accept: "application/json,.json", hidden: true, onchange: async e => { try { await db.importAll(JSON.parse(await e.target.files[0].text())); closeOnb(); } catch (err) { alertIn(box, err.message || "No se pudo leer la copia."); } } })));
  } else if (s === "clave") {
    const inp = h("input", { id: "onbKey", type: "password", autocomplete: "off", placeholder: "sk-ant-…", value: ai.getKey() });
    const st = h("p", { class: "status" }), er = h("p", { class: "err", hidden: true });
    const go = h("button", { class: "btn block", type: "button", onclick: async () => {
      const k = inp.value.trim();
      if (!/^sk-ant-/.test(k)) { showErr(er, "La clave debe empezar por sk-ant-. Cópiala entera desde la consola."); return; }
      go.disabled = true; st.textContent = "Comprobando la clave…"; showErr(er, "");
      try { await ai.testKey(k); ai.setKey(k); renderKey(); st.textContent = "Clave correcta."; next(); }
      catch (e) { showErr(er, errMsg(e)); st.textContent = ""; } finally { go.disabled = false; }
    } }, "Comprobar y guardar");
    put(box, close, stepsBar(), h("h2", {}, "Tu clave de Claude"),
      h("p", { class: "lead" }, "La app habla con Claude usando tu propia cuenta de desarrolladora de Anthropic. Es distinta de la suscripción de Claude: aunque pagues Claude Pro, necesitas esta clave."),
      h("ol", { class: "guide" },
        h("li", {}, "Entra en ", h("a", { href: "https://platform.claude.com", target: "_blank", rel: "noopener" }, "platform.claude.com"), " y crea tu cuenta."),
        h("li", {}, "En Billing, añade saldo (con unos pocos euros tienes para mucho tiempo) y, si quieres, un límite de gasto mensual."),
        h("li", {}, "En API Keys, pulsa Create Key, ponle de nombre «Estilista» y cópiala."),
        h("li", {}, "Pégala aquí. Se guarda solo en este móvil.")),
      h("label", { class: "f", for: "onbKey" }, "Clave", inp), er, go, st,
      ai.getKey() && !onb.single ? h("button", { class: "linkbtn", type: "button", onclick: next, style: "align-self:center" }, "Mantener la clave guardada") : null);
  } else if (s === "monigote") {
    onb.draft = { ...avatar() };
    const ed = h("div");
    avatarEditor(ed, onb.draft);
    put(box, close, stepsBar(), h("h2", {}, "Crea tu monigote"), h("p", { class: "lead" }, "Así aparecerás en cada look. Tu silueta y tu altura también sirven para recomendarte cortes y largos."), ed,
      h("button", { class: "btn block", type: "button", onclick: async () => { const a = { ...onb.draft }; delete a.medidas; await db.setKV("avatar", a); next(); } }, "Siguiente"));
  } else if (s === "cuerpo") {
    const form = cuerpoForm(state.cuerpo || {}, "onbcu");
    const er = h("p", { class: "err", hidden: true });
    put(box, close, stepsBar(), h("h2", {}, "Tu cuerpo"),
      h("p", { class: "lead" }, "Con tus medidas calculo tu morfología, ajusto el monigote a tus proporciones y te recomiendo cortes, largos y tallas. Todo es opcional y se queda en tu móvil."),
      form.el, er,
      h("button", { class: "btn block", type: "button", onclick: async () => { const r = await saveCuerpo(form, er); if (r) next(); } }, "Guardar y seguir"),
      h("button", { class: "linkbtn", type: "button", style: "align-self:center", onclick: next }, "Lo hago más tarde"));
  } else if (s === "diagnostico") {
    const prev = h("div", { class: "previews" }), er = h("p", { class: "err", hidden: true }), st = h("span", { class: "status" });
    const p = state.perfil || {};
    const f = { nombre: h("input", { id: "dNombre", value: p.nombre || "", placeholder: "Lucía" }), edad: h("input", { id: "dEdad", inputmode: "numeric", value: p.edad || "", placeholder: "30" }),
      estilo: h("select", { id: "dEstilo" }, ["Old money básico con un punto moderno", "Minimalista y limpio", "Clásico elegante", "Urbano y relajado", "Romántico y femenino", "Boho"].map(o => h("option", { selected: o === p.estilo }, o))),
      tiendas: h("input", { id: "dTiendas", value: p.tiendas || "", placeholder: "Zara, Mango", list: "tiendasList" }),
      notas: h("textarea", { id: "dNotas", placeholder: "Tengo poca frente, me tiño de castaño, uso gafas…" }, p.notas || ""),
      folio: h("input", { type: "checkbox", id: "dFolio", style: "width:auto" }) };
    const datos = () => ({ nombre: f.nombre.value.trim(), edad: f.edad.value.trim(), estilo: f.estilo.value, tiendas: f.tiendas.value.trim() || "Zara, Mango", notas: f.notas.value.trim() });
    const fileIn = h("input", { type: "file", id: "dFiles", accept: "image/*", multiple: true, hidden: true, onchange: e => { onb.files = [...e.target.files].slice(0, 3); prev.replaceChildren(...onb.files.map(x => h("img", { src: URL.createObjectURL(x), alt: "Selfie" }))); showErr(er, ""); } });
    const stop = h("button", { class: "btn ghost", type: "button", hidden: true }, "Detener");
    const go = h("button", { class: "btn", type: "button" }, "Analizar mi color");
    const run = runner(go, stop, st);
    go.addEventListener("click", async () => {
      if (!onb.files.length) { showErr(er, "Sube al menos un selfie con luz natural."); return; }
      if (!ai.getKey()) { showErr(er, "Falta tu clave de Claude."); return; }
      showErr(er, "");
      const d = datos(), a = avatar();
      const prompt = `Analiza la colorimetría de la persona de los selfies: subtono de piel (mira cuello, mandíbula y zona de la ojera), valor, contraste entre piel, pelo y ojos, intensidad y temperatura.\n${f.folio.checked ? "Ha puesto un folio blanco junto a la cara: úsalo como referencia de blanco para corregir la dominante de color de la luz." : "No hay referencia de blanco: la luz y la cámara pueden alterar el color; refleja esa incertidumbre en la confianza."}\nColores que ella ha elegido para su monigote (orientativos): piel ${a.piel}, pelo ${a.pelo}, ojos ${a.ojos}. Silueta ${label("silueta", a.silueta)}, altura ${label("altura", a.altura)}.\nDatos: ${d.nombre || "sin nombre"}, ${d.edad || "edad no indicada"} años. Estilo que busca: ${d.estilo}. Tiendas: ${d.tiendas}. Notas: ${d.notas || "ninguna"}.\nDa la confianza con honestidad: "alta" solo si la luz es natural y neutra y los rasgos se ven bien; si dudas entre dos estaciones vecinas, indícalo en "alternativa".`;
      try {
        const images = await Promise.all(onb.files.map(x => ai.imageBlock(x, 1400)));
        const r = await run(signal => ai.ask({ system: SYSTEM, prompt, images, schema: ai.S_PERFIL, effort: "high", signal }), "Estudiando tu subtono y contraste…");
        onb.result = { ...r, ...d }; onb.step = "telas"; renderOnb();
      } catch (e) { showErr(er, errMsg(e)); }
    });
    const known = h("select", { id: "dKnown" }, h("option", { value: "" }, "Elige tu estación"), ESTACIONES.map(x => h("option", {}, x)));
    const kEr = h("p", { class: "err", hidden: true }), kSt = h("span", { class: "status" });
    const kStop = h("button", { class: "btn ghost small", type: "button", hidden: true }, "Detener");
    const kGo = h("button", { class: "btn ghost small", type: "button" }, "Crear mi paleta");
    const kRun = runner(kGo, kStop, kSt);
    kGo.addEventListener("click", async () => {
      if (!known.value) { showErr(kEr, "Elige tu estación."); return; }
      if (!ai.getKey()) { showErr(kEr, "Falta tu clave de Claude."); return; }
      showErr(kEr, "");
      const d = datos(), a = avatar();
      try {
        const r = await kRun(signal => ai.ask({ system: SYSTEM, prompt: `La clienta ya conoce su estación: ${known.value} (diagnóstico previo de una profesional o propio). Crea su perfil completo de colorimetría para esa estación, con confianza "alta" y motivo "Estación indicada por ella". Usa como piel_hex ${a.piel}, pelo_hex ${a.pelo} y ojos_hex ${a.ojos}. Silueta ${label("silueta", a.silueta)}, altura ${label("altura", a.altura)}. Datos: ${d.nombre || "sin nombre"}, ${d.edad || "?"} años, estilo ${d.estilo}, tiendas ${d.tiendas}. Notas: ${d.notas || "ninguna"}.`, schema: ai.S_PERFIL, signal }), "Preparando tu paleta…");
        await db.setKV("perfil", { ...r, ...d, creado: Date.now() }); onb.step = "listo"; if (onb.single) closeOnb(); else renderOnb();
      } catch (e) { showErr(kEr, errMsg(e)); }
    });
    put(box, close, stepsBar(), h("h2", {}, "Tu diagnóstico de color"),
      h("p", { class: "lead" }, "Sube de 1 a 3 selfies. La calidad de la foto decide la calidad del diagnóstico:"),
      h("ul", { class: "check" }, h("li", {}, "De día, de frente a una ventana. Sin luz amarilla ni flash."), h("li", {}, "Sin maquillaje (o muy poco) y sin filtros."), h("li", {}, "Pelo apartado de la cara y cuello visible."), h("li", {}, "Mejor aún: sostén un folio blanco junto a la cara. Sirve de referencia para corregir el color.")),
      h("label", { class: "drop", for: "dFiles" }, h("strong", {}, "Elegir selfies"), h("span", {}, "Cámara frontal o trasera"), fileIn), prev,
      h("label", { class: "row", for: "dFolio", style: "font-size:.9rem;gap:8px" }, f.folio, "He puesto un folio blanco junto a la cara"),
      h("div", { class: "grid2" }, h("label", { class: "f", for: "dNombre" }, "Tu nombre", f.nombre), h("label", { class: "f", for: "dEdad" }, "Edad", f.edad), h("label", { class: "f", for: "dEstilo" }, "Estilo que buscas", f.estilo), h("label", { class: "f", for: "dTiendas" }, "Dónde compras", f.tiendas)),
      h("label", { class: "f", for: "dNotas" }, "Algo que deba saber (opcional)", f.notas),
      h("div", { class: "row" }, go, stop, st), er,
      h("div", { class: "card" }, h("h3", {}, "¿Ya conoces tu estación?"), h("p", { class: "status" }, "Si te la hizo una profesional, elígela y creo tu paleta sin fotos."), known, h("div", { class: "row" }, kGo, kStop, kSt), kEr));
  } else if (s === "telas") {
    const r = onb.result;
    const conf = { alta: ["ok", "Confianza alta"], media: ["warn", "Confianza media"], baja: ["bad", "Confianza baja"] }[r.confianza] || ["warn", "Confianza media"];
    const QS = [
      ["q1", "Pon junto a tu cara una prenda camel y luego una gris perla o plateada. ¿Con cuál se ve tu piel más uniforme y luminosa?", ["Camel", "Gris perla", "Igual o no sé"]],
      ["q2", "Prueba una joya dorada y luego una plateada. ¿Cuál te ilumina más?", ["Dorada", "Plateada", "Igual o no sé"]],
      ["q3", "Blanco óptico frente a crema o marfil. ¿Cuál te favorece más?", ["Blanco óptico", "Crema", "Igual o no sé"]],
      ["q4", "Negro frente a marrón chocolate junto a la cara. ¿Cuál te sienta mejor?", ["Negro", "Chocolate", "Igual o no sé"]],
    ];
    const qs = h("div", { class: "stack" }, QS.map(([k, t, ops]) => h("div", { class: "q" }, h("p", {}, t), h("div", { class: "chips" }, ops.map(o => h("button", { type: "button", class: "chip", "aria-pressed": String(onb.answers[k] === o), onclick: () => { onb.answers[k] = o; renderOnb(); } }, o))))));
    const er = h("p", { class: "err", hidden: true }), st = h("span", { class: "status" });
    const stop = h("button", { class: "btn ghost", type: "button", hidden: true }, "Detener");
    const go = h("button", { class: "btn", type: "button" }, "Confirmar mi estación");
    const run = runner(go, stop, st);
    go.addEventListener("click", async () => {
      if (Object.keys(onb.answers).length < 4) { showErr(er, "Responde a las cuatro pruebas, aunque sea con «Igual o no sé»."); return; }
      showErr(er, "");
      const answers = QS.map(([k, t]) => `- ${t} → ${onb.answers[k]}`).join("\n");
      try {
        const fin = await run(signal => ai.ask({ system: SYSTEM, prompt: `Este es el diagnóstico inicial de colorimetría hecho a partir de selfies:\n${JSON.stringify(r)}\n\nLa clienta ha hecho una prueba de telas y metales frente al espejo con luz natural:\n${answers}\n\nConfirma o corrige la estación teniendo en cuenta la prueba (la prueba real pesa más que las fotos si se contradicen). Ajusta la paleta si cambias de estación. Recalcula la confianza y explica en motivo_confianza qué ha confirmado o cambiado la prueba.`, schema: ai.S_PERFIL, signal }), "Contrastando con tu prueba de telas…");
        await db.setKV("perfil", { ...fin, nombre: r.nombre, edad: r.edad, estilo: r.estilo, tiendas: r.tiendas, notas: r.notas, creado: Date.now() });
        onb.step = "listo"; if (onb.single) closeOnb(); else renderOnb();
      } catch (e) { showErr(er, errMsg(e)); }
    });
    put(box, close, stepsBar(), h("h2", {}, "Primera lectura: " + r.estacion),
      h("span", { class: "pill " + conf[0], style: "align-self:flex-start" }, conf[1]),
      h("p", { class: "lead" }, r.descripcion || ""),
      r.motivo_confianza ? h("p", { class: "status" }, r.motivo_confianza + (r.alternativa ? ` Estación vecina posible: ${r.alternativa}.` : "")) : null,
      h("div", { class: "pal" }, pal((r.acentos || []).slice(0, 8))),
      h("div", { class: "card" }, h("h3", {}, "Prueba de telas para confirmar"), h("p", { class: "status" }, "Delante de un espejo, con luz de día. Usa prendas o telas que tengas en casa."), qs),
      h("div", { class: "row" }, go, stop, st), er,
      h("button", { class: "linkbtn", type: "button", style: "align-self:flex-start", onclick: async () => { await db.setKV("perfil", { ...r, creado: Date.now() }); onb.step = "listo"; if (onb.single) closeOnb(); else renderOnb(); } }, "Guardar sin hacer la prueba"));
  } else {
    const fig = h("div", { class: "hero-figs" });
    fig.innerHTML = figura(PREVIEW_LOOK, avatar());
    put(box, fig, h("h2", {}, "¡Lista!"), h("p", { class: "lead" }, state.perfil ? `Eres ${state.perfil.estacion}. Empieza por «Qué me pongo» o analiza tu próxima compra en «¿Me la quedo?».` : "Ya puedes usar la app."),
      installHint(), h("button", { class: "btn block", type: "button", onclick: () => { closeOnb(); show("looks"); } }, "Entrar"));
  }
  $("onb").scrollTo(0, 0);
}
function put(el, ...kids) { el.replaceChildren(...kids.flat().filter(k => k != null && k !== false)); }
function alertIn(box, msg) { box.append(h("p", { class: "err" }, msg)); }

/* ---------- arranque ---------- */
(async () => {
  setModo(state.modo); renderKey(); renderInstallTip(); show(lsGet("ebo.tab", "looks"));
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  db.persist();
  let n = 0; const loaded = () => { if (++n >= 5) { state.loaded = true; renderCloset(); renderDiario(); } };
  db.on("closet", l => { state.closet = l; renderCloset(); renderDiario(); renderSaved(); loaded(); });
  db.on("outfits", l => { state.outfits = l; renderSaved(); loaded(); });
  db.on("shopping", l => { state.shopping = l; renderShopping(); loaded(); });
  db.on("diario", l => { state.diario = l; renderDiario(); renderCloset(); loaded(); });
  db.onKV("avatar", a => { state.avatar = a || null; avDraft = { ...avatar() }; avatarEditor($("avEditor"), avDraft, () => { $("avStatus").textContent = ""; }); renderSaved(); renderDiario(); if ($("ofResult").dataset.example) renderLooksExample(); });
  db.onKV("cuerpo", c => { state.cuerpo = c || null; renderCuerpo(); renderSaved(); renderDiario(); if ($("ofResult").dataset.example) renderLooksExample(); avDraft = { ...avatar() }; avatarEditor($("avEditor"), avDraft, () => { $("avStatus").textContent = ""; }); });
  let first = true;
  db.onKV("perfil", async p => {
    state.perfil = p || null; renderPerfil(); loaded();
    if (first) {
      first = false;
      const av = await db.getKV("avatar");
      if (!ai.getKey()) openOnb("bienvenida");
      else if (!av) openOnb("monigote");
      else if (!state.perfil) openOnb("diagnostico");
    }
  });
})();
