#!/usr/bin/env bash
#
# Idle Factory — 백업 복구 리허설
#
# 백업 파일이 "존재한다"는 것과 "복구된다"는 것은 다른 문제다. 이 스크립트는
# 실제 프로덕션을 건드리지 않고, 임시 Postgres 컨테이너에 덤프를 복구해 본 뒤
# 테이블 집합과 행 수를 프로덕션과 대조한다.
#
# 사용:
#   scripts/db-restore-drill.sh                  # 최신 로컬 백업으로 리허설
#   scripts/db-restore-drill.sh /path/to.dump    # 특정 덤프로 리허설
#
# 최소 분기마다 1회 수행하고 출력된 리포트를 보관할 것.
# 프로덕션 DB 에는 읽기 쿼리만 나가고 쓰기는 전혀 하지 않는다.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="${DEPLOY_DIR:-$(dirname "$SCRIPT_DIR")}"
ENV_FILE="${ENV_FILE:-${DEPLOY_DIR}/.env.prod}"
COMPOSE_FILE="${COMPOSE_FILE:-${DEPLOY_DIR}/compose.prod.yml}"

log() { printf '[%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }
die() { log "오류: $*" >&2; exit 1; }

[ -f "$ENV_FILE" ] || die "환경 파일이 없다: ${ENV_FILE}"

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

: "${POSTGRES_USER:?.env.prod 에 POSTGRES_USER 가 없다}"
: "${POSTGRES_DB:?.env.prod 에 POSTGRES_DB 가 없다}"

BACKUP_DIR="${BACKUP_DIR:-/var/backups/idle-factory}"
DRILL_CONTAINER="${DRILL_CONTAINER:-idle-factory-restore-drill}"
# 프로덕션과 같은 메이저를 써야 복구 호환성이 보장된다(compose.prod.yml 과 일치).
DRILL_IMAGE="${DRILL_IMAGE:-postgres:16-alpine}"
DRILL_PASSWORD='drill-only-not-a-secret'

compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }

# 모든 테이블의 정확한 행 수를 한 쿼리로 얻는다. pg_stat_user_tables 의
# n_live_tup 은 근사값이라 대조에 쓸 수 없다.
ROW_COUNT_SQL="
SELECT table_name || '=' ||
       (xpath('/row/c/text()',
              query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name),
                           false, true, '')))[1]::text
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
  AND table_name <> '_prisma_migrations'
ORDER BY table_name;
"

DUMP_PATH="${1:-}"
if [ -z "$DUMP_PATH" ]; then
  DUMP_PATH="$(find "$BACKUP_DIR" -maxdepth 1 -name "${POSTGRES_DB}-*.dump" -type f \
    -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)"
  [ -n "$DUMP_PATH" ] || die "백업을 찾을 수 없다: ${BACKUP_DIR}/${POSTGRES_DB}-*.dump"
  log "최신 백업을 사용한다: ${DUMP_PATH}"
fi
[ -f "$DUMP_PATH" ] || die "덤프 파일이 없다: ${DUMP_PATH}"

