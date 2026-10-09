import './pauta.css'
import { headers } from 'next/headers'
import { Inter, JetBrains_Mono } from 'next/font/google'

// Fuentes autoalojadas por Next (sin pedir nada a Google en tiempo de ejecución): CSP estricta y mejor privacidad.
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], display: 'swap', variable: '--font-inter' })
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['500', '600', '700'], display: 'swap', variable: '--font-mono' })

export const metadata = {
  title: 'DropFlexAds Ops',
  description: 'Contabilidad real de tu operación de dropshipping',
  robots: { index: false, follow: false },
}

export default async function RootLayout({ children }) {
  await headers() // render dinámico: cada respuesta lleva su propio nonce de CSP
  return (
    <html lang="es" className={`${inter.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
