/** Un candidato por movimiento, y ese candidato no lo reclama otro movimiento. */
export function emparejarUnico<TMov extends { id: string }, TCand extends { id: string }>(
  movimientos: readonly TMov[],
  candidatos: (mov: TMov) => readonly TCand[],
): Map<string, TCand> {
  const reclamos = new Map<string, Array<{ movId: string; cand: TCand }>>()
  for (const mov of movimientos) {
    const lista = candidatos(mov)
    if (lista.length !== 1) continue
    const cand = lista[0]
    if (!cand) continue
    const grupo = reclamos.get(cand.id) ?? []
    grupo.push({ movId: mov.id, cand })
    reclamos.set(cand.id, grupo)
  }
  const resultado = new Map<string, TCand>()
  for (const grupo of reclamos.values()) {
    if (grupo.length !== 1) continue
    const unico = grupo[0]
    if (!unico) continue
    resultado.set(unico.movId, unico.cand)
  }
  return resultado
}
