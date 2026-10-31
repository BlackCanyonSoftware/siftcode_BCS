export const USAGE = `Usage:
  siftcode scan <path> [options]
  siftcode explain <rule-id>

Commands:
  scan      Scan a folder or file and report findings with suggestions
  explain   Show why a rule exists, the standards behind it, and how to fix what it finds

Scan options:
  -f, --format <name>     Report format: text (default), json, markdown, or sarif
  -o, --output <file>     Write the report to a file instead of printing it
  -c, --config <file>     Config file (default: siftcode.config.json in the scanned folder)
      --fail-on <level>   Exit with code 1 if a finding is at least this severe:
                          error, warning, info, or note

General options:
  -h, --help              Show this help
  -v, --version           Show the version

Exit codes: 0 success, 1 findings at or above --fail-on, 2 usage or configuration error.
`;
