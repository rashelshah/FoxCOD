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
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
        <style>{`
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
            background: linear-gradient(90deg, #6366f1, #8b5cf6, #6366f1);
            background-size: 200% 100%;
            animation: shimmer 1.5s infinite;
            z-index: 9999;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.2s ease;
          }
          
          .page-loading-overlay.active {
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
          
          .page-content.loading {
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
        `}</style>
      </head>
      <body>
        <div className={`page-loading-overlay ${isLoading ? 'active' : ''}`} />
        <div className={`page-content ${isLoading ? 'loading' : ''}`}>
          <Outlet />
        </div>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
