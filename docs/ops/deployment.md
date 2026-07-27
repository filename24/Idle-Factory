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

# 배포 유저가 sudo 없이 docker 를 쓰게 한다. 이걸 빼면 배포 워크플로의
# `docker compose` 가 소켓 권한 오류(permission denied ... docker.sock)로 죽는다.
sudo usermod -aG docker "$USER"

sudo mkdir -p /srv/idle-factory
sudo chown "$USER":"$USER" /srv/idle-factory
```

그룹 변경은 **새 로그인 세션부터** 적용된다. 로그아웃 후 다시 접속해 확인한다.
(배포 워크플로는 매번 새 SSH 세션을 열므로 별도 조치가 필요 없다.)

```bash
docker ps      # sudo 없이 동작해야 한다
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

`.env.prod` 에서 반드시 채워야 하는 값과 함정은 `.env.prod.example` 의 주석에
전부 적혀 있다. 특히 두 가지를 확인한다.

- `POSTGRES_DB` 는 **`-dev` 로 끝나면 안 된다.** `apps/bot` 통합 테스트는
  `DATABASE_URL` 이 `-dev` 로 끝날 때만 실행되며 매 테스트마다 전체 테이블을
  `TRUNCATE` 한다. 프로덕션 DB 이름을 `-dev` 로 두면 실수로 실행된 테스트가
  프로덕션 데이터를 지운다.
- `DATABASE_URL` 의 호스트는 `postgres`(compose 서비스명)다. `localhost` 는
  컨테이너 자기 자신을 가리킨다.

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

### 3. 배포용 SSH 키와 GitHub 시크릿

#### 3-1. 키 만들기

**배포 전용** 키를 새로 만든다. 평소 쓰는 개인 키를 재사용하지 않는다 — 유출 시
피해 범위가 다르고, 회수할 때 다른 접속까지 함께 끊긴다.

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy@idle-factory" \
  -f ~/.ssh/idle-factory-deploy -N ""
```

- `-N ""` — **패스프레이즈를 걸지 않는다.** GitHub Actions 는 비대화형이라 입력할
  수단이 없다. 대신 키를 이 용도로만 좁히고 시크릿으로만 보관해 위험을 줄인다.
- `-t ed25519` — RSA 보다 짧고 빠르다. OpenSSH 6.5+ 면 지원한다.

두 파일이 생긴다. **둘을 섞지 않도록 주의한다.**

| 파일                      | 정체   | 어디에 넣나                     |
| ------------------------- | ------ | ------------------------------- |
| `idle-factory-deploy.pub` | 공개키 | VPS 의 `~/.ssh/authorized_keys` |
| `idle-factory-deploy`     | 개인키 | GitHub Secret `VPS_SSH_KEY`     |

#### 3-2. VPS 에 공개키 등록

```bash
ssh-copy-id -i ~/.ssh/idle-factory-deploy.pub <VPS_USER>@<VPS_HOST>
```

`ssh-copy-id` 가 없으면 수동으로 붙인다.

```bash
cat ~/.ssh/idle-factory-deploy.pub | ssh <VPS_USER>@<VPS_HOST> \
  'install -m 700 -d ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys'
```

#### 3-3. 접속 확인

시크릿에 넣기 **전에** 이 키만으로 접속되는지 본다.

```bash
ssh -i ~/.ssh/idle-factory-deploy -o IdentitiesOnly=yes \
  <VPS_USER>@<VPS_HOST> 'whoami && docker ps -q | wc -l'
