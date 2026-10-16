# Handoffs — trabalhos abertos

Cada linha é um assunto em andamento: leia o snapshot do assunto que for continuar. Gravado por handoff-grava.py.

<!-- handoff-indice:inicio -->
- `sala-multiplayer` · handoffs/history/2026-10-16T065452Z-sala-multiplayer.md · 16/10 03:54
<!-- handoff-indice:fim -->

---

Cópia integral do snapshot mais recente (handoffs/history/2026-10-16T065452Z-sala-multiplayer.md):

# Handoff — 2026-10-16 — sala-multiplayer v0.5 → v0.7.1: laço entre agentes, convidado pelo Telegram, Fluxo visual e tópicos

## Projeto e escopo
Sessão aberta em ~/projetos/wifi; trabalho real em ~/projetos/sala-multiplayer (repo público inematds/sala-multiplayer, autor inematds). O Nei viu na sala a discussão sobre painel de tópicos e pediu: corrigir os erros do teste (laço de agentes), Fluxo com alternância Texto/Visual, lista e resumo de tópicos e convidado pelo Telegram sem digitar id. Decisões dele: aprovação nova toda vez, convite sem expirar, teto 30 por convidado, tudo ajustável na tela Config.

## Objetivo atual
Nenhuma tarefa em andamento: v0.5.0, v0.6.0, v0.7.0 e v0.7.1 publicadas (push) e servidores reiniciados. Falta só o relatório final ao Nei.

## Estado aceito
- [confirmed] v0.5.0 (9c84df7): teto por rodada (teto_rodada, soma dos ramos), aviso de teto uma vez por rodada, @ só no começo da frase entre agentes (mencoesDiretas), chamar de volta só com pergunta, eco marcado meta.eco, estado da sala no prompt, motivo do id em uso, eventos com rodada/pai, convidado pelo Telegram (/entrar, /aceitar N, /recusar N, /remover nome, /sair), campos teto_convidado, convidado_reaprovar, convidado_expira_h; cartão de convite e seção Convidados na Config (senha do dono).
- [confirmed] v0.6.0 (b333ca2): public/fluxo.html com botão Texto | Visual; public/rodadas.js (agrupa rodadas, ramos pelo pai, faixa de resolução); antigos sem rodada aparecem como "aproximado".
- [confirmed] v0.7.0 (26b6aa6): tabela topicos no banco; sala.organizar() após cada rodada (agente @topicos se existir, senão agrupamento da sala por conversa em 15 min); coluna Tópicos à direita, cartão de resumo no alto do chat, abas Conversa/Tópicos no celular; READMEs PT/EN/ES atualizados.
- [confirmed] v0.7.1 (934670f): eco só vale entre agentes (resposta a pessoa com "Certo. @codex, ..." chama o Codex).

## Proposto / tentado, não confirmado
- [unverified] Fluxo de convidado com o Telegram real — só testes com fetch falso.
- [unverified] Claude/Codex reais devolvendo a linha TOPICO: e obedecendo o @ no começo da frase — só motor falso.
- [?] Primeira delegação real Claude→Codex depois da regra de @ direto: conferir se o modelo põe o @ no começo da frase.

## Decisões e restrições
- teto_turnos continua = profundidade de um ramo; teto_rodada novo soma todos os ramos (pessoa 12, atendimento 8).
- Faixa de resolução só com dados estruturados (opção a); resumo escrito vem do @topicos quando aprovado.
- Removido pelo dono sempre pede de novo, mesmo com convidado_reaprovar=nao (só quem saiu com /sair volta direto).

## Arquivos alterados
- Nenhum no repo wifi além de `LESSONS.md` (nota "repetido 16/10" na lição do pkill; o arquivo já tinha mudanças de outras sessões, não commitado).
- Fora do projeto: ~/projetos/sala-multiplayer/{lib/banco.mjs, lib/sala.mjs, lib/telegram.mjs, lib/config.mjs, lib/propostas.mjs, lib/agentes.mjs, server.mjs, perfis/*.json, public/{sala,fluxo,config}.html, public/rodadas.js, public/comum.js, public/estilo.css, tests/sala.test.mjs, tools/checar.cjs, README*.md, ROADMAP.md, FALHAS.md, docs/sala-1280.png, package.json 0.7.1} — tudo commitado e com push.

## Memória e regras duráveis tocadas
- ~/projetos/sala-multiplayer/FALHAS.md — linha 16/10 do laço de 20 respostas.
- ~/projetos/wifi/LESSONS.md — pkill no mesmo comando repetido (sem commit).

## Verificação
- Rodado: `npm test` em sala-multiplayer → 46/46 ok (v0.7.1).
- Rodado: tools/checar.cjs (/, /grafo, /fluxo, /config em 360/800/1280/1920) numa cópia isolada com demo → "OK: nenhum problema".
- Rodado: Playwright no visual (rodadas, sem overflow, sem erro JS, também numa cópia do banco real), clique de aceitar convite com senha errada/certa e desligar convidado na Config, filtro e resumo de tópico em 1280 e 360 → ok.
- Não rodado: Telegram real, agentes reais (gasta assinatura; o Nei testa).

## Estado em execução
- Processos: `npm run pessoa` (porta 4600, Telegram ligado, log /tmp/claude-1000/sala-logs/pessoa.log) e `npm run demo` (porta 4601, log /tmp/claude-1000/sala-logs/demo.log), iniciados com setsid nohup; matar pelo pid em `ps -eo pid,args | grep server.mjs` (nunca pkill -f na mesma linha).
- Servidores: http://192.168.2.99:4600 e http://192.168.2.99:4601.
- Worktrees: nenhum. Cópias de teste em scratchpad da sessão (descartáveis).

## Perguntas abertas e adiados
- Aberta: aprovar a proposta #4 @topicos na sala (sem ela, tópicos sem resumo escrito; cada resumo = 1 chamada da assinatura).
- Aberta: atualizar o guia (guia/ PT/EN/ES ainda descreve v0.1) e publicar — oferecer.
- Adiado: ferramenta nova por pedido (duas aprovações); conversas antigas sem tópico (começam na próxima mensagem).

## Próxima ação exata
Entregar o relatório final ao Nei com "Terminei: ...". Ramos: (A) ele aprova #4 e testa tópicos reais; (B) pede o guia v0.7 nos 3 idiomas (commit + push); (C) testa /entrar com alguém pelo Telegram.

## Mapa de retomada
- ~/projetos/sala-multiplayer/README.md — telas, convidado, tópicos, tetos.
- ~/projetos/sala-multiplayer/lib/sala.mjs — tetos, mencoesDiretas/ehEco, convidados, organizar().
- ~/projetos/sala-multiplayer/public/rodadas.js — agrupamento e resolução usados no Fluxo e nos tópicos.
- ~/projetos/sala-multiplayer/ROADMAP.md — o que foi feito em v0.5–v0.7 e o que falta.

## Checagem de compartilhamento
- Sem segredos, tokens, cookies ou dados pessoais: sim (senha do dono e token do bot só pelo nome da variável no .env fora do git).
