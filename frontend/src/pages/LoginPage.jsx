import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import FormField from '../components/common/FormField';
import Button from '../components/common/Button';
import { login as loginRequest } from '../api/auth.api';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const result = await loginRequest({ email, password });
      login(result.token, result.user);
      navigate('/teams');
    } catch (err) {
      // SC-01 E1: 잘못된 비밀번호/미존재 이메일 모두 동일 오류 문구, 화면 유지
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <h2>로그인</h2>
      {error && <div className="error-text">{error}</div>}
      <form onSubmit={handleSubmit}>
        <FormField
          id="email"
          label="이메일"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <FormField
          id="password"
          label="비밀번호"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button type="submit" disabled={submitting}>
          로그인
        </Button>
      </form>
      <p>
        계정이 없으신가요? <Link to="/signup">회원가입</Link>
      </p>
    </div>
  );
}
