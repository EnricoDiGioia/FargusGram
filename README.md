# FargusGram

A rede social dos personagens da campanha Fargus. Funciona no navegador e se instala no celular como um app, no iPhone e no Android, sem pagar nada.

![Telas do FargusGram](docs/telas.jpg)

## O que tem

- Feed com publicações de até 10 fotos ou vídeos, com recorte e filtros
- Vídeos de até 15 segundos nos posts, nos stories e nos reels, cortados e comprimidos no próprio celular
- Reels: vídeos em pé, um por tela, com som, curtida com dois toques e aba própria no perfil
- Curtir com toque duplo, comentar e responder comentários (com foto ou figurinha), salvar e mandar no Direct
- Figurinhas como as do WhatsApp: crie com as suas fotos, salve as que mandarem e use no Direct e nos comentários
- Reações com emoji nos comentários, nas mensagens do Direct, nos stories e nos destaques; até 3 comentários fixados pelo dono do post
- Stories de 24 horas (foto ou texto), com lista de quem viu e respostas
- Figurinhas nos stories: enquete, caixinha de perguntas, menção, local e horário
- Repostar o story em que você foi marcado ("Adicionar ao seu story")
- Textos e fotos por cima, no story e na publicação: vários textos em 6 fontes e fotos coladas, que dá para arrastar, girar e mudar o tamanho
- Destaques no perfil: stories guardados com nome e capa, que ficam no perfil para sempre
- Música nos posts e nos stories: busca no catálogo do Apple Music, escolha do trecho de 15 segundos e adesivo da música no story
- Perfis, seguidores, marcação de personagens nas fotos, @menções e #hashtags
- Explorar, com busca de personagens e hashtags
- Notificações de curtidas, comentários, respostas, menções, marcações e seguidores
- Notificações no celular (mesmo com o app fechado), com número no ícone do app e escolha do que receber
- Direct com conversas individuais e grupos, inclusive com fotos, e respostas a uma mensagem específica
- Notas no topo do Direct: um recado curto (com música, se quiser) que dura 24 horas
- Melhores amigos: cada personagem monta a sua lista secreta e pode mandar stories e notas só para ela (anel verde)
- Cada jogador pode ter vários personagens e alternar entre eles. O mestre usa isso para os NPCs.
- Selo de verificado, dado pelo admin
- Temas: claro, escuro e 9 temas prontos com papel de parede, ou crie o seu com as suas cores, degradê, desenho ou foto de fundo
- Cadastro só com código de convite
- Painel do admin: trocar o convite, ver jogadores, redefinir senhas, dar selos, inflar os números de um perfil famoso e apagar qualquer publicação

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

Quem instala do zero não precisa rodar mais nada: o `setup.sql` já inclui todas as atualizações da pasta `supabase/atualizacoes/`.

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

