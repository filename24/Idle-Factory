FROM node:16-alpine

WORKDIR /app

RUN apk update && apk upgrade && \
    apk add --no-cache bash git openssh python3 build-base libc6-compat

COPY package.json .
COPY .yarn/ ./.yarn
COPY .yarnrc.yml .
COPY yarn.lock .

COPY .git ./.git
COPY prisma/ ./prisma

COPY turbo.json .
COPY packages/ ./packages
COPY apps/bot ./apps/bot

RUN yarn install --inline-builds
RUN yarn cache clean

COPY tsup.config.ts .
COPY tsconfig.json .

RUN yarn build --filter bot
RUN yarn generate

CMD yarn start --filter bot
