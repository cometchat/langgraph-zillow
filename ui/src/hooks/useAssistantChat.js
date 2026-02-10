import { useEffect, useMemo, useState } from 'react';
import { CometChat } from '@cometchat/chat-sdk-javascript';
import { CometChatAIAssistantTools } from '@cometchat/chat-uikit-react';
import { ensureLoggedIn } from '../utils/cometchat.js';

const CONFIG_ERROR_MESSAGE =
  'CometChat configuration missing. Update the .env file with CometChat credentials and assistant UID.';

export function useAssistantChat({ hasChatConfig, assistantUid, toolHandlers }) {
  const [assistantUser, setAssistantUser] = useState(null);
  const [chatReady, setChatReady] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState(null);
  const [isChatOpen, setIsChatOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    if (!hasChatConfig) {
      setChatReady(false);
      setAssistantUser(null);
      setChatLoading(false);
      setChatError(CONFIG_ERROR_MESSAGE);
      return () => {
        isMounted = false;
      };
    }

    setAssistantUser(null);
    setChatReady(false);
    setChatError(null);

    const initializeChat = async () => {
      setChatLoading(true);
      try {
        await ensureLoggedIn();
        if (!isMounted) {
          return;
        }

        const assistant = await CometChat.getUser(assistantUid);
        if (!isMounted) {
          return;
        }

        setAssistantUser(assistant);
        setChatReady(true);
        setChatError(null);
      } catch (error) {
        if (!isMounted) {
          return;
        }
        console.error('CometChat initialization failed:', error);
        const errorCode = error?.code ?? error?.details?.code;
        let message = error?.message ?? 'Unable to connect to chat at the moment.';
        if (errorCode === 'ERR_UID_NOT_FOUND' || message?.toLowerCase().includes('not found')) {
          message = 'Unable to find the configured assistant user. Verify VITE_COMETCHAT_ASSISTANT_UID.';
        }
        setChatError(message);
        setChatReady(false);
        setAssistantUser(null);
      } finally {
        if (isMounted) {
          setChatLoading(false);
        }
      }
    };

    void initializeChat();

    return () => {
      isMounted = false;
    };
  }, [assistantUid, hasChatConfig]);

  useEffect(() => {
    if (!chatReady || chatLoading || !assistantUser) {
      setIsChatOpen(false);
    }
  }, [assistantUser, chatReady, chatLoading]);

  const assistantTools = useMemo(() => {
    if (!toolHandlers) {
      return null;
    }
    return new CometChatAIAssistantTools(toolHandlers);
  }, [toolHandlers]);

  const openChat = () => {
    if (!chatReady || chatLoading || !assistantUser) {
      return;
    }
    setIsChatOpen(true);
  };

  const closeChat = () => {
    setIsChatOpen(false);
  };

  const toggleChat = () => {
    if (!chatReady || chatLoading || !assistantUser) {
      return;
    }
    setIsChatOpen((prev) => !prev);
  };

  return {
    assistantUser,
    chatReady,
    chatLoading,
    chatError,
    setChatError,
    assistantTools,
    isChatOpen,
    openChat,
    closeChat,
    toggleChat,
  };
}
