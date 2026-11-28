const statusBox = document.querySelector('#status');

export function showStatus(message) {
  statusBox.textContent = message;
}

function formatFlightTime(seconds) {
  const minutes = Math.round(seconds / 60);
  if (seconds < 3600) return `${Math.min(minutes, 59)} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60} min`;
}

function formatComputeTime(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms.toFixed(3)} ms`;
}

function renderReport(container, title, rows) {
  const report = document.createElement('div');
  report.className = 'timing-report-content';
  const heading = document.createElement('strong');
  heading.textContent = title;
  report.appendChild(heading);
  for (const [label, text] of rows) {
    const row = document.createElement('div');
    row.className = 'timing-row';
    const name = document.createElement('span');
    name.textContent = label;
    const value = document.createElement('strong');
    value.textContent = text;
    row.append(name, value);
    report.appendChild(row);
  }
  container.appendChild(report);
}

export function renderResult(container, { route, error }) {
  container.replaceChildren();
  container.hidden = false;
  const status = document.createElement('p');
  status.className = 'solver-status';
  status.textContent = route?.message ?? error;
  container.appendChild(status);
  if (!route) return;

  const order = document.createElement('div');
  order.className = 'route-order';
  order.textContent = route.ordered_names.join(' → ');
  const metrics = document.createElement('div');
  metrics.className = 'metric-grid';
  const values = [
    ['Total distance', `${(route.distance_meters / 1000).toFixed(2)} km`],
    ['Estimated flight time', formatFlightTime(route.duration_seconds)]
  ];
  for (const [label, value] of values) {
    const card = document.createElement('div');
    card.className = 'metric-card';
    const title = document.createElement('span');
    title.textContent = label;
    const amount = document.createElement('strong');
    amount.textContent = value;
    card.append(title, amount);
    metrics.appendChild(card);
  }
  container.append(order, metrics);

  const quantum = route.quantum_run;
  const computeMs = quantum ? route.timings_ms.quantum_qaoa : route.timings_ms.classical_solver;
  const rows = [[
    quantum ? 'Quantum compute' : 'Held–Karp compute',
    quantum?.cached ? 'Cached result' : formatComputeTime(computeMs)
  ]];
  if (quantum) {
    rows.push(
      ['Circuit', quantum.layers ? `${quantum.qubits} qubits · ${quantum.layers} QAOA layers` : '1 qubit · single route'],
      ['Selected bitstring', route.selected_bitstring],
      ['Selected measurement', `${quantum.selected_count.toLocaleString()} / ${quantum.shots.toLocaleString()} shots`]
    );
    if (quantum.layers) {
      const evaluations = quantum.cached ? 'original evaluations' : 'objective evaluations';
      rows.push(['CVaR α', `${quantum.cvar_alpha} · ${quantum.objective_evaluations} ${evaluations}`]);
    }
  }
  renderReport(container, 'Performance report', rows);
}
