; Copyright (C) 2026 AnalyseDeCircuit
; SPDX-License-Identifier: Apache-2.0

(identifier) @variable
[(line_comment) (block_comment)] @comment
[(string_literal) (multiline_string_literal) (character_literal)] @string
[(number_literal) (float_literal)] @number
(function_declaration name: (identifier) @function)
(call_expression (identifier) @function)
(user_type (identifier) @type)
(class_declaration name: (identifier) @type)
(annotation) @attribute
[(class_modifier) (function_modifier) (inheritance_modifier) (member_modifier)
 (parameter_modifier) (platform_modifier) (property_modifier) (visibility_modifier)] @keyword
["fun" "val" "var" "class" "interface" "object" "return" "if" "else"
 "when" "for" "while" "do" "try" "catch" "finally" "throw" "in" "is"
 "as" "package" "import" "typealias"] @keyword
((identifier) @keyword (#any-of? @keyword "break" "continue"))
((identifier) @constant.builtin (#any-of? @constant.builtin "true" "false" "null"))
["=" "+" "-" "*" "/" "%" "==" "!=" "&&" "||" "!" "?:"] @operator
["(" ")" "{" "}" "[" "]" "," "." ":" ";"] @punctuation.delimiter
