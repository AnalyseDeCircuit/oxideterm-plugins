; Copyright (C) 2026 AnalyseDeCircuit
; SPDX-License-Identifier: Apache-2.0
; The published grammar crate has no highlight query; use its stable node names.
(comment) @comment
(identifier) @variable
(block (identifier) @keyword)
(attribute (identifier) @property)
(get_attr (identifier) @property)
(function_call (identifier) @function)
(string_lit) @string
(template_literal) @string
(numeric_lit) @number
(bool_lit) @constant
(null_lit) @constant
["for" "in" "if" "else" "endif" "endfor"] @keyword
["=" "=>" "+" "-" "*" "/" "%" "==" "!=" "<" ">" "<=" ">=" "&&" "||" "!" "?" ":"] @operator
[(block_start) (block_end) (object_start) (object_end) (tuple_start) (tuple_end) "(" ")"] @punctuation.bracket
[(template_interpolation_start) (template_interpolation_end)] @punctuation.special
["," "."] @punctuation.delimiter
