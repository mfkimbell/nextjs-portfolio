export type SpringState = {
  value: number;
  velocity: number;
};

export const stepSpring = (
  state: SpringState,
  target: number,
  stiffness: number,
  damping: number,
  delta: number,
): SpringState => {
  const safeDelta = Math.min(Math.max(delta, 0), 0.1);
  const steps = Math.max(1, Math.ceil(safeDelta / (1 / 120)));
  const step = safeDelta / steps;
  let value = state.value;
  let velocity = state.velocity;

  for (let index = 0; index < steps; index += 1) {
    velocity += (target - value) * stiffness * step - velocity * damping * step;
    value += velocity * step;
  }

  return { value, velocity };
};

export const clampSpring = (state: SpringState, min: number, max: number): SpringState => ({
  value: Number.isFinite(state.value) ? Math.max(min, Math.min(max, state.value)) : 0,
  velocity: Number.isFinite(state.velocity) ? state.velocity : 0,
});
