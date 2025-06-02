import { fetchModuleData } from './modelData.js';

let currentChart = null;
let currentManufacturer = null;
let currentModel = null;
let showPowerCurve = false;
let measuredSeries = [];

const renderPVChart = async (manufacturer, model) => {
  // Input fields
  const irrInput = document.getElementById('irradiance-input');
  const tempInput = document.getElementById('temperature-input');
  const modsInput = document.getElementById('modules-input');
  const degInput = document.getElementById('degradation-input');
  const startDateInput = document.getElementById('start-date-input');
  const endDateInput = document.getElementById('end-date-input');

  let irradiance = parseFloat(irrInput.value);
  let temperature = parseFloat(tempInput.value);
  let modules = parseInt(modsInput.value);

  // Validate ranges
  if (irradiance < 0 || irradiance > 1500 || isNaN(irradiance)) {
    irradiance = 1000;
    irrInput.value = irradiance;
  }
  if (temperature < -20 || temperature > 100 || isNaN(temperature)) {
    temperature = 25;
    tempInput.value = temperature;
  }
  if (isNaN(modules) || modules < 1 || modules > 100) {
    modules = 1;
    modsInput.value = modules;
  }

  const degradationRate = parseFloat(degInput.value) / 100; // %
  const startDate = new Date(startDateInput.value);
  const endDate = new Date(endDateInput.value);
  const diffYears = (endDate - startDate) / (365.25 * 24 * 3600 * 1000);
  const totalDegradation = degradationRate * diffYears;
  const scalingFactor = Math.sqrt(1 - totalDegradation);

  const url = `/api/iv-curve/?manufacturer=${encodeURIComponent(manufacturer)}&model=${encodeURIComponent(model)}&temperature=${temperature}&irradiance=${irradiance}&modules=${modules}`;
  const res = await fetch(url);
  const data = await res.json();

  if (!data.voltage || !data.current) {
    console.warn('Invalid IV curve response:', data);
    return;
  }

  const ivData = data.voltage.map((v, i) => ({
    x: v * scalingFactor,
    y: data.current[i] * scalingFactor
  }));
  const powerData = data.voltage.map((v, i) => ({
    x: v * scalingFactor,
    y: data.power[i] * (1 - totalDegradation)
  }));

  // Calculate modeled values for the table
  const modeledVoc = Math.max(...data.voltage) * scalingFactor;
  const modeledIsc = Math.max(...data.current) * scalingFactor;

  const powerValues = data.voltage.map((v, i) => v * data.current[i]);
  const maxPowerIndex = powerValues.indexOf(Math.max(...powerValues));
  const modeledVmp = data.voltage[maxPowerIndex] * scalingFactor;
  const modeledImp = data.current[maxPowerIndex] * scalingFactor;
  const modeledPmp = modeledVmp * modeledImp * (1 - totalDegradation);

  const tableBody = document.querySelector('#module-info-table tbody');
  tableBody.querySelectorAll('tr').forEach(row => {
    const label = row.cells[0].innerText;
    switch (label) {
      case 'Power (W)':
        row.cells[1].innerText = modeledPmp.toFixed(2);
        break;
      case 'Voc (V)':
        row.cells[1].innerText = modeledVoc.toFixed(2);
        break;
      case 'Isc (A)':
        row.cells[1].innerText = modeledIsc.toFixed(2);
        break;
      case 'Vmp (V)':
        row.cells[1].innerText = modeledVmp.toFixed(2);
        break;
      case 'Imp (A)':
        row.cells[1].innerText = modeledImp.toFixed(2);
        break;
    }
  });

  // Modeled series
  const modeledSeries = [{ name: 'IV Curve', data: ivData }];
  if (showPowerCurve) {
    modeledSeries.push({
      name: 'Power Curve',
      data: powerData,
      yAxis: 1
    });
  }

  // Combine with any measured data series (preserved globally)
  const fullSeries = [...modeledSeries, ...measuredSeries];

  const yaxis = showPowerCurve
    ? [
        {
          min: 0,
          title: { text: 'Current (A)' },
          labels: { formatter: val => val.toFixed(2) }
        },
        {
          min: 0,
          opposite: true,
          title: { text: 'Power (W)' },
          labels: { formatter: val => val.toFixed(2) }
        }
      ]
    : {
        min: 0,
        title: { text: 'Current (A)' },
        labels: { formatter: val => val.toFixed(2) }
      };

  const options = {
    chart: { type: 'line', height: 420, toolbar: { show: false } },
    series: fullSeries,
    xaxis: {
      title: { text: 'Voltage (V)' },
      tickAmount: 10,
      labels: { rotate: -45, formatter: val => val.toFixed(2) }
    },
    yaxis: yaxis,
    tooltip: {
      y: { formatter: val => val.toFixed(2) },
      x: { formatter: val => val.toFixed(2) }
    }
  };

  const chartDiv = document.getElementById('pv-iv-chart');
  if (chartDiv) {
    if (window.currentChart) {
      // ✅ Update only the series and yaxis (preserve zoom, etc.)
      window.currentChart.updateOptions({
        series: fullSeries,
        yaxis: yaxis
      });
    } else {
      window.currentChart = new ApexCharts(chartDiv, options);
      window.currentChart.render();
    }
  }
};

