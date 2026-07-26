import React, { useState, useRef, useEffect } from 'react';
import { Button, IconButton } from './Material3UI.tsx';
import { ArchitectCorrectionDialog } from './ArchitectCorrectionDialog.tsx';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ArchitectChatProps {
  messages: Message[];
  onSendMessage: (message: string) => void;
  isLoading?: boolean;
}

export const ArchitectChat: React.FC<ArchitectChatProps> = ({
  messages,
  onSendMessage,
  isLoading = false,
}) => {
  const [input, setInput] = useState('');
  const [correctionDialogOpen, setCorrectionDialogOpen] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<{ id: string; content: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  const handleCorrectionClick = (messageId: string, content: string) => {
    setSelectedMessage({ id: messageId, content });
    setCorrectionDialogOpen(true);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-[24px] shadow-lg overflow-hidden">
      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <span className="material-symbols-rounded text-indigo-400 text-6xl mb-4" aria-hidden="true">
              architecture
            </span>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Architect Assistant</h2>
            <p className="text-sm text-slate-600 max-w-md">
              Ask me about system architecture, design patterns, or technical decisions. I'm here to help!
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-[20px] p-4 ${
                  message.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-sm'
                    : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                }`}
              >
                <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                <div className="flex items-center justify-between mt-2 gap-2">
                  <span
                    className={`text-xs ${
                      message.role === 'user' ? 'text-indigo-200' : 'text-slate-500'
                    }`}
                  >
                    {formatTime(message.timestamp)}
                  </span>
                  {message.role === 'assistant' && (
                    <Button
                      variant="ghost"
                      className="text-xs px-2 py-1 h-auto"
                      onClick={() => handleCorrectionClick(message.id, message.content)}
                      title="Report inaccurate information"
                    >
                      <span className="material-symbols-rounded text-[16px]" aria-hidden="true">
                        flag
                      </span>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-[20px] p-4 bg-slate-100 text-slate-800 rounded-bl-sm">
              <div className="flex items-center gap-2">
                <span className="material-symbols-rounded animate-spin text-slate-500" aria-hidden="true">
                  progress_activity
                </span>
                <span className="text-sm text-slate-600">Architect is thinking...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-gray-100 bg-white">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the architect..."
            disabled={isLoading}
            className="flex-1 p-3 bg-slate-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none disabled:opacity-50"
          />
          <Button
            variant="primary"
            type="submit"
            disabled={!input.trim() || isLoading}
            className="px-4"
          >
            <span className="material-symbols-rounded" aria-hidden="true">send</span>
          </Button>
        </form>
      </div>

      {/* Correction Dialog */}
      {selectedMessage && (
        <ArchitectCorrectionDialog
          isOpen={correctionDialogOpen}
          onClose={() => {
            setCorrectionDialogOpen(false);
            setSelectedMessage(null);
          }}
          messageContent={selectedMessage.content}
          messageId={selectedMessage.id}
        />
      )}
    </div>
  );
};
