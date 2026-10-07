; Copyright (C) 2026 AnalyseDeCircuit
; SPDX-License-Identifier: Apache-2.0

["and" "as" "break" "catch" "def" "elif" "else" "end" "foreach"
 "if" "import" "include" "label" "module" "or" "reduce" "then" "try"] @keyword

(identifier) @function
(field_id) @property
(variable) @variable
(number) @number
(string) @string
(escape_sequence) @string.escape
(comment) @comment
[(true) (false) (null)] @constant.builtin
(format) @function.builtin

[(dot) (recurse)] @operator
[(binary_expression operator: _ @operator)
 (assignment_expression operator: _ @operator)
 (unary_expression operator: _ @operator)]
["|" "?" "//" "?//"] @operator
["(" ")" "[" "]" "{" "}"] @punctuation.bracket
["," ":" ";"] @punctuation.delimiter
