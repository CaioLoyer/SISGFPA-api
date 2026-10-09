import { stopServers } from './servers.js'

let passed = 0

/** Executa um passo do teste, imprimindo ✔/✘ e repassando a falha. */
export async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    passed++
    console.log(`  ✔ ${name}`)
  } catch (error) {
    console.error(`  ✘ ${name}\n    ${(error as Error).message}`)
    throw error
  }
}

export const passedCount = () => passed

/** Roda o script principal e garante que os servidores filhos sejam encerrados. */
export function runMain(main: () => Promise<void>) {
  main()
    .then(() => {
      stopServers()
      process.exit(0)
    })
    .catch((error) => {
      console.error(error)
      stopServers()
      process.exit(1)
    })
}
