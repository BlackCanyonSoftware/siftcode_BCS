/** Where the CLI writes. Results go to stdout; diagnostics go to stderr so piping stays clean. */
export interface Output {
  stdout(text: string): void;
  stderr(text: string): void;
}

export const EXIT_OK = 0;
/** At least one finding is at or above the `--fail-on` severity. */
export const EXIT_FINDINGS = 1;
/** Bad arguments, a missing path, or an invalid config. */
export const EXIT_USAGE = 2;
