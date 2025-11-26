

import { secretRules } from './rules.js';

/**
 * Compiles all regex patterns for the scan.
 * It combines static patterns with dynamic ones based on user settings and secret rules.
 * @param {string[]} parameters - An array of user-defined "interesting parameters".
 * @returns {object} An object containing all regex patterns, grouped by category.
 */
export function getPatterns(parameters) {
  let patterns = {
    Subdomains: {
      regex:
        /\b(?:https?:\/\/)?((?:[a-zA-Z0-9-]+\.)+[a-z]{2,63})(?:\/[^\s"'`]*)?/g,
      group: 1,
      context: "snippet",
    },
    Endpoints: {
      regex: /(["'`])(\/(?!\/)[a-zA-Z0-9_?&=\/\-#.]*)\1/g,
      group: 2,
      context: "snippet",
    },
    "Source Maps": {
      regex: /\/[#*]\s?sourceMappingURL=([^\s<]+)/g,
      group: 1,
      context: "line",
    },
    "JS Libraries": {
      regex: /\/\*!?[ \n][a-zA-Z0-9\._\- ]+ v([0-9\.]+)/g,
      group: 0,
      context: "line",
    },
    "Potential DOM XSS Sinks": {
      regex: /\.(innerHTML\b|outerHTML\b|src\b|href\b|action\b|style\b|cssText\b)\s*=|(\.|\b)(insertAdjacentHTML\b|write\b|writeln\b|replace\b|open\b|setAttribute\b|assign\b|html\b|append\b|prepend\b|after\b|before\b|parseHTML\b|eval\b|setTimeout\b|setInterval\b)\s*\(/gi,
      group: 1,
      context: "snippet",
    },
    "Interesting Parameters": {
      regex:
        parameters && parameters.length > 0
          ? new RegExp(`[?&"']((${parameters.join("|")}))\\s*[:=]`, "gi")
          : null,
      group: 1,
      context: "snippet",
    },
    "Potential NPM Packages": [
      {
        // Finds scoped package names in "name" fields, like in a package.json
        regex: /"name":\s*"(@[a-z0-9-~][a-z0-9-._~]*\/[a-z0-9-~][a-z0-9-._~]*)"/g,
        group: 1,
        context: "line",
      },
      {
        // Finds scoped package names in import/require statements
        regex: /(?:from|require\()\s*['"](@[a-z0-9-~][a-z0-9-._~]*\/[a-z0-9-~][a-z0-9-._~]*)['"]/g,
        group: 1,
        context: "line",
      },
    ],
    "GraphQL": [
      {
        regex: /(["'`])((?:https?:\/\/[^"'\s]*)?(?:\/api)?(?:\/v\d+)?\/graphql)(?:\?[^"']*)?\1/g,
        group: 2,
        context: "line",
      },
      {
        regex: /(?:query|mutation|subscription)\s+[a-zA-Z0-9_]+\s*[({]|gql\s*`/g,
        group: 0,
        context: "snippet",
      },
      {
        regex: /__schema\s*\{|__type\s*\(/g,
        group: 0,
        context: "snippet",
      }
    ],
  };
  for (const rule of secretRules) {
    if (!patterns["Potential Secrets"]) {
      patterns["Potential Secrets"] = [];
    }
    patterns["Potential Secrets"].push({
      regex: new RegExp(rule.regex, "gi"),
      group: rule.group ?? 0,
      context: "snippet",
      ruleId: rule.id,
      ruleEntropy: rule.entropy ?? 0,
    });
  }
  return patterns;
}
