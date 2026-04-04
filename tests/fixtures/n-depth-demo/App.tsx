import { Button, Input } from './components';

interface AppState {
  username: string;
  submitted: boolean;
}

export function App(): JSX.Element {
  const state: AppState = {
    username: "",
    submitted: false,
  };

  const handleSubmit = () => {
    if (state.username.trim().length > 0) {
      state.submitted = true;
      console.log(`Submitted: ${state.username}`);
    }
  };

  const handleChange = (value: string) => {
    state.username = value;
    state.submitted = false;
  };

  return (
    <div className="app-container">
      <h1>Welcome to N-Depth Demo</h1>
      <Input
        value={state.username}
        onChange={handleChange}
        placeholder="Enter your name"
      />
      <Button
        title="Submit"
        onClick={handleSubmit}
      />
      {state.submitted && <p>Hello, {state.username}!</p>}
    </div>
  );
}
