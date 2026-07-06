-- 글로벌 이벤트(신뢰도 증감·긴급지원금·비활성 재분배) 공지 채널 (docs/design/07-global-system.md)
ALTER TABLE "Guild" ADD COLUMN "announceChannelId" TEXT;
