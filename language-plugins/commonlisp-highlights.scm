; Copyright (C) 2026 AnalyseDeCircuit
; SPDX-License-Identifier: GPL-3.0-only
(comment) @comment
(str_lit) @string
(num_lit) @number
(sym_lit) @variable
(defun_keyword) @keyword
((sym_lit) @keyword
  (#match? @keyword "^(defun|defmacro|lambda|let|let\\*|if|cond|loop|return)$"))
