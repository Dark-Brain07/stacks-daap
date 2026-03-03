/**
 * Basic client-side Clarity syntax validation.
 * This checks structural correctness — not full compilation.
 */

import {
    CONTRACT_NAME_REGEX,
    MAX_CONTRACT_NAME_LENGTH,
    MAX_CONTRACT_BODY_LENGTH,
} from './constants';

export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

const CLARITY_KEYWORDS = [
    'define-public',
    'define-private',
    'define-read-only',
    'define-data-var',
    'define-map',
    'define-constant',
    'define-fungible-token',
    'define-non-fungible-token',
    'define-trait',
    'impl-trait',
    'use-trait',
    'begin',
    'let',
    'if',
    'match',
    'ok',
    'err',
    'some',
    'none',
    'true',
    'false',
    'tx-sender',
    'block-height',
    'stx-get-balance',
    'stx-transfer?',
    'print',
    'map-set',
    'map-get?',
    'map-delete',
    'var-set',
    'var-get',
    'unwrap!',
    'unwrap-panic',
    'try!',
    'asserts!',
    'is-eq',
    'not',
    'and',
    'or',
    'contract-call?',
];

/**
 * Validate a Clarity contract name.
 */
export function validateContractName(name: string): ValidationResult {
    const errors: string[] = [];

    if (!name || name.trim().length === 0) {
        errors.push('Contract name cannot be empty.');
    } else {
        if (name.length > MAX_CONTRACT_NAME_LENGTH) {
            errors.push(`Contract name exceeds ${MAX_CONTRACT_NAME_LENGTH} characters.`);
        }
        if (!CONTRACT_NAME_REGEX.test(name)) {
            errors.push(
                'Contract name must start with a letter and contain only letters, numbers, hyphens, or underscores.'
            );
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Validate Clarity contract source code (structural checks).
 */
export function validateClarityCode(code: string): ValidationResult {
    const errors: string[] = [];

    if (!code || code.trim().length === 0) {
        errors.push('Contract code cannot be empty.');
        return { valid: false, errors };
    }

    if (new Blob([code]).size > MAX_CONTRACT_BODY_LENGTH) {
        errors.push(`Contract body exceeds ${MAX_CONTRACT_BODY_LENGTH} bytes.`);
    }

    // Check balanced parentheses
    let depth = 0;
    for (let i = 0; i < code.length; i++) {
        if (code[i] === '(') depth++;
        if (code[i] === ')') depth--;
        if (depth < 0) {
            errors.push(`Unmatched closing parenthesis at position ${i}.`);
            break;
        }
    }
    if (depth > 0) {
        errors.push(`${depth} unclosed opening parenthesis(es).`);
    }

    // Check for at least one define- expression
    const hasDefinition = CLARITY_KEYWORDS.some(
        (kw) => kw.startsWith('define-') && code.includes(kw)
    );
    if (!hasDefinition) {
        errors.push(
            'Contract must contain at least one define- expression (define-public, define-data-var, etc.).'
        );
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Full validation of a contract (name + code).
 */
export function validateContract(
    name: string,
    code: string
): ValidationResult {
    const nameResult = validateContractName(name);
    const codeResult = validateClarityCode(code);
    return {
        valid: nameResult.valid && codeResult.valid,
        errors: [...nameResult.errors, ...codeResult.errors],
    };
}

/**
 * Check for duplicate contract names in a batch.
 */
export function findDuplicateNames(names: string[]): string[] {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const name of names) {
        const lower = name.toLowerCase();
        if (seen.has(lower)) {
            duplicates.push(name);
        }
        seen.add(lower);
    }
    return duplicates;
}