Para os avisos chegarem no celular, falta criar a função `push` no Supabase: veja [Notificações no celular](#notificações-no-celular).

## Atualizações do banco

Quando uma novidade do app precisa de algo novo no banco, ela vem num arquivo separado dentro de `supabase/atualizacoes/`. Quem já tinha o FargusGram funcionando roda esse arquivo uma vez:

1. No Supabase, abra **SQL Editor** e clique em **New query**.
2. Copie todo o conteúdo do arquivo, cole no editor e clique em **Run**.
3. No fim aparece uma mensagem com ✔.

Esses arquivos não apagam nada e podem ser rodados mais de uma vez sem problema. Enquanto a atualização não for rodada, o resto do app continua funcionando normalmente; só a novidade avisa que falta atualizar o banco.

| Arquivo | O que traz |
| --- | --- |
| `2026-09-musica.sql` | Música nos posts e nos stories |
| `2026-09-notificacoes.sql` | Notificações no celular (depois, crie a função `push`, veja abaixo) |
| `2026-09-respostas.sql` | Responder uma mensagem específica no Direct (rode depois da de notificações) |
| `2026-09-destaques-notas.sql` | Destaques no perfil e notas no Direct (rode depois das anteriores) |
| `2026-09-melhores-amigos.sql` | Melhores amigos (rode depois da de destaques e notas) |
| `2026-09-interacoes.sql` | Reações e comentários fixados; figurinhas do story (rode depois da de melhores amigos) |
| `2026-09-reacoes.sql` | Reações nos stories, nos destaques e nas mensagens do Direct (rode depois da de interações) |
| `2026-09-figurinhas.sql` | Figurinhas no Direct e nos comentários, e fotos nos comentários (rode depois da de reações) |
| `2026-09-repost.sql` | Repostar o story em que você foi marcado (rode depois da de figurinhas) |
| `2026-09-numeros-extras.sql` | Números extras (seguidores e curtidas) no Painel do admin (rode depois da de repost) |
| `2026-09-temas.sql` | Temas guardados na conta, para valerem em todos os aparelhos (rode depois da de números extras) |
| `2026-09-videos.sql` | Vídeos nos posts, nos stories e nos reels (rode depois da de temas) |

## Notificações no celular

Os avisos chegam no celular mesmo com o app fechado, como no Instagram: mensagens do Direct, comentários e respostas, menções e marcações, curtidas, novos seguidores e publicações de quem você segue. Stories de quem você segue também, mas esse aviso começa desligado.

### Ligar (uma vez só, pelo admin)

1. Rode a atualização `supabase/atualizacoes/2026-09-notificacoes.sql` no SQL Editor, como explicado em [Atualizações do banco](#atualizações-do-banco). Quem instala do zero já tem isso no `setup.sql`.
2. No Supabase, abra **Edge Functions** no menu lateral e clique em **Deploy a new function** → **Via Editor**.
3. Apague o código de exemplo e cole todo o arquivo `supabase/functions/push/index.ts`. O jeito mais fácil de copiar é abrir [este link](https://raw.githubusercontent.com/EnricoDiGioia/FargusGram/main/supabase/functions/push/index.ts), apertar Ctrl+A e Ctrl+C.
4. No campo do nome da função, escreva `push`, exatamente assim, e clique em **Deploy function**. Leva uns 30 segundos.
5. Na página da função, abra **Details** e desligue **Verify JWT with legacy secret** (em painéis mais antigos aparece como **Enforce JWT Verification**). Salve. A função confere sozinha se quem chamou está logado no app.

A função não precisa de nenhuma configuração: as chaves que identificam o FargusGram para o Google, a Apple e a Mozilla são criadas na primeira vez e ficam guardadas no banco.

### Ativar no celular (cada pessoa)

1. Abra **Configurações** → **Notificações** e ligue **Receber neste aparelho**. O celular pergunta se pode mandar notificações: toque em **Permitir**.
2. Toque em **Enviar notificação de teste**. O aviso chega em alguns segundos.
3. Logo abaixo dá para escolher o que receber. Quem tem vários personagens pode desligar os avisos de alguns deles, o que é útil para os NPCs do mestre.

A tela de Atividade também convida a ativar.

- **iPhone:** só funciona com o app instalado na tela de início (iOS 16.4 ou mais novo) e aberto pelo ícone, não pelo Safari.
- **Android:** funciona no Chrome, com ou sem o app instalado.
- **Bloqueou sem querer?** Libere nas configurações do celular: no iPhone, **Ajustes** → **Notificações** → **FargusGram**. No Android, segure o ícone do app → **Informações do app** → **Notificações**.
- **Saiu da conta?** O aparelho para de receber os avisos daquela conta.

Tocar num aviso abre o post, a conversa ou o perfil certo, já no personagem que recebeu. Se algo não chegar, o botão de teste mostra o motivo, e os detalhes ficam em **Edge Functions** → **push** → **Logs**, no Supabase.

## Música

- **Colocar música:** ao criar um post, toque em **Adicionar música**. No story, toque no ♫ do lado direito. Pesquise pelo nome da música ou do artista, toque no ▶ para ouvir e toque na música para escolher. Depois arraste a faixa para escolher o trecho de 15 segundos.
- **Adesivo no story:** aparece sozinho e pode ser arrastado. Tocar nele troca o estilo (claro, escuro ou pílula). Para um story sem adesivo, desmarque **Mostrar adesivo** ao escolher o trecho.
- **Ouvir:** a música do post toca quando ele aparece na tela, e a do story toca junto com ele (o story com música dura 15 segundos). O alto-falante na foto ou no topo do story liga e desliga o som, e o app lembra a escolha. Tocando no nome da música dá para abrir no Apple Music.
- **iPhone e Android** só deixam um site tocar som depois do primeiro toque na tela. Se a música não começar sozinha, toque em qualquer lugar ou no aviso **Toque para ouvir a música**.
- **Trocar ou tirar a música de um post:** no post, toque em ⋯ → **Editar**.

As músicas são as prévias de 30 segundos do Apple Music, que qualquer site pode usar sem conta e sem pagar. O áudio vem direto da Apple, então não ocupa o espaço nem o tráfego do Supabase: o banco guarda só o nome, o artista e o trecho escolhido. Quem ouve gasta cerca de 1 MB de internet por música, e só quando ela toca.

## Destaques e notas

**Destaques** são stories que ficam no perfil, em bolinhas com nome e capa, entre a bio e as fotos.

- **Destacar um story na hora:** abra o seu story e toque em **Destacar**, embaixo. Escolha um destaque que já existe ou toque em **Novo** e dê um nome.
- **Montar um destaque com stories antigos:** no seu perfil, toque em **Novo** (o + no fim da fileira), marque os stories, toque em **Avançar**, dê um nome e escolha a capa em **Editar capa**.
- **Arquivo:** o story some da bandeja depois de 24 horas, mas fica 30 dias num arquivo que só o dono vê, justamente para poder ir para um destaque depois. O que estiver num destaque fica para sempre. O resto é apagado depois dos 30 dias para liberar espaço.
- **Editar:** abra o destaque e toque em ⋯ para **Editar destaque** (nome, capa e stories), **Remover do destaque** o story que está na tela ou **Excluir destaque**. Os stories continuam no arquivo.
- Todo mundo do grupo vê os destaques e pode responder, como num story. Se o dono excluir o story, ele sai dos destaques também.

**Notas** aparecem numa fileira no topo do Direct e num balão em cima da foto do perfil.

- **Deixar uma nota:** no Direct, toque em **Sua nota** (ou no balão em cima da sua foto no perfil). Escreva até 60 caracteres e, se quiser, toque em **Adicionar música**.
- A nota dura 24 horas e aparece para quem segue o personagem. Uma nota nova substitui a anterior, e dá para apagar antes.
- **Responder:** toque na nota de alguém, escreva e envie. A resposta chega no Direct, mostrando a nota respondida, e a pessoa recebe a notificação "respondeu à sua nota".

## Textos e fotos por cima (story e publicação)

Os dois editores, o de story e o de publicação, têm as mesmas ferramentas:

- **Texto:** toque em **Aa**, escreva e escolha a fonte (Clássica, Moderna, Máquina, Caneta, Forte ou Elegante), a cor, o fundo e o tamanho. Dá para colocar vários textos.
- **Foto do story:** a foto escolhida pelo quadradinho da galeria (canto de baixo) entra inteira na tela, atrás de tudo, e se mexe como as outras camadas: arraste, gire e mude o tamanho à vontade. Onde ela não cobre, aparece um degradê com as cores da própria foto; a paleta, do lado direito, troca por outros fundos. A lixeira (ou o **✕** da foto) tira a foto.
- **Foto por cima:** toque no ícone de foto com **+** e escolha uma ou mais fotos, até 6. Elas entram lado a lado, como uma colagem (com cantos arredondados e sombra), sem uma cobrir a outra.
- **Mover:** arraste a camada com o dedo (ou o mouse). Enquanto você mexe, os botões do editor somem para liberar a vista.
- **Girar e mudar o tamanho:** a camada tocada (e a que acabou de entrar) mostra três alças nos cantos: **↻** gira, **⤡** aumenta ou diminui e **✕** tira. É só arrastar a alça, com um dedo no celular ou com o mouse no computador. As alças nunca saem do quadro nem ficam em cima dos botões, então dá para pegar mesmo com a camada no canto.
- **Atalhos:** no celular, dois dedos giram e mudam o tamanho de uma vez (o segundo dedo pode cair fora da camada). No computador, a rodinha do mouse em cima da camada muda o tamanho, e com **Shift** ela gira; no trackpad, a pinça também funciona. O giro "gruda" no reto quando passa perto de 0° ou 90°.
- **Editar:** tocar num texto abre para editar. A camada tocada vem para a frente das outras.
- **Na publicação,** cada foto do carrossel tem os seus próprios textos e fotos. As camadas não pegam o filtro, que fica só na foto de baixo.

A imagem publicada sai exatamente como aparece no editor. As fontes vêm junto com o app (umas 130 KB, baixadas só quando alguém abre um editor), então funcionam em qualquer celular e ficam gravadas na foto: quem vê não precisa ter a fonte.

## Reações e comentários fixados

- **Reagir a uma mensagem do Direct:** segure o dedo na mensagem (no computador, clique com o botão direito) e escolha ❤️ 😂 😮 😢 😡 ou 👍 em cima do menu. Toque duplo na mensagem manda um ❤️. A reação aparece embaixo da mensagem, para todos da conversa, e quem mandou recebe o aviso. Tocar nas reações mostra quem reagiu; na sua, dá para tirar.
- **Reagir a um story ou destaque:** o coração ao lado de "Responder" curte o story (não manda mais mensagem no Direct). Tocando em **Responder**, aparecem as reações rápidas: 😂 😮 😍 😢 👏 🔥 🎉 ❤️. Cada um tem uma reação por story, e tocar de novo tira. O dono recebe o aviso ("curtiu seu story" ou "reagiu com 🔥 ao seu story"), vê o resumo em **Visualizações** e o emoji de cada pessoa na lista. Responder com texto continua indo para o Direct.
- **Reagir a um comentário:** o coração continua ali do lado. Para outro emoji (😂 😮 😢 🔥 👏), segure o dedo no comentário ou toque em **Reagir**. Cada personagem tem uma reação por comentário; tocar de novo no seu emoji tira. Embaixo do comentário aparecem os emojis mais usados e o total, e quem escreveu recebe o aviso "reagiu com 😂 ao seu comentário".
- **Fixar:** o dono da publicação vê **Fixar** embaixo de cada comentário. Os fixados (até 3) ficam no topo com "Fixado pelo autor". **Desafixar** volta o comentário para o lugar dele. Respostas não podem ser fixadas.

## Figurinhas e fotos nos comentários e no Direct

Cada jogador tem a sua coleção de figurinhas (vale para todos os personagens dele), como no WhatsApp.

- **Criar:** nos comentários ou numa conversa do Direct, toque no ícone de figurinha e em **Criar**. Escolha uma foto, enquadre no quadrado e escolha o formato (quadrada, arredondada ou redonda). **Tirar fundo branco** apaga o fundo claro em volta (ótimo para desenhos e prints com fundo branco), **Contorno branco** deixa com cara de adesivo e dá para pôr uma legenda. A prévia mostra como fica, com o xadrez onde ficou transparente. Toque em **Salvar**.
- **Mandar:** toque na figurinha na bandeja e ela vai na hora, no comentário ou na conversa. No Direct ela aparece solta, sem balão, e dá para responder e reagir como qualquer mensagem.
- **Salvar a de alguém:** no Direct, segure a figurinha e toque em **Salvar figurinha**. Nos comentários, toque na figurinha e em **Salvar nas minhas figurinhas**.
- **Tirar da coleção:** segure a figurinha na bandeja. Quem já recebeu continua vendo.
- **Foto no comentário:** toque no ícone de foto ao lado do campo, escreva um texto se quiser e toque em **Publicar**. Tocar na foto abre em tela cheia. Excluir o comentário apaga a foto.

Cada figurinha é um arquivo pequeno (uns 30 a 80 KB), e cada jogador pode guardar até 200.

## Figurinhas no story

No editor de story, toque na figurinha (ícone de adesivo, do lado direito) e escolha:

- **Enquete:** uma pergunta (opcional) e de 2 a 4 opções. Quem vê toca numa opção para votar e aí vê as porcentagens. O voto não pode ser trocado.
- **Perguntas:** a caixinha "Me faça uma pergunta" (dá para mudar o texto). Quem vê toca nela, escreve e envia. Só o dono do story vê as respostas, e recebe um aviso no celular a cada uma.
- **Menção:** escolha um personagem. O story chega no Direct dele ("Mencionou você no story") e, no story, tocar na menção abre o perfil. Num story de Melhores amigos, só quem está na lista recebe a menção.
- **Local:** qualquer nome de lugar, inclusive os do mundo da campanha.
- **Horário:** a hora em que você fez o story. Tocar nela troca para a data ou para as duas.

As figurinhas se mexem como os textos: arraste, gire e mude o tamanho pelas alças. Tocar numa figurinha abre para editar (no horário, troca o estilo). Elas não ficam "pintadas" na foto: o app guarda cada uma e desenha por cima na hora de ver, para dar para tocar. Por isso não aparecem na capinha do destaque nem na miniatura do Direct.

**Repostar quando te marcam:** quem é marcado (figurinha de menção) recebe o story no Direct com o botão **Adicionar ao seu story**, que também aparece embaixo do próprio story. Ele abre o editor com o story original num cartão, com o @ de quem fez no canto e o fundo nas cores dele. Dá para mexer no cartão como numa foto (mover, girar, mudar o tamanho) e colocar textos e figurinhas antes de publicar. Quem vê o repost pode tocar no cartão para ir aos stories ou ao perfil de quem fez o original, e quem fez recebe o aviso "compartilhou seu story". Stories de Melhores amigos não podem ser repostados, e o botão some quando o story sai do ar (24 horas).

**Resultados:** no seu story, as enquetes já mostram as porcentagens e a caixinha mostra quantas respostas chegaram. Toque em **Visualizações** (ou na caixinha) para ver as respostas e quem votou em cada opção.

## Melhores amigos

Cada personagem tem a sua lista de **Melhores amigos**, e só o dono sabe quem está nela. Quem entra ou sai da lista não recebe aviso nenhum: só passa a ver (ou deixa de ver) o que for marcado como Melhores amigos.

- **Montar a lista:** em **Configurações** → **Melhores amigos**, toque nos personagens para marcar ou desmarcar. Dá para colocar alguém também pelo perfil da pessoa: ⋯ → **Adicionar aos melhores amigos**. A lista é do personagem que você está usando; os NPCs têm a lista deles.
- **Story só para a lista:** no editor de story, toque em **Melhores amigos** em vez de **Seu story**. Se a lista estiver vazia, ela abre primeiro para você escolher quem entra. Quem está na lista vê o seu story com o anel **verde** e o selo "Melhores amigos"; para os outros, ele não existe.
- **Nota só para a lista:** ao deixar uma nota, escolha **Melhores amigos** em vez de **Seguidores**. Ela aparece com um contorno verde.
- **Destaques:** um story de Melhores amigos que estiver num destaque continua só para a lista. Se o destaque só tiver stories assim, quem está fora da lista nem vê o destaque.
- Tirar alguém da lista vale na hora, inclusive para os stories e destaques antigos.

## Vídeos e reels

Posts, stories e reels aceitam vídeo. Para caber no plano grátis, o próprio celular corta e comprime cada vídeo antes de enviar.

- **Até 15 segundos.** Vídeo mais longo abre direto a tela de corte: arraste as pontas ou o trecho para escolher. Depois, a tesoura (✂) no editor abre o corte de novo.
- **Pequeno:** 540 pixels de largura e cerca de 0,7 Mbps. Um vídeo de 15 s fica com 1 a 1,5 MB (uma foto tem uns 300 KB). Junto vai uma foto do primeiro quadro, que aparece nas miniaturas e enquanto o vídeo carrega.
- **Publicação:** escolha fotos e vídeos juntos (até 3 vídeos por publicação). O vídeo pode ser enquadrado e ganhar filtro e textos por cima, como as fotos. Ao compartilhar aparece "Preparando o vídeo" com a porcentagem; num celular recente leva alguns segundos.
- **Story:** no quadradinho da galeria, escolha um vídeo. Ele entra como a foto do story: dá para mover, girar, mudar o tamanho e colocar textos, figurinhas e música por cima. O story dura o tempo do vídeo, e segurar o dedo pausa. Repostar um story em vídeo em que você foi marcado mantém o vídeo.
- **Reels:** um vídeo em pé, sozinho. Crie pelo **+** → **Reel** ou pela câmera na tela de Reels. Os reels de todo mundo ficam no ícone de claquete da barra de baixo, um por tela: arraste para cima para ver o próximo, toque para ligar ou desligar o som, segure para pausar e toque duas vezes para curtir. No perfil, a aba de claquete mostra os reels do personagem. Eles também aparecem no feed, como as outras publicações.
- **Som:** o vídeo vai com o som dele, a não ser que você toque no alto-falante (no editor ou no corte) para tirar. Se escolher uma música, o vídeo vai sem o som dele e a música toca no lugar. No feed, o vídeo que está na tela toca sozinho; toque nele (ou no alto-falante) para ligar ou desligar o som. No iPhone, o som só começa depois de um toque: nos stories e nos reels aparece "Toque para ouvir"; no feed, toque no vídeo ou no alto-falante.
- **O coração mudou de lugar:** com os vídeos ligados, a claquete dos Reels fica no lugar do coração na barra de baixo, e o coração (atividade) vai para o topo do feed, ao lado do Direct, como no Instagram.
- **Celulares:** preparar vídeo precisa de um navegador recente: iPhone com iOS 16.4 ou mais novo, Chrome no Android e no computador. Num navegador sem suporte aparece um aviso. Assistir funciona em qualquer um.
- Sem a atualização `2026-09-videos.sql`, o app continua só com fotos, como antes.

## Temas

Em **Configurações** → **Temas** dá para mudar a cara do app todo: cores, fundo e um papel de parede atrás das telas.

- **Prontos:** Automático (segue o claro/escuro do celular), Claro, Escuro, e nove com papel de parede: Fissura, Oceano, Floresta, Noite estrelada e Brasa (escuros), Papel, Sakura, Pôr do sol e Menta (claros). Toque num para usar.
- **Criar o seu:** toque em **Criar tema**. Escolha o nome, claro ou escuro, a cor de destaque (botões, links, curtidas), a cor do fundo e o papel de parede: **Degradê** (duas cores e a direção), **Desenho** (pontinhos, quadriculado, estrelas, ondas ou listras, na cor que quiser) ou **Foto** (uma foto sua). A barra **Quanto o papel de parede aparece** deixa ele mais forte ou mais suave, para os textos continuarem fáceis de ler. O app já muda enquanto você mexe; **Cancelar** volta ao tema de antes.
- **Editar ou apagar:** toque no lápis ao lado do nome do tema. Cada jogador pode ter até 12 temas criados.
- **Em todos os aparelhos:** o tema é do jogador (vale para todos os seus personagens) e fica guardado na conta, então aparece também no computador ou em outro celular. Sem a atualização `2026-09-temas.sql`, ele funciona do mesmo jeito, mas fica só no aparelho em que foi escolhido.
- As cores que acompanham (fundo dos cartões, bordas, textos mais claros) são calculadas a partir das que você escolheu, e o texto dos botões fica branco ou preto conforme a cor de destaque, para dar sempre para ler.

## No dia a dia

- **Trocar de personagem:** segure o ícone do perfil na barra de baixo, ou toque no seu @ no topo do perfil.
- **Criar NPC:** na troca de personagem, toque em **Criar novo personagem**.
- **Responder uma mensagem no Direct:** arraste a mensagem para a direita, ou segure o dedo nela e toque em **Responder**. A resposta mostra a mensagem citada, e tocar na citação leva até a original, mesmo que seja antiga. Quem foi respondido recebe a notificação "respondeu você".
- **Esqueceu a senha:** o admin redefine em **Painel do admin** → **Redefinir senha** e passa a senha nova para a pessoa, que pode trocá-la depois em Configurações.
- **Selo de verificado:** no Painel do admin, toque no selo ao lado do personagem.
- **Perfil famoso (números extras):** no Painel do admin, toque no ícone de gráfico ao lado do personagem. **Seguidores extras** soma ao número de seguidores do perfil, e **Curtidas extras por publicação** soma perto dessa média em cada post dele (varia um pouco de um para outro, para parecer natural, e vale também para os antigos). Ninguém vê que são extras; as listas de quem segue e de quem curtiu continuam só com os personagens de verdade. Para voltar ao normal, escolha **Nenhum** e **Nenhuma**.
- **Tirar alguém do grupo:** no Supabase, abra **Authentication** → **Users** e apague o usuário. Tudo o que ele publicou some junto. Depois troque o código de convite.
- **Contas novas só pelo app.** Criar usuário direto pelo painel do Supabase dá erro de propósito, porque não passa pelo código de convite.
- **Se uma tela der erro:** aparece o aviso "Algo deu errado nesta tela" com **Tentar de novo** e **Recarregar**, em vez de a tela ficar toda preta. O texto pequeno embaixo diz qual foi o erro; tire um print dele para descobrir a causa. Se o aviso for "Saiu uma versão nova do FargusGram", é só tocar em **Recarregar**.

## Limites do plano grátis

- **Fotos:** o Supabase grátis tem 1 GB. Figurinhas, fotos dos comentários e fotos de papel de parede também contam, mas são pequenas (a foto de um tema apagado sai do bucket junto). O app comprime cada foto no próprio celular antes de enviar (cerca de 200 a 400 KB), então cabem alguns milhares. Stories vencidos ficam 30 dias no arquivo e depois são apagados, liberando espaço; só os que estão em destaques ficam guardados.
- **Banco:** 500 MB, que é muito para textos, curtidas e mensagens.
- **Tráfego:** 5 GB por mês. As fotos e os vídeos já vistos ficam guardados no celular, o que economiza bastante.
- **Vídeos:** são o que mais pesa. Cada vídeo de 15 s ocupa de 1 a 1,5 MB do 1 GB (os stories em vídeo também saem depois dos 30 dias no arquivo, a não ser os que estão em destaques). No tráfego, só o vídeo que está na tela é baixado, uma vez por aparelho, e os 50 mais recentes ficam guardados no celular; os 5 GB do mês dão para uns 3 mil vídeos assistidos.
- **Música:** não conta em nenhum desses limites, porque o áudio vem direto do Apple Music.
- **Notificações:** cada curtida, comentário ou mensagem chama a função `push` uma vez. O plano grátis tem 500 mil chamadas por mês, bem mais do que um grupo de amigos usa.
- **Pausa por falta de uso:** o Supabase pausa projetos grátis depois de 7 dias sem uso. O robô "Manter o Supabase acordado" (`.github/workflows/keepalive.yml`) faz uma consulta a cada 3 dias para evitar isso. O GitHub desliga robôs agendados em repositórios públicos depois de 60 dias sem commits. Se acontecer, abra **Actions** → "Manter o Supabase acordado" → **Enable workflow**. Se o projeto pausar mesmo assim, entre no painel do Supabase e clique em **Restore project**. Os dados continuam lá.

## Privacidade

- Publicações, perfis, comentários e mensagens só aparecem para quem entrou com o código de convite.
- As fotos e os vídeos ficam num bucket público do Supabase. O endereço de cada arquivo é longo e aleatório, mas quem tiver o link consegue abrir. Não publique nada sensível.
- Os e-mails dos jogadores só aparecem para os admins.
- Reações a stories e destaques só o dono do story vê (e cada um vê a própria). Reações às mensagens, só quem está na conversa.
- Respostas das caixinhas de perguntas e quem votou em cada opção das enquetes só o dono do story vê. Os outros veem só as porcentagens, e só depois de votar.
- Stories e notas de **Melhores amigos** só chegam a quem está na lista: o próprio banco esconde, não só a tela. A lista em si é secreta, só o dono vê. (A foto do story continua no bucket público: quem estiver na lista e copiar o endereço da imagem consegue repassar.)
- As notificações no celular passam pelos servidores de push do Google, da Apple ou da Mozilla (depende do celular), mas vão criptografadas: só o aparelho de quem recebe consegue ler o texto.

## Mudar o app depois

- Edite os arquivos, faça commit e push. Em poucos minutos o site é atualizado, e o app no celular carrega a versão nova na próxima vez que for aberto.
- Para rodar no computador: instale o [Node.js](https://nodejs.org) 22 ou mais novo, depois rode `npm install` e `npm run dev`. O terminal mostra também um endereço de rede, que abre no celular se ele estiver no mesmo Wi-Fi.
- Se uma mudança precisar de algo novo no banco, crie um arquivo em `supabase/atualizacoes/`, coloque a mesma mudança no `setup.sql` e rode o arquivo no SQL Editor (veja [Atualizações do banco](#atualizações-do-banco)).

## Onde fica cada coisa

| Caminho | O que é |
| --- | --- |
| `supabase/setup.sql` | Banco de dados, regras de segurança e funções |
| `supabase/atualizacoes/` | Atualizações do banco para quem já tinha o app funcionando |
| `supabase/functions/push/` | Função do Supabase que manda as notificações para os celulares |
| `src/config.js` | URL e chave do Supabase |
| `src/pages/` | As telas do app |
| `src/components/` | Peças reutilizadas pelas telas |
| `src/lib/` | Conexão com o Supabase, processamento de imagens, música e utilidades |
| `src/styles/app.css` | Visual (cores, claro e escuro) |
| `src/lib/theme.js` | Temas prontos e as contas das cores de cada tema |
| `src/lib/videoEdit.js` | Cortar, montar e comprimir os vídeos no celular (biblioteca Mediabunny, só carregada quando alguém escolhe um vídeo) |
| `src/lib/videoHost.js` | O único player de vídeo do app, que passa de um post para outro |
| `public/` | Ícones, manifesto de instalação e service worker (cache) |
| `.github/workflows/` | Publicação automática e robô contra a pausa |
| `scripts/keepalive.mjs` | Consulta usada pelo robô |
