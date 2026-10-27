# JARVIS

JARVIS é um aplicativo desktop para Windows que automatiza a preparação de ambientes de uso.

Ele permite configurar um perfil com aplicativos, navegador, abas iniciais, VPN e rotina de horários. Ao ativar esse perfil, o app executa as ações configuradas e acompanha o estado da rotina em uma interface única.

## Contexto e proposta

Iniciar uma atividade costuma envolver pequenas tarefas repetitivas: abrir os mesmos aplicativos, acessar uma página específica, conectar uma VPN e lembrar os horários da rotina. O JARVIS transforma esse preparo em um fluxo configurável.

O projeto não depende de um contexto pessoal específico. Um perfil pode representar um ambiente de trabalho, estudo, atendimento, live, manutenção ou qualquer rotina que precise ser iniciada de forma consistente.

## Funcionalidades principais

* Configuração de perfil com nome e descrição.
* Personalização visual com cor sólida ou gradiente.
* Seleção manual de aplicativos executáveis.
* Detecção de aplicativos do Menu Iniciar, Microsoft Store (incluindo o novo Teams), registro do Windows e pastas de instalação.
* Busca dos aplicativos detectados por nome, executável ou caminho.
* Inicialização automática dos aplicativos configurados.
* Seleção de navegador detectado no sistema.
* Abertura automática de várias abas, com opção de adicionar e remover URLs.
* Seções das configurações recolhidas ao abrir o painel.
* Detecção de conexões VPN do Windows.
* Integração com VPN usando ferramentas nativas do Windows.
* Automação auxiliar do pop-up de VPN usando Python separado.
* Rotina opcional com início, pausa, retorno e encerramento.
* Pausa intermediária opcional.
* Suporte a rotinas que atravessam a meia-noite.
* Notificações personalizadas para eventos da rotina.
* Persistência local das configurações.
* Encerramento apenas dos processos iniciados pelo próprio JARVIS.
* Exibição de avisos quando parte do perfil falha ao iniciar ou encerrar.

## Fluxo de execução

Ao ativar um perfil, o JARVIS:

1. valida a configuração atual;
2. solicita/conecta a VPN configurada, quando habilitada;
3. abre o navegador com as abas configuradas, quando habilitado;
4. inicia os aplicativos configurados;
5. ativa o acompanhamento da rotina, quando habilitado;
6. mostra avisos caso alguma etapa falhe parcialmente.

Ao desativar o perfil, o app tenta desconectar a VPN configurada e encerrar os processos que foram iniciados por ele durante aquela sessão.

Ao fechar a janela principal pelo X ou por Alt+F4, o JARVIS encerra também a janela oculta de notificações, os agendamentos e os processos auxiliares. Os processos do perfil ainda rastreados são encerrados e as VPNs cuja conexão foi solicitada pelo JARVIS são desconectadas. Aplicativos da Microsoft Store que já estavam abertos antes da ativação são preservados.

A detecção de executáveis procura nas pastas de instalação mais comuns, no Desktop e nos locais registrados pelos instaladores, com limites de tempo e profundidade. Executáveis portáteis em outras pastas podem ser adicionados pelo botão de adicionar aplicativo.

## Demonstração da aplicação

<p align="center">
  <img src="docs/screenshots/home.png" alt="Tela inicial do JARVIS" width="320" />
  <img src="docs/screenshots/settings-overview.png" alt="Configurações de perfil e aplicativos do JARVIS" width="320" />
</p>

<p align="center">
  <img src="docs/screenshots/settings-routine.png" alt="Configuração de rotina do JARVIS" width="320" />
  <img src="docs/screenshots/settings-notifications.png" alt="Configurações de notificações do JARVIS" width="320" />
</p>

## Arquitetura da aplicação

O projeto é dividido entre o processo principal do Electron, a interface em React e um preload script que controla a comunicação entre os dois lados.

```text
JARVIS
├── electron/
│   ├── main.cjs       # Janelas, IPC, processos, VPN, notificações e persistência
│   └── preload.cjs    # API controlada exposta ao renderer
├── src/
│   ├── App.tsx        # Orquestração da interface e fluxo de ativação
│   ├── config.ts      # Configuração padrão e normalização no renderer
│   ├── time.ts        # Cálculo da rotina e validação de horários
│   ├── components/    # Componentes visuais da aplicação
│   └── *.test.ts      # Testes unitários
├── public/            # Ícones estáticos
├── scripts/           # Scripts auxiliares de execução
└── package.json       # Scripts, dependências e configuração de empacotamento
```

### Processo principal do Electron

O arquivo `electron/main.cjs` concentra as integrações com o sistema operacional. Ele cria as janelas, registra os handlers IPC, salva e carrega a configuração local, detecta aplicativos e navegadores, interage com VPNs do Windows e agenda notificações.

Também é nele que os processos iniciados pelo JARVIS são rastreados por PID. Isso permite que a desativação do perfil tente encerrar apenas o que o próprio aplicativo abriu, reduzindo o risco de fechar programas que o usuário já estava usando antes.

