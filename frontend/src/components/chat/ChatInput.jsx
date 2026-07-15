import { useState } from 'react';
import TextInput from '../common/TextInput';
import Button from '../common/Button';
import { postMessage } from '../../api/message.api';

export default function ChatInput({ teamId, appendMessage }) {
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSend() {
    const trimmed = content.trim();
    if (trimmed === '') {
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      const message = await postMessage(teamId, trimmed);
      appendMessage(message);
      setContent('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <TextInput
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="메시지를 입력하세요"
          disabled={submitting}
          style={{ flex: 1 }}
        />
        <Button type="button" onClick={handleSend} disabled={submitting}>
          전송
        </Button>
      </div>
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}
