-- User.lang 을 "개인 언어 설정"으로 승격한다.
--
-- 기존 동작: UserService.ensure 가 가입 시점 interaction.locale 을 그대로 박아
-- 넣었고, 읽는 코드는 어디에도 없었다. 즉 지금 저장된 값은 "유저가 고른 언어"가
-- 아니라 단순한 클라이언트 로케일 스냅샷이다.
--
-- 새 동작: 'auto' = 서버(Guild.lang) 설정을 따름. 유저가 명시적으로 고른 경우에만
-- 구체 로케일이 들어간다 (apps/bot/src/utils/language.ts 우선순위 1단계).
--
-- 아무도 언어를 고른 적이 없으므로 전 행을 'auto' 로 초기화한다. 유실되는 정보는
-- 없다 — 클라이언트 로케일은 리졸버가 3순위(interactionLocale)로 여전히 참조한다.
ALTER TABLE "User" ALTER COLUMN "lang" SET DEFAULT 'auto';

UPDATE "User" SET "lang" = 'auto';
