import TextInput from './TextInput';

export default function FormField({ id, label, ...inputProps }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <TextInput id={id} {...inputProps} />
    </div>
  );
}
