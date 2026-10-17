/* The core reads its configuration the way Vite hands it over,
   `import.meta.env.VITE_*`, and Metro has no such object. Rather than teach
   the core a second spelling, the values from the repository's own .env.local
   are written into the bundle where it asks for them — which is what Vite
   does too. */
const path = require("node:path");
const mobileCollabUrl = require("./collab-url.cjs");

try {
  process.loadEnvFile(path.join(__dirname, "../../.env.local"));
} catch {
  /* No file: CI, or a preview that needs no backend. */
}

function importMetaEnv({ types: t }) {
  const isEnv = (node) =>
    t.isMemberExpression(node) &&
    t.isMetaProperty(node.object) &&
    node.object.meta.name === "import" &&
    t.isIdentifier(node.property, { name: "env" });
  const value = (name) =>
    name === "DEV"
      ? t.booleanLiteral(process.env.NODE_ENV !== "production")
      : name === "VITE_COLLAB_URL"
        ? t.stringLiteral(mobileCollabUrl())
        : process.env[name] === undefined
          ? t.identifier("undefined")
          : t.stringLiteral(process.env[name]);
  return {
    visitor: {
      MemberExpression(p) {
        if (isEnv(p.node.object) && t.isIdentifier(p.node.property))
          p.replaceWith(value(p.node.property.name));
        else if (isEnv(p.node) && !t.isMemberExpression(p.parent))
          p.replaceWith(t.objectExpression([]));
      },
    },
  };
}

module.exports = (api) => {
  api.cache.never();
  return { presets: ["babel-preset-expo"], plugins: [importMetaEnv] };
};
