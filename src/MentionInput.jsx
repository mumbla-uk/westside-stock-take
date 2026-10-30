import React, { useState, useEffect, useRef } from 'react';
import { User, Users } from 'lucide-react';
import { supabase, DEFAULT_VENUE_ID } from './lib/db';

const FALLBACK_STAFF = [
  'Ross', 'Josh', 'Matt', 'Luca', 'Grant', 'CB', 'Kirsty', 
  'Elle', 'Nicole', 'Lauren', 'Ciarán', 'Daniel', 'Phoebe', 
  'Eva', 'Alex', 'Amy', 'Rosie', 'Joseph', 'John', 'Ally',
  'Openers', 'Closers', 'Kitchen', 'Bar'
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
  const [staffList, setStaffList] = useState(FALLBACK_STAFF);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef(null);
  const popupRef = useRef(null);

  // Fetch registered staff from profiles if available
  useEffect(() => {
    async function loadStaff() {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('full_name, name')
          .limit(50);

        if (!error && data && data.length > 0) {
          const names = data
            .map(p => p.full_name || p.name)
            .filter(Boolean);
          const combined = Array.from(new Set([...names, ...FALLBACK_STAFF]));
          setStaffList(combined);
        }
      } catch (err) {
        // Keep fallback list
      }
    }
    loadStaff();
  }, []);

  // Filter staff matching the query after @
  const matchingStaff = React.useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return staffList
      .filter(s => s.toLowerCase().includes(q))
      .slice(0, 6);
  }, [mentionQuery, staffList]);

  const detectMention = (text, cursorPosition) => {
    const textBeforeCursor = text.slice(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      // Check that @ is at start of line or preceded by a space
      const charBeforeAt = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : ' ';
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);

      // Make sure there are no spaces in query
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

    // Reposition cursor right after inserted mention
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const nextCursor = before.length + name.length + 2; // +2 for '@' and ' '
        inputRef.current.setSelectionRange(nextCursor, nextCursor);
      }
    }, 10);
  };

  const handleKeyDown = (e) => {
    if (mentionQuery !== null && matchingStaff.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % matchingStaff.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + matchingStaff.length) % matchingStaff.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(matchingStaff[selectedIndex]);
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

      {/* Autocomplete Mention Popup */}
      {mentionQuery !== null && matchingStaff.length > 0 && (
        <div
          ref={popupRef}
          className="absolute z-50 left-0 bottom-full mb-1.5 w-64 bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden divide-y divide-gray-100 animate-in fade-in zoom-in-95 duration-100 select-none"
        >
          <div className="px-3 py-1.5 bg-gray-50 flex items-center justify-between border-b border-gray-100">
            <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-gray-500">
              Mention Staff
            </span>
            <span className="text-[9px] font-mono text-gray-400">Tap to select</span>
          </div>

          <div className="max-h-44 overflow-y-auto">
            {matchingStaff.map((staff, idx) => {
              const isGroup = ['Openers', 'Closers', 'Kitchen', 'Bar'].includes(staff);
              const isSelected = selectedIndex === idx;

              return (
                <button
                  key={staff}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault(); // Prevent blurring input
                    insertMention(staff);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center space-x-2 transition ${
                    isSelected ? 'bg-neutral-100 font-bold text-black' : 'hover:bg-gray-50 text-gray-800'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    isGroup ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {isGroup ? <Users className="w-3 h-3" /> : <User className="w-3 h-3" />}
                  </div>
                  <span className="truncate">@{staff}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}