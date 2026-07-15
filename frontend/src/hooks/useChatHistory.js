import { useEffect, useRef, useState } from 'react';
import { getMessagesByDate } from '../api/message.api';
import { formatDateParam } from '../utils/calendar-date';
import { mergeNewMessages, getNextSince } from '../utils/chat-history';

const POLL_INTERVAL_MS = 3000; // 구현 단계 결정값, docs/2-PRD.md 참조

export function useChatHistory(teamId, date) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refetchKey, setRefetchKey] = useState(0);
  const sinceRef = useRef(null);
  const dateParam = date ? formatDateParam(date) : null;

  // Effect 1: 초기/날짜변경/refetch 시 전체 재조회
  useEffect(() => {
    if (!teamId || !dateParam) {
      setMessages([]);
      setError(null);
      sinceRef.current = null;
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getMessagesByDate(teamId, dateParam)
      .then((data) => {
        if (cancelled) return;
        setMessages(data);
        sinceRef.current = getNextSince(null, data);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [teamId, dateParam, refetchKey]);

  // Effect 2: 폴링 (teamId/dateParam이 바뀔 때만 재시작, since는 ref로 추적해 interval을 건드리지 않음)
  useEffect(() => {
    if (!teamId || !dateParam) return;
    let cancelled = false;
    const id = setInterval(() => {
      getMessagesByDate(teamId, dateParam, sinceRef.current)
        .then((data) => {
          if (cancelled) return;
          setMessages((prev) => mergeNewMessages(prev, data));
          sinceRef.current = getNextSince(sinceRef.current, data);
        })
        .catch(() => {
          // 폴링 실패는 조용히 무시하고 다음 tick에서 재시도한다.
        });
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [teamId, dateParam]);

  function refetch() {
    setRefetchKey((k) => k + 1);
  }

  function appendMessage(message) {
    setMessages((prev) => mergeNewMessages(prev, [message]));
    sinceRef.current = getNextSince(sinceRef.current, [message]);
  }

  return { messages, loading, error, refetch, appendMessage };
}
