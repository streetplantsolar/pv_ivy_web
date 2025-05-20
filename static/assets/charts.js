// ApexCharts is loaded globally via the <script> tag.

const fetchCSVData = async () => {
    const url = 'https://raw.githubusercontent.com/streetplantsolar/pv_ivy_web/refs/heads/main/module_db.csv';
    try {
        const response = await fetch(url);
        const data = await response.text();
        console.log('CSV Data Fetched Successfully');
        return data;
    } catch (error) {
        console.error('Error fetching CSV data:', error);
        return null;
    }
};

const processCSVData = (data) => {
    console.log('Processing CSV Data');
    const rows = data.split('\n').slice(1);
    const modules = rows.map(row => {
        const cols = row.split(',');

        if (cols.length < 3) {
            console.warn('Skipping incomplete row:', row);
            return null;
        }

        const manufacturer = cols[1]?.trim();
        const model = cols[0]?.trim();
        const technology = cols[2]?.trim();

        console.log(`Manufacturer: ${manufacturer}, Model: ${model}, Technology: ${technology}`);

        return {
            manufacturer: manufacturer,
            model: model,
            technology: technology,
            I_L_ref: parseFloat(cols[21]) || 0,
            I_o_ref: parseFloat(cols[22]) || 0,
            R_s: parseFloat(cols[23]) || 0,
            R_sh_ref: parseFloat(cols[24]) || 0,
            Adjust: parseFloat(cols[25]) || 0
        };
    }).filter(Boolean);

    console.log('Data Processed:', modules);
    return modules;
};

const renderPVChart = (modules, manufacturer, model) => {
    console.log('Rendering Chart for:', manufacturer, model);
    const selectedModule = modules.find(m => m.manufacturer === manufacturer && m.model === model);

    if (!selectedModule) {
        console.warn('No module found for selection:', manufacturer, model);
        return;
    }

    console.log('Selected Module Data:', selectedModule);

    const { I_L_ref, I_o_ref, R_s, R_sh_ref } = selectedModule;

    // Verify numerical data
    console.log('Data Points - I_L_ref:', I_L_ref, 'I_o_ref:', I_o_ref, 'R_s:', R_s, 'R_sh_ref:', R_sh_ref);

    const scatterData = [
        { x: 0, y: I_L_ref },
        { x: R_s, y: I_L_ref - R_s * I_o_ref },
        { x: R_sh_ref, y: 0 }
    ];

    console.log('Scatter Data for Chart:', scatterData);

    const options = {
        chart: {
            type: 'scatter',
            height: 420,
            toolbar: { show: false }
        },
        series: [
            {
                name: 'IV Curve',
                data: scatterData
            }
        ],
        xaxis: {
            title: { text: 'Voltage (V)' }
        },
        yaxis: {
            title: { text: 'Current (A)' }
        }
    };

    const chartDiv = document.getElementById('pv-iv-chart');
    if (chartDiv) {
        const chart = new ApexCharts(chartDiv, options);
        chart.render();
    }
};

const initPVChart = async () => {
    console.log('Initializing PV Chart');
    const csvData = await fetchCSVData();
    if (!csvData) return;
    const modules = processCSVData(csvData);

    const makeSelect = document.getElementById('make-select');
    const modelSelect = document.getElementById('model-select');

    makeSelect.addEventListener('change', () => {
        const selectedManufacturer = makeSelect.value;
        console.log('Selected Manufacturer:', selectedManufacturer);
        const filteredModels = modules.filter(m => m.manufacturer === selectedManufacturer).map(m => m.model);
        modelSelect.innerHTML = `<option value="">Select Model</option>` + filteredModels.map(model => `<option value="${model}">${model}</option>`).join('');
    });

    modelSelect.addEventListener('change', () => {
        const selectedManufacturer = makeSelect.value;
        const selectedModel = modelSelect.value;
        console.log('Selected Model:', selectedModel);
        renderPVChart(modules, selectedManufacturer, selectedModel);
    });

    const uniqueManufacturers = [...new Set(modules.map(m => m.manufacturer))];
    console.log('Unique Manufacturers:', uniqueManufacturers);
    makeSelect.innerHTML = `<option value="">Select Manufacturer</option>` + uniqueManufacturers.map(make => `<option value="${make}">${make}</option>`).join('');
};

document.addEventListener('DOMContentLoaded', initPVChart);
