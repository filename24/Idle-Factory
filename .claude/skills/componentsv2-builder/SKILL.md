---
name: componentsv2-builder
description: discord.js로 메시지를 전송/수정할 때 사용. Discord Components v2 (IsComponentsV2 플래그 기반 Container/Section/TextDisplay/MediaGallery 등)만 사용하여 메시지를 구성한다. 레거시 EmbedBuilder / embeds / content 평문 필드는 절대 사용하지 않는다. TRIGGER when interaction.reply, channel.send, interaction.editReply, followUp 등 discord.js의 메시지 전송/수정 코드를 작성·리뷰·수정할 때.
---

# Components v2 Builder

Idle-Factory 봇의 모든 메시지는 **Discord Components v2** 로만 구성한다. 레거시 embed 전면 금지.

## 🚫 금지 사항 (절대)

- `EmbedBuilder`, `new MessageEmbed()`, `embeds: [...]` 사용 금지
- v2 플래그와 함께 `content: "..."` 평문 전송 금지
- `poll`, `stickers` 필드 사용 금지 (v2 비활성화)
- 첨부파일 암묵 노출 금지 — 반드시 MediaGallery / File / Thumbnail 로 명시

## ✅ 필수 규칙

1. **항상 플래그**: `flags: MessageFlags.IsComponentsV2`
2. **최상위는 Container** — 좌측 accent stripe로 메시지 경계를 명확히
3. 최상위 컴포넌트 ≤ 40, 총 텍스트 ≤ 4000자
4. Section의 `accessory`는 Button **또는** Thumbnail **하나만**
5. Primary 버튼은 그룹당 **최대 1개**

## 🎨 디자인 가이드

### 전체 레이아웃

- **루트 Container 로 감싼다** — 좌측 세로 accent bar가 메시지의 "카드" 경계를 만들어준다
- 용도별로 **여러 Container 분할** 가능 (예: 정보/경고/위험 분리). 연속 Container 사이에는 여백이 자연히 생기므로 별도 Separator 불필요
- 스포일러 민감 섹션은 `spoiler: true` Container로 분리

### Accent color 팔레트 (용도별 고정)

| 상황      | Hex                  | 용도                    |
| --------- | -------------------- | ----------------------- |
| 기본/정보 | `0x5865F2` (blurple) | 일반 응답, 도움말, 상태 |
| 성공/수령 | `0x57F287` (green)   | 보상, 완료, 구매 성공   |
| 경고      | `0xFEE75C` (yellow)  | 확인 필요, 쿨다운 임박  |
| 위험/오류 | `0xED4245` (red)     | 오류, 파괴적 액션       |
| 뽑기/특별 | `0xEB459E` (fuchsia) | 희귀 보상, 이벤트       |

### 텍스트 계층 (마크다운)

- 제목: `# **타이틀**` (TextDisplay, 맨 위)
- 부제/섹션: `## 소제목`
- 본문: 일반 텍스트 TextDisplay
- 키-값: `**라벨:** 값` 인라인
- 푸터/메타: `-# 작은 회색 글씨`

### Section 사용 패턴

- **텍스트 + Thumbnail**: 아이템/유저 아바타를 우측에 붙일 때. description은 Thumbnail `alt`에 반드시 설정
- **텍스트 + Button accessory**: 목록형 UI(아이템 N개 + 각각의 액션)에 최적. ActionRow로 나열하지 말 것
- Section `components` 는 TextDisplay 1~3개만

### MediaGallery / File

- 이미지 2장 이상은 **MediaGallery** (최대 10). 각 아이템마다 `spoiler`, `description`(alt) 가능
- MediaGallery 배치: 2장이면 나란히, 3장이면 큰 1 + 작은 2 그리드. 시각 강조 순서 신경쓸 것
- 정적 파일(로그, 세이브)은 `FileBuilder` + `AttachmentBuilder`. 파일명/크기가 카드로 표시됨