```

`IdentitiesOnly=yes` 가 핵심이다. 없으면 ssh 에이전트에 올라간 **다른** 키로 접속이
성공해서, 정작 이 키가 등록됐는지 확인하지 못한다. 여기서 `docker ps` 가 권한
오류를 내면 §1 의 docker 그룹 설정이나 재로그인이 빠진 것이다.

#### 3-4. 호스트 키 얻기 (권장)

```bash
ssh-keyscan -t ed25519 <VPS_HOST>
```

출력된 한 줄을 그대로 `VPS_SSH_HOST_KEY` 에 넣는다. 이 값이 없으면 워크플로가
`ssh-keyscan` 결과를 검증 없이 신뢰하고(TOFU) 경고를 남긴다.

#### 3-5. 시크릿 등록

리포지터리 Settings → Secrets and variables → Actions.

| 이름               | 필수 | 내용                                                 |
| ------------------ | ---- | ---------------------------------------------------- |
| `VPS_HOST`         | ✅   | VPS 주소 (IP 또는 도메인)                            |
| `VPS_USER`         | ✅   | SSH 사용자 — §3-3 의 `whoami` 결과                   |
| `VPS_SSH_KEY`      | ✅   | **개인키 전문** (`idle-factory-deploy`, `.pub` 아님) |
| `VPS_SSH_HOST_KEY` | 권장 | §3-4 의 `ssh-keyscan` 출력 한 줄                     |

`VPS_SSH_KEY` 는 `-----BEGIN OPENSSH PRIVATE KEY-----` 부터
`-----END OPENSSH PRIVATE KEY-----` 까지 **줄바꿈을 포함해 통째로** 넣는다.

```bash
# macOS
pbcopy < ~/.ssh/idle-factory-deploy
# Linux (xclip)
xclip -selection clipboard < ~/.ssh/idle-factory-deploy
# 그 외 — 출력해서 전체 선택 복사
cat ~/.ssh/idle-factory-deploy
```

줄바꿈이 뭉개져 한 줄로 들어가면 워크플로가 `Load key: error in libcrypto` 로
실패한다. 그때는 시크릿을 지우고 다시 붙여넣는 것 말고는 방법이 없다.

등록을 마치면 개인키 파일은 로컬에 남겨둘 이유가 없다. 지우거나 패스워드 매니저로
옮긴다. 키를 잃어버렸으면 새로 만들어 §3-1 부터 다시 하면 된다 — 공개키만 갈아
끼우면 되므로 비용이 거의 없다.

GHCR 푸시는 기본 `GITHUB_TOKEN` 으로 처리되므로 별도 토큰이 필요 없다.

배포 디렉터리가 `/srv/idle-factory` 가 아니면 Variables 에 `DEPLOY_DIR` 를 둔다.

#### 선택적 강화

이 키는 VPS 에서 임의 명령을 실행할 수 있다. 더 좁히고 싶다면 `authorized_keys`
항목 앞에 옵션을 붙인다.

```
restrict,pty ssh-ed25519 AAAAC3Nza...키_전체... github-actions-deploy@idle-factory
```

`restrict` 는 포트 포워딩·에이전트 포워딩·X11 을 모두 막는다(명령 실행은 남는다).
`command="..."` 로 실행 가능한 명령까지 한 개로 고정할 수도 있지만, 현재 배포
워크플로는 스크립트를 heredoc 으로 보내므로 그렇게 하려면 배포 스크립트를 VPS 에
두는 구조 변경이 필요하다.

GitHub Actions 러너의 IP 는 고정이 아니므로 `from=` 으로 출처를 제한하는 방법은
쓸 수 없다.

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

### SSH 접속이 실패한다

배포 워크플로의 `Deploy over SSH` 스텝 로그를 본다.

- `Load key ".../deploy_key": error in libcrypto` → `VPS_SSH_KEY` 의 줄바꿈이
  깨졌다. 개인키를 다시 통째로 붙여넣는다(§3-5).
- `Permission denied (publickey)` → 공개키가 VPS 에 등록되지 않았거나 다른
  사용자 계정에 등록됐다. `VPS_USER` 가 §3-3 의 `whoami` 결과와 같은지 확인한다.
- `Host key verification failed` → `VPS_SSH_HOST_KEY` 가 실제 호스트 키와 다르다.
  VPS 를 재설치했다면 호스트 키가 바뀌었으니 `ssh-keyscan` 을 다시 떠서 갱신한다.
- `permission denied while trying to connect to the Docker daemon socket` →
  배포 유저가 docker 그룹에 없다. §1 의 `usermod -aG docker` 를 하고 재로그인한다.

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

## web 을 Vercel 에서 돌리기

기본 구성은 web 도 이 VPS 에서 컨테이너로 돈다. Vercel 로 옮길 수 있게 스위치를
넣어 두었지만, **바꿔야 할 것은 배포 설정보다 데이터 경로다.** 먼저 그것을 읽고
결정할 것.

### 먼저 판단할 것 — DB 접근

봇은 계속 이 VPS 에서 돌고, 봇과 web 은 같은 Postgres 를 쓴다. 지금 Postgres 는
compose 내부 네트워크에만 있고 호스트 포트조차 열지 않는다. Vercel 함수가 여기에
붙으려면 다음을 감수해야 한다.

- **인터넷 노출** — Vercel 함수의 egress IP 는 고정이 아니다(Static IP 는 상위
  플랜 기능). 따라서 방화벽으로 출처를 좁힐 수 없고, 사실상 Postgres 포트를 전체
  개방한 뒤 TLS 와 비밀번호에만 의존하게 된다.
- **연결 폭발** — serverless 인스턴스마다 커넥션을 열어 `max_connections` 를
  넘긴다. PgBouncer transaction 풀링이 필요하고, Prisma 쪽 prepared statement
  설정도 함께 조정해야 한다.
- **레이턴시** — Vercel 리전과 VPS 가 멀면 쿼리마다 왕복 비용이 붙는다.
- **마이그레이션 순서가 깨진다** — 지금은 compose 가 `migrator 완료 → web 시작`
  을 강제해 스키마 불일치 창이 없다. Vercel 배포는 이 워크플로와 별도 타임라인이라
  그 보장이 사라진다. web 이 새 스키마를 기대하는데 migrator 가 아직 안 돌았거나,
  반대 상황이 생길 수 있다.

그래서 현실적인 선택은 **DB 를 매니지드로 옮기는 것**이다(Neon, Supabase 등).
연결 풀러가 내장돼 있고 Postgres 를 직접 노출할 필요가 없으며, VPS 의 봇도 같은
DB 에 붙는다. 이 경우 `compose.prod.yml` 의 `postgres` 서비스를 빼고
`DATABASE_URL` 만 외부로 돌리면 되지만, 백업 스크립트가 `compose exec postgres`
에 의존하므로 함께 손봐야 한다(공급자 백업 기능으로 대체하거나 스크립트에서
직접 접속하도록 수정).

**Postgres 를 컨테이너로 유지한 채 web 만 Vercel 로 옮기는 조합은 권장하지
않는다.** 위 네 가지를 모두 떠안게 된다.

### 전환 절차

DB 문제를 해결했다면 나머지는 스위치 세 개다.

1. **리포지터리 Variables** 에 `WEB_ON_VERCEL=true` 를 추가한다.
   배포 워크플로가 web 이미지를 만들지 않고, VPS 에 web 컨테이너가 없는 것을
   사고가 아닌 의도로 판정한다.

2. **`.env.prod`** 에서 프로파일을 비운다.

   ```bash
   COMPOSE_PROFILES=
   ```

   ⚠️ web 전용 값(`BETTER_AUTH_SECRET`·`BETTER_AUTH_URL`·`DISCORD_CLIENT_ID`·
   `DISCORD_CLIENT_SECRET`)은 **줄을 지우지 말 것.** compose 는 프로파일로 제외된
   서비스의 변수까지 보간하므로 비어 있으면 모든 compose 명령이 멈춘다. web 이
   뜨지 않으니 진짜 시크릿일 필요는 없다 — `unused` 같은 자리값으로 두고 실제
   값은 Vercel 환경변수에 넣는다.

3. **Vercel 프로젝트** 를 만든다. 모노레포이므로 Root Directory 를 `apps/web` 로
   지정한다. `next.config.js` 가 `VERCEL` 환경변수를 보고 `output: 'standalone'`
   을 자동으로 끄므로 빌드 설정을 따로 만질 필요는 없다.

   Vercel 환경변수에 넣을 값:

   | 변수                            | 비고                                       |
   | ------------------------------- | ------------------------------------------ |
   | `DATABASE_URL`                  | 풀러 경유 주소. 위의 DB 판단 결과를 따른다 |
   | `BETTER_AUTH_SECRET`            | VPS 와 같은 값이어야 기존 세션이 유지된다  |
   | `BETTER_AUTH_URL`               | Vercel 도메인                              |
   | `DISCORD_CLIENT_ID` / `_SECRET` | Discord 앱 자격증명                        |
   | `NEXT_PUBLIC_APP_URL`           | 같은 오리진이면 비워 둔다                  |

   Discord Dev Portal 의 Redirects 에 Vercel 도메인 콜백 URL 을 추가한다.

4. VPS 에서 남아 있는 web 컨테이너를 내린다.

   ```bash
   cd /srv/idle-factory
   docker compose --env-file .env.prod -f compose.prod.yml up -d --remove-orphans
   ```

   `--remove-orphans` 가 프로파일에서 빠진 web 컨테이너를 정리한다.

5. 호스트 리버스 프록시에서 web 으로 향하던 설정을 제거하거나 Vercel 로 돌린다.

### 되돌리기

`apps/web/Dockerfile` 과 compose 의 web 서비스 정의는 그대로 남겨 둔다. Vercel 을
쓰지 않게 되면 `WEB_ON_VERCEL` 변수를 지우고 `COMPOSE_PROFILES=self-hosted` 로
되돌리면 끝이다. CI 의 이미지 빌드 가드는 Vercel 사용 여부와 무관하게 계속 web
Dockerfile 을 검증하므로, 방치해도 썩지 않는다.

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
