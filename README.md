# FargusGram

A rede social dos personagens da campanha Fargus. Funciona no navegador e se instala no celular como um app, no iPhone e no Android, sem pagar nada.

![Telas do FargusGram](docs/telas.jpg)

## O que tem

- Feed com publicações de até 10 fotos, com recorte e filtros
- Curtir com toque duplo, comentar e responder comentários, salvar e mandar no Direct
- Stories de 24 horas (foto ou texto), com lista de quem viu e respostas
- Perfis, seguidores, marcação de personagens nas fotos, @menções e #hashtags
- Explorar, com busca de personagens e hashtags
- Notificações de curtidas, comentários, respostas, menções, marcações e seguidores
- Direct com conversas individuais e grupos, inclusive com fotos
- Cada jogador pode ter vários personagens e alternar entre eles. O mestre usa isso para os NPCs.
- Selo de verificado, dado pelo admin
- Modo escuro
- Cadastro só com código de convite
- Painel do admin: trocar o convite, ver jogadores, redefinir senhas, dar selos e apagar qualquer publicação

## Como funciona

O app é um site feito em React, hospedado de graça no GitHub Pages. Os dados e as fotos ficam no Supabase, também no plano grátis. No celular ele vira um PWA: a pessoa adiciona o site à tela inicial e ele abre em tela cheia, com ícone próprio, como um app normal. Publicar na App Store custaria US$ 99 por ano e na Play Store US$ 25, por isso usamos esse caminho.

## Colocar no ar

Leva uns 20 minutos, uma vez só.

### 1. Criar o projeto no Supabase