WORK_DIR="$(mktemp -d)"
cleanup() {
  log "정리: 임시 컨테이너·디렉터리 삭제"
  docker rm -f "$DRILL_CONTAINER" > /dev/null 2>&1 || true
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

REPORT="${WORK_DIR}/report.txt"

log "리허설 시작 — 덤프: $(basename "$DUMP_PATH")"

# ── 1. 임시 Postgres 기동 ──────────────────────────────────────────────
docker rm -f "$DRILL_CONTAINER" > /dev/null 2>&1 || true
# 포트를 바인딩하지 않는다. 외부에 노출할 이유가 없고, 프로덕션 포트와 충돌할
# 여지도 없앤다. 접근은 docker exec 으로만 한다.
docker run -d --name "$DRILL_CONTAINER" \
  -e POSTGRES_USER=drill \
  -e POSTGRES_PASSWORD="$DRILL_PASSWORD" \
  -e POSTGRES_DB=drill \
  "$DRILL_IMAGE" > /dev/null

log "임시 Postgres 기동 대기"
# postgres 이미지는 initdb 를 끝낸 뒤 임시 서버를 껐다 다시 켠다. 그 틈에
# pg_isready 가 한 번 성공하므로, 단발 성공으로 넘어가면 바로 다음 명령이
# "the database system is shutting down" 으로 죽는다(실측). 실제 쿼리가
# 연속으로 성공할 때까지 기다려 재시작 구간을 확실히 통과한다.
ready=0
stable=0
for _ in $(seq 1 90); do
  if docker exec "$DRILL_CONTAINER" psql -U drill -d drill -tAc 'SELECT 1' > /dev/null 2>&1; then
    stable=$((stable + 1))
    if [ "$stable" -ge 3 ]; then
      ready=1
      break
    fi
  else
    stable=0
  fi
  sleep 1
done
[ "$ready" = 1 ] || die "임시 Postgres 가 90초 안에 안정적으로 준비되지 않았다"

# ── 2. 복구 ────────────────────────────────────────────────────────────
log "덤프 복구 중"
docker cp "$DUMP_PATH" "${DRILL_CONTAINER}:/tmp/restore.dump"
# --exit-on-error: 조용히 절반만 복구되는 상황을 실패로 만든다.
if ! docker exec "$DRILL_CONTAINER" \
  pg_restore --username drill --dbname drill --no-owner --no-acl \
  --exit-on-error /tmp/restore.dump > "${WORK_DIR}/restore.log" 2>&1; then
  log "복구 실패 — pg_restore 출력:"
  tail -30 "${WORK_DIR}/restore.log" >&2
  die "복구 리허설 실패"
fi
log "복구 성공"

# ── 3. 대조 ────────────────────────────────────────────────────────────
log "행 수 대조 (프로덕션 ↔ 복구본)"
docker exec "$DRILL_CONTAINER" \
  psql -U drill -d drill -tAc "$ROW_COUNT_SQL" | sed 's/[[:space:]]*$//' | sort > "${WORK_DIR}/drill.txt"

# 프로덕션에는 읽기 쿼리만 보낸다.
compose exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$ROW_COUNT_SQL" | sed 's/[[:space:]]*$//' | sort > "${WORK_DIR}/prod.txt"

DRILL_TABLES="$(wc -l < "${WORK_DIR}/drill.txt")"
PROD_TABLES="$(wc -l < "${WORK_DIR}/prod.txt")"

{
  echo "복구 리허설 리포트"
  echo "  수행 시각(UTC) : $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  echo "  덤프           : ${DUMP_PATH}"
  echo "  덤프 크기      : $(stat -c %s "$DUMP_PATH") bytes"
  echo "  테이블 수      : 프로덕션 ${PROD_TABLES} / 복구본 ${DRILL_TABLES}"
  echo
  echo "테이블별 행 수 차이 (< 는 프로덕션, > 는 복구본):"
  if diff "${WORK_DIR}/prod.txt" "${WORK_DIR}/drill.txt" > "${WORK_DIR}/diff.txt"; then
    echo "  없음 — 완전 일치"
  else
    sed 's/^/  /' "${WORK_DIR}/diff.txt"
    echo
    echo "  ※ 백업 시점 이후에 들어온 쓰기가 있으면 차이가 나는 것이 정상이다."
    echo "     테이블이 아예 빠졌거나 행 수가 0 으로 떨어진 항목만 문제로 본다."
  fi
} | tee "$REPORT"

# ── 4. 판정 ────────────────────────────────────────────────────────────
FAILED=0

if [ "$DRILL_TABLES" -eq 0 ]; then
  log "판정: 실패 — 복구본에 테이블이 없다"
  FAILED=1
fi

# 프로덕션에 있는 테이블이 복구본에 없으면 백업이 불완전하다.
MISSING="$(comm -23 \
  <(cut -d= -f1 "${WORK_DIR}/prod.txt") \
  <(cut -d= -f1 "${WORK_DIR}/drill.txt") || true)"
if [ -n "$MISSING" ]; then
  log "판정: 실패 — 복구본에서 누락된 테이블:"
  printf '%s\n' "$MISSING" | sed 's/^/    /'
  FAILED=1
fi

# 리포트는 임시 디렉터리가 지워지기 전에 보관 위치로 옮긴다.
DRILL_LOG_DIR="${DRILL_LOG_DIR:-${BACKUP_DIR}/drills}"
mkdir -p "$DRILL_LOG_DIR"
KEEP="${DRILL_LOG_DIR}/drill-$(date -u '+%Y%m%dT%H%M%SZ').txt"
cp "$REPORT" "$KEEP"
log "리포트 보관: ${KEEP}"

if [ "$FAILED" != 0 ]; then
  die "복구 리허설 판정 실패 — 백업 파이프라인을 점검할 것"
fi

log "복구 리허설 통과"
