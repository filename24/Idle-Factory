# 배포 · 롤백 · 복구 런북

단일 VPS + Docker Compose 기준 운영 절차. 이 문서에 적힌 명령은 모두 VPS 의
배포 디렉터리(기본 `/srv/idle-factory`)에서 실행한다고 가정한다.

## 구성

| 이미지                                     | 역할                        | 엔트리포인트              |
| ------------------------------------------ | --------------------------- | ------------------------- |
| `ghcr.io/filename24/idle-factory-bot`      | Discord 봇                  | `node build/index.js`     |
| `ghcr.io/filename24/idle-factory-web`      | Next.js 웹                  | `node apps/web/server.js` |
| `ghcr.io/filename24/idle-factory-migrator` | 마이그레이션 전용 일회성 잡 | `prisma migrate deploy`   |

Postgres 16 과 Redis 7 은 compose 컨테이너로 함께 뜬다. 데이터는 명명 볼륨
(`idle-factory-prod_postgres_data`, `idle-factory-prod_redis_data`)에 남는다.

기동 순서는 compose 가 강제한다.

```
postgres (healthy) ─┬─> migrator (완료) ─┬─> bot
                    │                    └─> web
redis    (healthy) ─┘
```

`migrator` 가 실패하면 봇과 웹은 아예 뜨지 않는다. 스키마와 코드가 어긋난 채
돈이 오가는 명령을 처리하는 것보다 낫다는 판단이다.

## 최초 1회 준비

### 1. VPS

```bash
# Docker + compose 플러그인
curl -fsSL https://get.docker.com | sh

sudo mkdir -p /srv/idle-factory
sudo chown "$USER":"$USER" /srv/idle-factory
```

배포에 필요한 파일은 `scripts/vps-sync.sh` 가 레포에서 받아 온다. 소스 전체를
클론할 필요는 없다.

```bash
curl -fsSL https://raw.githubusercontent.com/filename24/Idle-Factory/stable/scripts/vps-sync.sh \
  -o /tmp/vps-sync.sh
less /tmp/vps-sync.sh      # 실행 전에 한 번 읽어볼 것
bash /tmp/vps-sync.sh
```

이 첫 다운로드만 `raw.githubusercontent.com` 을 쓴다. raw 는 CDN 캐시가 걸려 방금
머지한 내용이 몇 분간 안 보일 수 있는데, 스크립트가 실행되면서 codeload 아카이브로
자기 자신까지 최신으로 갱신하므로 그냥 한 번 더 돌리면 된다.

받아 놓는 결과는 이렇다.

```
/srv/idle-factory/
├── compose.prod.yml
├── .env.prod             # 템플릿에서 생성됨(권한 600). 값은 직접 채운다
├── .env.prod.example
└── scripts/
    ├── db-backup.sh
    ├── db-restore-drill.sh
    └── vps-sync.sh
```

이어서 값을 채운다.

```bash
cd /srv/idle-factory
$EDITOR .env.prod
```

#### 이후 갱신

**배포 워크플로는 이미지만 갱신한다.** `compose.prod.yml` 이나 백업 스크립트가
바뀌면 VPS 쪽은 그대로 남으므로 같은 스크립트를 다시 돌린다.

```bash
cd /srv/idle-factory && ./scripts/vps-sync.sh
```

- `.env.prod` 는 **절대 덮어쓰지 않는다.** 대신 템플릿에 새로 생긴 변수가 있으면
  알려주므로, 그것만 채우면 된다.
- 바뀐 파일은 `.bak` 로 한 세대 남긴다.
- 특정 브랜치에서 가져오려면 `REF=<브랜치> ./scripts/vps-sync.sh`.

갱신을 잊어도 조용히 넘어가지 않는다. 배포 워크플로가 VPS 의 `compose.prod.yml`
해시를 레포와 대조해 다르면 경고를 남긴다.

