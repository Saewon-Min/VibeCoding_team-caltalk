import { useState } from 'react';
import FormField from '../common/FormField';
import Button from '../common/Button';
import { createTeam } from '../../api/team.api';

export default function TeamCreateForm({ onCreated }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const team = await createTeam(name);
      setName('');
      onCreated(team);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
      <div style={{ flex: 1 }}>
        <FormField
          id="team-name"
          label="새 팀 이름"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={submitting} style={{ marginBottom: 16 }}>
        팀 생성
      </Button>
      {error && <div className="error-text">{error}</div>}
    </form>
  );
}
