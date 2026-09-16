import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { filterOptions, type SelectOption } from './selectSearch';
import './searchableSelect.css';

type Props = {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
};

/** Search is local UI state; only an explicit selection changes the controlled value. */
export function SearchableSelect({ label, value, options, onChange, disabled = false }: Props) {
  const id = useId(), input = useRef<HTMLInputElement>(null), popup = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const [open, setOpen] = useState(false), [query, setQuery] = useState<string | null>(null);
  const [activeValue, setActiveValue] = useState<string | null>(null);
  const [position, setPosition] = useState<CSSProperties>({});
  const selected = options.find(option => option.value === value);
  const filtered = useMemo(() => filterOptions(options, query ?? ''), [options, query]);
  const activeIndex = Math.max(0, filtered.findIndex(option => option.value === activeValue));
  const active = filtered[activeIndex];
  const blocked = () => disabled || !!input.current?.matches(':disabled');
  function close() { setOpen(false); setQuery(null); composing.current = false; }
  function show() {
    if (blocked()) return;
    setQuery(null); setActiveValue(value); setOpen(true); input.current?.select();
  }
  function choose(option: SelectOption) {
    if (blocked()) return close();
    close();
    if (option.value !== value) onChange(option.value);
  }
  useEffect(() => { close(); }, [value, disabled]);
  // Select after rendering the committed label, including after Escape/rejected changes.
  useLayoutEffect(() => {
    if (!open && document.activeElement === input.current) input.current?.select();
  }, [open, value]);
  // A disabled ancestor fieldset must also disable the portalled options.
  useLayoutEffect(() => { if (open && blocked()) close(); });
  useLayoutEffect(() => {
    if (!open || !input.current) return;
    const field = input.current;
    function place() {
      const rect = field.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) return close();
      const below = Math.max(0, window.innerHeight - rect.bottom - 8), above = Math.max(0, rect.top - 8);
      const up = below < 220 && above > below;
      const width = Math.min(Math.max(rect.width, 180), window.innerWidth - 16);
      setPosition({ width, left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        ...(up ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
        maxHeight: Math.min(260, up ? above : below) });
    }
    function scroll(event: Event) { if (!popup.current?.contains(event.target as Node)) place(); }
    function outside(event: PointerEvent) {
      if (!field.parentElement?.contains(event.target as Node) && !popup.current?.contains(event.target as Node)) close();
    }
    const resize = new ResizeObserver(place); resize.observe(field);
    place();
    window.addEventListener('resize', place); window.addEventListener('scroll', scroll, true);
    window.addEventListener('blur', close); document.addEventListener('pointerdown', outside);
    return () => {
      resize.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('blur', close); document.removeEventListener('pointerdown', outside);
    };
  }, [open]);
  useEffect(() => {
    if (open) popup.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, active?.value, query]);

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (composing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (event.key === 'Tab') return close();
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); input.current?.select(); return; }
    if (event.key === 'Enter') {
      event.preventDefault(); event.stopPropagation();
      if (!open) show(); else if (active) choose(active);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); event.stopPropagation();
      if (!open) return show();
      const next = Math.max(0, Math.min(filtered.length - 1, activeIndex + (event.key === 'ArrowDown' ? 1 : -1)));
      setActiveValue(filtered[next]?.value ?? null);
    }
  }
  return <span className="search-select">
    <input ref={input} type="text" role="combobox" aria-label={label} aria-expanded={open}
      aria-autocomplete="list" aria-controls={open ? id : undefined} aria-haspopup="listbox"
      aria-activedescendant={open && active ? `${id}-${activeIndex}` : undefined}
      autoComplete="off" spellCheck={false} disabled={disabled} title={selected?.label}
      placeholder={open ? '输入文字 / 拼音 / 首字母' : '请选择…'} value={open && query !== null ? query : selected?.label || ''}
      onFocus={show} onClick={() => { if (!open) show(); else if (query === null) input.current?.select(); }} onBlur={close} onKeyDown={keyDown}
      onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
      onChange={event => { setQuery(event.target.value); setActiveValue(null); setOpen(true); }} />
    <span className="search-select-caret" aria-hidden="true">▾</span>
    {open && !disabled && createPortal(<div ref={popup} id={id} role="listbox" aria-label={`${label}候选项`}
      className="search-select-popup" style={position} onMouseDown={event => event.preventDefault()}>
      {filtered.length ? filtered.map((option, index) => <div key={option.value} id={`${id}-${index}`} role="option"
        aria-selected={option.value === value} data-value={option.value} data-active={index === activeIndex}
        className="search-select-option" onMouseMove={() => setActiveValue(option.value)} onClick={() => choose(option)}>
        <span>{option.label}</span>{option.value === value && <span aria-hidden="true">✓</span>}
      </div>) : <div className="search-select-empty">无匹配选项</div>}
    </div>, document.body)}
  </span>;
}
