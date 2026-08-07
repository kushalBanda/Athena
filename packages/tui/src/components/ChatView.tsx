import React, { type ReactNode, useEffect, useRef, useState } from "react";
import { Box, Static } from "ink";
import type { Message } from "../types.js";
import { MessageBubble } from "./MessageBubble.js";
import { ThinkingDot } from "./ThinkingDot.js";

interface Props {
  header: ReactNode;
  messages: Message[];
  thinking: boolean;
}

type StaticItem = { kind: "header" } | { kind: "message"; message: Message };

const STREAM_REPAINT_MS = 80;

function useThrottledActiveMessage(activeMessage: Message | undefined): Message | undefined {
  const [displayed, setDisplayed] = useState(activeMessage);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef(activeMessage);

  useEffect(() => {
    pendingRef.current = activeMessage;

    if (!activeMessage || activeMessage.id !== displayed?.id) {
      // No active message, or a new message started streaming: show immediately.
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setDisplayed(activeMessage);
      return;
    }

    if (timerRef.current) return; // repaint already scheduled
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setDisplayed(pendingRef.current);
    }, STREAM_REPAINT_MS);
  }, [activeMessage, displayed?.id]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return displayed;
}


export function ChatView({ header, messages, thinking }: Props) {
  const lastMessage = messages[messages.length - 1];
  const activeMessage = lastMessage?.streaming ? lastMessage : undefined;
  const settledMessages = activeMessage ? messages.slice(0, -1) : messages;
  const displayedActiveMessage = useThrottledActiveMessage(activeMessage);

  const staticItems: StaticItem[] = [
    { kind: "header" },
    ...settledMessages.map((message) => ({ kind: "message" as const, message })),
  ];

  return (
    <Box flexDirection="column" paddingX={1}>
      <Static items={staticItems}>
        {(item) =>
          item.kind === "header" ? (
            <Box key="header" flexDirection="column">
              {header}
            </Box>
          ) : (
            <MessageBubble key={item.message.id} message={item.message} />
          )
        }
      </Static>
      {displayedActiveMessage && <MessageBubble key={displayedActiveMessage.id} message={displayedActiveMessage} />}
      {thinking && <ThinkingDot />}
    </Box>
  );
}
