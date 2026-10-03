/**
 * Forge Platform — forbidden provider SDK imports rule.
 *
 * Enforces ARCHITECTURE.md §0.1 / ADR-002: all LLM traffic flows through the
 * AI Gateway; no product module may import a provider SDK directly.
 *
 * Allowed locations (configurable via rule options):
 *   - apps/gateway/src/adapters/**  (the only place vendor SDKs live)
 *
 * The rule is intentionally simple and dependency-free (no ESLintParser type
 * info required) so it can run repo-wide in CI as a hard gate, mirroring
 * SECURITY.md §3 ("enforced mechanically, not by review memory").
 */
"use strict";

const DEFAULT_FORBIDDEN = [
  // OpenAI family
  "openai",
  "@azure/openai",
  "@google/generative-ai",
  // Anthropic family
  "@anthropic-ai/sdk",
  "@anthropic-ai/vertex-sdk",
  "@anthropic-ai/bedrock-sdk",
  // Qwen / DashScope / Alibaba
  "dashscope",
  "@dashscope/dashscope-sdk",
  // Misc providers commonly reached for (extend over time; never weaken)
  "@mistralai/mistralai",
  "cohere-ai",
  "@groq/cloud-sdk-groq",
  "groq-sdk",
  "@deepseek/api",
];

const DEFAULT_ALLOW_GLOBS = ["apps/gateway/src/adapters/"];

/** Convert a crude glob (dir prefix with trailing slash, or exact file) to matcher. */
function makePathMatcher(globs) {
  const normalized = globs.map((g) => g.replace(/\\/g, "/"));
  return (relPath) => {
    const p = relPath.replace(/\\/g, "/");
    return normalized.some((g) => (g.endsWith("/") ? p.startsWith(g) : p === g));
  };
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow importing AI provider SDKs outside approved gateway adapter locations (ADR-002).",
      recommended: true,
    },
    schema: [
      {
        type: "object",
        properties: {
          forbiddenPackages: { type: "array", items: { type: "string" } },
          allowPaths: { type: "array", items: { type: "string" } },
          cwd: { type: "string" },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      forbiddenProviderImport:
        "Provider SDK import '{{source}}' is forbidden outside approved gateway adapter paths (ADR-002). Route this through @forge/ai-contracts + the AI Gateway instead.",
    },
  },

  create(context) {
    const options = context.options[0] || {};
    const forbidden = new Set(options.forbiddenPackages || DEFAULT_FORBIDDEN);
    const allowMatch = makePathMatcher(options.allowPaths || DEFAULT_ALLOW_GLOBS);

    const filename = context.filename || context.getFilename();
    let rel = null;
    if (typeof options.cwd === "string") {
      rel = filename.replace(options.cwd.replace(/\/$/, ""), "").replace(/^\/+/, "");
    } else {
      rel = filename;
    }

    if (allowMatch(rel)) {
      return {}; // inside approved adapter zone — everything allowed
    }

    // Also skip the rule's own fixtures/tests that intentionally reference names
    // (they use string literals, not imports, but be defensive about test dirs
    // named for the rule itself).
    if (rel.includes("fixtures/forbidden-import-violation")) {
      // Intentional violation fixture — must NOT be skipped: it exists to prove
      // the rule fires. Keep this block empty on purpose.
    }

    function checkSource(node, sourceValue) {
      if (typeof sourceValue !== "string") return;
      const pkg = normalizePackageName(sourceValue);
      if (pkg && forbidden.has(pkg)) {
        context.report({ node, messageId: "forbiddenProviderImport", data: { source: sourceValue } });
      }
    }

    /**
     * Match bare package specifiers AND dynamic requires: require("openai"),
     * await import("@anthropic-ai/sdk").
     */
    return {
      ImportDeclaration: (node) => checkSource(node, node.source.value),
      ExportAllDeclaration: (node) => checkSource(node, node.source.value),
      ExportNamedDeclaration: (node) => {
        if (node.source) checkSource(node, node.source.value);
      },
      TSImportEqualsDeclaration: (node) => {
        const ref = node.moduleReference;
        if (ref && ref.expression && ref.expression.type === "Literal") {
          checkSource(node, ref.expression.value);
        }
      },
      CallExpression: (node) => {
        const callee = node.callee;
        const isRequire = callee.type === "Identifier" && callee.name === "require";
        const isDynamicImport = callee.type === "Import";
        if ((isRequire || isDynamicImport) && node.arguments.length >= 1) {
          const arg = node.arguments[0];
          if (arg.type === "Literal") checkSource(arg, arg.value);
        }
      },
    };
  },
};

/** Extract package name from a specifier ("openai/chat" -> "openai", "@a/b/c" -> "@a/b"). */
function normalizePackageName(specifier) {
  if (!specifier) return null;
  if (specifier.startsWith(".")) return null; // relative
  const parts = specifier.split("/");
  if (specifier.startsWith("@") && parts.length >= 2) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0] || null;
}

module.exports.DEFAULT_FORBIDDEN = DEFAULT_FORBIDDEN;
module.exports.normalizePackageName = normalizePackageName;
