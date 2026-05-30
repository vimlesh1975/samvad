import './styles.css';

export const metadata = {
  title: 'Samvad WebSocket Inspector',
  description: 'Next.js inspector for Samvad teleprompter WebSocket frames',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
