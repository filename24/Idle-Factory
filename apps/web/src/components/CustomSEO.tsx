import Head from 'next/head'

const Name = 'Idle Factory'

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
  description: '모바일 게임의 종류인 Idle game 기반으로 개발된 게임봇',
  keyword: '디시코드봇, Idle game, 게임봇',
  image: '',
}

interface SeoProps {
  title?: string
  description?: string
  keyword?: string
  image?: string
}

export default CustomSEO
