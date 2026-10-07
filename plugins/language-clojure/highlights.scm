; Copyright (C) 2026 AnalyseDeCircuit
; SPDX-License-Identifier: Apache-2.0

((sym_lit) @keyword
 (#any-of? @keyword "ns" "in-ns" "def" "defonce" "defn" "defn-" "defmacro"
  "fn" "fn*" "let" "let*" "letfn" "loop" "loop*" "recur" "if" "if-let"
  "if-some" "when" "when-let" "when-some" "do" "doseq" "for" "cond"
  "case" "try" "catch" "finally" "throw" "new" "set!" "quote" "var"
  "deftype" "defrecord" "defprotocol" "extend-type" "extend-protocol"))

((list_lit . (sym_lit) @_head . (sym_lit) @function)
 (#any-of? @_head "defn" "defn-" "defmacro"))
((list_lit . (sym_lit) @_head . (sym_lit) @namespace)
 (#any-of? @_head "ns" "in-ns"))
((list_lit . (sym_lit) @function)
 (#not-any-of? @function "ns" "in-ns" "def" "defonce" "defn" "defn-" "defmacro"
  "fn" "fn*" "let" "let*" "letfn" "loop" "loop*" "recur" "if" "if-let"
  "if-some" "when" "when-let" "when-some" "do" "doseq" "for" "cond"
  "case" "try" "catch" "finally" "throw" "new" "set!" "quote" "var"
  "deftype" "defrecord" "defprotocol" "extend-type" "extend-protocol"))

(sym_lit) @variable
(num_lit) @number
[(char_lit) (str_lit) (regex_lit)] @string
[(bool_lit) (nil_lit) (kwd_lit)] @constant.builtin
[(comment) (dis_expr)] @comment
["(" ")" "[" "]" "{" "}"] @punctuation.bracket
["'" "`" "~" "@" "~@" "#_" "#'" "#?" "#?@"] @operator