const initPVChart = async () => {
  const modules = await fetchModuleData();
  console.log('Parsed Module Data:', modules);

  const makeSelect = document.getElementById('make-select');
  const modelSelect = document.getElementById('model-select');

  const uniqueManufacturers = [...new Set(modules.map(m => m.Manufacturer))];
  makeSelect.innerHTML =
    `<option value="">Select Manufacturer</option>` +
    uniqueManufacturers.map(m => `<option value="${m}">${m}</option>`).join('');

  makeSelect.addEventListener('change', () => {
    const selected = makeSelect.value;
    const models = modules
      .filter(m => m.Manufacturer === selected)
      .map(m => m.Model);

    modelSelect.innerHTML =
      `<option value="">Select Model</option>` +
      models.map(m => `<option value="${m}">${m}</option>`).join('');
  });

  modelSelect.addEventListener('change', () => {
    const manufacturer = makeSelect.value;
    const model = modelSelect.value;
    const selected = modules.find(
      m => m.Manufacturer === manufacturer && m.Model === model
    );
    if (selected) {
      currentManufacturer = manufacturer;
      currentModel = model;
      renderPVChart(manufacturer, model);
      updateModuleTable(selected);
    }
  });

  const today = new Date().toISOString().split('T')[0];
  document.getElementById('start-date-input').value = today;
  document.getElementById('end-date-input').value = today;

  ['irradiance-input', 'temperature-input', 'modules-input', 'degradation-input', 'start-date-input', 'end-date-input'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      if (currentManufacturer && currentModel) {
        renderPVChart(currentManufacturer, currentModel);
      }
    });
  });
};

function updateModuleTable(module) {
  const tableBody = document.querySelector('#module-info-table tbody');
  tableBody.innerHTML = '';
  const rows = [
    ['Model', module.Model],
    ['Manufacturer', module.Manufacturer],
    ['Technology', module.Technology],
    ['Power (W)', module.STC],
    ['Voc (V)', module.V_oc_ref],
    ['Isc (A)', module.I_sc_ref],
    ['Vmp (V)', module.V_mp_ref],
    ['Imp (A)', module.I_mp_ref]
  ];
  rows.forEach(([label, value]) => {
    const row = `<tr><td>${label}</td><td>${value}</td></tr>`;
    tableBody.insertAdjacentHTML('beforeend', row);
  });
}


document.getElementById('reset-zoom').addEventListener('click', () => {
  if (window.currentChart) {
    window.currentChart.resetSeries(true);
  }
});

document.getElementById('toggle-power').addEventListener('click', () => {
  showPowerCurve = !showPowerCurve;
  if (currentManufacturer && currentModel) {
    renderPVChart(currentManufacturer, currentModel);
  }
});

document.getElementById('reset-stc').addEventListener('click', () => {
  document.getElementById('irradiance-input').value = 1000;
  document.getElementById('temperature-input').value = 25;
  document.getElementById('modules-input').value = 1;
  if (currentManufacturer && currentModel) {
    renderPVChart(currentManufacturer, currentModel);
  }
});

document.getElementById('reset-degradation').addEventListener('click', () => {
  document.getElementById('degradation-input').value = 0.5;
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('start-date-input').value = today;
  document.getElementById('end-date-input').value = today;
  if (currentManufacturer && currentModel) {
    renderPVChart(currentManufacturer, currentModel);
  }
});

