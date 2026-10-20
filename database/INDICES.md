# Índices: qué hay, qué se midió y qué NO hace falta ejecutar

Medido el 2026-10-19 sobre la rama de desarrollo de Neon (tablas de 0 a 95 filas) y sobre una tabla TEMPORAL de 200.000 movimientos de billetera (no toca datos reales).

## Estado actual
Casi todas las consultas ya tienen índice: `dropi_orders (owner_id, created_date)`, `card_transactions (owner_id, tx_date)`, `meta_spend_daily (owner_id, day)`, `meta_charges (owner_id, charged_date)`,
`wallet_movements (owner_id, tx_at)` y `(owner_id, order_ref)`.

## Lo que se midió (200.000 movimientos)
| Consulta | Sin índice | Con índice | Veredicto |
|---|---|---|---|
| Flujo por día, filtrando `tx_date >= inicio` (índice `(owner_id, tx_date, kind)`) | 36 ms | 36 ms | **No sirve**: el filtro trae casi todo desde el inicio de la operación |
| Ganancias no reversadas, `NOT EXISTS … reverses = external_id` (índice parcial `(owner_id, reverses)`) | 42 ms | 25 ms | Mejora pequeña en términos absolutos |

**Conclusión: no ejecutes ningún índice por ahora.** El tiempo de una visita lo dominan los viajes a la base (~94 ms cada uno) y no el motor de consultas; por eso el trabajo útil fue reducir consultas
(Cortes 85 → 32, Inicio 62 → 29), no indexar.

## Cuándo reconsiderarlo
Si `wallet_movements` supera ~100.000 filas y las pantallas se sienten lentas. El único candidato con ganancia medible:

```sql
-- Producción: SIEMPRE con CONCURRENTLY (no bloquea las escrituras) y como una sola sentencia, fuera de una transacción.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wallet_mov_owner_reverses ON wallet_movements (owner_id, reverses) WHERE reverses IS NOT NULL;
-- Deshacer (no toca ningún dato):
DROP INDEX CONCURRENTLY IF EXISTS idx_wallet_mov_owner_reverses;
```
Un índice nunca cambia ni borra datos: lo peor que puede pasar es ocupar algo de disco y hacer un poco más lenta cada inserción. Pruébalo antes en la rama de desarrollo y compara con `EXPLAIN ANALYZE`.
