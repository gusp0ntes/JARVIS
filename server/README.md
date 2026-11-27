# JARVIS API

A API independente oferece autenticação, edição da conta e armazenamento de perfis portáteis do JARVIS. A interface React chama o processo principal do Electron via `window.jarvis` e `contextBridge`. O processo principal faz as requisições da conta e usa o `config.json` como fonte das automações. O tema local é carregado antes de exibir o formulário da conta.

```text
server/
├── src/app.ts            # Express, cabeçalhos de segurança e respostas HTTP
├── src/server.ts         # Inicialização e encerramento do serviço
├── src/config/          # Variáveis de ambiente e conexão Mongoose
├── src/http/            # Respostas padronizadas de erro
├── src/middlewares/     # Proteção de rotas por sessão
├── src/models/          # Usuários, sessões, perfis e índices MongoDB
├── src/routes/          # Endpoints de autenticação, conta e perfil
├── src/schemas/         # Validação Zod de autenticação e perfil portátil
├── src/services/        # Senhas, tokens e ciclo de vida da sessão
├── tests/               # Validação e integração com MongoDB isolado
└── .env.example        # Modelo para a configuração local
```

## Configuração e execução

Use uma versão LTS do Node.js a partir da 22.21. O backend pode ser iniciado a partir do seu próprio diretório.

```powershell
cd server
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

No Atlas, crie um usuário de banco com a função `readWrite` restrita ao banco `jarvis` e autorize o endereço de saída da máquina ou do serviço que hospeda a API. Em `server/.env`, preencha `MONGODB_URI` com a URI SRV de `jarviscluster.eadisek.mongodb.net`. Codifique os caracteres reservados do usuário e da senha no componente correspondente da URI. Em produção, URIs `mongodb+srv://` usam o TLS padrão do driver, e URIs `mongodb://` exigem `tls=true` ou `ssl=true`. O `.env` fica fora do Git. [Usuários do Atlas](https://www.mongodb.com/docs/atlas/security-add-mongodb-users/) · [Lista de acesso IP](https://www.mongodb.com/docs/atlas/security/ip-access-list/)

| Variável | Valor e finalidade |
| --- | --- |
| `NODE_ENV` | `development`, `test` ou `production`. |
| `HOST` | `127.0.0.1` por padrão. Configure o endereço de escuta na hospedagem. |
| `PORT` | `3001` por padrão. |
| `TRUST_PROXY_HOPS` | `0` por padrão. Use o número de proxies confiáveis em uma topologia com distância fixa até a API. |
| `MONGODB_URI` | URI do banco usada pelo processo Node.js. |
| `JWT_ACCESS_SECRET` | Segredo aleatório com pelo menos 32 caracteres para autenticação. Gere 32 bytes aleatórios codificados em Base64 ou hexadecimal. Alterar o segredo invalida os tokens atuais. |
| `ACCESS_TOKEN_TTL` | `15m` por padrão. Aceita segundos, minutos ou horas com sufixos `s`, `m` ou `h`, até uma hora. |
| `REFRESH_TOKEN_TTL_DAYS` | `30` por padrão. Duração total da sessão a partir do login, entre 1 e 365 dias. |

```powershell
npm run build
npm start
```

De outro terminal, consulte `http://127.0.0.1:3001/api/v1/health`. Para iniciar o desktop a partir da raiz do repositório, use `npm ci` e `npm run dev`.