`.env.prod` 에서 반드시 채워야 하는 값과 함정은 `.env.prod.example` 의 주석에
전부 적혀 있다. 특히 두 가지를 확인한다.

- `POSTGRES_DB` 는 **`-dev` 로 끝나면 안 된다.** `apps/bot` 통합 테스트는
  `DATABASE_URL` 이 `-dev` 로 끝날 때만 실행되며 매 테스트마다 전체 테이블을
  `TRUNCATE` 한다. 프로덕션 DB 이름을 `-dev` 로 두면 실수로 실행된 테스트가
  프로덕션 데이터를 지운다.
- `DATABASE_URL` 의 호스트는 `postgres`(compose 서비스명)다. `localhost` 는
  컨테이너 자기 자신을 가리킨다.

### 2. GHCR 패키지 접근

**이 레포에서는 추가 설정이 필요 없다.** public 레포에서 `GITHUB_TOKEN` 으로
푸시된 세 패키지가 public 으로 생성되어, 자격증명 없이 `docker pull` 이 된다
(배포 워크플로 첫 실행 후 실측으로 확인).

```bash
# VPS 에서 확인
docker pull ghcr.io/filename24/idle-factory-migrator:latest
```

이것이 실패한다면 패키지가 private 으로 만들어진 것이고, 배포 워크플로는
`compose pull` 단계에서 `denied` 로 멈춘다. 그때만 둘 중 하나를 한다.

- (권장) GitHub → Packages → 각 패키지 → Package settings → Change visibility → Public
- 또는 VPS 에서 1회 로그인한다. `read:packages` 스코프 PAT 가 필요하다.
  ```bash
  echo "$GHCR_PAT" | docker login ghcr.io -u <github-username> --password-stdin
  ```

### 3. GitHub 시크릿

리포지터리 Settings → Secrets and variables → Actions.

| 이름               | 필수 | 내용                                                                   |
| ------------------ | ---- | ---------------------------------------------------------------------- |
| `VPS_HOST`         | ✅   | VPS 주소                                                               |
| `VPS_USER`         | ✅   | SSH 사용자                                                             |
| `VPS_SSH_KEY`      | ✅   | 배포 전용 개인키(전문). VPS 의 `~/.ssh/authorized_keys` 에 공개키 등록 |
| `VPS_SSH_HOST_KEY` | 권장 | `ssh-keyscan <host>` 결과. 없으면 호스트 키를 검증 없이 신뢰한다       |

GHCR 푸시는 기본 `GITHUB_TOKEN` 으로 처리되므로 별도 토큰이 필요 없다.

배포 디렉터리가 `/srv/idle-factory` 가 아니면 Variables 에 `DEPLOY_DIR` 를 둔다.

### 4. 리버스 프록시

프록시와 TLS 는 compose 밖(호스트의 기존 프록시)에서 담당한다. `web` 컨테이너는
`127.0.0.1:3000` 에만 바인딩되므로 인터넷에 직접 노출되지 않는다.

nginx:

```nginx
server {
    listen 443 ssl http2;
    server_name example.com;

    # ssl_certificate / ssl_certificate_key 는 기존 설정을 따른다.

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        # better-auth 가 콜백 URL 을 조립할 때 원본 스킴이 필요하다.
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";
    }
}
```

Caddy:

```caddy
example.com {
    reverse_proxy 127.0.0.1:3000
}
```

프록시를 세운 뒤 `.env.prod` 의 `BETTER_AUTH_URL` 을 실제 도메인으로 맞추고,
Discord Dev Portal → OAuth2 → Redirects 에 `https://<도메인>/api/auth/callback/discord`
를 등록한다. 이 두 값이 어긋나면 로그인이 조용히 실패한다.

### 5. Cloudflare R2 (오프사이트 백업)

백업을 VPS 로컬에만 두면 디스크나 호스트가 죽을 때 백업도 함께 사라진다. R2 는
egress 비용이 없어 이 용도에 적합하다. `R2_BUCKET` 을 비워 두면 스크립트가 로컬
보관만 하므로, 이 절을 건너뛰어도 배포 자체는 동작한다.

