import { Links, Meta, Outlet, Scripts, ScrollRestoration, useNavigation } from "react-router";

export default function App() {
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Outfit:wght@400;500;600;700&family=Poppins:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&family=Cormorant+Garamond:wght@400;500;600;700&family=Abril+Fatface:wght@400;500;600;700&family=Syne:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <Meta />
        <Links />
        <style dangerouslySetInnerHTML={{
          __html: `
          /* Global smooth transitions */
          * {
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
          }
          
          /* Page transition overlay */
          .page-loading-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: linear-gradient(90deg, #202223, #000000, #202223);
            background-size: 200% 100%;
            animation: shimmer 1.5s infinite linear;
            z-index: 9999;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.3s ease;
          }
          
          .page-loading-overlay[data-loading="true"] {
            opacity: 1;
          }
          
          @keyframes shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
          
          /* Smooth page content fade */
          .page-content {
            opacity: 1;
            transition: opacity 0.15s ease;
          }
          
          .page-content[data-loading="true"] {
            opacity: 0.7;
            pointer-events: none;
          }
          
          /* Faster link transitions */
          a {
            transition: color 0.1s ease, opacity 0.1s ease;
          }
          
          /* Button interactions */
          button, .btn, [role='button'] {
            transition: transform 0.1s ease, background-color 0.1s ease, box-shadow 0.1s ease;
          }
          
          button:active, .btn:active, [role='button']:active {
            transform: scale(0.98);
          }
        `}} />
      </head>
      <body>
        <div className="page-loading-overlay" data-loading={isLoading} />
        <div className="page-content" data-loading={isLoading}>
          <Outlet />
        </div>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
