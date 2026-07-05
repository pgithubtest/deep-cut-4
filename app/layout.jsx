import './globals.css';
import './polish.css';
import CatchUpEnhancer from './catchup-enhancer';

export const metadata = {
  title: 'Deep Cut',
  description: 'Listen through an artist catalogue in order.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <CatchUpEnhancer />
      </body>
    </html>
  );
}
