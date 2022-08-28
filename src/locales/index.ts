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
          '현재 점검중임으로 해당 기능을 이용하실수 없습니다.\n자세한 내용은 `/announcement` 를 참고하세요.'
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
    slashSetup: {
      wait: {
        description:
          'Slash Command를 사용하려면 봇 초대할 떄 `applications.commands` 스코프를 사용하지 않았을 경우 해당기능을 이용할 수 없습니다. 만약 `applications.commands` 스코프를 안 할 경우 [여기를](https://discord.com/api/oauth2/authorize?client_id=${clientID}&scope=applications.commands) 클릭하여 허용해 주시기 바랍니다.',
        title: '잠시만요!',
        timeout: '시간 초과. 다시 시도해주세요...'
      },
      error: {
        noPerm: '명령어 요청한 **${username}**만 사용할수 있어요.',
        missingAccess:
          '제 봇 권한이 부족합니다...\n> 필요한 권한\n`applications.commands`스코프'
      },
      loading: {
        title: 'Slash Command 로딩중...',
        name: '잠시만 기다려주십시요...'
      },
      success: {
        title: '로딩완료!',
        description:
          '${size}개의 (/) 명령어를 생성했어요!\n이제 Idle Factory를 (/) 로 쓸수있다니 너무 기대되요!'
      }
    },
    notice: {
      title: '공지사항'
    }
  }
}

export const en = {
  main: {
    hello: {
      world: 'Hello world'
    }
  }
}
