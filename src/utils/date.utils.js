exports.formatDate = (date, format = 'iso') => {
  const d = new Date(date);
  
  switch (format) {
    case 'iso':
      return d.toISOString();
    case 'short':
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    case 'long':
      return d.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    case 'date-only':
      return d.toISOString().split('T')[0];
    default:
      return d.toISOString();
  }
};

exports.getDateRange = (range) => {
  const end = new Date();
  const start = new Date();
  
  switch (range) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      break;
    case 'yesterday':
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      break;
    case 'this-week':
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1);
      start.setDate(diff);
      start.setHours(0, 0, 0, 0);
      break;
    case 'last-7-days':
      start.setDate(start.getDate() - 7);
      break;
    case 'last-30-days':
      start.setDate(start.getDate() - 30);
      break;
    case 'this-month':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'last-month':
      start.setMonth(start.getMonth() - 1, 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(0); // Last day of previous month
      end.setHours(23, 59, 59, 999);
      break;
    default:
      start.setDate(start.getDate() - 7); // Default to last 7 days
  }
  
  return { start, end };
};

exports.isValidDate = (date) => {
  return date instanceof Date && !isNaN(date.getTime());
};

exports.daysBetween = (date1, date2) => {
  const diff = Math.abs(new Date(date2) - new Date(date1));
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};
