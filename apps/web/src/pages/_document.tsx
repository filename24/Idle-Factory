import Document, {
  Html,
  Head,
  Main,
  NextScript,
  DocumentContext,
} from 'next/document'

export default class MyDocument extends Document {
  static async getInitialProps(ctx: DocumentContext) {
    const initialProps = await Document.getInitialProps(ctx)

    return initialProps
  }
  render() {
    return (
      <Html lang="en">
        <Head>
          <meta charSet="utf-8" />
          <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
          <meta name="viewport" content="initial-scale=1, width=device-width" />

          <link
            rel="stylesheet"
            as="style"
            href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.6/dist/web/variable/pretendardvariable-dynamic-subset.css"
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
