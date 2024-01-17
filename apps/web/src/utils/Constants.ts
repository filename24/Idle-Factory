export const isDevelop = true

export const enum ProgressStatus {
  /**
   * 2022년 8월 28일
   */
  Developing = '개발중...',
  /**
   * 2023-01-15
   */
  DevPrev1 = '개발자 프리뷰 1',
  DevPrev2 = '개발자 프리뷰 2',
  DevPrev3 = '개발자 프리뷰 3',
  DevPrev4 = '개발자 프리뷰 4',
  DevPrev5 = '개발자 프리뷰 5',
  Beta1 = '베타 테스트 1',
  Beta2 = '베타 테스트 2',
  Beta3 = '베타 테스트 3',
  Beta4 = '베타 테스트 4',
  Release = '최종 릴리즈',
}

export const nowStatus = ProgressStatus.DevPrev1 as const
