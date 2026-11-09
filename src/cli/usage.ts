export const USAGE = `Usage:
  siftcode scan <path> [options]
  siftcode baseline <path> [options]
  siftcode explain <rule-id>

Commands:
  scan      Scan a folder or file and report findings with suggestions
  baseline  Accept the current findings in a file, so later scans report only new ones
  explain   Show why a rule exists, the standards behind it, and how to fix what it finds

Scan options:
  -f, --format <name>     Report format: text (default), json, markdown, or sarif
  -o, --output <file>     Write the report to a file instead of printing it
  -c, --config <file>     Config file (default: siftcode.config.json in the scanned folder)
      --baseline <file>   Accept the findings listed in this baseline (see "siftcode baseline")
      --fail-on <level>   Exit with code 1 if a finding is at least this severe:
                          error, warning, info, or note

Baseline options:
  -o, --output <file>     Where to write the baseline (default: the "baseline" setting of the
                          config, else siftcode-baseline.json in the scanned folder)
  -c, --config <file>     Config file (default: siftcode.config.json in the scanned folder)

To accept one finding in the code instead, put a comment on or above its line:
  // siftcode-ignore SC-MET-001: legacy parser, see #42
  # siftcode-ignore SC-MET-001: legacy parser, see #42
(\`siftcode-ignore-file\` covers the whole file. The rule id and a reason are required.)

General options:
  -h, --help              Show this help
  -v, --version           Show the version

Exit codes: 0 success, 1 findings at or above --fail-on, 2 usage or configuration error.
`;

export const BASELINE_USAGE = `Usage: siftcode baseline <path> [options]

Scans <path> and writes every finding it reports into a baseline file. Scans that name the file
(with --baseline or the "baseline" setting in the config) accept those findings and report only
new ones. Run the command again to refresh the file after fixing findings.

Options:
  -o, --output <file>     Where to write the baseline (default: the "baseline" setting of the
                          config, else siftcode-baseline.json in the scanned folder)
  -c, --config <file>     Config file (default: siftcode.config.json in the scanned folder)
  -h, --help              Show this help
`;
