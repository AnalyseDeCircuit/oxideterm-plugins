; Copyright (C) 2026 AnalyseDeCircuit
; SPDX-License-Identifier: GPL-3.0-only
[
  "async"
  "await"
  "break"
  "case"
  "catch"
  "class"
  "const"
  "continue"
  "debugger"
  "default"
  "delete"
  "do"
  "else"
  "export"
  "extends"
  "finally"
  "for"
  "from"
  "function"
  "if"
  "import"
  "in"
  "instanceof"
  "let"
  "new"
  "of"
  "return"
  "switch"
  "throw"
  "try"
  "typeof"
  "var"
  "void"
  "while"
  "with"
  "yield"
] @keyword
(comment) @comment
(string) @string
(template_string) @string
(number) @number
(identifier) @variable
(property_identifier) @property
(function_declaration name: (identifier) @function)
(method_definition name: (property_identifier) @function)
(pair key: (property_identifier) @property)
