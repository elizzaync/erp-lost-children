/** Tipos del dominio Entregas. */

export interface EntregaRaw {
  id: number;
  fecha: string;
  persona_id: number;
  nino?: string | null;
  persona_tipo?: string | null;
  articulo?: string | null;
  articulo_categoria?: string | null;
  unidad?: string | null;
  articulo_id: number;
  cantidad: number | string;
  campana?: string | null;
  notas?: string | null;
  inicial?: string | null;
  avatar_bg?: string | null;
  avatar_fg?: string | null;
  bg_color?: string | null;
  fg_color?: string | null;
}

export interface Entrega {
  id: number;
  fecha: string;
  personaId: number;
  nino: string;
  personaTipo: string;
  articulo: string;
  articuloCategoria: string;
  unidad: string;
  articuloId: number;
  cantidad: number;
  campana: string;
  notas: string;
  inicial: string;
  avatarBg: string;
  avatarFg: string;
  campBg: string;
  campFg: string;
}
