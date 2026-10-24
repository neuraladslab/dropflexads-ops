// Copies de Meta Ads (texto principal, título y descripción) generados por la IA para cada creativo.
// Puro (sin base de datos ni red): valida la respuesta del modelo y la REVISA contra las normas de publicidad de Meta que más baneos causan
// (atributos personales, promesas médicas o milagrosas, antes/después, cifras o pruebas inventadas, urgencia falsa, exceso de mayúsculas/emojis).
// El modelo recibe estas mismas reglas en su instrucción; esta revisión es la segunda barrera: nada «sospechoso» llega a la pantalla sin aviso.

export const FORMULAS = ["AIDA", "PAS"] as const;
export type Formula = (typeof FORMULAS)[number];
export const CANTIDAD_COPIES = 5;
/** Meta muestra ~125 caracteres del texto principal antes de «ver más»; el título y la descripción se recortan en móvil. */
export const LIMITES = { principalVisible: 125, principal: 600, titulo: 40, descripcion: 30, emojisPrincipal: 5, emojisTitulo: 1, emojisDescripcion: 1 };

export type Copy = { formula: Formula; principal: string; titulo: string; descripcion: string };
export type CopyRevisado = Copy & { avisos: string[] };
export type ContextoCopy = { campana: string; productos: string[]; angulo: string; formato: string; gancho: string | null };

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const EMOJI = /\p{Extended_Pictographic}/gu;
export const contarEmojis = (s: string) => (s.match(EMOJI) ?? []).length;

