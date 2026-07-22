import Link from 'next/link'
import type { Root as PageTreeRoot, Node as PageTreeNode } from 'fumadocs-core/page-tree'

interface DocsSidebarProps {
  tree: PageTreeRoot
  currentPath: string
}

/** 문서 사이드바 — 페이지 트리를 재귀적으로 렌더링 */
export function DocsSidebar({ tree, currentPath }: DocsSidebarProps) {
  return (
    <nav className="py-6 pr-4" aria-label="문서 네비게이션">
      {tree.children.map((node) => (
        <SidebarNode key={node.$id ?? String(node.name)} node={node} currentPath={currentPath} />
      ))}
    </nav>
  )
}

function SidebarNode({ node, currentPath }: { node: PageTreeNode; currentPath: string }) {
  if (node.type === 'separator') {
    return (
      <div className="text-mute mt-5 mb-1 px-2 text-xs font-medium tracking-wider uppercase">
        {node.name}
      </div>
    )
  }

  if (node.type === 'folder') {
    return (
      <div className="mb-1">
        {node.index ? (
          <SidebarLink href={node.index.url} label={String(node.name)} currentPath={currentPath} />
        ) : (
          <div className="text-mute mb-1 px-2 py-1 text-xs font-medium tracking-wider uppercase">
            {node.name}
          </div>
        )}
        <div className="border-hairline ml-3 border-l pl-3">
          {node.children.map((child) => (
            <SidebarNode
              key={child.$id ?? String(child.name)}
              node={child}
              currentPath={currentPath}
            />
          ))}
        </div>
      </div>
    )
  }

  return <SidebarLink href={node.url} label={String(node.name)} currentPath={currentPath} />
}

function SidebarLink({
  href,
  label,
  currentPath,
}: {
  href: string
  label: string
  currentPath: string
}) {
  const isActive = currentPath === href || currentPath === href + '/'

  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={[
        'focus-visible:ring-ring focus-visible:ring-offset-canvas mb-0.5 block rounded px-2 py-1.5 text-sm no-underline transition-colors duration-100 outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        isActive ? 'bg-elevated text-ink font-medium' : 'text-mute hover:text-ink',
      ].join(' ')}
    >
      {label}
    </Link>
  )
}
