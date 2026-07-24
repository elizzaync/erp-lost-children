/** Selectores derivados — réplica pura de getKPIs() y getAlertasActivas() de
 *  js/db.js. Separados del store para poder testearlos sin red ni estado. */
import type { Alerta, KPIs, StoreData } from './store-types';

export function getKPIs(data: StoreData): KPIs {
  return {
    presentes: data.asistencia.filter((a) => a.presente).length,
    gastoMes: data.gastos.reduce((s, g) => s + g.monto, 0),
    almuerzosMes: data.serviciosAlimentacion.reduce((s, x) => s + x.total, 0),
    entregasMes: data.entregas.length,
    criticos: data.articulos.filter((a) => a.stock < a.minimo).length,
    ninos: data.personas.filter((p) => p.tipo === 'nino').length,
  };
}

export function getAlertasActivas(data: StoreData): Alerta[] {
  const alertas: Alerta[] = [];

  const criticos = data.articulos.filter((a) => a.stock < a.minimo);
  if (criticos.length) {
    alertas.push({
      tipo: 'danger',
      texto: `${criticos.map((a) => a.nombre).join(', ')} bajo el mínimo`,
      sub: `${criticos.length} artículo${criticos.length > 1 ? 's' : ''} por agotarse`,
      link: 'almacen',
    });
  }

  for (const p of data.personas.filter((p) => p.estado === 'alerta')) {
    alertas.push({
      tipo: 'warn',
      texto: `${p.nombre} no asiste hace 8 días`,
      sub: 'Posible deserción · contactar al tutor',
      link: 'personas',
    });
  }

  const sinZK = data.personas.filter(
    (p) => ['nino', 'padre'].includes(p.tipo) && p.estado === 'activo' && !p.zkUserId,
  ).length;
  if (sinZK > 0) {
    alertas.push({
      tipo: 'primary',
      texto: `${sinZK} persona${sinZK > 1 ? 's' : ''} sin enrolamiento facial`,
      sub: 'Sin ZK user ID asignado · ir a Marcado',
      link: 'marcado',
    });
  }

  return alertas;
}
