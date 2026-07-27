#!/usr/bin/env bash
#
# Idle Factory — VPS 배포 파일 설치 · 갱신
#
# 배포 워크플로는 **이미지만** 갱신한다. compose.prod.yml 이나 백업 스크립트가
# 바뀌면 VPS 쪽은 그대로 남으므로, 이 스크립트로 레포와 맞춘다.
#
# 최초 설치 (VPS 에서 한 줄):
#   curl -fsSL https://raw.githubusercontent.com/filename24/Idle-Factory/stable/scripts/vps-sync.sh -o vps-sync.sh \
#     && less vps-sync.sh && bash vps-sync.sh
#
# 이후 갱신:
#   cd /srv/idle-factory && ./scripts/vps-sync.sh
#
# 특정 브랜치/태그에서 가져오기:
#   REF=ci/deploy-pipeline ./scripts/vps-sync.sh
#
# .env.prod 는 절대 덮어쓰지 않는다. 없을 때만 템플릿에서 만들어 준다.

set -euo pipefail

REPO="${REPO:-filename24/Idle-Factory}"
REF="${REF:-stable}"
TARGET_DIR="${TARGET_DIR:-/srv/idle-factory}"
# 파일을 하나씩 raw.githubusercontent.com 에서 받지 않는다. 두 가지 이유다.
#  1) raw 는 CDN 캐시가 걸려 push 직후 몇 분간 옛 내용을 준다(실측). codeload
#     아카이브는 즉시 최신을 준다.
#  2) 파일별로 받으면 요청 사이에 새 커밋이 끼어들어 서로 다른 커밋의 파일이
#     섞일 수 있다. 아카이브는 한 커밋의 스냅숏이라 원자적으로 일관된다.
ARCHIVE_URL="https://codeload.github.com/${REPO}/tar.gz/${REF}"