### 버튼 스타일 선택

| 스타일              | 언제                                                |
| ------------------- | --------------------------------------------------- |
| `Primary` (blurple) | 그룹의 메인 액션 — 1개만                            |
| `Secondary` (gray)  | 보조 액션 (뒤로, 새로고침, 토글)                    |
| `Success` (green)   | 긍정/확정 (구매, 교환, 적용)                        |
| `Danger` (red)      | 파괴적/비가역 (삭제, 초기화, 포기) — 확인 단계 권장 |
| `Link`              | 외부 링크만                                         |
| `Disabled`          | 쿨다운/권한부족 — 이유를 label에 간결히             |

**전면 위험 액션**은 단독 ActionRow + 단독 Danger 버튼으로 배치. 실수 방지.

### Separator

- 섹션 주제가 **전환될 때만** 사용. 매 줄마다 넣지 말 것
- Container 경계가 이미 시각 분리를 제공하므로 Container 내부 전환에만 사용

### Select Menu

- 5종(String/User/Role/Mentionable/Channel) 모두 v2 지원
- 각 Select 는 고유 ActionRow (단일 Select만)
- `placeholder` 는 i18n 키로 주입
- 선택 직후 피드백은 `interaction.update()` 로 **같은 메시지 내 Container 교체**, 새 메시지 생성 금지

### 데스크탑 기준 레이아웃

- Section + Thumbnail: 텍스트가 Thumbnail 높이보다 짧으면 우측 여백이 비어 어색 → **3~4줄 채우거나 Thumbnail을 빼고 TextDisplay만** 사용
- Section + Button accessory: 우측 버튼 영역이 좁으므로 label **한글 6자 이내**
- ActionRow의 버튼은 데스크탑 기준 한 줄 최대 5개. 모바일은 자동 줄바꿈
- 긴 본문은 Section 내부에 몰아넣지 말고 Container 바로 아래 TextDisplay로 분리 (풀폭 사용)

### 📏 Container 폭 확보 (중요)

데스크탑에서 Container는 **내용물 폭에 맞게 자동 축소**된다. 콘텐츠가 적으면 "쪽지"처럼 좁고 초라하게 보인다. 폭을 확실히 잡으려면 아래 중 하나 이상 포함:

1. **MediaGallery** — 가장 확실. 1장이라도 넣으면 카드 폭이 최대치로 고정됨
2. **긴 TextDisplay** — 최소 40자 이상의 본문 문장 한 줄
3. **여러 Button이 있는 ActionRow** — 3개 이상이면 자연스럽게 넓어짐
4. **Section + Button accessory** — text가 짧아도 우측 버튼 영역이 폭을 잡아줌

**쓰지 말아야 할 조합 (좁게 보임):**

- 짧은 TextDisplay 1~2개 + 버튼 2개 이하
- Thumbnail만 있는 Section + 짧은 텍스트

**해결 예시:**

| 문제                            | 해결                                                 |
| ------------------------------- | ---------------------------------------------------- |
| "일일 보상 수령" 같은 짧은 안내 | 아이템 설명을 Section으로 2~3개 나열 (보상 목록처럼) |
| 단순 확인 다이얼로그            | `-# 이 동작은 되돌릴 수 없습니다` 등 부연 푸터 추가  |
| 단일 이미지                     | Thumbnail 대신 **MediaGallery 단일 아이템**으로 전환 |

### ⚠️ 이미지 URL 주의

Thumbnail / MediaGallery의 `url`은 **실제 접근가능한 CDN URL** 이어야 한다. 깨진 URL이면 회색 플레이스홀더가 뜨고 전체 카드가 초라해 보임. 정적 에셋은 Discord 서버에 업로드 후 CDN URL을 상수로 관리하거나, `AttachmentBuilder`로 함께 전송하고 `attachment://filename.png` 스킴으로 참조.

## 🧱 표준 스켈레톤