#### 5-1. 버킷 만들기

Cloudflare 대시보드 → **R2 Object Storage** → **Create bucket**.

- 이름: `idle-factory-backups` (예시. `.env.prod` 의 `R2_BUCKET` 과 일치시킨다)
- Location: 기본값(Automatic)으로 둔다. 특정 관할권이 필요하면 그때 지정한다.
- Storage class: Standard

#### 5-2. API 토큰 발급

R2 화면 우측의 **API** → **Manage API tokens** → **Create Account API token**.

- Permissions: **Object Read & Write** (버킷 생성·삭제 권한은 필요 없다)
- Specify bucket(s): 위에서 만든 버킷 **하나만** 지정한다. 계정 전체 권한을 주면
  이 키가 유출됐을 때 다른 버킷까지 노출된다.
- TTL: 무기한이 부담스러우면 기간을 두고 갱신 일정을 잡는다.

생성 직후 화면에 나오는 값을 그대로 기록한다.

| 화면의 값         | `.env.prod` 키         |
| ----------------- | ---------------------- |
| Access Key ID     | `R2_ACCESS_KEY_ID`     |
| Secret Access Key | `R2_SECRET_ACCESS_KEY` |

⚠️ **Secret Access Key 는 이 화면을 벗어나면 다시 볼 수 없다.** 놓쳤으면 토큰을
새로 만들어야 한다.

#### 5-3. 엔드포인트 확인

S3 호환 엔드포인트는 계정 ID 로 결정된다. R2 개요 화면이나 버킷 상세의
**S3 API** 항목에 그대로 표시된다.

```
https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

이 값이 `R2_ENDPOINT` 다. 버킷 이름을 URL 에 붙이지 않는다 — 버킷은
`R2_BUCKET` 으로 따로 넘긴다.

#### 5-4. `.env.prod` 채우기

```bash
R2_BUCKET=idle-factory-backups
R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=<Access Key ID>
R2_SECRET_ACCESS_KEY=<Secret Access Key>
R2_PREFIX=postgres
R2_RETENTION_DAYS=30
```

`region` 은 설정하지 않는다. 스크립트가 R2 규약대로 `auto` 를 쓴다.

#### 5-5. 연결 확인

백업 스크립트는 호스트에 aws-cli 를 깔지 않고 컨테이너로 호출한다. 같은 방식으로
자격증명을 먼저 검증한다. 값은 `.env.prod` 에서 읽어 셸 히스토리에 남기지 않는다.

```bash
cd /srv/idle-factory
set -a; . ./.env.prod; set +a

docker run --rm \
  -e AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  -e AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  -e AWS_DEFAULT_REGION=auto \
  amazon/aws-cli:latest --endpoint-url "$R2_ENDPOINT" \
  s3 ls "s3://${R2_BUCKET}/"
