import { fetchModuleData } from './modelData.js';

let currentChart = null;
let currentManufacturer = null;
let currentModel = null;

const renderPVChart = async (manufacturer, model) => {
    // Get input values and validate
    const irrInput = document.getElementById('irradiance-input');
    const tempInput = document.getElementById('temperature-input');
    const modsInput = document.getElementById('modules-input');

    let irradiance = parseFloat(irrInput.value);
    let temperature = parseFloat(tempInput.value);
    let modules = parseInt(modsInput.value);

    // Clamp to safe ranges
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
    
    const url = `/api/iv-curve/?manufacturer=${encodeURIComponent(manufacturer)}&model=${encodeURIComponent(model)}&temp=${temperature}&irradiance=${irradiance}&modules=${modules}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.voltage || !data.current) {
        console.warn('Invalid IV curve response:', data);
        return;
    }

    const ivData = data.voltage.map((v, i) => ({ x: v, y: data.current[i] }));

    const options = {
        chart: {
            type: 'line',
            height: 420,
            toolbar: { show: false }
        },
        series: [{
            name: 'IV Curve',
            data: ivData
        }],
        xaxis: {
            title: { text: 'Voltage (V)' },
            labels: {
                formatter: function (val) {
                    return val.toFixed(2);
                }
            }
        },
        yaxis: {
            title: { text: 'Current (A)' },
            labels: {
                formatter: function (val) {
                    return val.toFixed(2);
                }
            }
        },
        tooltip: {
            y: {
                formatter: function (val) {
                    return val.toFixed(2);
                }
            },
            x: {
                formatter: function (val) {
                    return val.toFixed(2);
                }
            }
        }
    };

    const chartDiv = document.getElementById('pv-iv-chart');
    if (chartDiv) {
        if (window.currentChart) {
            window.currentChart.destroy();
        }
        window.currentChart = new ApexCharts(chartDiv, options);
        window.currentChart.render();
    }
};

const initPVChart = async () => {
    const modules = await fetchModuleData();
    console.log("Parsed Module Data:", modules);

    const makeSelect = document.getElementById('make-select');
    const modelSelect = document.getElementById('model-select');

    const uniqueManufacturers = [...new Set(modules.map(m => m.Manufacturer))];
    makeSelect.innerHTML = `<option value="">Select Manufacturer</option>` +
        uniqueManufacturers.map(m => `<option value="${m}">${m}</option>`).join("");

    makeSelect.addEventListener('change', () => {
        const selected = makeSelect.value;
        const models = modules
            .filter(m => m.Manufacturer === selected)
            .map(m => m.Model);

        modelSelect.innerHTML = `<option value="">Select Model</option>` +
            models.map(m => `<option value="${m}">${m}</option>`).join("");
    });

    modelSelect.addEventListener('change', () => {
        const manufacturer = makeSelect.value;
        const model = modelSelect.value;
        const selected = modules.find(m => m.Manufacturer === manufacturer && m.Model === model);
        if (selected) {
            currentManufacturer = manufacturer;
            currentModel = model;
            renderPVChart(manufacturer, model);
            updateModuleTable(selected);
        }
    });

    // Bind input listeners once (globally), use currentModel/manufacturer
    ['irradiance-input', 'temperature-input', 'modules-input'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            if (currentManufacturer && currentModel) {
                renderPVChart(currentManufacturer, currentModel);
            }
        });
    });
};

function updateModuleTable(module) {
    const tableBody = document.querySelector('#module-info-table tbody');
    tableBody.innerHTML = ''; // Clear previous rows

    const rows = [
        ['Model', module.Model],
        ['Manufacturer', module.Manufacturer],
        ['Technology', module.Technology],
        ['Power (W)', module.STC],
        ['Voc (V)', module.V_oc_ref],
        ['Isc (A)', module.I_sc_ref],
        ['Vmp (V)', module.V_mp_ref],
        ['Imp (A)', module.I_mp_ref],
    ];

    rows.forEach(([label, value]) => {
        const row = `<tr><td>${label}</td><td>${value}</td></tr>`;
        tableBody.insertAdjacentHTML('beforeend', row);
    });
}

document.addEventListener('DOMContentLoaded', initPVChart);
document.getElementById('reset-stc').addEventListener('click', () => {
  document.getElementById('irradiance-input').value = 1000;
  document.getElementById('temperature-input').value = 25;
  document.getElementById('modules-input').value = 1;
});
