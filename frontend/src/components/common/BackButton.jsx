import { useNavigate } from 'react-router-dom';
import Button from './Button';

export default function BackButton({ style }) {
  const navigate = useNavigate();

  return (
    <Button
      type="button"
      variant="secondary"
      onClick={() => navigate(-1)}
      style={{ marginBottom: 16, ...style }}
    >
      ← 뒤로
    </Button>
  );
}
