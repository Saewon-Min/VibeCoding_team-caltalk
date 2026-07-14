import { useState } from 'react';
import FormField from '../common/FormField';
import Button from '../common/Button';
import { searchMemberByEmail, addMember } from '../../api/team.api';

// 팀장 전용 UI(BR-14). 이메일 검색 → 즉시 추가만 지원하며 초대 발송/수락
// 대기 절차는 존재하지 않는다.
export default function MemberSearchAddForm({ teamId, onAdded }) {
  const [email, setEmail] = useState('');
  const [foundUser, setFoundUser] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSearch(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    setFoundUser(null);
    setSubmitting(true);
    try {
      const user = await searchMemberByEmail(teamId, email);
      setFoundUser(user);
    } catch (err) {
      // SC-02 E2: 미가입 이메일 안내 문구
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAdd() {
    setError('');
    setSubmitting(true);
    try {
      await addMember(teamId, foundUser.id);
      setNotice(`${foundUser.name}님을 팀원으로 추가했습니다`);
      setFoundUser(null);
      setEmail('');
      onAdded();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <FormField
            id="member-search-email"
            label="팀원으로 추가할 이메일"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <Button type="submit" variant="secondary" disabled={submitting} style={{ marginBottom: 16 }}>
          검색
        </Button>
      </form>

      {error && <div className="error-text">{error}</div>}
      {notice && <p>{notice}</p>}

      {foundUser && (
        <p>
          {foundUser.name} ({foundUser.email}){' '}
          <Button onClick={handleAdd} disabled={submitting}>
            팀원으로 추가
          </Button>
        </p>
      )}
    </div>
  );
}
