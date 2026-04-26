/** Discord 메서드 이름 집합 — 첫 번째 인자가 메시지 페이로드인 메서드. */
const DISCORD_METHODS = new Set(['reply', 'send', 'update', 'followUp', 'editReply'])

/** Components v2에서 금지된 최상위 오브젝트 키. */
const FORBIDDEN_KEYS = new Set(['embeds', 'poll', 'stickers'])

/** flags 값이 IsComponentsV2를 포함할 가능성이 높은 AST 노드인지 확인. */
function looksLikeV2Flags(node) {
  if (!node) return false
  // v2Flags(), v2Flags(true) 등 함수 호출
  if (node.type === 'CallExpression') return true
  // v2Flags() | MessageFlags.Ephemeral 등 비트 연산
  if (node.type === 'BinaryExpression') return true
  // MessageFlags.IsComponentsV2
  if (node.type === 'MemberExpression') return node.property.name === 'IsComponentsV2'
  return false
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce Discord Components v2 — forbid EmbedBuilder, embeds, poll, stickers, plain content, and string replies.',
    },
    fixable: null,
    schema: [],
    messages: {
      noEmbedBuilder:
        'EmbedBuilder is forbidden — use ContainerBuilder via ComponentsV2 helpers (simpleV2Payload, simpleContainer).',
      noEmbeds:
        "'embeds' is forbidden — Components v2 uses 'components' with MessageFlags.IsComponentsV2.",
      noPoll: "'poll' is forbidden in Components v2 message payloads.",
      noStickers: "'stickers' is forbidden in Components v2 message payloads.",
      noPlainContent:
        "Plain 'content' without MessageFlags.IsComponentsV2 is forbidden — use simpleV2Payload() or set flags: v2Flags().",
      noStringArg:
        "Plain string passed to '{{ method }}()' is forbidden — use simpleV2Payload() or a Components v2 payload object.",
    },
  },

  create(context) {
    return {
      // 1. EmbedBuilder import 탐지
      ImportDeclaration(node) {
        if (node.source.value !== 'discord.js') return
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportSpecifier' && specifier.imported.name === 'EmbedBuilder') {
            context.report({ node: specifier, messageId: 'noEmbedBuilder' })
          }
        }
      },

      // 2-4. Discord 전송 메서드 호출 탐지
      CallExpression(node) {
        const { callee } = node
        if (callee.type !== 'MemberExpression') return
        const methodName = callee.property.name
        if (!DISCORD_METHODS.has(methodName)) return

        const firstArg = node.arguments[0]
        if (!firstArg) return

        // 4. 문자열 직접 전달
        if (firstArg.type === 'Literal' && typeof firstArg.value === 'string') {
          context.report({
            node: firstArg,
            messageId: 'noStringArg',
            data: { method: methodName },
          })
          return
        }

        // 첫 인자가 ObjectExpression이 아니면 (함수 호출, 변수 참조 등) 안전으로 간주
        if (firstArg.type !== 'ObjectExpression') return

        let flagsValue = null
        const contentProps = []

        for (const prop of firstArg.properties) {
          if (prop.type !== 'Property') continue
          const keyName = prop.key.name ?? prop.key.value

          // 2. embeds / poll / stickers
          if (FORBIDDEN_KEYS.has(keyName)) {
            const msgMap = { embeds: 'noEmbeds', poll: 'noPoll', stickers: 'noStickers' }
            context.report({ node: prop, messageId: msgMap[keyName] })
          }

          if (keyName === 'flags') flagsValue = prop.value
          if (keyName === 'content') contentProps.push(prop)
        }

        // 3. content — flags 가 v2로 보이지 않을 때만 보고
        for (const contentProp of contentProps) {
          if (!looksLikeV2Flags(flagsValue)) {
            context.report({ node: contentProp, messageId: 'noPlainContent' })
          }
        }
      },
    }
  },
}
