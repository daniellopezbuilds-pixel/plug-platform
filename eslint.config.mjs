import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const HTTP_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

/**
 * Route handlers must authenticate the caller.
 *
 * Everything under app/api/ is a public internet endpoint. Nothing else in
 * this app gates them: proxy.ts matches /dashboard only, so a route handler
 * that does not check the caller itself has not been checked by anything.
 * Widening that matcher would not change this rule — authentication belongs in
 * the handler, not in a path pattern someone can refactor out from under it.
 *
 * That is not hypothetical. Both Stripe checkout routes took `userId` from the
 * request body and trusted it, and group-checkout took the PRICE from the body
 * too — a one-cent group join for anyone willing to edit a fetch. The fix was
 * lib/apiAuth.tsx; this rule is what stops the next route from being written
 * the same way.
 *
 * A route that is genuinely public opts out with a `@public-route` comment
 * naming what protects it instead. There are two today: the Stripe webhook
 * (verifies a Stripe signature) and keep-alive (a Vercel cron ping).
 */
const requireRouteAuth = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Route handlers must authenticate the caller with getUserFromRequest(), or declare @public-route with a reason.",
    },
    schema: [],
    messages: {
      missing:
        "Route handler {{name}} never calls getUserFromRequest(), so it trusts whatever the caller sends. Authenticate the caller, or add a `@public-route` comment saying what protects it instead.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const handlers = [];
    let callsAuth = false;

    return {
      Identifier(node) {
        if (node.name === "getUserFromRequest") callsAuth = true;
      },

      ExportNamedDeclaration(node) {
        const declaration = node.declaration;
        if (!declaration) return;

        // export async function POST(...) {}
        if (
          declaration.type === "FunctionDeclaration" &&
          declaration.id &&
          HTTP_METHODS.has(declaration.id.name)
        ) {
          handlers.push(declaration.id);
          return;
        }

        // export const POST = async (...) => {}
        if (declaration.type === "VariableDeclaration") {
          for (const declarator of declaration.declarations) {
            if (
              declarator.id.type === "Identifier" &&
              HTTP_METHODS.has(declarator.id.name)
            ) {
              handlers.push(declarator.id);
            }
          }
        }
      },

      "Program:exit"() {
        if (callsAuth || handlers.length === 0) return;

        // Checked across the whole file rather than per-handler: the marker is
        // a statement about the route, and every route file here exports one
        // handler.
        const optedOut = sourceCode
          .getAllComments()
          .some((comment) => comment.value.includes("@public-route"));

        if (optedOut) return;

        for (const id of handlers) {
          context.report({ node: id, messageId: "missing", data: { name: id.name } });
        }
      },
    };
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["app/api/**/route.{ts,tsx,js,jsx}"],
    plugins: {
      sparx: { rules: { "require-route-auth": requireRouteAuth } },
    },
    rules: {
      "sparx/require-route-auth": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
