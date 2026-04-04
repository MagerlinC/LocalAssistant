import React, { createContext, useContext, useState, useCallback } from 'react';
import type { Chat } from '@local-assistant/shared';
import { DEFAULT_MODEL } from '@local-assistant/shared';

interface AppContextValue {
  selectedChatId: string | null;
  setSelectedChatId: (id: string | null) => void;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  isStreaming: boolean;
  setIsStreaming: (v: boolean) => void;
  indexingStatus: string | null;
  setIndexingStatus: (v: string | null) => void;
  currentChat: Chat | null;
  setCurrentChat: (chat: Chat | null) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const [isStreaming, setIsStreaming] = useState(false);
  const [indexingStatus, setIndexingStatus] = useState<string | null>(null);
  const [currentChat, setCurrentChat] = useState<Chat | null>(null);

  const handleSetSelectedChatId = useCallback((id: string | null) => {
    setSelectedChatId(id);
    if (!id) setCurrentChat(null);
  }, []);

  return (
    <AppContext.Provider
      value={{
        selectedChatId,
        setSelectedChatId: handleSetSelectedChatId,
        selectedModel,
        setSelectedModel,
        isStreaming,
        setIsStreaming,
        indexingStatus,
        setIndexingStatus,
        currentChat,
        setCurrentChat,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
