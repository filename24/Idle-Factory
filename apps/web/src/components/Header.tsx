import classNames from 'classnames'
import Link from 'next/link'
import * as React from 'react'

const Navbar: React.FC = () => {
  return (
    <header className="absolute top-0 flex w-full flex-col items-center">
      <div className="flex w-full max-w-[90rem] flex-row items-center justify-between p-6">
        <Link className="text-white font-bold text-xl" href="/">
          Idle Factory
        </Link>
        <div className="hidden md:flex items-center">
          <Link
            className="px-2 py-1 mx-3 text-white font-semibold rounded-md"
            href="/about"
          >
            소개
          </Link>
          <Link
            className="px-2 py-1 mx-3 text-white font-semibold rounded-md"
            href="/docs"
          >
            문서
          </Link>
          <Link
            href="/login"
            className={classNames(
              'flex flex-row px-3 py-2 mx-3 rounded-full shadow-lg font-semibold text-white bg-blue-700 transition-all duration-300 items-center justify-center',
              'hover:text-gray-100 hover:bg-blue-600 hover:shadow-xl',
              'focus:translate-y-1 focus:shadow-none'
            )}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className=""
            >
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
              <polyline points="10 17 15 12 10 7"></polyline>
              <line x1="15" y1="12" x2="3" y2="12"></line>
            </svg>
            <p className="text-base mx-1">로그인</p>
          </Link>
        </div>
      </div>
    </header>
  )
}

export default Navbar
