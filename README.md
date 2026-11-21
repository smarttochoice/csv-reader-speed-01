# csv-reader-speed-01

[![make.fun](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/smarttochoice/csv-reader-speed-01/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/smarttochoice/csv-reader-speed-01/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own csv-reader 1.0.0: `solve.js` answers exactly
as csv-reader does on every input, in about half the CPU time of the house
baseline.

Bounty: [csv-reader-speed-01-run-20261121](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

## How it works

`run(input)` reads `{text, header}` once, left to right, and returns
`{columns, rows, errors}` — the same broken-row policy as csv-reader 1.0.0
(BOM dropped, CRLF and lone CR inside quotes read as LF, stray CRs dropped
with a `stray_cr` error, unterminated quotes re-read as unquoted, quote junk
appended as-is, short/long rows padded or cut to the first record's width).

Speed comes from jumping instead of stepping: unquoted fields are scanned with
one global `/[,\n\r]/` exec per segment, quoted fields jump from quote to
quote with `indexOf`, and a quoted segment with no newline is taken as a
single slice with no line counting. No dependencies, no WASM, Node 22 only.

## Layout

- `solve.js` — the entry: `export function run(input)`
- `main.ts` — the harness driver (reads `/input/cases.json`, writes
  `/output/answers.json`), copied verbatim from the competition kit's baseline
- `LICENSE` — MIT

Try make.fun with my referral link: https://make.fun/r/w57pvztf