| Método | Endpoint | Entrada e resposta |
| --- | --- | --- |
| `GET` | `/api/v1/health` | Retorna `200` com `{"data":{"status":"ok"}}` quando o MongoDB responde ao `ping` e `503` se o banco estiver indisponível. |
| `POST` | `/api/v1/auth/register` | Recebe `name`, `email`, `password` e `passwordConfirmation`. Retorna `201` com a conta pública ou `409` com uma mensagem genérica se o cadastro estiver indisponível. |
| `POST` | `/api/v1/auth/login` | Recebe `email` e `password`. Retorna `200` com tokens e dados públicos da conta ou `401` com uma mensagem genérica. |
| `POST` | `/api/v1/auth/refresh` | Recebe `refreshToken`. Retorna `200` com tokens renovados ou `401` se a sessão estiver inválida ou expirada. |
| `POST` | `/api/v1/auth/logout` | Recebe `refreshToken`. Revoga a sessão quando ativa e retorna `204`, inclusive se ela já tiver sido encerrada. |
| `GET` | `/api/v1/users/me` | Recebe `Authorization: Bearer <accessToken>`. Retorna `200` com a conta da sessão ou `401` se o acesso estiver inválido. |
| `PATCH` | `/api/v1/users/me` | Requer sessão autenticada. Aceita `name` ou `email` e pede `currentPassword` para alterar o e-mail. Retorna `200` com a conta atualizada. |
| `GET` | `/api/v1/profiles/me` | Requer sessão autenticada. Retorna `{ profile, revision, updatedAt }` em `data`. Uma conta sem histórico retorna `profile: null` e `revision: 0`. |
| `PUT` | `/api/v1/profiles/me` | Requer sessão autenticada e `{ expectedRevision, profile }`. Retorna `200` com a revisão gravada ou `409` se o perfil tiver mudado. |
| `DELETE` | `/api/v1/profiles/me` | Requer sessão autenticada e `{ expectedRevision }`. Retorna `200` com `profile: null` e a nova revisão ou `409` se a versão confirmada tiver mudado. |

