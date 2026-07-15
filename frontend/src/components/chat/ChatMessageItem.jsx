import { formatTimeLabel } from '../../utils/calendar-date';

const TYPE_LABEL = {
  change_request: '[일정 변경요청]',
};

export default function ChatMessageItem({ message }) {
  const time = formatTimeLabel(new Date(message.createdAt));

  if (message.messageType === 'system') {
    return (
      <div style={{ textAlign: 'center', padding: '4px 0' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          {`${time} [시스템] ${message.content}`}
        </span>
      </div>
    );
  }

  const typeLabel = TYPE_LABEL[message.messageType];

  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{time}</span>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{`사용자 ${message.authorId}`}</span>
        {typeLabel && (
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{typeLabel}</span>
        )}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text)' }}>{message.content}</div>
    </div>
  );
}
