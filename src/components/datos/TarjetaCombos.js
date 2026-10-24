import { cop, fmtN } from '@/lib/formato'

/** «Combos y precios» → «Lo vendido por combo» (mismo diseño de la app original), armado con los pedidos entregados de Dropi y la ganancia real de la billetera. */
export default function TarjetaCombos({ c }) {
  const t = c.total
  const gcol = (n) => (n == null ? undefined : n >= 0 ? 'var(--jade-ink)' : 'var(--coral-ink)')
  return (
    <div className="card" style={{ margin: '0 0 16px' }}>
      <div className="sec-head" style={{ margin: 0, alignItems: 'flex-start' }}>
        <div>
          <h2>Combos y precios</h2>
          <p className="muted" style={{ fontSize: 14, margin: '2px 0 0' }}>Se clasifican por el valor total que devuelve Dropi en cada pedido entregado: cada precio es un combo (y se muestra cuántas unidades lleva).</p>
        </div>
      </div>
      {c.filas.length === 0 ? (
        <p className="empty-note" style={{ margin: '14px 0 0' }}>Aún no hay pedidos entregados con valor para armar los combos.</p>
      ) : (
        <details className="md-flat md-sec" open style={{ marginTop: 14 }}>
          <summary>Lo vendido por combo <span className="md-sm">{fmtN(t.ventas)} {t.ventas === 1 ? 'venta' : 'ventas'} · {cop(t.gananciaTotal)} de ganancia real</span></summary>
          <div className="scroll-x">
            <table className="tbl tbl-combos">
              <thead><tr><th style={{ textAlign: 'left' }}>Valor del pedido</th><th>Combo</th><th>Ventas</th><th>% ventas</th><th>Facturado</th><th>Ganancia por venta</th><th>Ganancia total</th></tr></thead>
              <tbody>
                {c.filas.map((f) => (
                  <tr key={f.valor}>
                    <td><b>{cop(f.valor)}</b></td>
                    <td className="num">{f.unidades ? f.unidades + 'x' : '—'}</td>
                    <td className="num">{fmtN(f.ventas)}</td>
                    <td className="num">{f.pctVentas} %</td>
                    <td className="num">{cop(f.facturado)}</td>
                    <td className="num" style={{ color: gcol(f.gananciaPorVenta), fontWeight: 700 }}>{f.gananciaPorVenta == null ? '—' : cop(f.gananciaPorVenta)}</td>
                    <td className="num" style={{ color: gcol(f.conGanancia ? f.gananciaTotal : null), fontWeight: 700 }}>{f.conGanancia ? cop(f.gananciaTotal) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--ink)' }}>
                  <td><b>Total</b></td><td /><td className="num"><b>{fmtN(t.ventas)}</b></td><td />
                  <td className="num"><b>{cop(t.facturado)}</b></td>
                  <td className="num"><b>{t.gananciaPorVenta == null ? '—' : cop(t.gananciaPorVenta)}</b></td>
                  <td className="num" style={{ color: gcol(t.conGanancia ? t.gananciaTotal : null) }}><b>{t.conGanancia ? cop(t.gananciaTotal) : '—'}</b></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>
            «Ventas» = pedidos entregados. La ganancia es la real que Dropi ya pagó a tu billetera (ya descuenta producto, comisión y flete); todavía no resta la publicidad ni las devoluciones.
            {t.ventas > t.conGanancia ? ` ${fmtN(t.ventas - t.conGanancia)} ${t.ventas - t.conGanancia === 1 ? 'venta todavía no tiene' : 'ventas todavía no tienen'} su ganancia en la billetera y no cuenta${t.ventas - t.conGanancia === 1 ? '' : 'n'} en el promedio.` : ''}
            {c.sinValor > 0 ? ` ${fmtN(c.sinValor)} ${c.sinValor === 1 ? 'entregado no trae' : 'entregados no traen'} su valor total: sincroniza de nuevo.` : ''}
          </p>
        </details>
      )}
    </div>
  )
}
