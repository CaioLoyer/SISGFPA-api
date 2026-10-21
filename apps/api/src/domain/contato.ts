import { prisma } from '@sisgfpa/database'
import { BusinessRuleError, NotFoundError } from '@sisgfpa/http'
import type { PapelContato } from '@sisgfpa/types'

/** Garante que um título novo ou editado escolha um contato ativo do papel correto. */
export async function buscarContatoAtivo(id: string, papel: PapelContato) {
  const contato = await prisma.contato.findUnique({ where: { id } })
  if (!contato) throw new NotFoundError('Contato não encontrado')
  if (!contato.ativo || !contato.papeis.includes(papel)) {
    throw new BusinessRuleError('CONTATO_INDISPONIVEL', 'Selecione um contato ativo do tipo correspondente')
  }
  return contato
}
