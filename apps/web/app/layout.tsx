import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { Providers } from '@/components/providers';
import './globals.css';

// Self-hosted Poppins (latin). Antes usábamos `next/font/google` que
// fetch a fonts.gstatic.com en build-time; cuando la red del builder
// de Dokploy no resuelve Google Fonts, Next reintenta 3 veces y a
// veces marca el deploy como Error. Self-hosting elimina la
// dependencia externa: los .woff2 viven en el repo y Next los
// optimiza igual (preload, hash, font-display: swap).
const poppins = localFont({
  src: [
    { path: './fonts/poppins-300.woff2', weight: '300', style: 'normal' },
    { path: './fonts/poppins-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/poppins-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/poppins-600.woff2', weight: '600', style: 'normal' },
    { path: './fonts/poppins-700.woff2', weight: '700', style: 'normal' },
    { path: './fonts/poppins-800.woff2', weight: '800', style: 'normal' },
    { path: './fonts/poppins-900.woff2', weight: '900', style: 'normal' },
  ],
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
