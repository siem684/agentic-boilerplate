// Shared by init.mjs and check.mjs.
// Files that carry {{PLACEHOLDERS}} to fill in at spawn time. README.md is
// deliberately absent: it only mentions the placeholder syntax.
export const PLACEHOLDER_FILES = ["CLAUDE.md", ".github/CODEOWNERS", ".github/workflows/ci.yml"];

// Files that belong to the template repository only. init.mjs deletes them in a spawned project.
export const TEMPLATE_ONLY_FILES = [".github/workflows/template-ci.yml"];
