import { useState, useRef, useEffect } from 'react';

/**
 * Props:
 *   nodes    — destination 타입 노드 배열 { id, name, ... }
 *   label    — placeholder 텍스트
 *   selected — 현재 선택된 노드 (외부 제어)
 *   onSelect — (node) => void
 *   onClear  — () => void
 */
export default function SearchBar({ nodes = [], label = '목적지 검색', selected, onSelect, onClear }) {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen]       = useState(false);
  const wrapperRef            = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // 외부에서 선택 초기화 시 입력값도 리셋
  useEffect(() => {
    if (!selected) setQuery('');
  }, [selected]);

  const handleInput = (value) => {
    setQuery(value);
    const matches = value.trim()
      ? nodes.filter(n => n.name.toLowerCase().includes(value.toLowerCase()))
      : nodes;
    setResults(matches);
    setOpen(matches.length > 0);
  };

  const handleSelect = (node) => {
    setQuery(node.name);
    setOpen(false);
    onSelect(node);
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setOpen(false);
    onClear?.();
  };

  return (
    <div className="search-wrapper" ref={wrapperRef}>
      <svg className="search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="7" cy="7" r="4.5" />
        <line x1="10.5" y1="10.5" x2="14" y2="14" />
      </svg>
      <input
        className="search-input"
        type="text"
        placeholder={selected ? selected.name : label}
        value={query}
        onChange={e => handleInput(e.target.value)}
        onFocus={() => {
          if (selected) return;
          const matches = query.trim()
            ? nodes.filter(n => n.name.toLowerCase().includes(query.toLowerCase()))
            : nodes;
          setResults(matches);
          setOpen(matches.length > 0);
        }}
        readOnly={!!selected}
      />
      {(selected || query) && (
        <button
          onClick={handleClear}
          style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 14, padding: 2 }}
        >
          ✕
        </button>
      )}
      {open && (
        <div className="search-results">
          {results.map(node => (
            <div key={node.id} className="search-result-item" onClick={() => handleSelect(node)}>
              <span>{node.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