1. Crie uma conta em [supabase.com](https://supabase.com). Dá para entrar com a conta do GitHub.
2. Clique em **New project**. Use o nome `fargusgram`, crie uma senha para o banco (guarde, mas o app não usa) e escolha a região **South America (São Paulo)**.
3. Espere um ou dois minutos até o projeto ficar pronto.

### 2. Criar o banco de dados

1. No menu lateral, abra **SQL Editor** e clique em **New query**.
2. Abra o arquivo `supabase/setup.sql`, copie tudo, cole no editor e clique em **Run**.
3. No fim deve aparecer `FargusGram: banco configurado com sucesso ✔`.

O Supabase pode avisar que o script tem comandos "destrutivos". Pode confirmar: ele só apaga e recria as próprias regras de segurança, nunca os seus dados. O script pode ser rodado de novo quando quiser.

### 3. Desligar a confirmação de e-mail

O envio de e-mails grátis do Supabase só funciona para os membros da equipe do projeto. Se a confirmação de e-mail ficar ligada, seus amigos não conseguem terminar o cadastro.

1. Abra **Authentication** → **Sign In / Providers** → **Email**.
2. Desligue **Confirm email** e salve.

### 4. Ligar o app ao seu Supabase

1. No topo do projeto, clique em **Connect**. A URL também fica em **Project Settings** → **Data API** e a chave em **Project Settings** → **API Keys**.
2. Copie a **Project URL** (algo como `https://abcdxyz.supabase.co`) e a **publishable key** (começa com `sb_publishable_`). Se o seu projeto só mostrar a chave `anon`, pode usar ela.
3. Abra `src/config.js` e cole os dois valores no lugar indicado.

Esses dois valores são públicos por natureza, porque vão para o celular de todo mundo. Quem protege os dados são as regras de segurança criadas pelo `setup.sql`: só quem entrou com o código de convite consegue ver ou publicar qualquer coisa. Nunca coloque no app a chave `secret` ou `service_role`.

### 5. Publicar no GitHub Pages

O código fica no repositório [EnricoDiGioia/FargusGram](https://github.com/EnricoDiGioia/FargusGram). Ele precisa ser **público**, porque o GitHub Pages gratuito só funciona assim.

1. No repositório, abra **Settings** → **Pages** e, em **Build and deployment** → **Source**, confira que está **GitHub Actions**.
2. Abra a aba **Actions** e espere o "Publicar no GitHub Pages" ficar verde. Se alguma execução falhar por ter rodado antes do passo 1, abra a execução e clique em **Re-run all jobs** (ou escolha o fluxo na lista e clique em **Run workflow**).
3. O site fica em `https://enricodigioia.github.io/FargusGram/`.

Toda vez que alguém der push na branch `main`, o site é publicado de novo sozinho. Para mudar só o `src/config.js`, dá para editar direto no site do GitHub: abra o arquivo, clique no lápis, cole os valores e confirme o commit.

Para trabalhar no código no seu computador:

```powershell
cd D:\GithubProjects
git clone https://github.com/EnricoDiGioia/FargusGram.git
```

Se você já tiver a pasta `D:\GithubProjects\FargusGram` sem o Git, dá para ligá-la ao repositório assim:

```powershell
cd D:\GithubProjects\FargusGram
git init -b main
git remote add origin https://github.com/EnricoDiGioia/FargusGram.git
git fetch origin
git reset --hard origin/main
```

### 6. Primeiro acesso

1. Abra o site e toque em **Cadastre-se**. O código de convite inicial é `fargus`.
2. A primeira conta criada vira admin. Depois é só criar o seu personagem.
3. No seu perfil, toque em ☰ → **Painel do admin**. Troque o código de convite e toque em **Copiar link de convite** para mandar no grupo. O link já abre o cadastro com o código preenchido.
4. Se o mestre também for cuidar do app, use **Tornar admin** na conta dele.

### 7. Instalar no celular

**iPhone:** abra o link no **Safari**, toque em **Compartilhar** e depois em **Adicionar à Tela de Início**. Tem que ser o Safari: se o link abrir dentro do WhatsApp ou do Instagram, copie e cole no Safari. No iPhone, o app instalado pede login de novo na primeira vez.

**Android:** abra o link no **Chrome**, toque no menu ⋮ e depois em **Instalar app** (em alguns aparelhos aparece como **Adicionar à tela inicial**).

O próprio app mostra essas instruções na tela inicial para quem ainda não instalou.

## No dia a dia

- **Trocar de personagem:** segure o ícone do perfil na barra de baixo, ou toque no seu @ no topo do perfil.
- **Criar NPC:** na troca de personagem, toque em **Criar novo personagem**.
- **Esqueceu a senha:** o admin redefine em **Painel do admin** → **Redefinir senha** e passa a senha nova para a pessoa, que pode trocá-la depois em Configurações.
- **Selo de verificado:** no Painel do admin, toque no selo ao lado do personagem.
- **Tirar alguém do grupo:** no Supabase, abra **Authentication** → **Users** e apague o usuário. Tudo o que ele publicou some junto. Depois troque o código de convite.
- **Contas novas só pelo app.** Criar usuário direto pelo painel do Supabase dá erro de propósito, porque não passa pelo código de convite.

## Limites do plano grátis

- **Fotos:** o Supabase grátis tem 1 GB. O app comprime cada foto no próprio celular antes de enviar (cerca de 200 a 400 KB), então cabem alguns milhares. Stories são apagados depois de 24 horas e liberam espaço.
- **Banco:** 500 MB, que é muito para textos, curtidas e mensagens.
- **Tráfego:** 5 GB por mês. As fotos já vistas ficam guardadas no celular, o que economiza bastante.
- **Pausa por falta de uso:** o Supabase pausa projetos grátis depois de 7 dias sem uso. O robô "Manter o Supabase acordado" (`.github/workflows/keepalive.yml`) faz uma consulta a cada 3 dias para evitar isso. O GitHub desliga robôs agendados em repositórios públicos depois de 60 dias sem commits. Se acontecer, abra **Actions** → "Manter o Supabase acordado" → **Enable workflow**. Se o projeto pausar mesmo assim, entre no painel do Supabase e clique em **Restore project**. Os dados continuam lá.

## Privacidade

- Publicações, perfis, comentários e mensagens só aparecem para quem entrou com o código de convite.
- As fotos ficam num bucket público do Supabase. O endereço de cada foto é longo e aleatório, mas quem tiver o link consegue abrir. Não publique nada sensível.
- Os e-mails dos jogadores só aparecem para os admins.

## Mudar o app depois

- Edite os arquivos, faça commit e push. Em poucos minutos o site é atualizado, e o app no celular carrega a versão nova na próxima vez que for aberto.
- Para rodar no computador: instale o [Node.js](https://nodejs.org) 22 ou mais novo, depois rode `npm install` e `npm run dev`. O terminal mostra também um endereço de rede, que abre no celular se ele estiver no mesmo Wi-Fi.
- Se um dia o banco mudar, rode o SQL novo no SQL Editor do mesmo jeito.

## Onde fica cada coisa

| Caminho | O que é |
| --- | --- |
| `supabase/setup.sql` | Banco de dados, regras de segurança e funções |
| `src/config.js` | URL e chave do Supabase |
| `src/pages/` | As telas do app |
| `src/components/` | Peças reutilizadas pelas telas |
| `src/lib/` | Conexão com o Supabase, processamento de imagens e utilidades |
| `src/styles/app.css` | Visual (cores, claro e escuro) |
| `public/` | Ícones, manifesto de instalação e service worker (cache) |
| `.github/workflows/` | Publicação automática e robô contra a pausa |
| `scripts/keepalive.mjs` | Consulta usada pelo robô |

## Ideias para depois

- Notificações push no celular (precisa de uma Edge Function no Supabase)
- Vídeos curtos (ocupam bastante do 1 GB grátis)
- Destaques de stories no perfil
