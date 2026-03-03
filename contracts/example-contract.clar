;; Minimal Clarity Contract
(define-data-var v uint u0)
(define-public (s (x uint)) (begin (var-set v x) (ok x)))
(define-read-only (g) (ok (var-get v)))
