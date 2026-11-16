const statusBox = document.querySelector('#status');
const resultBox = document.querySelector('#result');

export function showStatus(message) {
  statusBox.textContent = message;
}

export function clearResult() {
  resultBox.replaceChildren();
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
}
