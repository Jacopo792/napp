# The collaboration server. Node 22 runs the TypeScript directly, the way the
# rest of this repository does — there is no build step to keep in sync.
FROM node:22.23-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.15.1 --activate
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY server/package.json server/package.json
# Hoisted, not the default symlink tree: the shared modules below keep their
# path under `src/`, and a flat `node_modules` at the root is what lets both
# them and `server/src` resolve the same packages.
RUN pnpm install --frozen-lockfile --filter @notes-app/collab-server --prod \
      --config.node-linker=hoisted

FROM node:22.23-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY server/package.json ./server/package.json
COPY server/src ./server/src

# The document schema and the Yjs conversion are shared verbatim with the
# browser, not reimplemented here: one definition is what keeps a note written
# in a tab legible to this process. They keep their path in the repository, so
# the import is the same line in development and in the image.
COPY src/features/editor/lib/content.ts src/features/editor/lib/ydoc.ts ./src/features/editor/lib/

USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--experimental-strip-types", "server/src/index.ts"]
