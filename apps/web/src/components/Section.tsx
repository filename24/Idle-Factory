import classNames from 'classnames'

const Section: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => {
  return (
    <section
      className={classNames('flex w-full flex-col items-center', className)}
    >
      {children}
    </section>
  )
}

export default Section
