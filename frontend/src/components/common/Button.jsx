export default function Button({ children, variant = 'primary', style, ...rest }) {
  const base = {
    padding: '8px 16px',
    borderRadius: 6,
    border: '1px solid transparent',
    fontSize: 14,
    cursor: 'pointer',
  };

  const variants = {
    primary: { background: 'var(--accent)', color: '#fff' },
    secondary: { background: 'transparent', color: 'var(--text)', borderColor: 'var(--border)' },
    danger: { background: 'var(--danger)', color: '#fff' },
  };

  return (
    <button style={{ ...base, ...variants[variant], ...style }} {...rest}>
      {children}
    </button>
  );
}
