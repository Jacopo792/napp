# The collaboration server. Node 22 runs the TypeScript directly, the way the
# rest of this repository does — there is no build step to keep in sync.
FROM node:22.23-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.15.1 --activate
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/collab-server/package.json packages/collab-server/package.json
COPY packages/core/package.json packages/core/package.json
# Hoisted, not the default symlink tree: the shared modules below keep their
# path under `packages/core/`, and a flat `node_modules` at the root is what
# lets both them and `packages/collab-server/src` resolve the same packages.
RUN pnpm install --frozen-lockfile --filter @notes-app/collab-server --prod \
      --config.node-linker=hoisted

FROM node:22.23-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY packages/collab-server/package.json ./packages/collab-server/package.json
COPY packages/collab-server/src ./packages/collab-server/src

# The document schema, the Yjs conversion and the write locks are shared
# verbatim with the browser, not reimplemented here: one definition is what
# keeps a note written in a tab legible to this process. They keep their path
# in the repository, so the import is the same line in development and in the
# image.
#
# The whole directory, and not the two or three files the server imports today.
# A named list is a second place to remember, and it was forgotten the moment
# `writeLocks.ts` arrived: the image built, started, and exited on
# ERR_MODULE_NOT_FOUND. Nothing here is loaded unless it is imported, so the
# cost of the files the server never reaches is the bytes.
COPY packages/core/package.json ./packages/core/package.json
COPY packages/core/src/features/editor/lib/ ./packages/core/src/features/editor/lib/

# `--config.node-linker=hoisted` builds a flat node_modules and does not link
# workspace packages into it, so `@notes-app/core` resolves in development and
# not in the image — which is the ERR_MODULE_NOT_FOUND above wearing a
# different hat. The link is what pnpm would have made; making it here is one
# line and does not depend on how a future pnpm hoists.
RUN mkdir -p node_modules/@notes-app \
 && ln -s ../../packages/core node_modules/@notes-app/core

USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--experimental-strip-types", "packages/collab-server/src/index.ts"]
