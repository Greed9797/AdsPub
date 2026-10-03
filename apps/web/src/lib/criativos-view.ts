import type { Asset } from './types';

export type EstadoDaMidia = 'aprovada' | 'com_aviso' | 'recusada';

export interface ContagemDeMidias {
  total: number;
  aprovadas: number;
  comAviso: number;
  recusadas: number;
}

export interface QuadroDeValidacao extends ContagemDeMidias {
  /** Aprovadas e com aviso: o que pode entrar num lote. */
  utilizaveis: number;
  imagens: ContagemDeMidias;
  videos: ContagemDeMidias;
}

export type FiltroDeMidia = 'todas' | 'aprovadas' | 'com_aviso' | 'recusadas';

/** Mídia com aviso continua utilizável: o aviso não impede o anúncio. */
export function estadoDaMidia(asset: Pick<Asset, 'validation'>): EstadoDaMidia {
  if (asset.validation.status === 'rejected') return 'recusada';
  return asset.validation.warnings.length > 0 ? 'com_aviso' : 'aprovada';
}

function contar(assets: readonly Pick<Asset, 'validation'>[]): ContagemDeMidias {
  const contagem = { total: assets.length, aprovadas: 0, comAviso: 0, recusadas: 0 };
  for (const asset of assets) {
    const estado = estadoDaMidia(asset);
    if (estado === 'aprovada') contagem.aprovadas += 1;
    else if (estado === 'com_aviso') contagem.comAviso += 1;
    else contagem.recusadas += 1;
  }
  return contagem;
}

export function quadroDeValidacao(assets: readonly Pick<Asset, 'kind' | 'validation'>[]): QuadroDeValidacao {
  const geral = contar(assets);
  return {
    ...geral,
    utilizaveis: geral.aprovadas + geral.comAviso,
    imagens: contar(assets.filter((a) => a.kind === 'image')),
    videos: contar(assets.filter((a) => a.kind === 'video')),
  };
}

export function lerFiltroDeMidia(valor: string | undefined): FiltroDeMidia {
  return valor === 'aprovadas' || valor === 'com_aviso' || valor === 'recusadas' ? valor : 'todas';
}

export function filtrarMidias<T extends Pick<Asset, 'validation'>>(assets: readonly T[], filtro: FiltroDeMidia): T[] {
  if (filtro === 'todas') return [...assets];
  const alvo: EstadoDaMidia = filtro === 'aprovadas' ? 'aprovada' : filtro === 'com_aviso' ? 'com_aviso' : 'recusada';
  return assets.filter((asset) => estadoDaMidia(asset) === alvo);
}