/** Cada regla: patrón sobre el texto sin tildes y en minúsculas → motivo (lo que se le muestra a la persona y al modelo para corregir). */
const REGLAS: { re: RegExp; motivo: string }[] = [
  { re: /garantiz|100 ?% ?(efectiv|seguro|natural)|resultados? (inmediat|garantizad|asegurad)|milagr|definitiv[ao]|para siempre|sin esfuerzo|de la noche a la manana/, motivo: "Promete resultados garantizados o milagrosos (Meta lo rechaza)." },
  { re: /\b(cura|curar|curativ\w*|sana|sanar|tratamiento|tratar|previene|prevenir|medicament\w*|medicina|enfermedad\w*|dolencia\w*|artritis|artrosis|osteoporosis|diabetes|terapeutic\w*)\b/, motivo: "Habla de curar, tratar o prevenir una enfermedad (claim médico)." },
  { re: /(elimina|quita|acaba con|adios (al|a))\w* (el |tu |tus |los |las )?(dolor\w*|arrugas|ojeras|celulitis|grasa)/, motivo: "Promete eliminar un dolor o rasgo físico." },
  { re: /(tienes|tiene|sufres|sufre|padeces|padece|estas|eres|te sientes|te duele|te duelen|te cansas|te afecta)\b[^.!?\n]{0,25}\b(dolor\w*|articulacion\w*|obes\w*|gord\w*|sobrepeso|arrugas|cansad\w*|fatiga\w*|ojos irritad\w*|ansios\w*|deprimid\w*|calv\w*|flacid\w*|problemas? de)/, motivo: "Se dirige a la persona asumiendo una condición de salud o físico (atributo personal)." },
  { re: /\b(tu|tus) (dolor\w*|problema\w*|sobrepeso|arrugas|cansancio|fatiga|obesidad|enfermedad\w*|ojos irritad\w*)\b/, motivo: "Asume que la persona tiene un problema de salud o físico (atributo personal)." },
  { re: /antes y despues|antes\/despues|before|despues de (usar|tomar)/, motivo: "Insinúa un «antes y después» (prohibido)." },
  { re: /testimonio|miles de (clientes|personas|mujeres|hombres)|clientes? satisfech\w*|(\d+ ?(mil )?|\d+k )(clientes|personas|ventas)|estudios? (demuestra|comprueba|cientific)|clinicamente|comprobado|aprobado por|certificad[ao]|invima|\bfda\b|el mejor|numero 1|#1/, motivo: "Afirma pruebas, testimonios, certificaciones o superlativos que no están en los datos." },
  { re: /ultim[oa]s? (unidades|cupos|piezas)|solo hoy|se agota|stock limitado|termina (hoy|manana)|ultima oportunidad|quedan \d+/, motivo: "Urgencia o escasez que no se puede verificar." },
  { re: /facebook|instagram|\bmeta\b/, motivo: "Menciona marcas de Meta en el texto del anuncio." },
  { re: /haz clic aqui|click aqui|clic aqui/, motivo: "«Haz clic aquí» está desaconsejado por Meta: usa un llamado a la acción natural." },
  { re: /\bgratis\b|\bregalo\b/, motivo: "«Gratis» o «regalo» solo si es literalmente cierto; no está en los datos." },
];

/** Números que aparecen en el contexto (nombre del producto, ángulo, gancho): solo esos pueden salir en un copy. */
const numerosDe = (s: string) => new Set((sinTildes(s).match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", ".")));

export function revisarCopy(c: Copy, ctx: ContextoCopy): string[] {
  const avisos: string[] = [];
  const todo = `${c.principal}\n${c.titulo}\n${c.descripcion}`, plano = sinTildes(todo);
  for (const r of REGLAS) if (r.re.test(plano)) avisos.push(r.motivo);
  // Cifras: solo las que ya están en el contexto de la persona (precios, porcentajes, años de «rejuvenecer»… se inventan fácil).
  const permitidas = numerosDe([ctx.campana, ...ctx.productos, ctx.angulo, ctx.gancho ?? ""].join(" "));
  const sobran = [...numerosDe(todo)].filter((n) => !permitidas.has(n));
  if (sobran.length) avisos.push(`Usa cifras que no están en tus datos (${sobran.slice(0, 3).join(", ")}).`);
  // Forma.
  if ((todo.match(/[A-ZÁÉÍÓÚÑ]{4,}/g) ?? []).length > 1) avisos.push("Demasiadas palabras en MAYÚSCULAS.");
  if (/[!¡]{2,}|[?¿]{2,}|!.*!.*!/.test(todo)) avisos.push("Exceso de signos de exclamación o interrogación.");
  if (contarEmojis(c.principal) < 1) avisos.push("El texto principal no lleva ningún emoji.");
  if (contarEmojis(c.principal) > LIMITES.emojisPrincipal) avisos.push(`Más de ${LIMITES.emojisPrincipal} emojis en el texto principal.`);
  if (contarEmojis(c.titulo) > LIMITES.emojisTitulo) avisos.push("Más de un emoji en el título.");
  if (contarEmojis(c.descripcion) > LIMITES.emojisDescripcion) avisos.push("Más de un emoji en la descripción.");
  if (c.principal.length > LIMITES.principal) avisos.push(`El texto principal pasa de ${LIMITES.principal} caracteres.`);
  if (c.titulo.length > LIMITES.titulo) avisos.push(`El título pasa de ${LIMITES.titulo} caracteres (Meta lo recorta).`);
  if (c.descripcion.length > LIMITES.descripcion) avisos.push(`La descripción pasa de ${LIMITES.descripcion} caracteres (Meta la recorta).`);
  return [...new Set(avisos)];
}

const limpiar = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").trim().slice(0, max) : "");

/** Convierte el texto del modelo en copies válidos: busca el JSON, exige la forma esperada y descarta lo que no la cumple. */
export function leerCopies(texto: string): { ok: true; copies: Copy[] } | { ok: false; error: string } {
  const i = texto.indexOf("{"), j = texto.lastIndexOf("}");
  if (i < 0 || j <= i) return { ok: false, error: "La respuesta no trae JSON." };
  let raw: { copies?: unknown } | null;
  try { raw = JSON.parse(texto.slice(i, j + 1)); } catch { return { ok: false, error: "El JSON no se pudo leer." }; }
  const lista = Array.isArray(raw?.copies) ? (raw.copies as Record<string, unknown>[]) : null;
  if (!lista) return { ok: false, error: "Falta la lista «copies»." };
  const copies: Copy[] = [];
  for (const x of lista) {
    const formula = String(x?.formula ?? "").toUpperCase().trim();
    const principal = limpiar(x?.texto_principal ?? x?.principal, 1500), titulo = limpiar(x?.titulo, 120), descripcion = limpiar(x?.descripcion, 120);
    if (!(FORMULAS as readonly string[]).includes(formula) || !principal || !titulo || !descripcion) continue;
    copies.push({ formula: formula as Formula, principal, titulo, descripcion });
  }
  if (copies.length < CANTIDAD_COPIES) return { ok: false, error: `Vinieron ${copies.length} copies válidos y se necesitan ${CANTIDAD_COPIES}.` };
  return { ok: true, copies: copies.slice(0, CANTIDAD_COPIES) };
}

export const revisarTodos = (copies: Copy[], ctx: ContextoCopy): CopyRevisado[] => copies.map((c) => ({ ...c, avisos: revisarCopy(c, ctx) }));
