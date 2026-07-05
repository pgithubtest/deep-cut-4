import './globals.css';
import './polish.css';

export const metadata = {
  title: 'Deep Cut',
  description: 'Listen through an artist catalogue in order.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
