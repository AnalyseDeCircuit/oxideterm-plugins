; Copyright (C) 2026 AnalyseDeCircuit
; SPDX-License-Identifier: Apache-2.0

(simple_identifier) @variable
[(line_comment) (block_comment)] @comment
(string_value) @string
[(int_value) (float_value) (length_value) (physical_length_value) (percent_value)] @number
(color_value) @constant
[(user_type_identifier) (builtin_type_identifier)] @type
(property name: (simple_identifier) @property)
(property_assignment property: (simple_identifier) @property)
(function_call name: (simple_identifier) @function)
(function_declaration name: (simple_identifier) @function)
(function_definition name: (simple_identifier) @function)
[(property_visibility) (function_visibility) (purity)] @keyword
["export" "component" "inherits" "import" "from" "as" "property" "callback"
 "function" "return" "if" "else" "for" "in" "struct" "enum" "global"] @keyword
["true" "false"] @constant.builtin
[":" ":=" "=" "<=>" "+" "-" "*" "/"] @operator
["(" ")" "{" "}" "[" "]" "," ";" "."] @punctuation.delimiter
