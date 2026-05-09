import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders the main analysis headline', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: /package safety analysis before install/i })
    ).toBeInTheDocument();
  });
});
