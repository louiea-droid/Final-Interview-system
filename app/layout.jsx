import { Inter, Poppins } from 'next/font/google';

import './globals.css';
import './tailwind.css';
import { ToastProvider } from '../components/ToastProvider';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata = {
  title: 'Interview Admin Panel',
  description: 'Interview candidate management dashboard',
  icons: {
    icon: '/visual/HILLC-Petals.png',
    apple: '/visual/HILLC-Petals.png',
  },
  openGraph: {
    title: 'Interview Admin Panel',
    description: 'Interview candidate management dashboard',
    images: ['/visual/HILLC-Petals.png'],
  },
};

export default function RootLayout({
  children,
}) {
  return (
    <html lang="en" className={`${inter.variable} ${poppins.variable}`}>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}