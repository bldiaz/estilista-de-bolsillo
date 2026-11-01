// Figurín SVG: cuerpo según silueta, peinado, ojos, prendas con estampados y texturas, labios y joyas.
import { TIPOS } from "./ai.js";

export const AV = {
  piel: [["#F5D9C6", "Muy clara"], ["#EBC6A8", "Clara"], ["#E2BFA0", "Clara oliva"], ["#D4A27C", "Media"], ["#B98258", "Morena"], ["#9A6644", "Morena oscura"], ["#7A4B2E", "Oscura"], ["#5A3520", "Muy oscura"]],
  pelo: [["#0F0B09", "Negro"], ["#2B1D15", "Castaño muy oscuro"], ["#4A3022", "Castaño"], ["#7A5232", "Castaño claro"], ["#B08452", "Rubio oscuro"], ["#D8B878", "Rubio"], ["#8C3B1E", "Pelirrojo"], ["#9A9590", "Canoso"]],
  ojos: [["#3A2416", "Marrón oscuro"], ["#6B4423", "Marrón"], ["#6E6B3B", "Avellana verdoso"], ["#4C7A4E", "Verde"], ["#5A7FA3", "Azul"], ["#7C8A93", "Gris"]],
  peinado: [["long_bob", "Long bob"], ["largo", "Largo"], ["corto", "Corto"], ["rizado", "Rizado"], ["recogido", "Recogido"]],
  silueta: [["reloj", "Reloj de arena"], ["pera", "Pera"], ["triangulo_invertido", "Triángulo invertido"], ["rectangulo", "Rectángulo"], ["ovalado", "Ovalado"]],
  altura: [["baja", "Menos de 1,60"], ["media", "1,60 a 1,70"], ["alta", "Más de 1,70"]],
};
export const AV_DEFAULT = { piel: "#E2BFA0", pelo: "#2B1D15", ojos: "#6B4423", peinado: "long_bob", silueta: "rectangulo", altura: "media" };
const BODY = { reloj: [19, 12, 19], pera: [16, 13, 21], triangulo_invertido: [22, 14, 16], rectangulo: [18, 16, 17], ovalado: [18, 19, 19] };

