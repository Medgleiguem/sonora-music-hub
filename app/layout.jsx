import '../src/styles.css';
import PwaRegister from '../src/PwaRegister';
import { Analytics } from '@vercel/analytics/next';

export const metadata = {
  title: 'Sonora — Your music, in one place',
  description: 'Your private, local-first music library.',
  applicationName: 'Sonora'
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b0b0c'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body><PwaRegister />{children}<Analytics /></body>
    </html>
  );
}
