// modelData.js

export const fetchModuleData = async () => {
    const url = 'https://raw.githubusercontent.com/streetplantsolar/pv_ivy_web/refs/heads/main/module_db.csv';
    try {
        const response = await fetch(url);
        const text = await response.text();
        const [headerLine, ...lines] = text.trim().split("\n");
        const headers = headerLine.split(",").map(h => h.trim());

        const rows = lines.map(line => {
            const cols = line.split(",");
            const row = {};
            headers.forEach((h, i) => {
                row[h] = isNaN(cols[i]) ? cols[i]?.trim() : parseFloat(cols[i]);
            });
            return row;
        });

        console.log("Parsed module data:", rows);
        return rows;
    } catch (e) {
        console.error("Failed to fetch module data:", e);
        return [];
    }
};
