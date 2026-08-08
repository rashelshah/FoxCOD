import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

export default function App() {
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
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Nunito:wght@400;500;600;700&family=Outfit:wght@400;500;600;700&family=Poppins:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
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

          /* Live-preview phone-mockup scrollbars (Form Builder, Bundle Offers,
             Upsells & Downsells, Branding): invisible at rest, briefly visible
             while actively scrolling (via the .is-scrolling class toggled from
             an onScroll handler), then fades back out — mirrors macOS overlay
             scrollbars instead of Windows/Chrome's persistent scrollbar track. */
          .preview-phone-screen, .pv-phone-screen {
            scrollbar-width: none;
          }
          .preview-phone-screen::-webkit-scrollbar,
          .pv-phone-screen::-webkit-scrollbar {
            width: 4px;
            background: transparent;
          }
          .preview-phone-screen::-webkit-scrollbar-thumb,
          .pv-phone-screen::-webkit-scrollbar-thumb {
            background: transparent;
            border-radius: 4px;
            transition: background 0.2s ease;
          }
          .preview-phone-screen.is-scrolling,
          .pv-phone-screen.is-scrolling {
            scrollbar-width: thin;
            scrollbar-color: rgba(156, 163, 175, 0.6) transparent;
          }
          .preview-phone-screen.is-scrolling::-webkit-scrollbar-thumb,
          .pv-phone-screen.is-scrolling::-webkit-scrollbar-thumb {
            background: rgba(156, 163, 175, 0.6);
          }
        `}} />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
