import './globals.css';

export const metadata = {
  title: 'Interview Admin Panel',
  description: 'Interview candidate management dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}