// Llamadas directas a la API de Claude desde el dispositivo, con la clave de cada persona.
// La clave se guarda solo en este navegador (localStorage) y viaja únicamente a api.anthropic.com.
export const MODELOS = {
  equilibrado: { id: "claude-sonnet-5-5", nombre: "Equilibrado (Sonnet 5.5)" },
  economico: { id: "claude-haiku-5-5", nombre: "Económico (Haiku 5.5)" },
  maximo: { id: "claude-opus-5-5", nombre: "Máxima calidad (Opus 5.5)" },
};
const KEY = "ebo.apiKey", MODEL = "ebo.modelo";
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} },
};
export const getKey = () => ls.get(KEY) || "";
export const setKey = k => ls.set(KEY, k ? k.trim() : null);
export const getModelo = () => (MODELOS[ls.get(MODEL)] ? ls.get(MODEL) : "equilibrado");
export const setModelo = m => ls.set(MODEL, m);

export class AIError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function friendly(status, body) {
  const msg = (body && body.error && body.error.message) || "";
  if (status === 401) return new AIError("auth", "La clave no es válida. Revísala en Ajustes: debe empezar por sk-ant-.");
  if (status === 403) return new AIError("forbidden", "Tu clave no tiene permiso para este modelo. Prueba con otro en Ajustes.");
  if (status === 429) return new AIError("rate", "Has hecho muchas consultas seguidas o has llegado a tu límite de gasto. Espera un poco o revisa tus límites en la consola de Anthropic.");
  if (status === 529 || status === 503) return new AIError("overloaded", "Claude está saturado ahora mismo. Vuelve a intentarlo en un minuto.");
  if (status === 400 && /credit|balance/i.test(msg)) return new AIError("credit", "No te queda saldo en tu cuenta de Anthropic. Recarga en platform.claude.com, apartado Billing.");
  if (status === 400 && /image/i.test(msg)) return new AIError("image", "Claude no pudo leer alguna imagen. Prueba con otra foto.");
  if (status === 413) return new AIError("size", "Las fotos pesan demasiado. Prueba con menos imágenes.");
  return new AIError("other", "Algo falló al consultar a Claude" + (msg ? ": " + msg : ".") );
}

// Imagen -> JPEG base64 reducido (ahorra tokens y saldo)
export async function imageBlock(file, max = 1200) {
  const data = await resizeToDataURL(file, max, 0.82);
  return { type: "image", source: { type: "base64", media_type: "image/jpeg", data: data.split(",")[1] } };
}
export async function resizeToDataURL(file, max, q) {
  let src;
  try { src = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch (e) {
    src = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new AIError("image", "No pude abrir esa imagen.")); im.src = URL.createObjectURL(file); });
  }
  const s = Math.min(1, max / Math.max(src.width, src.height));
  const c = document.createElement("canvas");
  c.width = Math.round(src.width * s); c.height = Math.round(src.height * s);
  c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", q);
}

export async function ask({ system, prompt, images = [], schema, modelo, effort = "medium", maxTokens = 12000, signal }) {
  const key = getKey();
  if (!key) throw new AIError("nokey", "Falta tu clave de Claude. Añádela en Ajustes.");
  const content = [...images, { type: "text", text: prompt }];
  const body = {
    model: MODELOS[modelo || getModelo()].id,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content }],
    output_config: { effort, format: { type: "json_schema", schema } },
  };
  let res;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    if (e.name === "AbortError") throw new AIError("cancelled", "");
    throw new AIError("network", "No hay conexión con Claude. Revisa tu internet.");
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) throw friendly(res.status, json);
  if (json.stop_reason === "refusal") throw new AIError("refused", "Claude no pudo analizar esto. Prueba con otra foto o descripción.");
  if (json.stop_reason === "max_tokens") throw new AIError("truncated", "La respuesta se cortó. Vuelve a intentarlo o pide menos a la vez.");
  const text = (json.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  try { return JSON.parse(text); }
  catch (e) {
    const a = text.indexOf("{"), b = text.lastIndexOf("}");
    if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch (e2) {} }
    throw new AIError("json", "La respuesta llegó en un formato inesperado. Vuelve a intentarlo.");
  }
}

export async function testKey(key) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key.trim(), "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({ model: MODELOS.economico.id, max_tokens: 16, messages: [{ role: "user", content: "Responde solo: ok" }] }),
  }).catch(() => { throw new AIError("network", "No hay conexión. Revisa tu internet."); });
  if (!res.ok) throw friendly(res.status, await res.json().catch(() => null));
  return true;
}