log() { printf '[%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }
die() { log "오류: $*" >&2; exit 1; }

# 레포에서 가져올 파일 목록. 소스 전체는 필요 없다.
# 이 스크립트 자신도 포함한다 — 갱신 로직이 바뀌어도 따라온다.
FILES=(
  compose.prod.yml
  .env.prod.example
  scripts/db-backup.sh
  scripts/db-restore-drill.sh
  scripts/vps-sync.sh
)
# 실행 권한을 줄 파일.
EXECUTABLE=(
  scripts/db-backup.sh
  scripts/db-restore-drill.sh
  scripts/vps-sync.sh
)

command -v curl > /dev/null || die "curl 이 필요하다"
command -v tar > /dev/null || die "tar 가 필요하다"

log "레포 ${REPO} @ ${REF} → ${TARGET_DIR}"

mkdir -p "$TARGET_DIR"
cd "$TARGET_DIR"

# 임시 디렉터리에 전부 받고 검증한 뒤에야 옮긴다. 네트워크가 중간에 끊겨도
# 돌고 있는 배포의 compose 파일이 반쪽짜리로 덮이지 않는다.
STAGE="$(mktemp -d)"
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

log "  아카이브 받는 중: ${REF}"
if ! curl -fsSL "$ARCHIVE_URL" -o "${STAGE}/repo.tar.gz"; then
  die "다운로드 실패: ${ARCHIVE_URL} (ref '${REF}' 가 존재하는지 확인할 것)"
fi

# 필요한 경로만 뽑는다. --strip-components=1 이 아카이브 최상위 디렉터리
# (Idle-Factory-<ref>)를 벗겨낸다. 패턴이 하나라도 매칭되지 않으면 tar 가
# 실패하므로, 파일이 사라진 변경을 조용히 넘기지 않는다.
TAR_PATTERNS=()
for f in "${FILES[@]}"; do TAR_PATTERNS+=("*/${f}"); done
if ! tar -xzf "${STAGE}/repo.tar.gz" -C "$STAGE" --strip-components=1 \
  --wildcards "${TAR_PATTERNS[@]}" 2> "${STAGE}/tar.err"; then
  sed 's/^/      /' "${STAGE}/tar.err" >&2
  die "아카이브에서 배포 파일을 뽑지 못했다"
fi

for f in "${FILES[@]}"; do
  [ -s "${STAGE}/${f}" ] || die "아카이브에 비어 있거나 없는 파일: ${f}"
done

# compose 파일이 최소한 파싱은 되는지 본다. 값 보간은 .env.prod 가 필요해서
# 여기서 하지 않고, 아래 최종 점검에서 한다.
if command -v python3 > /dev/null; then
  python3 -c "import yaml,sys; yaml.safe_load(open('${STAGE}/compose.prod.yml'))" \
    || die "받은 compose.prod.yml 이 올바른 YAML 이 아니다"
fi
for f in "${EXECUTABLE[@]}"; do
  bash -n "${STAGE}/${f}" || die "받은 ${f} 에 문법 오류가 있다"
done

# ── 배치 ────────────────────────────────────────────────────────────────
CHANGED=0
for f in "${FILES[@]}"; do
  mkdir -p "$(dirname "$f")"
  if [ -f "$f" ] && cmp -s "${STAGE}/${f}" "$f"; then
    continue
  fi
  # 기존 파일은 한 세대만 남긴다. 갱신 후 문제가 생기면 즉시 되돌릴 수 있다.
  [ -f "$f" ] && cp -p "$f" "${f}.bak"
  mv "${STAGE}/${f}" "$f"
  log "  갱신: ${f}$([ -f "${f}.bak" ] && echo ' (이전 버전은 .bak)')"
  CHANGED=$((CHANGED + 1))
done

for f in "${EXECUTABLE[@]}"; do
  chmod +x "$f"
done

if [ "$CHANGED" -eq 0 ]; then
  log "이미 최신이다 (변경 없음)"
else
  log "${CHANGED}개 파일 갱신"
fi

# ── .env.prod ───────────────────────────────────────────────────────────
# 자격증명 파일이다. 이미 있으면 절대 손대지 않는다.
if [ ! -f .env.prod ]; then
  cp .env.prod.example .env.prod
  chmod 600 .env.prod
  log ""
  log "★ .env.prod 를 만들었다. 지금 값을 채워야 한다:"
  log "    \$EDITOR ${TARGET_DIR}/.env.prod"
  log "  주의: POSTGRES_DB 는 '-dev' 로 끝나면 안 된다(통합 테스트가 TRUNCATE 한다)."
  log "  절차 전체는 docs/ops/deployment.md 참고."
  exit 0
fi

chmod 600 .env.prod

# 템플릿에 새 변수가 추가됐는지 알려준다. 이걸 놓치면 compose 가 필수 변수
# 누락으로 배포 시점에 멈춘다.
#
# 다만 전부 나열하면 대부분이 compose 에 기본값 있는 선택 변수라 노이즈가 되고,
# 결국 경고를 무시하게 된다. compose 가 `${VAR:?...}` 로 필수라고 선언한 것만
# 강조하고 나머지는 개수만 알린다.
key_list() { grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' "$1" | tr -d '=' | sort -u; }
required_keys() {
  grep -oE '\$\{[A-Za-z_][A-Za-z0-9_]*:\?' compose.prod.yml \
    | sed -e 's/^\${//' -e 's/:?$//' | sort -u
}

MISSING="$(comm -23 <(key_list .env.prod.example) <(key_list .env.prod) || true)"
if [ -n "$MISSING" ]; then
  MISSING_REQUIRED="$(comm -12 <(printf '%s\n' "$MISSING" | sort -u) <(required_keys) || true)"
  MISSING_OPTIONAL_COUNT="$(comm -23 <(printf '%s\n' "$MISSING" | sort -u) <(required_keys) | grep -c . || true)"

  if [ -n "$MISSING_REQUIRED" ]; then
    log ""
    log "★ .env.prod 에 없는 **필수** 변수 — 채우지 않으면 배포가 멈춘다:"
    printf '%s\n' "$MISSING_REQUIRED" | sed 's/^/      /'
  fi
  if [ "${MISSING_OPTIONAL_COUNT:-0}" -gt 0 ]; then
    log "  (선택 변수 ${MISSING_OPTIONAL_COUNT}개도 비어 있다 — compose 기본값을 쓴다."
    log "   목록은 .env.prod.example 과 비교해 볼 것)"
  fi
fi

# ── 최종 점검 ───────────────────────────────────────────────────────────
if command -v docker > /dev/null && docker compose version > /dev/null 2>&1; then
  if docker compose --env-file .env.prod -f compose.prod.yml config --quiet 2>/dev/null; then
    log "compose 구성 검증 통과"
  else
    log ""
    log "★ compose 구성 검증 실패. 대개 .env.prod 의 필수 값이 비어 있다:"
    docker compose --env-file .env.prod -f compose.prod.yml config --quiet 2>&1 \
      | head -5 | sed 's/^/      /' || true
  fi
else
  log "docker compose 가 없어 구성 검증을 건너뛴다"
fi

log "동기화 완료"
