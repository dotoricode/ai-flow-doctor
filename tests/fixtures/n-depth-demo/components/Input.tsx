export interface InputProps {
  value: string;
  onChange: (newValue: string) => void;
  placeholder?: string;
  type?: "text" | "password" | "email";
}

export function Input(props: InputProps): JSX.Element {
  const { value, onChange, placeholder, type = "text" } = props;

  const handleChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    onChange(target.value);
  };

  return (
    <input
      type={type}
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      className="input input-bordered"
    />
  );
}