### Renderer React

A interface fica em `src/`. O `App.tsx` coordena o estado principal, a abertura do painel de configurações, o fluxo de ativação/desativação e a exibição de avisos. Os componentes em `src/components/` cuidam da tela de configurações, contador da rotina, editor de mensagens e janela de notificação.

### Preload e comunicação IPC

O `electron/preload.cjs` expõe uma API limitada em `window.jarvis`. O renderer não acessa APIs Node.js diretamente; ele chama métodos controlados que passam pelo IPC do Electron.

## Segurança e isolamento

O projeto usa algumas medidas de endurecimento comuns em aplicações Electron:

* `contextIsolation` ativado.
* `nodeIntegration` desativado.
* `sandbox` ativado nas janelas.
* `webSecurity` ativado.
* Content Security Policy definida no HTML.
* Bloqueio de `window.open`.
* Bloqueio de navegação para fora da origem esperada.
* API do preload limitada às ações necessárias.
* Sanitização de configurações antes de salvar ou executar ações.
* Validação de caminhos executáveis, URLs HTTP/HTTPS e nomes de VPN.
* Encerramento de processos baseado em PIDs rastreados.

Esses mecanismos não tornam o app seguro de forma absoluta, mas reduzem a superfície de exposição entre interface, Electron e sistema operacional.

## Persistência de dados

As configurações são salvas em um arquivo `config.json` dentro do diretório `userData` do Electron, em uma subpasta `JARVIS`.

No desenvolvimento, o projeto isola esse diretório em `.jarvis-dev/user-data` para evitar conflitos com o cache do Electron e com instalações locais do aplicativo.

## Rotina e notificações

A rotina é opcional e pode ser configurada com:

* horário de início;
* horário de pausa;
* horário de retorno;
* horário de encerramento.

A pausa intermediária pode ser desativada. Quando isso acontece, a rotina passa a considerar apenas início e fim. A lógica de tempo também aceita rotinas que atravessam a meia-noite, como um período começando à noite e terminando na manhã seguinte.

As notificações podem ter mensagens personalizadas por evento e duração configurável.

## Tecnologias utilizadas

* Electron
* React
* Vite
* TypeScript
* Vitest
* Oxlint
* Electron Builder
* APIs nativas do Windows: atalhos do Menu Iniciar, `rasphone.exe`, `rasdial.exe` e `taskkill`
* Helper Python opcional para acionar o pop-up nativo de VPN.

## Pré-requisitos

* Windows
* Node.js compatível com as dependências do projeto
* npm
* Python com launcher `py` para a automação auxiliar da VPN

## Execução em ambiente de desenvolvimento

Instale as dependências:

```bash
npm install
```

Instale as dependências Python da automação de VPN:

```bash
npm run vpn:auto:install
```

As imagens usadas pela automação de VPN ficam em:

```text
electron/vpn-auto/images/
```

O helper procura primeiro por recortes chamados `connect_button*` para clicar no botão
`Conectar`. Se a imagem não for encontrada na tela, ele usa os fallbacks de `Enter` e
clique por coordenada.

Inicie em modo desenvolvimento:

```bash
npm run dev
```

## Build e distribuição

Gere o build web usado pelo Electron:

```bash
npm run build
```

Gere o instalador Windows:

```bash
npm run dist
```

O instalador é criado em:

```text
release/
```

## Qualidade e testes

Scripts disponíveis:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run dist
npm audit
```

Os testes unitários atuais cobrem:

* normalização de configurações salvas;
* preenchimento de valores padrão;
* rejeição de valores malformados;
* cálculo da rotina com pausa;
* cálculo da rotina sem pausa;
* rotinas que atravessam a meia-noite;
* validação de horários inválidos.
* validação de executáveis e identificadores de aplicativos da Microsoft Store;
* encerramento da janela principal com notificações ocultas e comandos pendentes;
* encerramento das árvores de processos auxiliares e bloqueio de novas tarefas durante a saída.

## Decisões de arquitetura

* Electron foi usado para permitir uma interface desktop com acesso controlado a recursos do Windows.
* React concentra a experiência visual e o estado da interface.
* O preload evita que o renderer acesse Node.js diretamente.
* A comunicação IPC separa comandos de sistema da interface.
* A configuração é normalizada tanto no renderer quanto no processo principal.
* O gerenciamento de processos usa PIDs armazenados durante a ativação do perfil.
* A rotina trabalha com segundos do dia e normalização de horários para lidar com virada de meia-noite.

## Desafios técnicos

* Integrar React e Electron mantendo uma fronteira clara entre UI e sistema operacional.
* Detectar aplicativos instalados no Windows a partir de atalhos do Menu Iniciar.
* Interagir com VPNs usando ferramentas nativas sem armazenar credenciais.
* Tratar rotinas que atravessam a meia-noite sem quebrar o contador.
* Encerrar processos iniciados pelo app sem afetar programas abertos manualmente pelo usuário.

## Autor

Gustavo Pontes da Silva