```

빈 출력이면 성공이다(객체가 아직 없다). 실패하면 대개 다음 중 하나다.

- `InvalidAccessKeyId` → 키를 잘못 옮겼거나 토큰이 삭제됐다
- `AccessDenied` → 토큰이 이 버킷으로 스코프되지 않았다
- `Could not connect to the endpoint URL` → `R2_ENDPOINT` 의 계정 ID 오타

#### 5-6. lifecycle 규칙 (권장)

`db-backup.sh` 가 업로드 후 `R2_RETENTION_DAYS` 를 넘긴 객체를 지운다. 다만
스크립트가 며칠 돌지 못하면 정리도 멈추므로, 버킷 쪽에 안전망을 하나 더 둔다.

버킷 → **Settings** → **Object lifecycle rules** → 규칙 추가:

- Prefix: `postgres/`
- Action: Delete objects, `R2_RETENTION_DAYS` 보다 넉넉한 값(예: 60일)

스크립트 값보다 길게 잡는 것이 요점이다. 짧게 잡으면 R2 가 먼저 지워서 스크립트의
보관 기간 설정이 무의미해진다.

### 6. 백업 crontab

```bash
crontab -e
```

```cron
# 매일 04:10 (호스트 시간대 기준)
10 4 * * * cd /srv/idle-factory && ./scripts/db-backup.sh >> /var/log/idle-factory-backup.log 2>&1
```

### 7. 이미지 GC

이미지가 하나에 400MB~900MB 다. 오래된 태그를 정리하지 않으면 디스크가 찬다.

```cron
# 매주 일요일 05:00 — 어떤 컨테이너도 참조하지 않는 이미지 정리
0 5 * * 0 docker image prune -af --filter "until=336h" >> /var/log/idle-factory-prune.log 2>&1
```

### 8. 첫 배포 후 복구 리허설

백업이 "존재한다"와 "복구된다"는 다른 문제다. 최초 1회, 그리고 이후 분기마다
리허설을 돌리고 리포트를 보관한다.

```bash
./scripts/db-backup.sh
./scripts/db-restore-drill.sh
```

리포트는 `/var/backups/idle-factory/drills/` 에 쌓인다.

## 일상 배포

`stable` 에 병합되면 `.github/workflows/deploy.yml` 이 자동으로 처리한다.

1. `prepare` — 이미지 태그를 `sha-<7자리>` 로 확정한다.
2. `build-push` — bot·web·migrator 를 병렬 빌드해 GHCR 에 올린다. 태그는
   `sha-<7자리>`(불변)와 `latest`(이동) 두 개.
3. `deploy` — SSH 로 접속해 `.env.prod` 의 `IMAGE_TAG` 를 새 SHA 로 바꾸고
   `compose pull && compose up -d` 를 실행한 뒤 다음을 검증한다.
   - `migrator` 종료 코드가 0
   - `web` 이 healthy (내부적으로 `/api/health` 를 호출한다)
   - `bot` 이 running 이고 재시작 횟수가 0 (크래시 루프 감지)

   하나라도 실패하면 워크플로가 실패하고 해당 컨테이너 로그 마지막 50줄을 남긴다.

`compose.prod.yml` 은 배포 대상이 아니다. 워크플로는 VPS 사본의 해시를 레포와
대조해 다르면 경고만 남기고 배포는 계속한다. 경고가 보이면 `./scripts/vps-sync.sh`
를 돌린다 — 새 서비스나 새 필수 env 가 들어온 변경이라면 갱신 전까지 반영되지 않는다.

수동 재배포는 Actions → Deploy → Run workflow.

### 지금 무엇이 돌고 있는지

```bash
grep '^IMAGE_TAG=' .env.prod
docker compose --env-file .env.prod -f compose.prod.yml ps
curl -s localhost:3000/api/health   # version 필드가 배포된 태그다
```

## 롤백

이미지 태그가 불변이므로 롤백은 한 줄 수정이다.

```bash
cd /srv/idle-factory

# 되돌릴 태그 확인 (GHCR 패키지 페이지 또는 배포 워크플로 실행 이력)
sed -i 's|^IMAGE_TAG=.*|IMAGE_TAG=sha-1a2b3c4|' .env.prod

