const statusBox = document.querySelector('#status');
const resultBox = document.querySelector('#result');
const timingReport = document.querySelector('#timing-report');

export function showStatus(message) {
  statusBox.textContent = message;
}

export function clearResult() {
  resultBox.replaceChildren();
  timingReport.replaceChildren();
}

function formatFlightTime(seconds) {
  const minutes = Math.round(seconds / 60);
  if (seconds < 3600) return `${Math.min(minutes, 59)} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60} min`;
}

export function renderResult(data) {
  const order = document.createElement('div');
  order.className = 'route-order';
  order.textContent = data.ordered_names.join(' → ');
  const metrics = document.createElement('div');
  metrics.className = 'metric-grid';
  [['Total distance', `${(data.distance_meters / 1000).toFixed(2)} km`],
    ['Estimated flight time', formatFlightTime(data.duration_seconds)]].forEach(([label, value]) => {
      const card = document.createElement('div');
      card.className = 'metric-card';
      const title = document.createElement('span');
      title.textContent = label;
      const amount = document.createElement('strong');
      amount.textContent = value;
      card.append(title, amount);
      metrics.appendChild(card);
    });
  resultBox.append(order, metrics);

  const report = document.createElement('div');
  report.className = 'timing-report-content';
  const title = document.createElement('strong');
  title.textContent = 'Performance report';
  report.appendChild(title);
  const quantum = data.quantum_run;
  const timings = data.timings_ms;
  const rows = [
    ['Geographic lookup', `${timings.geocoding.toFixed(2)} ms`],
    ['Distance matrix', `${timings.classical_preparation.toFixed(2)} ms`],
    [quantum ? 'Quantum compute' : 'Held–Karp compute',
      `${(quantum ? timings.quantum_qaoa : timings.classical_solver).toFixed(3)} ms`],
    ['Total request processing', `${timings.total.toFixed(2)} ms`]
  ];
  if (quantum) {
    rows.push(
      ['Circuit', quantum.layers ? `${quantum.qubits} qubits · ${quantum.layers} QAOA layers` : '1 qubit · single route'],
      ['Selected bitstring', data.selected_bitstring],
      ['Selected measurement', `${quantum.selected_count.toLocaleString()} / ${quantum.shots.toLocaleString()} shots`]
    );
    if (quantum.layers) {
      rows.push(['CVaR α', `${quantum.cvar_alpha} · ${quantum.objective_evaluations} objective evaluations`]);
    }
  }
  rows.forEach(([label, text]) => {
    const row = document.createElement('div');
    row.className = 'timing-row';
    const name = document.createElement('span');
    name.textContent = label;
    const value = document.createElement('strong');
    value.textContent = text;
    row.append(name, value);
    report.appendChild(row);
  });
  timingReport.appendChild(report);
}
