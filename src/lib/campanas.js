/** IDs de producto de Dropi: solo dígitos, sin repetir, máximo 50. Devuelve el arreglo limpio o null si algo no vale. */
export const limpiarProductos = (v) => {
  if (!Array.isArray(v) || v.length > 50) return null
  const ids = [...new Set(v.map(String))]
  return ids.every((x) => /^\d{1,12}$/.test(x)) ? ids : null
}
