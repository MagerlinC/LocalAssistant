import React, { createContext, useContext, useState, useCallback } from 'react';
import type { Chat } from '@local-assistant/shared';

interface AppContextValue {
  selectedChatId: string | null;
  setSelectedChatId: (id: string | null) => void;
  isStreaming: boolean;
  setIsStreaming: (v: boolean) => void;
  isIndexing: boolean;
  setIsIndexing: (v: boolean) => void;
  currentChat: Chat | null;
  setCurrentChat: (chat: Chat | null) => void;
  appName: string;
  setAppName: (name: string) => void;
  avatarUrl: string;
  setAvatarUrl: (url: string) => void;
  setupComplete: boolean;
  setSetupComplete: (v: boolean) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  const [currentChat, setCurrentChat] = useState<Chat | null>(null);
  const [appName, setAppName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [setupComplete, setSetupComplete] = useState(false);

  const handleSetSelectedChatId = useCallback((id: string | null) => {
    setSelectedChatId(id);
    if (!id) setCurrentChat(null);
  }, []);

  return (
    <AppContext.Provider
      value={{
        selectedChatId,
        setSelectedChatId: handleSetSelectedChatId,
        isStreaming,
        setIsStreaming,
        isIndexing,
        setIsIndexing,
        currentChat,
        setCurrentChat,
        appName,
        setAppName,
        avatarUrl,
        setAvatarUrl,
        setupComplete,
        setSetupComplete,
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
