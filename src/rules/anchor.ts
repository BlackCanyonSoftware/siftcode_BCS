import type { RepoView } from './types.js';

/** Where a finding about the project as a whole is shown: its README, or else the folder itself. */
export function anchorPath(repo: RepoView): string {
  return repo.files.find((path) => /^readme(?:\.\w+)?$/i.test(path)) ?? '.';
}

/** Whole-project checks apply to the top of a Git repository that has source code. */
export const isProject = (repo: RepoView): boolean =>
  repo.isRepositoryRoot && repo.sourceFileCount > 0;
