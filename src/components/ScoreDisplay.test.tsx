import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { evaluateThermalComfort } from '@/lib/biophysics/comfort';
import { ComfortDecision } from './layers/ComfortDecision';
import ScoreDisplay from './ScoreDisplay';

describe('server comfort presentation', () => {
  it('does not infer comfort from a high score without an assessment', () => {
    render(<ScoreDisplay score={100} />);
    expect(screen.getByRole('button', { name: 'Comfort unknown' })).toBeInTheDocument();
    expect(screen.queryByText('Optimal')).not.toBeInTheDocument();
  });
  it('shows the reported running reproduction consistently without a risk warning', () => {
    const decision = evaluateThermalComfort({ totalClo: 0.353, targetRange: [0.18, 0.31] });
    render(<><ScoreDisplay score={86.5} decision={decision} /><ComfortDecision decision={decision} /></>);
    expect(screen.getByRole('button', { name: 'Warmer than recommended' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Warmer than recommended' })).toBeInTheDocument();
    expect(screen.queryByText(/risk|immediately|optimal/i)).not.toBeInTheDocument();
  });
});
