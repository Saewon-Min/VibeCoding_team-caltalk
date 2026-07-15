import ChatMessageItem from './ChatMessageItem';

export default function ChatHistory({ messages, loading, error }) {
  return (
    <div>
      {loading && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>불러오는 중...</p>}
      {error && <div className="error-text">{error.message ?? '메시지를 불러오지 못했습니다.'}</div>}

      {!loading && !error && messages.length === 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>이 날짜에는 아직 대화가 없습니다</p>
      )}

      {!loading && !error &&
        messages.map((message) => <ChatMessageItem key={message.id} message={message} />)}
    </div>
  );
}
