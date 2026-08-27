#!/usr/bin/env bash
# Lists the modules in src/lib that no test imports.
# Run it with: pnpm test:gaps
#
# Written down because deriving it by hand kept going wrong in the same three ways:
#   - matching on a same-named test file, which misses missing-clockin.ts (covered by
#     missing-reminders.db-test.ts) and reports it as untested
#   - a [a-z0-9-] character class, which silently skips rateLimit.ts
#   - requiring a static `from '...'`, which misses `await import('./auth')`
# Each of those overstated the gap and sent someone writing tests that already existed.
#
# What it cannot see: a module exercised through another one rather than imported directly.
# lib/slack.ts is the standing example — it runs for real underneath the room-booking tests,
# on top of the fake WebClient in src/test/slack.ts. Hence the exclusions below.
#
# Kept to POSIX-ish bash: macOS still ships 3.2, which has no associative arrays or mapfile.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Why each module is not expected to have a test of its own.
excuse_for() {
  case "$1" in
    api-types) echo "types only" ;;
    cn) echo "one-line class merge" ;;
    prisma) echo "client singleton" ;;
    slack) echo "runs for real under the room-booking tests, via src/test/slack.ts" ;;
    *) echo "" ;;
  esac
}

TEST_FILES="$(find src \( -name '*.test.ts' -o -name '*.test.tsx' -o -name '*.db-test.ts' \))"
if [ -z "$TEST_FILES" ]; then
  echo "ERROR: no test files found. Is this being run from the repository root?" >&2
  exit 1
fi

# Both import forms, and module names as they are actually written — capitals included.
IMPORTED="$(echo "$TEST_FILES" | tr '\n' '\0' | xargs -0 grep -hoE "(from|import\()[[:space:]]*'(\./|@/lib/)[A-Za-z0-9._-]+'" \
  | sed -E "s#.*'(\./|@/lib/)##; s#'##" | sort -u)"

gaps=0
for path in src/lib/*.ts; do
  module="$(basename "$path" .ts)"
  case "$module" in *.test | *.db-test) continue ;; esac
  if echo "$IMPORTED" | grep -qx -- "$module"; then
    continue
  fi
  excuse="$(excuse_for "$module")"
  if [ -n "$excuse" ]; then
    printf '  skipped  %-24s (%s)\n' "$module" "$excuse"
    continue
  fi
  printf '  UNTESTED %-24s %s lines\n' "$module" "$(wc -l <"$path" | tr -d ' ')"
  gaps=$((gaps + 1))
done

echo
if [ "$gaps" -eq 0 ]; then
  echo "No gaps: every module in src/lib is imported by a test, or excused above."
else
  echo "$gaps module(s) in src/lib have no test importing them."
  exit 1
fi
