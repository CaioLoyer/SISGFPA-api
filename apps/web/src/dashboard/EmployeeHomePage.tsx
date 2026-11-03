import { Link } from 'react-router-dom'

import { useSession } from '../auth/session-context'
import { Icon } from '../shared/Icon'
import type { IconName } from '../shared/Icon'
import { PageHeader } from '../shared/PageHeader'
import './employee-home.css'

const shortcuts: { to: string; icon: IconName; title: string; description: string }[] = [
  {
    to: '/comercial',
    icon: 'mail',
    title: 'Comercial',
    description: 'Clientes, fornecedores e contatos da papelaria.',
  },
  {
    to: '/perfil',
    icon: 'user',
    title: 'Meu perfil',
    description: 'Consulte seus dados e altere sua senha.',
  },
  {
    to: '/chatbot',
    icon: 'bot',
    title: 'Chatbot',
    description: 'Abra suas conversas com o assistente.',
  },
]

export function EmployeeHomePage() {
  const { user } = useSession()
  if (!user) return null

  return (
    <section className="employee-home" aria-label="Início">
      <PageHeader title={`Olá, ${user.name}`} description="Escolha uma área para começar." />
      <div className="employee-home-content">
        <section className="employee-welcome" aria-labelledby="employee-welcome-title">
          <div className="employee-welcome-icon">
            <Icon name="home" />
          </div>
          <div>
            <h2 id="employee-welcome-title">Bem-vindo à Mil Folhas</h2>
            <p>Use os atalhos abaixo ou o menu para acessar o sistema.</p>
          </div>
        </section>

        <section aria-labelledby="employee-shortcuts-title">
          <h2 className="employee-section-title" id="employee-shortcuts-title">
            Acesso rápido
          </h2>
          <div className="employee-shortcuts">
            {shortcuts.map((shortcut) => (
              <Link className="employee-shortcut" key={shortcut.to} to={shortcut.to}>
                <span className="employee-shortcut-icon">
                  <Icon name={shortcut.icon} />
                </span>
                <strong>{shortcut.title}</strong>
                <span>{shortcut.description}</span>
                <Icon className="employee-shortcut-arrow" name="arrow" />
              </Link>
            ))}
          </div>
        </section>

        <p className="employee-access-note">
          As operações disponíveis seguem as permissões definidas para sua conta.
        </p>
      </div>
    </section>
  )
}