docker compose --env-file .env.prod -f compose.prod.yml pull
docker compose --env-file .env.prod -f compose.prod.yml up -d
```

### ⚠️ 스키마는 롤백되지 않는다

Prisma 마이그레이션에는 down 마이그레이션이 없다. **이미지를 되돌려도 DB 스키마는
그대로 최신 상태다.** 따라서 이전 이미지가 새 스키마와 호환되지 않으면 롤백해도
서비스가 복구되지 않는다.

이를 성립시키려면 파괴적 스키마 변경을 배포 2회로 쪼개야 한다(expand/contract).

| 단계      | 배포 N                                   | 배포 N+1       |
| --------- | ---------------------------------------- | -------------- |
| 컬럼 추가 | nullable 로 추가 + 코드가 양쪽 모두 처리 | NOT NULL 승격  |
| 컬럼 삭제 | 코드에서 사용 중단(컬럼은 남겨둠)        | 컬럼 DROP      |
| 컬럼 개명 | 새 컬럼 추가 + 양쪽 쓰기(dual-write)     | 이전 컬럼 DROP |

즉 **컬럼을 삭제하는 마이그레이션과 그 컬럼을 안 쓰게 만드는 코드 변경을 같은
배포에 넣지 않는다.** 한 배포로 합치면 그 배포는 롤백 불가능한 배포가 된다.

CI 의 `test-integration` 잡이 스키마 드리프트(마이그레이션 없는 스키마 변경)를
막아 주지만, expand/contract 를 지켰는지는 사람이 판단해야 한다.

## 백업 · 복구

### 백업

`scripts/db-backup.sh` 가 하는 일.

1. `pg_dump --format=custom` 을 **컨테이너 안에서** 실행한다(서버와 클라이언트
   버전 불일치가 원천적으로 없다).
2. 임시 파일로 받아 세 가지를 검사한 뒤에야 최종 이름으로 옮긴다.
   - 0바이트가 아닌지
   - `pg_restore --list` 로 읽히는지(깨진 덤프 차단)
   - **덤프의 테이블 수가 라이브 DB 와 일치하는지**
3. 로컬 보관(`BACKUP_RETENTION_DAYS`, 기본 7일) 후 Cloudflare R2 로 업로드하고
   원격도 정리한다(`R2_RETENTION_DAYS`, 기본 30일).

3번의 테이블 수 대조가 왜 필요한지는 실측으로 확인했다. **빈 덤프도 유효한 덤프라서
`pg_restore --list` 를 그대로 통과한다** — 스키마가 없는 DB 를 덤프하면 837바이트
파일이 무결성 검증을 지나갔다. 그대로 두면 DB 가 비어 버린 사고(런북이 경고하는
`-dev` 접미사 오설정 같은 것)를 백업이 "성공"으로 덮고, 로테이션이 며칠 뒤 마지막
정상 백업까지 지운다. 지금은 그 상황에서 백업이 실패하고 부분 파일도 남기지 않는다.

`R2_BUCKET` 이 비어 있으면 로컬 보관만 한다. VPS 디스크가 죽으면 백업도 함께
사라지므로 프로덕션에서는 반드시 채운다.

### 복구 리허설

프로덕션을 건드리지 않고, 임시 Postgres 컨테이너에 덤프를 복구해 테이블 집합과
행 수를 프로덕션과 대조한다.

```bash
./scripts/db-restore-drill.sh                 # 최신 로컬 백업
./scripts/db-restore-drill.sh /path/to.dump   # 특정 덤프
```

행 수 차이는 백업 시점 이후의 쓰기 때문에 정상적으로 발생한다. **테이블이 아예
누락된 경우만 실패로 판정한다.**

### 실제 복구

```bash
cd /srv/idle-factory
COMPOSE="docker compose --env-file .env.prod -f compose.prod.yml"

# 1. 쓰기를 멈춘다. Postgres 는 그대로 둔다.
$COMPOSE stop bot web

# 2. 복구 대상을 컨테이너로 넣는다.
docker cp /var/backups/idle-factory/<덤프> "$($COMPOSE ps -q postgres)":/tmp/restore.dump

# 3. 스키마째로 갈아끼운다. --clean --if-exists 가 기존 객체를 먼저 지운다.
$COMPOSE exec -T postgres pg_restore \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --clean --if-exists --no-owner --no-acl --exit-on-error \
  /tmp/restore.dump

