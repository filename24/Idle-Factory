'use client'

import { useSyncExternalStore } from 'react'

/** 구독할 외부 상태가 없다 — 값은 렌더 시점(서버/클라이언트)만으로 결정된다. */
const subscribe = () => () => {}
const getClientSnapshot = () => true
const getServerSnapshot = () => false

/**
 * 하이드레이션이 끝났는지 알려준다.
 *
 * 서버 렌더와 클라이언트의 **하이드레이션 렌더**에서 모두 `false`, 하이드레이션이
 * 커밋된 뒤부터 `true`. `useSyncExternalStore` 에 서버 스냅샷을 따로 넘기는 것이
 * 핵심이라, `useEffect` + `setState` 패턴과 달리 이펙트 안에서 상태를 바꾸지 않는다.
 *
 * 클라이언트에서만 값이 정해지는 상태(세션·테마·로컬스토리지 등)로 첫 렌더를
 * 분기하면 서버 HTML 과 어긋나 하이드레이션 오류가 난다. 그 분기를 이 훅으로
 * 막아 첫 렌더를 서버와 일치시킨다.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot)
}
