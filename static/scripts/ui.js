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

export function renderResult(data) {
  const order = document.createElement('div');
  order.className = 'route-order';
  order.textContent = data.ordered_names.join(' → ');
  const metrics = document.createElement('div');
  metrics.className = 'metric-grid';
  [['Total distance', `${(data.distance_meters / 1000).toFixed(2)} km`],
    ['Estimated time', `${(data.duration_seconds / 60).toFixed(1)} minutes`]].forEach(([label, value]) => {
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
  const labels = [
    ['Geographic lookup', 'geocoding'],
    ['Classical preparation', 'classical_preparation'],
    ['Classical solver', 'classical_solver'],
    ['Quantum QAOA', 'quantum_qaoa'],
    ['Total processing', 'total']
  ];
  labels.forEach(([label, key]) => {
    const row = document.createElement('div');
    row.className = 'timing-row';
    const name = document.createElement('span');
    name.textContent = label;
    const value = document.createElement('strong');
    value.textContent = `${Number(data.timings_ms?.[key] || 0).toFixed(0)} ms`;
    row.append(name, value);
    report.appendChild(row);
  });
  timingReport.appendChild(report);
}
