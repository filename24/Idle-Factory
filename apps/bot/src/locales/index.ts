export const ko = {
  main: {
    hello: {
      world: '헬로 월드!'
    },
    button: {
      accept: '수락',
      cancel: '취소',
      deny: '거부'
    },
    rules: {
      accept: '동의합니다.'
    },
    error: {
      dm: 'DM에서 사용할수 없는 기능입니다.',
      dev: {
        title: '이런...',
        description:
          '현재 점검중임으로 해당 기능을 이용하실수 없습니다.\n자세한 내용은 `/공지사항` 를 참고하세요.'
      }
    }
  },
  event: {
    guildCreate: {
      title: 'Idle Facory 를 초대해주셔서 감사합니다!',
      description: '추가적인 세팅을 원할경우 아래 버튼을 눌러주세요.'
    }
  },
  command: {
    ping: {
      loading: {
        title: '핑 측정중...'
      },
      success: {
        title: '🏓 Pong!',
        fields: {
          message: '메세지 응답속도',
          api: 'API 반응속도',
          uptime: '업타임'
        }
      }
    },
    setup: {
      available: {
        title: '제가 아는 ${factoryName}이군요!',
        description: '등록된 공장은 재등록 불가능합니다!'
      }
    },
    notice: {
      title: '공지사항'
    }
  }
} as const

export const en = {
  main: {
    hello: {
      world: 'Hello world'
    }
  }
} as const
