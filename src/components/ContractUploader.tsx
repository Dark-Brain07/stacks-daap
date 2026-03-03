'use client';

import React, { useState, useCallback, useRef } from 'react';
import { validateContract, findDuplicateNames } from '@/lib/clarity-validator';
import { MAX_CONTRACTS } from '@/lib/constants';

export interface ContractItem {
    name: string;
    code: string;
    valid: boolean;
    errors: string[];
}

interface Props {
    contracts: ContractItem[];
    onContractsChange: (contracts: ContractItem[]) => void;
}

const EXAMPLE_TEMPLATE = `(define-data-var counter uint u0)

(define-public (increment)
  (begin
    (var-set counter (+ (var-get counter) u1))
    (ok (var-get counter))
  )
)

(define-read-only (get-counter)
  (ok (var-get counter))
)`;

// Word bank — meaningful short nouns, crypto terms, nature, objects
const WORD_BANK = [
    'pool', 'vault', 'forge', 'bloom', 'cedar', 'orbit', 'pulse', 'nexus', 'prism', 'ember',
    'delta', 'sigma', 'alpha', 'omega', 'theta', 'gamma', 'swift', 'pixel', 'spark', 'haven',
    'ridge', 'stone', 'creek', 'brook', 'river', 'ocean', 'coral', 'pearl', 'amber', 'ivory',
    'onyx', 'opal', 'jade', 'ruby', 'topaz', 'titan', 'atlas', 'comet', 'solar', 'lunar',
    'storm', 'frost', 'flame', 'blaze', 'flare', 'glow', 'shine', 'gleam', 'glint', 'sheen',
    'tower', 'bridge', 'gate', 'arch', 'dome', 'spire', 'keep', 'fort', 'crest', 'crown',
    'blade', 'staff', 'wand', 'helm', 'rune', 'sigil', 'glyph', 'token', 'badge', 'medal',
    'oak', 'pine', 'birch', 'elm', 'ash', 'sage', 'mint', 'herb', 'fern', 'moss',
    'wolf', 'hawk', 'bear', 'lion', 'stag', 'eagle', 'raven', 'crane', 'falcon', 'tiger',
    'lake', 'peak', 'vale', 'glen', 'mesa', 'dune', 'cliff', 'cave', 'reef', 'isle',
    'link', 'node', 'core', 'mesh', 'grid', 'flux', 'wave', 'beam', 'ray', 'arc',
    'bond', 'pact', 'oath', 'vow', 'deal', 'trade', 'swap', 'lend', 'yield', 'stake',
    'defi', 'dao', 'nft', 'dex', 'amm', 'ledger', 'block', 'chain', 'hash', 'miner',
    'coin', 'cash', 'fund', 'bank', 'safe', 'lock', 'key', 'seed', 'root', 'stem',
    'wind', 'rain', 'snow', 'hail', 'mist', 'fog', 'dew', 'ice', 'sun', 'moon',
    'star', 'sky', 'dawn', 'dusk', 'noon', 'eve', 'gale', 'bolt', 'zap', 'boom',
    'echo', 'aria', 'hymn', 'tune', 'beat', 'drum', 'bell', 'harp', 'lute', 'horn',
    'port', 'dock', 'pier', 'quay', 'wharf', 'hull', 'mast', 'sail', 'keel', 'bow',
    'lamp', 'lens', 'bulb', 'cord', 'wire', 'plug', 'chip', 'disk', 'tape', 'gear',
    'hand', 'fist', 'palm', 'grip', 'hold', 'lift', 'push', 'pull', 'spin', 'turn',
    'gold', 'iron', 'zinc', 'lead', 'tin', 'alloy', 'steel', 'brass', 'bronze', 'chrome',
    'nest', 'hive', 'den', 'lair', 'burrow', 'grove', 'orchard', 'garden', 'field', 'ranch',
    'code', 'data', 'file', 'byte', 'bit', 'loop', 'call', 'task', 'sync', 'ping',
    'club', 'guild', 'band', 'crew', 'team', 'tribe', 'clan', 'pack', 'fleet', 'squad',
    'cape', 'veil', 'robe', 'wrap', 'hood', 'belt', 'sash', 'knot', 'braid', 'weave',
    'plum', 'grape', 'peach', 'berry', 'melon', 'mango', 'lemon', 'olive', 'basil', 'clove',
    'desk', 'shelf', 'bench', 'stool', 'chair', 'table', 'frame', 'panel', 'board', 'tile',
    'map', 'path', 'road', 'trail', 'route', 'track', 'bridge', 'tunnel', 'gate', 'arch',
    'cup', 'bowl', 'pot', 'pan', 'jar', 'jug', 'flask', 'vase', 'urn', 'mug',
    'fox', 'owl', 'bee', 'ant', 'elk', 'ram', 'eel', 'cod', 'ray', 'yak',
    'hub', 'lab', 'den', 'pod', 'bay', 'cove', 'nook', 'slot', 'cell', 'zone',
    'myth', 'lore', 'tale', 'saga', 'epic', 'fable', 'quest', 'raid', 'hunt', 'duel',
    'gem', 'rock', 'sand', 'clay', 'soil', 'peat', 'slate', 'chalk', 'quartz', 'flint',
    'web', 'net', 'trap', 'snare', 'latch', 'clasp', 'hinge', 'lever', 'valve', 'pump',
    'ink', 'dye', 'paint', 'stain', 'glaze', 'lacquer', 'resin', 'wax', 'tar', 'pitch',
    'bud', 'leaf', 'petal', 'thorn', 'bark', 'vine', 'reed', 'kelp', 'palm', 'lotus',
    'drift', 'surge', 'swell', 'crest', 'tide', 'eddy', 'swirl', 'ripple', 'plunge', 'float',
    'shard', 'splint', 'wedge', 'prong', 'spike', 'barb', 'point', 'edge', 'ridge', 'notch',
    'vigor', 'grace', 'valor', 'pride', 'honor', 'glory', 'bliss', 'peace', 'hope', 'joy',
    'craft', 'skill', 'knack', 'flair', 'talent', 'gift', 'trick', 'feat', 'deed', 'act',
    'audit', 'proof', 'claim', 'grant', 'vote', 'poll', 'bid', 'wager', 'bet', 'ante',
    'zinc', 'neon', 'argon', 'xenon', 'radon', 'boron', 'carbon', 'cobalt', 'nickel', 'copper',
    'frost', 'thaw', 'chill', 'warm', 'heat', 'cool', 'brisk', 'crisp', 'fresh', 'pure',
    'swift', 'fleet', 'rapid', 'brisk', 'hasty', 'keen', 'sharp', 'bold', 'brave', 'firm',
];

