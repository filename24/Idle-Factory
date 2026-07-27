#!/usr/bin/env bash
#
# Idle Factory — 프로덕션 Postgres 일일 백업
#
# 사용:
#   scripts/db-backup.sh
#
# crontab 예시 (매일 04:10 KST):
#   10 4 * * * cd /srv/idle-factory && ./scripts/db-backup.sh >> /var/log/idle-factory-backup.log 2>&1
#
# 설계 근거:
#  - pg_dump 를 컨테이너 **안에서** 실행한다. 호스트에 클라이언트를 깔지 않아도
#    되고, 서버와 pg_dump 버전이 어긋나는 문제가 원천적으로 생기지 않는다.
#  - --format=custom: pg_restore 로 선택 복구가 가능하고 자체 압축된다.
#  - 덤프 직후 pg_restore --list 로 읽어본다. 0바이트 덤프나 깨진 덤프가
#    "성공"으로 기록되는 것이 백업 운영에서 가장 흔한 사고다.
#  - R2 업로드는 aws-cli 컨테이너로 한다. 호스트 의존성을 늘리지 않는다.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="${DEPLOY_DIR:-$(dirname "$SCRIPT_DIR")}"
ENV_FILE="${ENV_FILE:-${DEPLOY_DIR}/.env.prod}"
COMPOSE_FILE="${COMPOSE_FILE:-${DEPLOY_DIR}/compose.prod.yml}"

log() { printf '[%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }
die() { log "오류: $*" >&2; exit 1; }

[ -f "$ENV_FILE" ] || die "환경 파일이 없다: ${ENV_FILE}"
[ -f "$COMPOSE_FILE" ] || die "compose 파일이 없다: ${COMPOSE_FILE}"

# .env.prod 의 값을 환경으로 올린다. 자격증명이 들어 있으므로 로그로 흘리지 않는다.
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

: "${POSTGRES_USER:?.env.prod 에 POSTGRES_USER 가 없다}"
: "${POSTGRES_DB:?.env.prod 에 POSTGRES_DB 가 없다}"

BACKUP_DIR="${BACKUP_DIR:-/var/backups/idle-factory}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"

compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }

mkdir -p "$BACKUP_DIR"
# 덤프에는 유저 데이터가 그대로 들어 있다. 디렉터리 권한을 좁힌다.
chmod 700 "$BACKUP_DIR"

STAMP="$(date -u '+%Y%m%dT%H%M%SZ')"
DUMP_NAME="${POSTGRES_DB}-${STAMP}.dump"
DUMP_PATH="${BACKUP_DIR}/${DUMP_NAME}"
# 부분 기록된 파일이 완성본으로 오인되지 않도록 임시 이름으로 받고 마지막에 옮긴다.
TMP_PATH="${DUMP_PATH}.partial"

cleanup_partial() { rm -f "$TMP_PATH"; }
trap cleanup_partial EXIT

log "백업 시작: ${POSTGRES_DB} → ${DUMP_PATH}"

# -T: TTY 미할당(cron 에서 필수). 표준출력을 그대로 파일로 받는다.
compose exec -T postgres \
  pg_dump \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --format=custom \
  --no-owner \
  --no-acl \
  > "$TMP_PATH"

SIZE="$(stat -c %s "$TMP_PATH")"
[ "$SIZE" -gt 0 ] || die "덤프가 0바이트다"

# 덤프 무결성 확인 — 목록을 읽을 수 없으면 복구도 불가능하다.
# 별도 컨테이너에서 파일을 직접 읽게 한다. custom format 은 목록을 얻으려면
# seek 이 필요해서 파이프(stdin)로 넘기면 실패하고, 프로덕션 컨테이너 안에
# 임시 파일을 만들 이유도 없다.
if ! docker run --rm -v "${BACKUP_DIR}:/backup:ro" "${DRILL_IMAGE:-postgres:16-alpine}" \
  pg_restore --list "/backup/$(basename "$TMP_PATH")" > /dev/null 2>&1; then
  die "덤프 무결성 검증 실패 (pg_restore --list 가 읽지 못했다)"
