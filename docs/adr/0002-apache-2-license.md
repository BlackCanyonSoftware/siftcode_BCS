# ADR 0002: License the project under Apache-2.0

- Status: accepted (owner decision, 2026-10-31)
- Date: 2026-10-31

## Context

The GitHub repository was created with an MIT `LICENSE`. SiftCode is open-source tooling that reads other people's source code, so adopters need clear terms, including patent terms.

## Options considered

1. **MIT.** Shortest and most permissive; no explicit patent grant.
2. **Apache-2.0.** Permissive, with an explicit patent grant and patent-retaliation clause, and an explicit contribution license. Requires preserving the `NOTICE` file.
3. **Source-available (e.g., BSL).** Restricts use; not open source; discourages adoption of a trust-sensitive tool.

## Decision

Apache-2.0. `LICENSE` holds the unmodified standard text; `NOTICE` carries the copyright line. `package.json` declares `"license": "Apache-2.0"` (added in Milestone 0). Source files do not need per-file headers.

## Consequences

- Stronger protection for adopters and contributors than MIT.
- Dependencies must be license-compatible (MIT, BSD, ISC, Apache-2.0 are fine; copyleft such as GPL/AGPL dependencies are not allowed in the shipped package). License checking is part of dependency review.
- The only prior history is the initial commit that added the MIT file, so no released version was ever published under MIT.
