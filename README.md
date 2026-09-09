# JARVIS

JARVIS é um lançador de perfis configurável feito com Electron, React e Vite.

Ele ajuda a preparar qualquer contexto de uso:

- abre aplicativos configurados;
- abre um navegador com a URL escolhida;
- integra com VPNs do Windows;
- acompanha uma rotina opcional com horários e notificações;
- permite nomear o perfil para estudo, foco, atendimento, live, manutenção ou uso pessoal.

## Scripts

```bash
npm run dev
npm run lint
npm run test
npm run typecheck
npm run build
npm run dist
```

`npm run build` executa o typecheck antes de gerar o bundle de produção.
`npm run dist` gera o instalador Windows usando a distribuição local do Electron.
