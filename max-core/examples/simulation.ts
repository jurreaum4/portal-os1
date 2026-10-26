import { Simulation } from "../simulation/index.js";
const simulation = new Simulation({
  initial: { position: 0, velocity: 2 },
  stepMs: 100,
  reduce: (state, { stepMs }) => ({
    ...state,
    position: state.position + (state.velocity * stepMs) / 1000,
  }),
});
simulation.start();
console.log(simulation.update(10));
