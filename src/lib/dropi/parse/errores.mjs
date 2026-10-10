// Motivo de un error de Dropi para mostrarlo a la persona: solo su campo `message`/`error`, recortado y sin cadenas largas que parezcan tokens.
export function motivoDropi(text) {
  try {
    const j = JSON.parse(text)
    return String(j.message || j.error || '').replace(/\s+/g, ' ').replace(/[A-Za-z0-9_\-.]{30,}/g, '…').slice(0, 90)
  } catch { return '' } // la respuesta no era JSON
}
