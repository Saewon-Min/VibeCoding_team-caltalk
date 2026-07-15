import { useState } from 'react';
import TextInput from '../common/TextInput';
import Button from '../common/Button';
import { postMessage } from '../../api/message.api';
import { useTeam } from '../../context/TeamContext';
import ChangeRequestForm from '../change-request/ChangeRequestForm';

export default function ChatInput({ teamId, appendMessage, date }) {
  const { currentRole } = useTeam();
  const [mode, setMode] = useState('general');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function handleCancelChangeRequest() {
    setMode('general');
  }

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
      {currentRole !== 'leader' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <Button
            type="button"
            variant={mode === 'general' ? 'primary' : 'secondary'}
            onClick={() => setMode('general')}
          >
            일반
          </Button>
          <Button
            type="button"
            variant={mode === 'change_request' ? 'primary' : 'secondary'}
            onClick={() => setMode('change_request')}
          >
            일정 변경요청
          </Button>
        </div>
      )}
      {mode === 'general' && (
        <>
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
        </>
      )}
      {mode === 'change_request' && (
        <ChangeRequestForm
          teamId={teamId}
          date={date}
          appendMessage={appendMessage}
          onCancel={handleCancelChangeRequest}
        />
      )}
    </div>
  );
}
