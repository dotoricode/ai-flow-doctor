export interface ButtonProps {
  title: string;
  onClick: () => void;
  disabled?: boolean;
}

export function Button(props: ButtonProps): JSX.Element {
  const { title, onClick, disabled } = props;

  const handleClick = () => {
    if (!disabled) {
      console.log(`Button "${title}" clicked`);
      onClick();
    }
  };

  return (
    <button
      className="btn btn-primary"
      onClick={handleClick}
      disabled={disabled}
    >
      {title}
    </button>
  );
}
