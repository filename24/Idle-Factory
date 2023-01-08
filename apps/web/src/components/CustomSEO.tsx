import Head from 'next/head'

const Name = 'Template'

const CustomSEO: React.FC<SeoProps> = ({
  title,
  description,
  keyword,
  image,
}) => {
  return (
    <>
      <Head>
        <title>{`${Name} - ` + title}</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content={description} />
        <meta name="keyword" content={keyword} />

        {/* Open Graph */}
        <meta property="og:site_name" content={Name} />
        <meta property="og:image" content={image} />
        <meta property="og:title" content={`${Name} - ` + title} />
        <meta property="og:description" content={description} />

        {/* Twitter */}
        <meta name="twitter:card" content={image} />
        <meta name="twitter:site" content="" />
        <meta name="twitter:title" content={`${Name} - ` + title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={image} />
      </Head>
    </>
  )
}

CustomSEO.defaultProps = {
  title: Name,
  description: 'This site created with next.js',
  keyword: '',
  image: '',
}

interface SeoProps {
  title?: string
  description?: string
  keyword?: string
  image?: string
}

export default CustomSEO
