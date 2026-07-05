import './globals.css';
import './polish.css';
import './sessions.css';
import './artist-orientation.css';
import CatchUpEnhancer from './catchup-enhancer';
import ArtistOrientationEnhancer from './artist-orientation-enhancer';

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
        <ArtistOrientationEnhancer />
      </body>
    </html>
  );
}
