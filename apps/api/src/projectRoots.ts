// A target project's own roots (B2 - iot AGENTS_TO_DO.md 2026-10-17): its
// plugins, its migrations - one directory or several (a project built on
// another project's packages: the Nexus Edge Demo on the aquarium's).
// An env value is a comma-separated list of "label=path" or "path"; the
// order is the order of loading (a dependency first). The first root's
// label defaults to `firstLabel` (compatible with the single-root days -
// "private" for plugins: `folder_path` "private/...", the URLs
// /library-assets/private/...), the next ones to "<firstLabel>-2", ...

export interface ProjectRoot {
  label: string;
  dir: string;
}

const LABEL = /^[a-z][a-z0-9-]{0,39}$/;

export function parseRoots(value: string | undefined, firstLabel: string): ProjectRoot[] {
  const entries = (value ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const roots = entries.map((entry, i) => {
    const eq = entry.indexOf("=");
    const label = eq > 0 ? entry.slice(0, eq).trim() : i === 0 ? firstLabel : `${firstLabel}-${i + 1}`;
    const dir = eq > 0 ? entry.slice(eq + 1).trim() : entry;
    if (!LABEL.test(label)) throw new Error(`a project root's label must be lowercase letters, digits, dashes: "${label}"`);
    return { label, dir };
  });
  const labels = new Set(roots.map((r) => r.label));
  if (labels.size !== roots.length) throw new Error(`project roots need distinct labels: ${value}`);
  return roots;
}