function pickUniqueNames(count: number, existing: Set<string>): string[] {
    // Shuffle and pick from word bank first
    const available = WORD_BANK.filter((w) => !existing.has(w));
    const shuffled = [...available].sort(() => Math.random() - 0.5);
    const names: string[] = [];
    const used = new Set(existing);

    for (const word of shuffled) {
        if (names.length >= count) break;
        if (!used.has(word)) {
            names.push(word);
            used.add(word);
        }
    }

    // If we need more than the word bank, combine two words
    if (names.length < count) {
        const combos = WORD_BANK.sort(() => Math.random() - 0.5);
        for (let i = 0; i < combos.length && names.length < count; i++) {
            for (let j = 0; j < combos.length && names.length < count; j++) {
                if (i === j) continue;
                const combo = `${combos[i]}-${combos[j]}`;
                if (!used.has(combo)) {
                    names.push(combo);
                    used.add(combo);
                }
            }
        }
    }

    return names;
}

export default function ContractUploader({ contracts, onContractsChange }: Props) {
    const [mode, setMode] = useState<'upload' | 'generate'>('upload');
    const [manualName, setManualName] = useState('');
    const [manualCode, setManualCode] = useState('');
    const [genCount, setGenCount] = useState(10);
    const [genTemplate, setGenTemplate] = useState(EXAMPLE_TEMPLATE);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ---------- Add single contract ----------
    const addContract = useCallback(() => {
        if (!manualName.trim() || !manualCode.trim()) return;

        const result = validateContract(manualName.trim(), manualCode.trim());
        const item: ContractItem = {
            name: manualName.trim(),
            code: manualCode.trim(),
            valid: result.valid,
            errors: result.errors,
        };

        const updated = [...contracts, item];
        onContractsChange(updated);
        setManualName('');
        setManualCode('');
    }, [manualName, manualCode, contracts, onContractsChange]);

    // ---------- File upload ----------
    const handleFileUpload = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const files = e.target.files;
            if (!files) return;

            const newContracts: ContractItem[] = [];
            let processed = 0;

            Array.from(files).forEach((file) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const code = reader.result as string;
                    const name = file.name.replace(/\.clar$/, '').replace(/[^a-zA-Z0-9_-]/g, '-');
                    const result = validateContract(name, code);

                    newContracts.push({
                        name,
                        code,
                        valid: result.valid,
                        errors: result.errors,
                    });

                    processed++;
                    if (processed === files.length) {
                        onContractsChange([...contracts, ...newContracts]);
                    }
                };
                reader.readAsText(file);
            });

            // Reset input
            if (fileInputRef.current) fileInputRef.current.value = '';
        },
        [contracts, onContractsChange]
    );

    // ---------- Bulk generate ----------
    const handleGenerate = useCallback(() => {
        if (!genTemplate.trim() || genCount < 1) return;
        if (contracts.length + genCount > MAX_CONTRACTS) {
            alert(`Total contracts cannot exceed ${MAX_CONTRACTS.toLocaleString()}`);
            return;
        }

        const existingNames = new Set(contracts.map((c) => c.name.toLowerCase()));
        const names = pickUniqueNames(genCount, existingNames);
        const generated: ContractItem[] = names.map((name) => {
            const code = `${genTemplate.trim()}\n\n;; Contract: ${name}\n(define-constant CONTRACT_ID "${name}")`;
            const result = validateContract(name, code);
            return { name, code, valid: result.valid, errors: result.errors };
        });

        onContractsChange([...contracts, ...generated]);
    }, [genCount, genTemplate, contracts, onContractsChange]);

    // ---------- Remove ----------
    const removeContract = useCallback(
        (index: number) => {
            const updated = contracts.filter((_, i) => i !== index);
            onContractsChange(updated);
        },
        [contracts, onContractsChange]
    );

    const clearAll = useCallback(() => {
        onContractsChange([]);
    }, [onContractsChange]);

    // ---------- Duplicates ----------
    const duplicates = findDuplicateNames(contracts.map((c) => c.name));
    const validCount = contracts.filter((c) => c.valid).length;
    const invalidCount = contracts.length - validCount;

    return (
        <div className="card">
            <div className="card-header">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="12" y1="18" x2="12" y2="12" />
                    <line x1="9" y1="15" x2="15" y2="15" />
                </svg>
                <h3>Contracts</h3>
                <span className="badge">{contracts.length.toLocaleString()}</span>
            </div>

            {/* Mode tabs */}
            <div className="tabs">
                <button
                    className={`tab ${mode === 'upload' ? 'tab-active' : ''}`}
                    onClick={() => setMode('upload')}
                >
                    Upload / Manual
                </button>
                <button
                    className={`tab ${mode === 'generate' ? 'tab-active' : ''}`}
                    onClick={() => setMode('generate')}
                >
                    Bulk Generate
                </button>
            </div>

            {mode === 'upload' && (
                <div className="upload-section">
                    {/* File upload */}
                    <div className="upload-area" onClick={() => fileInputRef.current?.click()}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        <p>Click or drag <strong>.clar</strong> files here</p>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".clar,.txt"
                            multiple
                            onChange={handleFileUpload}
                            style={{ display: 'none' }}
                        />
                    </div>

                    <div className="divider">
                        <span>or add manually</span>
                    </div>

                    {/* Manual entry */}
                    <div className="manual-entry">
                        <input
                            className="input"
                            placeholder="Contract name (e.g. my-token)"
                            value={manualName}
                            onChange={(e) => setManualName(e.target.value)}
                        />
                        <textarea
                            className="input code-textarea"
                            placeholder="Paste Clarity code here..."
                            value={manualCode}
                            onChange={(e) => setManualCode(e.target.value)}
                            rows={6}
                        />
                        <button className="btn btn-secondary" onClick={addContract} disabled={!manualName.trim() || !manualCode.trim()}>
                            Add Contract
                        </button>
                    </div>
                </div>
            )}

            {mode === 'generate' && (
                <div className="generate-section">
                    <div className="generate-row">
                        <div className="input-group">
                            <label className="input-label">Count</label>
                            <input
                                className="input"
                                type="number"
                                min={1}
                                max={MAX_CONTRACTS}
                                value={genCount}
                                onChange={(e) => setGenCount(Math.min(MAX_CONTRACTS, parseInt(e.target.value) || 1))}
                            />
                        </div>
                    </div>

                    <div className="input-group">
                        <label className="input-label">Template (Clarity code)</label>
                        <textarea
                            className="input code-textarea"
                            value={genTemplate}
                            onChange={(e) => setGenTemplate(e.target.value)}
                            rows={10}
                        />
                    </div>

                    <p className="text-muted">
                        Will generate <strong>{genCount.toLocaleString()}</strong> contracts with unique meaningful names (e.g. <strong>vault</strong>, <strong>forge</strong>, <strong>ember</strong>)
                    </p>

                    <button className="btn btn-secondary" onClick={handleGenerate}>
                        Generate {genCount.toLocaleString()} Contracts
                    </button>
                </div>
            )}

            {/* Contract list summary */}
            {contracts.length > 0 && (
                <div className="contract-summary">
                    <div className="summary-stats">
                        <span className="stat stat-total">{contracts.length.toLocaleString()} total</span>
                        <span className="stat stat-valid">{validCount} valid</span>
                        {invalidCount > 0 && <span className="stat stat-invalid">{invalidCount} invalid</span>}
                        {duplicates.length > 0 && (
                            <span className="stat stat-warning">{duplicates.length} duplicate(s)</span>
                        )}
                    </div>

                    {duplicates.length > 0 && (
                        <div className="error-banner">
                            <strong>Duplicate names found:</strong> {duplicates.join(', ')}
                        </div>
                    )}

                    <div className="contract-list">
                        {contracts.slice(0, 100).map((c, i) => (
                            <div key={i} className={`contract-row ${c.valid ? '' : 'contract-row-invalid'}`}>
                                <div className="contract-info">
                                    <span className={`status-dot ${c.valid ? 'status-dot-success' : 'status-dot-error'}`} />
                                    <span className="contract-name">{c.name}</span>
                                    {c.errors.length > 0 && (
                                        <span className="contract-errors" title={c.errors.join('\n')}>
                                            {c.errors[0]}
                                        </span>
                                    )}
                                </div>
                                <button className="btn-icon" onClick={() => removeContract(i)} title="Remove">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <line x1="18" y1="6" x2="6" y2="18" />
                                        <line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                </button>
                            </div>
                        ))}
                        {contracts.length > 100 && (
                            <p className="text-muted" style={{ padding: '0.5rem' }}>
                                ...and {(contracts.length - 100).toLocaleString()} more contracts
                            </p>
                        )}
                    </div>

                    <button className="btn btn-ghost" onClick={clearAll} style={{ marginTop: '0.5rem' }}>
                        Clear All
                    </button>
                </div>
            )}
        </div>
    );
}