// Modal logic for measured data
document.getElementById('open-user-data-modal').addEventListener('click', () => {
  document.getElementById('user-data-modal').classList.remove('hidden');
});
document.getElementById('close-user-data-modal').addEventListener('click', () => {
  document.getElementById('user-data-modal').classList.add('hidden');
});
document.getElementById('cancel-user-data').addEventListener('click', () => {
  document.getElementById('user-data-modal').classList.add('hidden');
});
document.getElementById('parse-user-data').addEventListener('click', () => {
  const text = document.getElementById('user-data-textarea').value.trim();
  const lines = text.split('\n').slice(0, 5000); // Limit to 5000 rows
  const tbody = document.querySelector('#user-data-table tbody');
  tbody.innerHTML = '';
  lines.forEach(line => {
    const parts = line.trim().split(/[\t\s]+/);
    if (parts.length >= 2) {
      const voltage = parseFloat(parts[0]);
      const current = parseFloat(parts[1]);
      if (!isNaN(voltage) && !isNaN(current)) {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td><input type="number" step="any" value="${voltage}" class="w-full p-1 border dark:bg-gray-700"></td>
          <td><input type="number" step="any" value="${current}" class="w-full p-1 border dark:bg-gray-700"></td>
        `;
        tbody.appendChild(row);
      }
    }
  });
});

document.getElementById('clear-user-data').addEventListener('click', () => {
  document.getElementById('user-data-textarea').value = '';
  document.querySelector('#user-data-table tbody').innerHTML = '';
  // Clear the globally tracked measured data
  measuredSeries = [];
  if (window.currentChart) {
    // Remove measured data from the chart by updating the series
    const modeledSeriesOnly = window.currentChart.w.config.series.filter(
      s => s.name !== 'Measured Data'
    );
    window.currentChart.updateOptions({
      series: modeledSeriesOnly
    });
    //  ApexCharts quirk: forcibly clear internal series state
    // by fully resetting chart data
    window.currentChart.updateSeries(modeledSeriesOnly, true);
  }
  // Remove the measured column from the table
  updateMeasuredColumn(null);
});

document.getElementById('save-user-data').addEventListener('click', () => {
  const rows = document.querySelectorAll('#user-data-table tbody tr');
  const userData = [];
  rows.forEach(row => {
    const voltage = parseFloat(row.cells[0].querySelector('input').value);
    const current = parseFloat(row.cells[1].querySelector('input').value);
    if (!isNaN(voltage) && !isNaN(current)) {
      userData.push({ x: voltage, y: current });
    }
  });

  if (window.currentChart && userData.length) {
    let existingSeries = window.currentChart.w.config.series || [];

    // Remove existing "Measured Data" series
    existingSeries = existingSeries.filter(series => series.name !== 'Measured Data');

    // Create the new Measured Data series
    const measuredDataSeries = {
      name: 'Measured Data',
      data: userData,
      type: 'line',
      color: '#FF0000'
    };

    //  Save measured data globally
    measuredSeries = [measuredDataSeries];

    //  Merge it into the chart
    const updatedSeries = [
      ...existingSeries,
      measuredDataSeries
    ];

    window.currentChart.updateOptions({
      series: updatedSeries
    });

    // Calculate measured data values
    const measured_voltage = userData.map(pt => pt.x);
    const measured_current = userData.map(pt => pt.y);
    const measuredVoc = Math.max(...measured_voltage);
    const measuredIsc = Math.max(...measured_current);
    const powerMeasured = measured_voltage.map((v, i) => v * measured_current[i]);
    const maxPowerIndexMeasured = powerMeasured.indexOf(Math.max(...powerMeasured));
    const measuredVmp = measured_voltage[maxPowerIndexMeasured];
    const measuredImp = measured_current[maxPowerIndexMeasured];
    const measuredPmp = measuredVmp * measuredImp;

    const measuredData = {
      voc: measuredVoc,
      isc: measuredIsc,
      vmp: measuredVmp,
      imp: measuredImp,
      power: measuredPmp
    };

    // Update the module table with the measured column
    updateMeasuredColumn(measuredData);
  }
  document.getElementById('user-data-modal').classList.add('hidden');
});

document.getElementById('detect-anomaly').addEventListener('click', async () => {
  if (!window.currentChart) return;

  // Get measured data from the chart
  const measuredSeriesObj = measuredSeries[0];
  if (!measuredSeriesObj) {
    document.getElementById('anomaly-output').innerText = 'Please upload measured data.';
    return;
  }

  const measured_voltage = measuredSeriesObj.data.map(pt => pt.x);
  const measured_current = measuredSeriesObj.data.map(pt => pt.y);

  // Get modeled data
  const modeledSeries = window.currentChart.w.globals.initialSeries.filter(s => s.name === 'IV Curve')[0];
  if (!modeledSeries || !modeledSeries.data || !modeledSeries.data.length) {
    document.getElementById('anomaly-output').innerText = 'Modeled data is not available for anomaly detection.';
    return;
  }

  const modeled_voltage = modeledSeries.data.map(pt => pt.x);
  const modeled_current = modeledSeries.data.map(pt => pt.y);

  // Send to backend for anomaly detection
  const response = await fetch('/api/detect-anomaly/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      measured_voltage,
      measured_current,
      modeled_voltage,
      modeled_current,
      module_type_code: 0
    })
  });
  const data = await response.json();

  // Updated logic for output:
  const outputEl = document.getElementById('anomaly-output');
  if (data.anomaly) {
    if (data.anomaly === 'Healthy') {
      // Show green check icon
      outputEl.innerHTML = `✅ No Anomaly Detected`;
    } else {
      // Show yellow warning icon and custom text
      outputEl.innerHTML = `⚠️ Possible Anomaly: ${data.anomaly}`;
    }
  } else if (data.error) {
    outputEl.innerText = data.error;
  }
});

function updateMeasuredColumn(measuredData) {
  const table = document.querySelector('#module-info-table');
  const headerRow = table.querySelector('thead tr');
  const rows = table.querySelectorAll('tbody tr');

  if (measuredData) {
    // Add Measured column if missing
    if (headerRow.cells.length < 3) {
      const th = document.createElement('th');
      th.innerText = 'Measured';
      headerRow.appendChild(th);

      rows.forEach(row => {
        const measuredCell = document.createElement('td');
        measuredCell.innerText = '-';
        row.appendChild(measuredCell);
      });
    }

    // Update Measured values
    const labelsToUpdate = ['Power (W)', 'Voc (V)', 'Isc (A)', 'Vmp (V)', 'Imp (A)'];
    rows.forEach(row => {
      const label = row.cells[0].innerText;
      if (labelsToUpdate.includes(label)) {
        let measuredValue;
        switch (label) {
          case 'Power (W)': measuredValue = measuredData.power; break;
          case 'Voc (V)': measuredValue = measuredData.voc; break;
          case 'Isc (A)': measuredValue = measuredData.isc; break;
          case 'Vmp (V)': measuredValue = measuredData.vmp; break;
          case 'Imp (A)': measuredValue = measuredData.imp; break;
        }
        row.cells[2].innerText = measuredValue.toFixed(2);
      }
    });
  } else {
    // Remove Measured column
    if (headerRow.cells.length === 3) {
      headerRow.removeChild(headerRow.lastChild);
      rows.forEach(row => {
        row.removeChild(row.lastChild);
      });
    }
  }
}

// Helper function to convert dataURI to a real PNG Blob
function dataURItoBlob(dataURI) {
  const byteString = atob(dataURI.split(',')[1]);
  const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mimeString });
}

// Helper: remove any existing listener by cloning the button
function removeExistingListeners(buttonId) {
  const oldEl = document.getElementById(buttonId);
  const newEl = oldEl.cloneNode(true);
  oldEl.parentNode.replaceChild(newEl, oldEl);
}

removeExistingListeners('download-plot');
document.getElementById('download-plot').addEventListener('click', async () => {
  if (!window.currentChart) {
    alert('No chart to export!');
    return;
  }

  const { imgURI } = await window.currentChart.dataURI();
  const link = document.createElement('a');
  const chartTitle = `${currentManufacturer} - ${currentModel}`.replace(/[^a-zA-Z0-9]/g, '_');
  link.download = `${chartTitle}.png`;
  link.href = imgURI;
  link.click();
});

removeExistingListeners('copy-plot');
document.getElementById('copy-plot').addEventListener('click', async () => {
  if (!window.currentChart) {
    alert('No chart to export!');
    return;
  }

  const { imgURI } = await window.currentChart.dataURI();
  const realBlob = dataURItoBlob(imgURI);

  if (navigator.clipboard && window.ClipboardItem) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': realBlob })
      ]);
      alert('Plot copied to clipboard!');
    } catch (err) {
      console.warn('Clipboard API failed:', err);
      alert('Could not copy to clipboard.');
    }
  } else {
    alert('Clipboard API not supported.');
  }
});

document.addEventListener('DOMContentLoaded', initPVChart);
