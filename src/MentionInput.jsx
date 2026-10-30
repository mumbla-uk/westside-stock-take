import React, { useState, useEffect, useRef, useMemo } from 'react';
import { User, Users } from 'lucide-react';
import { supabase, DEFAULT_VENUE_ID } from './lib/db';

const SHIFT_GROUPS = [
  { id: 'grp-openers', name: 'Openers', role: 'Morning Shift', isGroup: true },
  { id: 'grp-closers', name: 'Closers', role: 'Night Shift', isGroup: true }
];

export default function MentionInput({
  as: Component = 'input',
  value = '',
  onChange,
  placeholder,
  className = '',
  rows = 3,
  disabled = false,
  required = false
}) {
  const [staffList, setStaffList] = useState(() => {
    try {
      const cached = localStorage.getItem('wst_staff_directory');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [mentionQuery, setMentionQuery] = useState(null);
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef(null);
  const popupRef = useRef(null);

  // Fetch real staff accounts from the login database
  useEffect(() => {
    async function loadStaffDirectory() {
      try {
        // Query the staff table used by the venue login RPC
        let { data, error } = await supabase
          .from('staff')
          .select('id, name, role')
          .eq('venue_id', DEFAULT_VENUE_ID);

        // Fallback to venue_staff or profiles if table uses alternate naming
        if (error || !data || data.length === 0) {
          const res = await supabase
            .from('venue_staff')
            .select('id, name, role')
            .eq('venue_id', DEFAULT_VENUE_ID);
          if (!res.error && res.data && res.data.length > 0) {
            data = res.data;
            error = null;
          }
        }

        if (error || !data || data.length === 0) {
          const res = await supabase
            .from('profiles')
            .select('id, name, full_name, role');
          if (!res.error && res.data && res.data.length > 0) {
            data = res.data.map(p => ({
              id: p.id,
              name: p.full_name || p.name,
              role: p.role
            }));
            error = null;
          }
        }

        if (data && data.length > 0) {
          const formatted = data
            .filter(s => Boolean(s.name && s.name.trim()))
            .map(s => ({
              id: String(s.id || s.name),
              name: s.name.trim(),
              role: s.role || 'Team Member',
              isGroup: false
            }));

          // Deduplicate by name
          const unique = Array.from(
            new Map(formatted.map(item => [item.name.toLowerCase(), item])).values()
          );

          setStaffList(unique);
          localStorage.setItem('wst_staff_directory', JSON.stringify(unique));
        }
      } catch (err) {
        console.warn("Could not load staff directory for mentions:", err);
      }
    }

    loadStaffDirectory();
  }, []);

  // Filter matching staff & shift groups based on what is typed after @
  const matchingOptions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();

    const matchedStaff = staffList.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.role && s.role.toLowerCase().includes(q))
    );

    const matchedGroups = SHIFT_GROUPS.filter(g =>
      g.name.toLowerCase().includes(q)
    );

    return [...matchedStaff, ...matchedGroups].slice(0, 7);
  }, [mentionQuery, staffList]);

  const detectMention = (text, cursorPosition) => {
    const textBeforeCursor = text.slice(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      const charBeforeAt = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : ' ';
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);

      // Verify @ is preceded by whitespace or newline, and contains no spaces
      if ((charBeforeAt === ' ' || charBeforeAt === '\n') && !textAfterAt.includes(' ')) {
        setMentionQuery(textAfterAt);
        setMentionStartIndex(lastAtIndex);
        setSelectedIndex(0);
        return;
      }
    }

    setMentionQuery(null);
    setMentionStartIndex(-1);
  };

  const handleInputChange = (e) => {
    const nextVal = e.target.value;
    onChange(nextVal);
    detectMention(nextVal, e.target.selectionStart);
  };

  const insertMention = (name) => {
    if (mentionStartIndex === -1 || !inputRef.current) return;

    const before = value.slice(0, mentionStartIndex);
    const after = value.slice(inputRef.current.selectionStart || value.length);
    const updated = `${before}@${name} ${after}`;

    onChange(updated);
    setMentionQuery(null);
    setMentionStartIndex(-1);

    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const nextCursor = before.length + name.length + 2;
        inputRef.current.setSelectionRange(nextCursor, nextCursor);
      }
    }, 10);
  };

  const handleKeyDown = (e) => {
    if (mentionQuery !== null && matchingOptions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % matchingOptions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + matchingOptions.length) % matchingOptions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(matchingOptions[selectedIndex].name);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }
  };

  return (
    <div className="relative w-full">
      {Component === 'textarea' ? (
        <textarea
          ref={inputRef}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={className}
          rows={rows}
          disabled={disabled}
          required={required}
        />
      ) : (
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={className}
          disabled={disabled}
          required={required}
        />
      )}

      {/* Dynamic Mention Popup */}
      {mentionQuery !== null && matchingOptions.length > 0 && (
        <div
          ref={popupRef}
          className="absolute z-50 left-0 bottom-full mb-1.5 w-64 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden divide-y divide-gray-100 animate-in fade-in zoom-in-95 duration-100 select-none"
        >
          <div className="px-3 py-1.5 bg-gray-50 flex items-center justify-between border-b border-gray-100">
            <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-gray-500">
              Staff Directory
            </span>
            <span className="text-[9px] font-mono text-gray-400">
              {matchingOptions.length} found
            </span>
          </div>

          <div className="max-h-48 overflow-y-auto">
            {matchingOptions.map((item, idx) => {
              const isSelected = selectedIndex === idx;

              return (
                <button
                  key={item.id || item.name}
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    insertMention(item.name);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition ${
                    isSelected ? 'bg-neutral-100 font-bold text-black' : 'hover:bg-gray-50 text-gray-800'
                  }`}
                >
                  <div className="flex items-center space-x-2 min-w-0 pr-2">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                      item.isGroup ? 'bg-purple-100 text-purple-700' : 'bg-neutral-900 text-white'
                    }`}>
                      {item.isGroup ? (
                        <Users className="w-3 h-3" />
                      ) : (
                        <span>{item.name.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <span className="truncate">@{item.name}</span>
                  </div>

                  <span className="text-[9px] font-mono text-gray-400 truncate flex-shrink-0">
                    {item.role}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}