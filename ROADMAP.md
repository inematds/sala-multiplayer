# Roadmap

## v0.1 (esta)
- Entradas: Telegram (um bot como porta) e chat do painel.
- Agentes: Claude Code e Codex pela assinatura, chamados por @menção ou por rota padrão do perfil.
- Ferramentas de exemplo: base de respostas, chamados, notas, relógio.
- Painel: Sala (participantes + chat + topo com indicadores e aprovações), Grafo, Fluxo.
- Travas: teto de turnos entre agentes, teto diário, aprovação humana antes de responder cliente.
- Perfis: `pessoa` e `atendimento`.

## v0.2 — a sala cresce por pedido, com aprovação do dono (pedido do Nei, 15/10/2026)
- **Feito (0.2.0):** agente novo por pedido, com proposta conferida pela sala, estimativa de custo/tempo, aprovação, teto por agente e respostas/tempo médio de cada agente no painel.
- **Nova ferramenta por pedido:** alguém pede na conversa ("quero que vocês consultem a agenda"). O agente responde com uma **proposta** (o que a ferramenta faz, o que precisa — conta, credencial, API, instalação —, custo estimado por uso e por mês, tempo para fazer, riscos). A proposta entra na mesma fila de aprovação do atendimento. Só depois do "aprovo" do dono o agente implementa numa branch separada, roda os testes e mostra o resultado (diff, testes, custo real medido). A ferramenta só liga depois de uma **segunda aprovação**. API paga ou de terceiros só entra se a proposta disser qual API e para quê, e o dono aprovar.
- **Novo agente por pedido:** a mesma coisa para participantes. A proposta traz nome, papel, personalidade, motor (Claude ou Codex), ferramentas a que terá acesso, teto diário e custo/tempo estimados. Aprovado, o agente entra no perfil e aparece na sala e no grafo.
- **Prestação de contas:** cada agente mostra no painel o que fez, quanto tempo levou e quanto gastou (turnos da assinatura, chamadas de API), por tarefa e por dia. O dono pode desligar uma ferramenta ou agente pelo painel.

## v0.3
- **Conselhos** do projeto `7conselho` (estratégia, IA, futuro, gestão) como participantes: `@conselho-gestao` reúne o conselho e devolve a síntese na sala; cada conselheiro aparece no grafo.
- Login simples para o perfil de setor (cada pessoa com sua conta no painel).
- Histórico por cliente e busca.

## Depois
- E-mail como terceira entrada.
- Custo e uso da assinatura por pessoa e por agente.
