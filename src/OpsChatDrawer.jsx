import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Sparkles, Bot, User } from 'lucide-react';

const SUPABASE_URL = 'https://xuchzhwdgrukoylzvjvl.supabase.co';
const ANON_KEY = 'sb_publishable_szcofKuNIM98PsfNckZlLg_K0Fc-30D';

export default function OpsChatDrawer({ isOpen, onClose }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Ops assistant ready. Ask about last night, stock, local events, or draft a quick supplier note.',
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  if (!isOpen) return null;

  const handleSend = async (messageToSend) => {
    const text = (messageToSend || input).trim();
    if (!text || sending) return;

    setInput('');
    const newHistory = [...messages, { role: 'user', content: text }];
    setMessages(newHistory);
    setSending(true);

    try {
      // Pass the last 4 messages to preserve context without payload bloat
      const contextHistory = messages.slice(-4).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch(`${SUPABASE_URL}/functions/v1/manager-brief`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ANON_KEY}`,
          'apikey': ANON_KEY,
        },
        body: JSON.stringify({
          mode: 'chat',
          message: text,
          history: contextHistory,
        }),
      });

      const data = await res.json();

      if (res.ok && data?.reply) {
        setMessages([...newHistory, { role: 'assistant', content: data.reply }]);
      } else {
        const errorDetail = data?.error || `Error ${res.status}`;
        setMessages([
          ...newHistory,
          { role: 'assistant', content: `Ops Assistant: ${errorDetail}` },
        ]);
      }
    } catch {
      setMessages([
        ...newHistory,
        { role: 'assistant', content: 'Connection timed out. Check network and retry.' },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white animate-in zoom-in-95 duration-200 ease-out select-none">
      
      {/* Full-Screen Header */}
      <header className="flex items-center justify-between px-6 pt-[max(1.2rem,env(safe-area-inset-top))] pb-3 border-b border-gray-100 flex-shrink-0 bg-white">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-neutral-900 text-white flex items-center justify-center shadow-sm">
            <Sparkles className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h3 className="font-extrabold text-sm text-neutral-900">Shift Assistant</h3>
            <p className="text-[10px] text-gray-400 font-mono">West Side Tavern • Partick</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition active:scale-95"
          aria-label="Close Assistant"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      {/* Message Feed */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex items-start gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {m.role === 'assistant' && (
              <div className="w-6 h-6 rounded-lg bg-neutral-100 text-neutral-600 flex items-center justify-center flex-shrink-0 mt-1">
                <Bot className="w-3.5 h-3.5" />
              </div>
            )}
            <div
              className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-neutral-900 text-white rounded-br-none'
                  : 'bg-neutral-100 text-neutral-900 rounded-bl-none font-medium'
              }`}
            >
              {m.content}
            </div>
            {m.role === 'user' && (
              <div className="w-6 h-6 rounded-lg bg-neutral-900 text-white flex items-center justify-center flex-shrink-0 mt-1">
                <User className="w-3.5 h-3.5" />
              </div>
            )}
          </div>
        ))}

        {sending && (
          <div className="flex items-start gap-2 justify-start">
            <div className="w-6 h-6 rounded-lg bg-neutral-100 text-neutral-600 flex items-center justify-center flex-shrink-0 mt-1">
              <Bot className="w-3.5 h-3.5 animate-pulse" />
            </div>
            <div className="bg-neutral-100 rounded-2xl rounded-bl-none px-4 py-2.5 text-xs text-neutral-400 animate-pulse">
              Checking handover &amp; venue data...
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* Quick Ops Chips */}
      <div className="flex gap-2 px-6 py-2 overflow-x-auto no-scrollbar border-t border-gray-50 bg-white">
        {[
          "What's on today & footfall?",
          'Current 86 list?',
          'Summary of last night',
          'Draft short delivery note',
        ].map((chip, i) => (
          <button
            key={i}
            onClick={() => handleSend(chip)}
            className="text-[10px] font-semibold text-neutral-600 bg-neutral-100 hover:bg-neutral-200 px-3 py-1.5 rounded-full whitespace-nowrap transition active:scale-95"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Input Bar */}
      <div className="p-4 border-t border-gray-100 pb-[max(1rem,env(safe-area-inset-bottom))] bg-white flex items-center space-x-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ask a quick shift question..."
          className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs text-neutral-900 focus:outline-none focus:border-neutral-900 transition"
        />
        <button
          onClick={() => handleSend()}
          disabled={!input.trim() || sending}
          className="w-10 h-10 rounded-xl bg-neutral-900 disabled:opacity-40 text-white flex items-center justify-center transition active:scale-95"
          aria-label="Send"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}