fi

mv "$TMP_PATH" "$DUMP_PATH"
chmod 600 "$DUMP_PATH"
trap - EXIT
log "백업 완료: $(numfmt --to=iec "$SIZE" 2>/dev/null || echo "${SIZE}B")"

# ── 로컬 로테이션 ───────────────────────────────────────────────────────
log "로컬 보관 정리 (${RETENTION_DAYS}일 초과분 삭제)"
find "$BACKUP_DIR" -maxdepth 1 -name "${POSTGRES_DB}-*.dump" -type f \
  -mtime "+${RETENTION_DAYS}" -print -delete || true

# ── 오프사이트 업로드 (Cloudflare R2) ──────────────────────────────────
# R2_BUCKET 이 비어 있으면 로컬 보관만 한다. VPS 디스크가 죽으면 백업도 함께
# 사라지므로 프로덕션에서는 반드시 채울 것.
if [ -z "${R2_BUCKET:-}" ]; then
  log "R2_BUCKET 미설정 — 오프사이트 업로드를 건너뛴다(로컬 보관만)."
  exit 0
fi

: "${R2_ENDPOINT:?R2_BUCKET 을 설정했으면 R2_ENDPOINT 도 필요하다}"
: "${R2_ACCESS_KEY_ID:?R2_BUCKET 을 설정했으면 R2_ACCESS_KEY_ID 도 필요하다}"
: "${R2_SECRET_ACCESS_KEY:?R2_BUCKET 을 설정했으면 R2_SECRET_ACCESS_KEY 도 필요하다}"

R2_PREFIX="${R2_PREFIX:-postgres}"
AWS_IMAGE="${AWS_CLI_IMAGE:-amazon/aws-cli:latest}"

aws_r2() {
  docker run --rm \
    -e AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
    -e AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
    -e AWS_DEFAULT_REGION=auto \
    -v "${BACKUP_DIR}:/backup:ro" \
    "$AWS_IMAGE" --endpoint-url "$R2_ENDPOINT" "$@"
}

log "R2 업로드: s3://${R2_BUCKET}/${R2_PREFIX}/${DUMP_NAME}"
aws_r2 s3 cp "/backup/${DUMP_NAME}" "s3://${R2_BUCKET}/${R2_PREFIX}/${DUMP_NAME}"
log "R2 업로드 완료"

# ── 오프사이트 로테이션 ────────────────────────────────────────────────
# 버킷 lifecycle 규칙을 걸어 두는 것이 정석이지만, 규칙이 없어도 무한히 쌓이지
# 않게 여기서도 정리한다. 삭제 대상은 위에서 업로드한 prefix 안의 우리 덤프뿐이다.
R2_RETENTION_DAYS="${R2_RETENTION_DAYS:-30}"
CUTOFF="$(date -u -d "${R2_RETENTION_DAYS} days ago" '+%Y-%m-%d' 2>/dev/null || true)"
if [ -z "$CUTOFF" ]; then
  log "경고: date 가 상대 날짜를 지원하지 않아 R2 로테이션을 건너뛴다."
  exit 0
fi

log "R2 보관 정리 (${CUTOFF} 이전, prefix=${R2_PREFIX}/)"
# 출력 형식: "2026-07-01 04:10:00  12345  postgres/idle-factory-....dump"
aws_r2 s3 ls "s3://${R2_BUCKET}/${R2_PREFIX}/" | while read -r d _t _s key; do
  [ -n "${key:-}" ] || continue
  # prefix 밖의 키는 절대 건드리지 않는다.
  case "$key" in
    *.dump) ;;
    *) continue ;;
  esac
  if [[ "$d" < "$CUTOFF" ]]; then
    log "  삭제: ${key}"
    aws_r2 s3 rm "s3://${R2_BUCKET}/${R2_PREFIX}/${key}" > /dev/null
  fi
done

log "백업 작업 종료"
