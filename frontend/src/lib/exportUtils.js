/**
 * Exports data to a CSV file and triggers a browser download.
 * @param {Array} data - Array of objects to export.
 * @param {string} fileName - Name of the file (without extension).
 * @param {Object} headersMap - Optional mapping of keys to header labels (e.g., { id: "Transaction ID" }).
 */
export const exportToCSV = (data, fileName, headersMap = null) => {
    if (!data || !data.length) return;

    // 1. Prepare Headers
    const keys = Object.keys(data[0]);
    const headers = headersMap
        ? keys.map(key => headersMap[key] || key)
        : keys;

    // 2. Convert Data to Rows
    const csvContent = [
        headers.join(','), // Header row
        ...data.map(item =>
            keys.map(key => {
                let cell = item[key] === null || item[key] === undefined ? "" : item[key];
                // Handle strings with commas by wrapping in quotes
                cell = typeof cell === 'string' ? `"${cell.replace(/"/g, '""')}"` : cell;
                return cell;
            }).join(',')
        )
    ].join('\n');

    // 3. Trigger Download (Add BOM for Excel UTF-8 support)
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `${fileName}_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};