# 4. 다시 올린다. migrator 가 스키마를 최신으로 맞춘다.
$COMPOSE up -d
```

복구한 덤프가 현재 코드보다 오래된 스키마일 수 있으므로 4단계의 `migrator` 실행이
반드시 성공해야 한다. 실패하면 로그를 보고 판단한다.

Redis 는 백업 대상이 아니다. BullMQ 큐가 유실되면 예약 작업이 한 주기 지연될 뿐
재생성된다.

## 트러블슈팅

### `compose pull` 이 denied

GHCR 패키지가 private 이다. 위의 "GHCR 패키지 접근" 절을 따른다.

### migrator 가 실패한다

```bash
docker compose --env-file .env.prod -f compose.prod.yml logs migrator
```

- `Can't reach database server` → `DATABASE_URL` 의 호스트가 `postgres` 인지,
  `POSTGRES_*` 세 값과 자격증명이 일치하는지 확인한다.
- `migrate found failed migration` → 이전 마이그레이션이 중간에 깨졌다. 원인을
  고친 뒤 `prisma migrate resolve` 로 해당 마이그레이션을 정리해야 한다.
  자동 재시도로는 풀리지 않는다.

### web 이 healthy 가 되지 않는다

```bash
docker compose --env-file .env.prod -f compose.prod.yml logs web
curl -i localhost:3000/api/health
```

`/api/health` 는 DB 를 확인하지 않는 liveness 프로브다. 이것이 200 인데 페이지가
깨진다면 DB 나 인증 설정 문제이고, 이것 자체가 응답하지 않으면 프로세스가 죽은 것이다.

### bot 이 재시작을 반복한다

```bash
docker compose --env-file .env.prod -f compose.prod.yml logs bot | tail -50
```

`Missing required environment variable: BOT_TOKEN` 이 가장 흔하다. 봇은 HTTP
서버가 없어 healthcheck 를 걸 수 없으므로, 배포 워크플로가 기동 15초 후
`RestartCount` 를 보고 크래시 루프를 판정한다.

### 디스크가 찼다

```bash
docker system df
du -sh /var/backups/idle-factory
docker image prune -af --filter "until=336h"
```

Postgres 볼륨·백업·이미지 레이어가 같은 디스크에 있다. 백업이 디스크를 채워
DB 를 멈추게 하는 것이 이 구성의 가장 현실적인 장애 시나리오다. `BACKUP_RETENTION_DAYS`
를 줄이거나 백업 디렉터리를 별도 볼륨으로 옮긴다.

## 알려진 제약

- **단일 VPS = SPOF.** 호스트가 죽으면 전체가 멈춘다. 복구 수단은 백업뿐이다.
- **무중단 배포 없음.** 배포마다 봇은 수 초, 웹은 짧은 502 가 발생한다.
- **스키마 롤백 불가.** 위 expand/contract 절을 참고한다.
- **Redis 미백업.** 예약 작업 큐는 재생성 가능한 상태로 취급한다.
- **이미지가 무겁다**(400MB~900MB). Prisma 7 이 `@prisma/client` 의 peer 로
  `prisma` CLI 체인을 프로덕션 트리까지 끌고 오는 것이 주된 원인이다. 재배포
  전송량은 node_modules 레이어를 따로 떼어 완화해 두었다(앱 코드만 바뀌면
  수 MB 만 전송된다).

## 로컬에서 프로덕션 이미지 검증

```bash
docker build -f apps/bot/Dockerfile -t idle-factory-bot:test .
docker build -f apps/web/Dockerfile -t idle-factory-web:test .
docker build -f packages/database/Dockerfile -t idle-factory-migrator:test .
```

세 Dockerfile 모두 **빌드 컨텍스트가 레포 루트**다. 컨테이너 안에서
`turbo prune` 을 실행하므로 워크스페이스 전체가 필요하다.

`compose.prod.yml` 로 로컬 검증을 할 때는 프로젝트명이 `idle-factory-prod` 로
고정돼 있어 `docker-compose.dev.yml` 스택(프로젝트명 `idle-factory`)과 섞이지
않는다. 이 격리가 없으면 prod compose 를 올리는 순간 dev 컨테이너가 prod 정의로
재생성된다.