export const safeHex = x => (/^#[0-9a-f]{6}$/i.test(String(x || "")) ? x : "#9a8f80");
export function shade(hex, amt) {
  const n = parseInt(safeHex(hex).slice(1), 16); const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = v => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  return "#" + [f(r), f(g), f(b)].map(v => v.toString(16).padStart(2, "0")).join("");
}
const lum = hex => { const n = parseInt(safeHex(hex).slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };

export function guessTipo(n) {
  n = String(n || "").toLowerCase();
  const R = [[/abrigo|trench|gabardina|plumas/, "abrigo_largo"], [/blazer|americana/, "blazer"], [/chaqueta|cazadora|bomber|biker|chaleco/, "chaqueta_corta"], [/cuello alto|cisne|perkins/, "cuello_alto"], [/c[áa]rdigan|rebeca/, "cardigan"], [/jersey|su[ée]ter|sudadera/, "jersey"], [/camisa|blusa/, "camisa"], [/body/, "body"], [/top|tirantes|lencero|cors[ée]t?/, "top_tirantes"], [/camiseta|polo/, "camiseta"], [/vaquero|jean|denim/, "vaquero"], [/palazzo|ancho|wide|culotte/, "pantalon_ancho"], [/pitillo|legging|skinny/, "pantalon_pitillo"], [/pantal/, "pantalon_recto"], [/minifalda|falda mini|falda corta/, "falda_mini"], [/falda larga|maxifalda|falda maxi/, "falda_larga"], [/falda/, "falda_midi"], [/vestido.*(mini|corto)/, "vestido_mini"], [/vestido.*(largo|maxi)/, "vestido_largo"], [/vestido/, "vestido_midi"], [/bota alta|botas altas|mosquetera/, "botas_altas"], [/bot[íi]n|bota/, "botines"], [/mocas[íi]n|loafer/, "mocasines"], [/bailarin|merceditas/, "bailarinas"], [/tac[óo]n|stiletto|salones|slingback/, "tacones"], [/zapatilla|sneaker|deportiv/, "zapatillas"], [/sandalia/, "sandalias"], [/clutch|bolso de mano|cartera de mano/, "bolso_mano"], [/bolso|shopper|bandolera/, "bolso"], [/cintur/, "cinturon"], [/pañuelo|panuelo|foulard|bufanda/, "panuelo"], [/collar|colgante|cadena/, "collar"]];
  for (const [re, t] of R) if (re.test(n)) return t;
  return null;
}

let seq = 0;
export function figura(piezas, av, opts = {}) {
  av = Object.assign({}, AV_DEFAULT, av || {});
  const id = "f" + (++seq) + Math.random().toString(36).slice(2, 5);
  const S = safeHex(av.piel), H = safeHex(av.pelo), E = safeHex(av.ojos), G = "#C9A24A";
  const [sh, wa, hp] = dims(av);
  const escala = av.medidas && av.medidas.altura ? Math.max(0.9, Math.min(1.06, av.medidas.altura / 165)) : ({ baja: 0.95, media: 1, alta: 1.04 }[av.altura] || 1);
  const L = v => 60 - v, R = v => 60 + v;
  const defs = [];
  let n = 0;

  function patternFor(p) {
    const base = safeHex(p.hex), est = p.estampado || "liso", tej = p.tejido || "";
    const out = [];
    const ctr = lum(base) > 0.55 ? shade(base, -0.5) : shade(base, 0.55);
    if (est !== "liso") {
      const pid = id + "p" + (++n);
      const P = {
        rayas: `<pattern id="${pid}" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1.5" fill="${ctr}"/></pattern>`,
        rayas_marineras: `<pattern id="${pid}" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="2.2" fill="${lum(base) > 0.55 ? "#1E2A3A" : "#F1EBDD"}"/></pattern>`,
        cuadros: `<pattern id="${pid}" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 4H8M4 0V8" stroke="${ctr}" stroke-width="1.3" opacity=".75"/><path d="M0 1H8M1 0V8" stroke="${ctr}" stroke-width=".4" opacity=".6"/></pattern>`,
        pata_de_gallo: `<pattern id="${pid}" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 0H2V2H0ZM2 2H4V4H2Z" fill="${ctr}" opacity=".8"/><path d="M2 0L4 2M0 2L2 4" stroke="${ctr}" stroke-width=".5"/></pattern>`,
        espiga: `<pattern id="${pid}" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 6L3 0L6 6" stroke="${ctr}" stroke-width=".7" fill="none" opacity=".6"/></pattern>`,
        lunares: `<pattern id="${pid}" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.1" fill="${ctr}"/></pattern>`,
        animal: `<pattern id="${pid}" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M2 2q2-1 3 1t-2 2q-2 0-1-3ZM7 6q2 0 2 2t-3 1q-1-2 1-3Z" fill="${shade(base, -0.55)}" opacity=".8"/></pattern>`,
        floral: `<pattern id="${pid}" width="10" height="10" patternUnits="userSpaceOnUse"><g fill="${ctr}"><circle cx="3" cy="2" r=".9"/><circle cx="2" cy="3.5" r=".9"/><circle cx="4" cy="3.5" r=".9"/><circle cx="8" cy="7" r=".9"/><circle cx="7" cy="8.5" r=".9"/><circle cx="9" cy="8.5" r=".9"/></g></pattern>`,
      }[est];
      if (P) { defs.push(P); out.push(`url(#${pid})`); }
    }
    const tid = id + "t" + (++n);
    const T = {
      punto: `<pattern id="${tid}" width="2.6" height="4" patternUnits="userSpaceOnUse"><path d="M1.3 0V4" stroke="${shade(base, -0.25)}" stroke-width=".5" opacity=".7"/></pattern>`,
      lana: `<pattern id="${tid}" width="3" height="3" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".35" fill="${shade(base, 0.25)}" opacity=".7"/></pattern>`,
      denim: `<pattern id="${tid}" width="3" height="3" patternUnits="userSpaceOnUse"><path d="M0 3L3 0" stroke="${shade(base, 0.3)}" stroke-width=".4" opacity=".7"/></pattern>`,
      lentejuelas: `<pattern id="${tid}" width="3" height="3" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r=".7" fill="#FFFFFF" opacity=".55"/></pattern>`,
      saten: `<linearGradient id="${tid}" x1="0" y1="0" x2="1" y2="1"><stop offset=".2" stop-color="#fff" stop-opacity="0"/><stop offset=".45" stop-color="#fff" stop-opacity=".38"/><stop offset=".7" stop-color="#fff" stop-opacity="0"/></linearGradient>`,
      seda: `<linearGradient id="${tid}" x1="0" y1="0" x2="1" y2="1"><stop offset=".25" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".25"/><stop offset=".75" stop-color="#fff" stop-opacity="0"/></linearGradient>`,
      piel: `<linearGradient id="${tid}" x1="0" y1="0" x2="1" y2="0"><stop offset=".3" stop-color="#fff" stop-opacity="0"/><stop offset=".42" stop-color="#fff" stop-opacity=".3"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient>`,
      terciopelo: `<linearGradient id="${tid}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".3"/><stop offset=".5" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>`,
    }[tej];
    if (T) { defs.push(T); out.push(`url(#${tid})`); }
    return out;
  }
  const paint = (d, p) => {
    const c = safeHex(p.hex);
    return `<path d="${d}" fill="${c}" stroke="${shade(c, -0.3)}" stroke-width=".7" stroke-linejoin="round"/>` + patternFor(p).map(u => `<path d="${d}" fill="${u}"/>`).join("");
  };
  const line = (x1, y1, x2, y2, w, p) => {
    const c = safeHex(p.hex), d = `M${x1} ${y1} L${x2} ${y2}`;
    return `<path d="${d}" stroke="${shade(c, -0.3)}" stroke-width="${w + 1.4}" stroke-linecap="round"/><path d="${d}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>` + patternFor(p).map(u => `<path d="${d}" stroke="${u}" stroke-width="${w}" stroke-linecap="round"/>`).join("");
  };
  const shL = [L(sh) + 1, 60], shR = [R(sh) - 1, 60];
  const wrL = [L(sh) - 8, 136], wrR = [R(sh) + 8, 136];
  const sleeves = (p, w, len) => {
    const fL = len === "larga" ? wrL : [(shL[0] + wrL[0]) / 2 + 1, 88], fR = len === "larga" ? wrR : [(shR[0] + wrR[0]) / 2 - 1, 88];
    return line(shL[0], shL[1], fL[0], fL[1], w, p) + line(shR[0], shR[1], fR[0], fR[1], w, p);
  };

  const by = {};
  for (const p of piezas || []) { const t = TIPOS.includes(p.tipo) ? p.tipo : guessTipo(p.nombre); if (t && !by[t]) by[t] = p; }
  const get = list => { for (const t of list) if (by[t]) return [t, by[t]]; return null; };

  const BACK = {
    long_bob: `<path d="M44 30 Q44 9 60 9 Q76 9 76 30 L80 60 Q70 65 60 63 Q50 65 40 60 Z" fill="${H}"/>`,
    largo: `<path d="M44 30 Q44 9 60 9 Q76 9 76 30 L83 96 Q70 101 60 99 Q50 101 37 96 Z" fill="${H}"/>`,
    corto: `<path d="M45 30 Q44 9 60 9 Q76 9 75 30 L75 40 L45 40 Z" fill="${H}"/>`,
    rizado: `<g fill="${H}"><circle cx="60" cy="16" r="12"/><circle cx="47" cy="24" r="9"/><circle cx="73" cy="24" r="9"/><circle cx="44" cy="38" r="9"/><circle cx="76" cy="38" r="9"/><circle cx="45" cy="52" r="8"/><circle cx="75" cy="52" r="8"/><circle cx="52" cy="58" r="6"/><circle cx="68" cy="58" r="6"/></g>`,
    recogido: `<circle cx="60" cy="7" r="7" fill="${H}"/><path d="M47 30 Q46 12 60 12 Q74 12 73 30 Z" fill="${H}"/>`,
  }[av.peinado] || "";

  let body = BACK +
    `<rect x="55" y="40" width="10" height="16" fill="${S}"/>` +
    `<path d="M${shL[0]} ${shL[1]} L${wrL[0]} ${wrL[1] + 2} M${shR[0]} ${shR[1]} L${wrR[0]} ${wrR[1] + 2}" stroke="${S}" stroke-width="8" stroke-linecap="round"/>` +
    `<path d="M53 128 L51 254 M67 128 L69 254" stroke="${S}" stroke-width="11" stroke-linecap="round"/>` +
    `<path d="M${L(sh)} 56 Q60 52 ${R(sh)} 56 L${R(wa)} 112 Q${R(wa) + 1} 122 ${R(hp)} 130 L${L(hp)} 130 Q${L(wa) - 1} 122 ${L(wa)} 112 Z" fill="${S}"/>`;

  const v = get(["vestido_mini", "vestido_midi", "vestido_largo"]);
  const inf = get(["pantalon_recto", "vaquero", "pantalon_ancho", "pantalon_pitillo", "falda_mini", "falda_midi", "falda_larga"]);
  const zap = get(["botas_altas", "botines", "mocasines", "bailarinas", "tacones", "zapatillas", "sandalias"]);
  const sup = get(["cuello_alto", "jersey", "camisa", "camiseta", "cardigan", "top_tirantes", "body"]);
  const capa = get(["abrigo_largo", "blazer", "chaqueta_corta"]);

  if (v) {
    const [t, p] = v, end = { vestido_mini: 150, vestido_midi: 198, vestido_largo: 248 }[t], fl = { vestido_mini: 3, vestido_midi: 7, vestido_largo: 9 }[t];
    const d = `M${L(sh) - 1} 56 Q60 51 ${R(sh) + 1} 56 L${R(wa) + 1} 112 L${R(hp) + 1} 130 L${R(hp) + fl} ${end} L${L(hp) - fl} ${end} L${L(hp) - 1} 130 L${L(wa) - 1} 112 Z`;
    const manga = sup || capa ? "sin" : (p.manga === "larga" ? "larga" : "sin");
    if (manga === "sin") {
      body += paint(`M${L(wa) + 1} 63 L${R(wa) - 1} 63 L${R(wa) + 1} 112 L${R(hp) + 1} 130 L${R(hp) + fl} ${end} L${L(hp) - fl} ${end} L${L(hp) - 1} 130 L${L(wa) - 1} 112 Z`, p) +
        `<path d="M${L(wa) + 3} 56 L${L(wa) + 3} 64 M${R(wa) - 3} 56 L${R(wa) - 3} 64" stroke="${safeHex(p.hex)}" stroke-width="1.6"/>`;
    } else body += sleeves(p, 9, "larga") + paint(d, p);
  } else if (inf) {
    const [t, p] = inf;
    const top = `M${L(wa) - 1} 112 L${R(wa) + 1} 112 L${R(hp)} 130`;
    const D = {
      pantalon_recto: `${top} L${R(16)} 252 L63 252 L60 140 L57 252 L${L(16)} 252 L${L(hp)} 130 Z`,
      vaquero: `${top} L${R(16)} 252 L63 252 L60 140 L57 252 L${L(16)} 252 L${L(hp)} 130 Z`,
      pantalon_ancho: `${top} L${R(25)} 253 L62 253 L60 145 L58 253 L${L(25)} 253 L${L(hp)} 130 Z`,
      pantalon_pitillo: `${top} L${R(14)} 251 L65 251 L60 140 L55 251 L${L(14)} 251 L${L(hp)} 130 Z`,
      falda_mini: `${top} L${R(hp) + 3} 150 L${L(hp) - 3} 150 L${L(hp)} 130 Z`,
      falda_midi: `${top} L${R(hp) + 6} 198 L${L(hp) - 6} 198 L${L(hp)} 130 Z`,
      falda_larga: `${top} L${R(hp) + 8} 248 L${L(hp) - 8} 248 L${L(hp)} 130 Z`,
    }[t];
    body += paint(D, p);
    if (t === "vaquero") body += `<path d="M50 135 L49 250 M70 135 L71 250" stroke="${shade(p.hex, 0.35)}" stroke-width=".6" fill="none"/>`;
  }
  if (zap) {
    const [t, p] = zap, c = safeHex(p.hex);
    const D = {
      botas_altas: ["M44 180 L57 180 L57 257 L39 257 Q39 251 44 249 Z", "M63 180 L76 180 L76 249 Q81 251 81 257 L63 257 Z"],
      botines: ["M45 228 L57 228 L57 257 L39 257 Q39 251 45 249 Z", "M63 228 L75 228 L75 249 Q81 251 81 257 L63 257 Z"],
      tacones: ["M45 249 L57 249 L56 254 L40 258 Z", "M63 249 L75 249 L80 258 L64 254 Z"],
    }[t] || ["M43 249 L57 249 L57 257 L38 257 Q38 251 43 249 Z", "M63 249 L77 249 Q82 251 82 257 L63 257 Z"];
    if (t === "sandalias") body += `<path d="M45 251 L57 251 M44 255 L57 255 M63 251 L75 251 M63 255 L76 255" stroke="${c}" stroke-width="2" stroke-linecap="round"/>`;
    else body += paint(D[0], p) + paint(D[1], p);
    if (t === "tacones") body += `<path d="M55 254 L55 264 M65 254 L65 264" stroke="${shade(c, -0.3)}" stroke-width="1.6"/>`;
    if (t === "zapatillas") body += `<path d="M38 256 L57 256 M63 256 L82 256" stroke="#F4F1EA" stroke-width="2"/>`;
  }
  if (sup) {
    const [t, p] = sup, c = safeHex(p.hex);
    if (t === "top_tirantes" || t === "body") {
      body += paint(`M${L(wa) + 1} 63 L${R(wa) - 1} 63 L${R(wa) + 2} 116 L${L(wa) - 2} 116 Z`, p) + `<path d="M${L(wa) + 3} 56 L${L(wa) + 3} 64 M${R(wa) - 3} 56 L${R(wa) - 3} 64" stroke="${c}" stroke-width="1.6"/>`;
    } else {
      body += sleeves(p, 10.5, t === "camiseta" ? "corta" : "larga") + paint(`M${L(sh) - 1} 56 Q60 51 ${R(sh) + 1} 56 L${R(wa) + 2} 116 L${L(wa) - 2} 116 Z`, p);
      if (t === "cuello_alto") body += paint("M53.5 44 h13 v13 h-13 Z", p);
      if (t === "jersey") body += `<path d="M53 55 Q60 60 67 55" stroke="${shade(c, -0.3)}" stroke-width="1.4" fill="none"/>`;
      if (t === "camisa") body += paint("M53 53 L60 63 L51 60 Z", { hex: shade(c, 0.15) }) + paint("M67 53 L60 63 L69 60 Z", { hex: shade(c, 0.15) }) + `<path d="M60 63 L60 115" stroke="${shade(c, -0.3)}" stroke-width=".6"/>`;
      if (t === "cardigan") body += `<path d="M60 58 L60 116" stroke="${shade(c, -0.35)}" stroke-width=".8"/>` + [72, 88, 104].map(y => `<circle cx="60" cy="${y}" r="1" fill="${shade(c, -0.4)}"/>`).join("");
    }
  }
  if (by.cinturon) body += paint(`M${L(wa) - 1} 110 h${2 * wa + 2} v4 h-${2 * wa + 2} Z`, by.cinturon) + `<rect x="58" y="109.5" width="4" height="5" fill="none" stroke="${G}" stroke-width="1"/>`;
  if (capa) {
    const [t, p] = capa, end = t === "abrigo_largo" ? 212 : 136, ow = Math.max(sh, hp) + (t === "abrigo_largo" ? 6 : 2);
    body += sleeves(p, 12.5, "larga") + paint(`M${L(sh) - 2} 56 L57 60 L55 ${end} L${L(ow)} ${end} Z`, p) + paint(`M${R(sh) + 2} 56 L63 60 L65 ${end} L${R(ow)} ${end} Z`, p);
    if (t !== "chaqueta_corta") body += paint("M45 57 L57 61 L52 80 Z", { hex: shade(p.hex, -0.12) }) + paint("M75 57 L63 61 L68 80 Z", { hex: shade(p.hex, -0.12) });
  }
  if (by.panuelo) body += paint("M51 52 L69 52 L60 68 Z", by.panuelo);
  if (by.collar) body += `<path d="M54 53 Q60 64 66 53" stroke="${G}" stroke-width="1.1" fill="none"/><circle cx="60" cy="61" r="1.4" fill="${G}"/>`;
  if (by.bolso) body += `<path d="M${shR[0]} 58 L${wrR[0] + 4} 118" stroke="${shade(by.bolso.hex, -0.3)}" stroke-width="1.2"/>` + paint(`M${wrR[0] - 4} 116 h20 v17 h-20 Z`, by.bolso);
  if (by.bolso_mano) body += paint(`M${wrL[0] - 12} 130 h17 v10 h-17 Z`, by.bolso_mano);

  const FRONT = av.peinado === "recogido" ? `<path d="M48 22 Q52 12 62 12 Q72 13 72 22 Q66 16 58 17 Q52 18 48 22 Z" fill="${H}"/>`
    : av.peinado === "rizado" ? `<path d="M47 24 Q50 11 60 11 Q71 11 74 24 Q68 17 60 18 Q52 17 47 24 Z" fill="${H}"/>`
      : `<path d="M47 25 Q49 11 62 11 Q75 12 75 27 Q69 17 57 20 Q50 22 47 31 Z" fill="${H}"/>`;
  const labios = safeHex(opts.labios || shade(S, -0.28));
  body += `<ellipse cx="60" cy="28" rx="12" ry="15" fill="${S}"/>${FRONT}` +
    `<path d="M51.5 24 Q55 22.5 57.5 24 M62.5 24 Q65 22.5 68.5 24" stroke="${shade(H, -0.1)}" stroke-width="1.2" fill="none" stroke-linecap="round"/>` +
    `<ellipse cx="55" cy="28" rx="1.8" ry="1.3" fill="#FFFFFF"/><ellipse cx="65" cy="28" rx="1.8" ry="1.3" fill="#FFFFFF"/><circle cx="55" cy="28" r="1" fill="${E}"/><circle cx="65" cy="28" r="1" fill="${E}"/>` +
    `<path d="M56 37 Q60 39.5 64 37 Q60 38 56 37 Z" fill="${labios}" stroke="${labios}" stroke-width="1" stroke-linejoin="round"/>`;
  if (opts.pendientes) body += `<circle cx="47.5" cy="33" r="1.2" fill="${G}"/><circle cx="72.5" cy="33" r="1.2" fill="${G}"/>`;

  return `<svg viewBox="0 -16 120 284" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${opts.label || "Figurín con el look"}"><defs>${defs.join("")}</defs><g transform="translate(60 262) scale(${escala.toFixed(3)}) translate(-60 -262)">${body}</g></svg>`;
}

// Anchura de hombros, cintura y cadera del dibujo: de las medidas reales si las hay; si no, de la silueta elegida.
function dims(av) {
  const m = av.medidas;
  if (m && m.pecho && m.cintura && m.cadera) {
    const k = 18 / ((m.pecho + m.cadera) / 2), cl = (v, a, b) => Math.round(Math.max(a, Math.min(b, v)) * 10) / 10;
    return [cl(m.hombros ? (18 * m.hombros) / 38 : m.pecho * k, 14, 24), cl(m.cintura * k * 1.05, 10, 22), cl(m.cadera * k, 14, 24)];
  }
  return BODY[av.silueta] || BODY.rectangulo;
}

// Morfología a partir de pecho, cintura y cadera (proporciones estándar, en cm).
export function calcMorfologia(m) {
  const B = +m.pecho, W = +m.cintura, Hp = +m.cadera;
  if (!B || !W || !Hp) return null;
  if (W >= Math.min(B, Hp) - 2) return "ovalado";
  if (B - Hp <= 2.5 && Hp - B < 9 && (B - W >= 23 || Hp - W >= 25)) return "reloj";
  if (Hp - B >= 9) return "pera";
  if (B - Hp >= 9) return "triangulo_invertido";
  if (Math.abs(B - Hp) < 9 && (B - W >= 20 || Hp - W >= 22)) return "reloj";
  return "rectangulo";
}
export function calcProporcion(m) {
  const a = +m.altura, p = +m.entrepierna;
  if (!a || !p) return null;
  const r = p / a;
  return r >= 0.47 ? "piernas largas" : r <= 0.44 ? "torso largo y piernas más cortas" : "torso y piernas equilibrados";
}
export const alturaRango = cm => (!cm ? null : cm < 160 ? "baja" : cm <= 170 ? "media" : "alta");
