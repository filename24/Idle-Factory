import Document, { Html, Head, Main, NextScript } from 'next/document'

export default class MyDocument extends Document {
  render() {
    return (
      <Html lang="en">
        <Head>
          <meta charSet="utf-8" />
          <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
          <meta
            name="viewport"
            content="minimum-scale=1, initial-scale=1, width=device-width, shrink-to-fit=no, user-scalable=no, viewport-fit=cover"
          />

          {/* Disable IE */}
          <script
            dangerouslySetInnerHTML={{
              __html: `
                if(/MSIE \\d|Trident.*rv:/.test(navigator.userAgent)) {
                  window.location = 'microsoft-edge:' + window.location;
                  setTimeout(function() {
                    window.location = 'https://go.microsoft.com/fwlink/?linkid=2135547';
                  }, 1);
                }
						    `,
            }}
          />
          <noscript>This website requires JavaScript to be enabled.</noscript>
        </Head>

        <body>
          <Main />

          <NextScript />
        </body>
      </Html>
    )
  }
}
