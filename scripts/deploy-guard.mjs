/**
 * Whether this checkout is fit to put on production, as a list of reasons it
 * is not.
 *
 * The deploy used to check the branch name and nothing else. A worktree on
 * `main` with an uncommitted edit, or three commits behind origin, or ahead of
 * it with a commit CI has never seen, all passed — and each of those puts code
 * on eventiq.win that is not the code anybody reviewed, with migrations to
 * match and no down path.
 *
 * Pure, so the rules can be tested without a git repository or a network. The
 * deploy script gathers the facts and this decides.
 */

/**
 * @param {object} facts
 * @param {string|null} facts.branch       `git rev-parse --abbrev-ref HEAD`, null outside git
 * @param {string} facts.deployBranch      the branch production comes from
 * @param {string|null} facts.porcelain    `git status --porcelain`, null if it could not run
 * @param {string|null} facts.head         HEAD's sha
 * @param {string|null} facts.upstream     origin/<deployBranch>'s sha after a fetch, null if unknown
 * @param {{ state: "success"|"failure"|"pending"|"none"|"unknown", detail?: string }|null} facts.ci
 *        the CI workflow's verdict on HEAD, null when the check was skipped
 * @returns {string[]} why this cannot go to production; empty when it can
 */
export function deployRefusals({ branch, deployBranch, porcelain, head, upstream, ci }) {
  const refusals = [];

  if (branch === null) {
    refusals.push("This is not a git checkout, so there is no way to tell what would go up.");
    return refusals;
  }

  if (branch !== deployBranch) {
    refusals.push(`This is branch "${branch}", not "${deployBranch}".`);
  }

  if (porcelain === null) {
    refusals.push("git status could not be read, so there is no way to tell whether the tree is clean.");
  } else if (porcelain.trim() !== "") {
    const files = porcelain.split(/\r?\n/).filter((line) => line.trim() !== "");
    refusals.push(
      [
        `The working tree has ${files.length} uncommitted change${files.length === 1 ? "" : "s"}, which would go up with it:`,
        ...files.slice(0, 10).map((line) => `    ${line}`),
        ...(files.length > 10 ? [`    and ${files.length - 10} more`] : []),
      ].join("\n"),
    );
  }

  if (!head || !upstream) {
    refusals.push(`Could not compare HEAD with origin/${deployBranch}; the fetch may have failed.`);
  } else if (head !== upstream) {
    refusals.push(
      `HEAD is ${head.slice(0, 7)} and origin/${deployBranch} is ${upstream.slice(0, 7)}. ` +
        "Production goes up from exactly what is on the remote: pull, or push and let CI run.",
    );
  }

  if (ci) {
    const at = head ? head.slice(0, 7) : "HEAD";
    const detail = ci.detail ? ` ${ci.detail}` : "";
    if (ci.state === "failure") refusals.push(`CI failed on ${at}.${detail}`);
    if (ci.state === "pending") refusals.push(`CI has not finished on ${at}. Wait for it.${detail}`);
    if (ci.state === "none") refusals.push(`CI has never run on ${at}.${detail}`);
    if (ci.state === "unknown") refusals.push(`Could not ask GitHub what CI made of ${at}.${detail}`);
  }

  return refusals;
}

/**
 * The CI workflow's verdict on one commit, from `gh run list --json`.
 *
 * Any successful run counts: a commit can be run twice (a re-run after a flaky
 * step), and one green run of the same sha is the same code passing.
 */
export function ciVerdict(runs) {
  if (!Array.isArray(runs) || runs.length === 0) return { state: "none" };
  if (runs.some((run) => run.conclusion === "success")) return { state: "success" };
  const live = runs.find((run) => run.status !== "completed");
  if (live) return { state: "pending", detail: live.url };
  return { state: "failure", detail: runs[0].url };
}