A inicialização valida as variáveis e exige que o MongoDB responda antes de abrir a porta HTTP. Se a conexão inicial falhar, o processo sai com código 1 e uma mensagem de diagnóstico sem valores da URI. As consultas de saúde têm tempo limite. A API usa Helmet e envia `Cache-Control: no-store`. [Conexões Mongoose](https://mongoosejs.com/docs/connections.html) · [Tempo limite do driver MongoDB](https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/csot/)

## Autenticação e sessões

As respostas de sucesso têm envelope `data`, exceto o logout, que retorna sem corpo. A conta pública contém `id`, `name` e `email`. Login e renovação retornam `user`, `accessToken`, `accessTokenExpiresIn` em segundos e `refreshToken`. Erros têm envelope `error`, com `code` e `message`. Erros de validação podem incluir os nomes dos campos em `fields`.

O cadastro normaliza o e-mail e usa um índice único para resolver inclusive cadastros concorrentes. As senhas aceitam de 15 a 128 caracteres Unicode e preservam espaços e caixa. O banco guarda apenas o hash Argon2id. O endpoint de login usa a mesma resposta para e-mail inexistente e senha incorreta. [Armazenamento de senhas da OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

Cada login abre uma família de sessão independente. O JWT de acesso tem validade curta e é aceito enquanto a sessão estiver ativa. O refresh token contém um valor aleatório e uma assinatura com chave derivada para autenticar a família. O MongoDB guarda somente o hash do token atual. A rotação troca esse hash atomicamente. Reapresentar um token antigo autêntico revoga a família e preserva os outros logins da conta. A API confere a expiração em cada uso e o índice TTL remove os registros expirados. [Rotação de refresh tokens](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14.2) · [Índices TTL do MongoDB](https://www.mongodb.com/docs/manual/core/index-ttl/)

Cadastro e login compartilham o limite de 20 solicitações por endereço em 15 minutos. Renovação e logout compartilham o limite de 60 solicitações por endereço por minuto. A resposta `429` inclui `Retry-After`. Os contadores ficam em memória por instância. Uma implantação com múltiplas réplicas deve usar contadores compartilhados. Configure `TRUST_PROXY_HOPS` somente se a API estiver acessível pela cadeia fixa de proxies confiáveis. [Configuração de proxy no Express](https://expressjs.com/en/guide/behind-proxies.html)

## Integração com o desktop

Em desenvolvimento, o Electron usa a origem `http://127.0.0.1:3001` por padrão. Para apontar o desktop de desenvolvimento a outra instância, defina `JARVIS_API_URL` antes de iniciá-lo. Para um instalador, defina essa variável antes de executar `npm run dist` na raiz do repositório. O pacote grava a origem HTTPS pública no aplicativo e o processo principal a usa por padrão. Os dados de acesso ao MongoDB são configurados no servidor.

O desktop aceita chamadas de conta pelo IPC apenas do documento principal da janela principal e limita o tamanho das respostas JSON da API. O renderer recebe o estado da sessão e os dados públicos da conta. O processo principal mantém o JWT em memória e, no Windows, guarda o refresh token criptografado com `safeStorage`, vinculado à origem da API, em `account-state.json`. Quando a criptografia estiver indisponível e for possível remover um registro anterior, a sessão vale somente até fechar o JARVIS. A preferência de visitante usa o mesmo arquivo e permite iniciar o desktop offline. [Armazenamento seguro do Electron](https://www.electronjs.org/docs/latest/api/safe-storage)

O processo principal combina renovações simultâneas em uma só solicitação. Antes de renovar uma sessão persistida, grava um marcador no registro criptografado. Falhas de rede anteriores à conexão preservam a possibilidade de tentar novamente. Se ficar incerto se o servidor consumiu o token, o marcador impede reenviar o token antigo, mesmo após reiniciar. O JARVIS mantém o perfil local disponível e informa quando é preciso entrar novamente. Sair da conta cancela a operação local, remove a sessão do aplicativo e tenta revogá-la no servidor quando há acesso à API.

A edição de nome e e-mail fica em **Configurações → Conta**. A mudança de e-mail pede a senha atual. A recuperação de senha depende de um provedor de e-mail configurado.

## Contrato de sincronização

O schema compartilhado em `src/schemas/profile-contract.cjs` aceita `schemaVersion: 1`, nome e descrição, tema, aplicativos portáteis, navegador com a lista de URLs em ordem, `vpnEnabled`, rotina e notificações. Todo objeto tem campos explícitos. Propriedades desconhecidas, caminhos locais nas referências de aplicativos e dados de conexão da VPN são rejeitados nos dois lados. O instalador inclui esse contrato e exclui o serviço do backend.

Aplicativos da Store usam o identificador de pacote `AppID`. Executáveis tradicionais usam o nome do arquivo com extensão `.exe` e podem incluir um nome de exibição autorizado. O cliente procura correspondências pelos aplicativos descobertos no Windows e pelos executáveis locais ainda disponíveis. A associação manual resolve nomes ambíguos, ausentes ou portáteis. O perfil usa um identificador de navegador conhecido e mantém o caminho escolhido no dispositivo. A recuperação prepara a configuração para a próxima ativação manual.

O contrato aceita URLs HTTP ou HTTPS aprovadas pelo usuário. Parâmetros, fragmentos, credenciais embutidas e padrões reconhecíveis de segredos no caminho ficam de fora. Alguns links legítimos também podem ser excluídos por esse filtro. Um segredo arbitrário ainda pode se parecer com texto comum. O desktop mostra o conteúdo exato do perfil antes do envio, mantém as URLs e os nomes de aplicativos desmarcados inicialmente e preserva as URLs salvas ao enviar o perfil.

O payload de escrita usa `{ expectedRevision, profile }`. A revisão `0` é reservada para uma conta sem registro de perfil. A autenticação determina a identidade do proprietário. A gravação e a exclusão incrementam a revisão atomicamente. A exclusão remove o conteúdo e conserva a revisão para invalidar solicitações antigas mesmo após uma recriação. Uma revisão obsoleta retorna `409` e exige nova revisão na interface. Quando o perfil local e a nuvem têm versões diferentes, o desktop mostra as datas e oferece gravar a versão local ou revisar a versão da nuvem. [Atomicidade de gravações do MongoDB](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/)

No primeiro login com um perfil salvo, o JARVIS oferece revisar o envio, recuperar um perfil existente na nuvem ou manter a configuração local. O `config.json` aceita metadados opcionais de proprietário, revisão e última sincronização, preservados durante novas edições locais. No primeiro envio confirmado, o desktop grava o vínculo local antes de chamar a API. Se houver conflito ou perda de conexão, as preferências locais são preservadas e a conta continua vinculada, impedindo que outra conta envie esse perfil. A outra conta pode recuperar seu próprio perfil ou começar um perfil local vazio. A recuperação ou a troca explícita do perfil cria uma cópia do arquivo anterior em `config-backups/`. O nome da VPN permanece no dispositivo, e a recuperação solicita seleção local se a VPN for necessária e faltar uma conexão.

## Testes e hospedagem

```powershell
npm run lint
npm run typecheck
npm test
```

Os testes compilam o código antes de rodar. As suítes HTTP iniciam processos `mongod` temporários em loopback e validam autenticação, atualização de conta, isolamento de perfis, concorrência de revisões, exclusão e bloqueio de dados locais. Na primeira execução, o `mongodb-memory-server-core` baixa o binário de teste se necessário. As suítes usam bancos temporários e as URIs das próprias instâncias. [Configuração do MongoDB Memory Server](https://typegoose.github.io/mongodb-memory-server/docs/api/config-options/)

### Hospedagem com contêiner

Use `server/` como contexto de build e `server/Dockerfile` como receita. A imagem usa Node.js 22 em Debian e executa a API como usuário sem privilégios. A imagem final inclui o código compilado e as dependências de produção. O health check do contêiner usa a porta configurada e consulta o MongoDB por meio da API. [Imagem oficial do Node.js](https://github.com/nodejs/docker-node) · [Referência do Dockerfile](https://docs.docker.com/reference/dockerfile/)

Para construir e executar localmente a partir da raiz do repositório, preencha `server/.env` com as variáveis privadas da API e use o Docker em modo de contêineres Linux.

```powershell
docker build --pull --tag jarvis-api:local server
docker run --rm --env-file server/.env --env NODE_ENV=production --env HOST=0.0.0.0 --env PORT=3001 --publish 127.0.0.1:3001:3001 jarvis-api:local
```

Se estiver usando o arquivo de implantação da API, extraia o conteúdo e execute os comandos na pasta extraída, substituindo `server` por `.` no build e `server/.env` por `.env` na execução.

Na hospedagem, injete `MONGODB_URI` e `JWT_ACCESS_SECRET` como variáveis privadas do serviço. A imagem usa `NODE_ENV=production`, `HOST=0.0.0.0` e `PORT=3001` por padrão. Configure o encaminhamento HTTPS do provedor, com certificado válido, e use `GET /api/v1/health` para monitorar a conexão com o Atlas. Ajuste `TRUST_PROXY_HOPS` à cadeia de proxies quando ela for fixa e o acesso direto à API estiver restrito.

No Render, configure um Web Service com ambiente Docker, diretório raiz `server`, Dockerfile `./Dockerfile`, contexto `.` e health check `/api/v1/health`. Configure os segredos nas variáveis privadas do serviço e permita no Atlas os intervalos de IP de saída exibidos no painel do Render. Use o domínio HTTPS do serviço em `JARVIS_API_URL`. [Serviços Web no Render](https://render.com/docs/web-services) · [Diretório raiz e contexto Docker](https://render.com/docs/monorepo-support) · [IPs de saída](https://render.com/docs/outbound-ip-addresses)

### Hospedagem com Node.js

Use `server/` como diretório de trabalho. No build, execute `npm ci --include=dev` e `npm run build`. Prepare a execução com `npm ci --omit=dev` e inicie com `npm start`. Configure `NODE_ENV=production`, `MONGODB_URI` e `JWT_ACCESS_SECRET` no ambiente privado do serviço. Ajuste `HOST`, `PORT` e `TRUST_PROXY_HOPS` conforme a rede da hospedagem e use o mesmo encaminhamento HTTPS.

### Validação da API hospedada

Para verificar a API hospedada e empacotar o desktop usando a mesma origem, execute estes comandos na raiz do repositório. Substitua o endereço de exemplo pelo endereço HTTPS da hospedagem.

```powershell
$env:JARVIS_API_URL = 'https://api.example.com'
npm run verify:api
npm run dist -- --win --x64
```

`verify:api` exige uma resposta HTTP 200 com `data.status` igual a `ok`. O comando consulta a API sem criar contas nem alterar perfis. O instalador incorpora apenas a origem HTTPS. O backend e seus segredos ficam na hospedagem.
