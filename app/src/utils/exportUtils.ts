import { saveAs } from 'file-saver';

/**
 * Standard CSV Export System
 * Centralized logic for all report downloads
 */
export function exportToCSV(data: any[], filename: string, columns: { header: string; key: string; transform?: (val: any) => string }[]) {
  const csvHeaders = columns.map(col => col.header).join(';');
  const csvRows = data.map(row => {
    return columns.map(col => {
      let val = row[col.key];
      if (col.transform) val = col.transform(val);
      
      // Clean data for CSV
      const stringVal = String(val || '').replace(/;/g, ',').replace(/\n/g, ' ');
      return `"${stringVal}"`;
    }).join(';');
  });

  const csvContent = [csvHeaders, ...csvRows].join('\n');
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' });
  saveAs(blob, `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
}
