/**
 * Whether a task or chef checkout belongs to a project: the project path itself or a
 * path under it. A worktree outside the project folder does not match.
 */
export function inProject(checkout: string, projectPath: string): boolean {
  const root = projectPath.replace(/\/+$/, "") || "/";
  const prefix = root === "/" ? "/" : `${root}/`;
  return checkout === root || checkout.startsWith(prefix);
}
