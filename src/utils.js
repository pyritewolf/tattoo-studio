export const parseCoin = number => number.toLocaleString('es-ar', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 2});
