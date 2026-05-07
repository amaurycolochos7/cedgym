import type { Metadata, Viewport } from 'next';
import { Poppins } from 'next/font/google';
import { Providers } from '@/components/providers';
import './globals.css';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900'],
  variable: '--font-poppins',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'CED·GYM — Plataforma multi-deporte',
  description:
    'CED·GYM es la plataforma integral de preparación física para atletas: rutinas, seguimiento y comunidad.',
  metadataBase: new URL('https://cedgym.mx'),
  openGraph: {
    title: 'CED·GYM',
    description:
      'Plataforma multi-deporte de preparación física para atletas',
    type: 'website',
    locale: 'es_MX',
  },
  icons: {
    icon: [
      { url: '/favicon.png', type: 'image/png', sizes: '512x512' },
      { url: '/logo.png', type: 'image/png' },
    ],
    // iOS toma el apple-touch-icon más cercano a 180×180 para el
    // ícono que se ancla en la pantalla de inicio. icon-192 le sirve
    // (lo escala a 180 sin perder calidad notoria). Si más adelante
    // tenemos un PNG de 180×180 dedicado, agregarlo arriba de éste.
    apple: [
      { url: '/icons/icon-192.png', sizes: '180x180', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: ['/favicon.png'],
  },
  manifest: '/manifest.json',
  // Configura la WebApp para iOS. Con esto Safari, al "Agregar a
  // pantalla de inicio", la abre en modo standalone (sin barra del
  // navegador) y reconoce el título correcto del ícono.
  appleWebApp: {
    capable: true,
    title: 'CED·GYM',
    statusBarStyle: 'default',
  },
  // Hint para Microsoft Edge / Windows tile (no afecta iOS).
  other: {
    'mobile-web-app-capable': 'yes',
    'application-name': 'CED·GYM',
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${poppins.variable} dark`}>
      <body className="min-h-screen overflow-x-hidden bg-background text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