```ts
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js'

const container = new ContainerBuilder()
  .setAccentColor(0x57f287)
  .addTextDisplayComponents(new TextDisplayBuilder().setContent('# **일일 보상 도착**'))
  .addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '연속 **3일차** 출석을 축하합니다. 오늘의 보상을 확인하세요.',
    ),
  )
  .addSeparatorComponents(new SeparatorBuilder())
  .addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('**골드** · 100 G\n-# 기본 출석 보상'),
      )
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(GOLD_ICON).setDescription('골드')),
  )
  .addSectionComponents(
    new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('**강화석** · 3개\n-# 연속 3일차 보너스'),
      )
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(STONE_ICON).setDescription('강화석')),
  )
  .addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('reward:claim')
        .setLabel('수령')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('reward:skip')
        .setLabel('나중에')
        .setStyle(ButtonStyle.Secondary),
    ),
  )

await interaction.reply({
  components: [container],
  flags: MessageFlags.IsComponentsV2,
})
```

## 📚 컴포넌트 빌더 치트시트

| 용도                 | 빌더                                           | 타입 |
| -------------------- | ---------------------------------------------- | ---- |
| 전체 래퍼            | `ContainerBuilder`                             | 17   |
| 텍스트               | `TextDisplayBuilder`                           | 10   |
| 텍스트 + 버튼/썸네일 | `SectionBuilder`                               | 9    |
| 썸네일               | `ThumbnailBuilder`                             | 11   |
| 이미지 갤러리 (1-10) | `MediaGalleryBuilder`                          | 12   |
| 파일                 | `FileBuilder`                                  | 13   |
| 여백/구분선          | `SeparatorBuilder`                             | 14   |
| 버튼 행              | `ActionRowBuilder<ButtonBuilder>`              | 1    |
| 선택 메뉴 행         | `ActionRowBuilder<StringSelectMenuBuilder>` 등 | 1    |

## 🔄 마이그레이션 (Embed → v2)

| 레거시 Embed                  | Components v2                                              |
| ----------------------------- | ---------------------------------------------------------- |
| `.setTitle(x)`                | `TextDisplay` `# **x**`                                    |
| `.setDescription(x)`          | `TextDisplay` 평문                                         |
| `.addFields([{name, value}])` | 필드마다 `TextDisplay` `**name**\nvalue` 또는 Section 분할 |
| `.setThumbnail(url)`          | `Section.setThumbnailAccessory(...)`                       |
| `.setImage(url)`              | `MediaGallery` 단일 아이템                                 |
| `.setColor(c)`                | `Container.setAccentColor(c)`                              |
| `.setFooter({text})`          | 마지막 TextDisplay `-# text`                               |
| `.setAuthor({name, iconURL})` | Section + Thumbnail accessory (iconURL)                    |

## ✏️ 전송 전 체크리스트

- [ ] `flags: MessageFlags.IsComponentsV2`
- [ ] `content`/`embeds`/`poll`/`stickers` 미사용
- [ ] 루트가 Container (의도적 flat 제외)
- [ ] Primary 버튼 ≤ 1, Danger 버튼은 확인 단계
- [ ] 모든 Thumbnail/MediaGalleryItem에 `description`(alt) 설정
- [ ] 텍스트는 i18n 키 (하드코딩 금지, `apps/bot/src/locales/<lng>/*.json`)
- [ ] Accent color가 팔레트와 일치
- [ ] 총 텍스트 ≤ 4000자, 컴포넌트 ≤ 40
- [ ] 데스크탑에서 폭이 너무 좁지 않은지 (MediaGallery/긴 본문/3+ 버튼 중 하나 확보)
- [ ] Thumbnail/MediaGallery URL이 실제로 접근 가능한지

## 🔗 참고

- Discord 공식: https://docs.discord.com/developers/components/reference.md
- discord.js 가이드: https://discordjs.guide/legacy/popular-topics/display-components