/* ---------- esquemas JSON (salida estructurada) ---------- */
export const CATS = ["Abrigos", "Chaquetas y blazers", "Punto", "Camisas y tops", "Camisetas", "Pantalones", "Vaqueros", "Faldas", "Vestidos", "Calzado", "Bolsos", "Accesorios"];
export const TIPOS = ["camiseta", "camisa", "jersey", "cuello_alto", "cardigan", "top_tirantes", "body", "blazer", "chaqueta_corta", "abrigo_largo", "pantalon_recto", "pantalon_ancho", "vaquero", "pantalon_pitillo", "falda_mini", "falda_midi", "falda_larga", "vestido_mini", "vestido_midi", "vestido_largo", "botas_altas", "botines", "mocasines", "bailarinas", "tacones", "zapatillas", "sandalias", "bolso", "bolso_mano", "cinturon", "panuelo", "collar"];
export const ESTAMPADOS = ["liso", "rayas", "rayas_marineras", "cuadros", "pata_de_gallo", "espiga", "lunares", "animal", "floral"];
export const TEJIDOS = ["algodon", "lana", "punto", "lino", "seda", "saten", "piel", "ante", "denim", "terciopelo", "lentejuelas", "sintetico"];

const str = d => (d ? { type: "string", description: d } : { type: "string" });
const int = d => ({ type: "integer", description: d });
const en = (vals, d) => (d ? { type: "string", enum: vals, description: d } : { type: "string", enum: vals });
const arr = (items, d) => (d ? { type: "array", items, description: d } : { type: "array", items });
export const obj = props => ({ type: "object", properties: props, required: Object.keys(props), additionalProperties: false });

const COLOR = obj({ hex: str("#rrggbb"), nombre: str() });
const PUNTO = obj({ x: { type: "number", description: "0 a 1, desde la izquierda" }, y: { type: "number", description: "0 a 1, desde arriba" } });
export const S_PIEZA = obj({
  nombre: str("Nombre concreto de la prenda"),
  id: str("id de su armario si la tiene; cadena vacía si no"),
  tipo: en(TIPOS), color: str(), hex: str("#rrggbb"), estampado: en(ESTAMPADOS), tejido: en(TEJIDOS),
});
export const S_BELLEZA = obj({
  labios: str("Color y acabado de labios"), labios_hex: str("#rrggbb"),
  ojos: str("Sombra o máscara recomendada"), joyas: str("Joyas y metal concretos"),
});
export const S_OUTFIT = obj({ titulo: str(), ocasion: str(), por_que: str("1 frase sobre por qué le favorece, incluida su silueta"), piezas: arr(S_PIEZA), belleza: S_BELLEZA });
export const S_LOOKS = obj({ outfits: arr(S_OUTFIT, "Exactamente 3 looks") });
export const S_ANALISIS = obj({
  prenda: str("Nombre corto"), categoria: en(CATS), tipo: en(TIPOS), color: str(), hex: str("#rrggbb"), estampado: en(ESTAMPADOS), tejido: en(TEJIDOS),
  puntuaciones: obj({ color: int("0 a 10"), estilo: int("0 a 10"), versatilidad: int("0 a 10"), calidad_precio: int("0 a 10") }),
  veredicto: en(["quedatela", "con_matices", "devuelvela"]),
  titular: str("Una frase directa"), colorimetria: str("2-3 frases"), estilo: str("1-2 frases"),
  silueta: str("Si alguna foto la muestra puesta, cómo le queda el corte; si no, qué vigilar en el probador (1-2 frases)"),
  como_llevarla: arr(str(), "Máximo 3 consejos concretos"), outfits: arr(S_OUTFIT, "Exactamente 3 looks"),
});
export const S_PERFIL = obj({
  estacion: str("Una de las 12 estaciones, p. ej. Otoño Profundo"), descripcion: str("2 frases claras"),
  subtono: str(), valor: str("claro, medio u oscuro"), intensidad: str("suave o brillante"), contraste: en(["bajo", "medio", "medio-alto", "alto"]),
  metal: en(["Oro", "Plata", "Ambos"]), piel_hex: str("#rrggbb"), pelo_hex: str("#rrggbb"), ojos: str(), ojos_hex: str("#rrggbb"),
  rostro: str("Forma y rasgos útiles para estilismo"),
  confianza: en(["alta", "media", "baja"]), motivo_confianza: str("Qué ha limitado o apoyado el diagnóstico (luz, maquillaje, folio blanco...)"),
  alternativa: str("Estación vecina posible si hay duda"),
  neutros: arr(COLOR, "6 neutros"), acentos: arr(COLOR, "8 acentos"), evitar: arr(COLOR, "4 colores a evitar junto a la cara"),
  reglas: arr(str(), "4 reglas concretas de prendas y combinaciones"),
  maquillaje: obj({ labios: str(), ojos: str(), colorete: str() }),
  peinado: en(["long_bob", "largo", "corto", "rizado", "recogido"], "El que más se parece a su peinado"),
  muestras: obj({ piel: PUNTO, pelo: PUNTO, folio: PUNTO, folio_visible: { type: "boolean" } }),
});
export const S_IDENT = obj({ nombre: str("Nombre corto en español"), categoria: en(CATS), tipo: en(TIPOS), color: str(), hex: str("#rrggbb"), estampado: en(ESTAMPADOS), tejido: en(TEJIDOS) });
export const S_COMPRAS = obj({ items: arr(obj({ prenda: str(), color: str(), hex: str("#rrggbb"), prioridad: en(["alta", "media", "baja"]), por_que: str("1 frase"), buscar: str("2-4 palabras para buscar en la tienda"), tienda: str() }), "Entre 6 y 9 prendas") });
