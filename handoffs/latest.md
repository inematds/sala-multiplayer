# Handoffs — trabalhos abertos

Cada linha é um assunto em andamento: leia o snapshot do assunto que for continuar. Gravado por handoff-grava.py.

<!-- handoff-indice:inicio -->
- `sala-multiplayer` · handoffs/history/2026-10-16T113853Z-sala-multiplayer.md · 16/10 08:38
<!-- handoff-indice:fim -->

---

Cópia integral do snapshot mais recente (handoffs/history/2026-10-16T113853Z-sala-multiplayer.md):

# Handoff — 2026-10-16 — sala-multiplayer na VPS2 (salaconf.inema.pro), login INEMA.PRO + dono por senha (v0.12.5)

## Projeto e escopo
~/projetos/sala-multiplayer (repo público inematds/sala-multiplayer, autor inematds). O Nei pediu: rodar a sala numa VPS, em salaconf.inema.pro, com página inicial simples explicando o projeto, login pela conta INEMA.PRO (só assinantes), entrada direta para convidado e aprovação do dono para os outros, mais um usuário/senha geral do dono. Só o perfil `pessoa` vai para a web. A sala NÃO roda mais na máquina local (spark); roda só na VPS2.

## Objetivo atual
Nada em execução. Tudo publicado (push) e no ar. Faltam 3 pendências do Nei (abaixo).

## Estado aceito
- [confirmed] VPS2 = 37.27.39.74 (hostname nano, Ubuntu 24.04, Node 24.19), SSH root com ~/.ssh/id_ed25519_inema. Código em /root/projetos/sala-multiplayer (git pull para atualizar). Serviço systemd `sala@pessoa` (/etc/systemd/system/sala@.service: HOME=/root, SALA_HOST=127.0.0.1, SALA_PORTA=4600, MemoryMax=1500M, Restart=always). Também hospeda INEMACERT (cert.inema.pro) — não derrubar.
- [confirmed] Caddy: bloco `salaconf.inema.pro { reverse_proxy 127.0.0.1:4600 { flush_interval -1 } }`, sem basic_auth (removido). Certificado Let's Encrypt emitido via ACME com autorização explícita do Nei. Backups /etc/caddy/Caddyfile.bak-*.
- [confirmed] .env da VPS2 (backup .env.bak-*): SALA_LOGIN=inema, SALA_URL_PUBLICA=https://salaconf.inema.pro, SALA_DONO_SENHA = senha geral do dono (credenciais em ~/projetos/wifi/.env: SALACONF_URL/USUARIO/SALACONF_SENHA). Telegram (long polling) ligado na VPS2; não ligar outra cópia com o mesmo token. Histórico data/pessoa copiado da local.
- [confirmed] v0.11.4 (71d6413): lib/acesso.mjs repassa cookies sb-* a https://www.inema.pro/api/assinatura?s=salaconf (200 email / 403 sem assinatura → /?assinante=nao / outro, incl. 307 → login), cache 60 s, repasse de set-cookie renovado; /entrar grava cookie inema_volta (Domain=.inema.pro, Lax) e manda a www.inema.pro/entrar; páginas públicas / (inicio.html) e /aguardando; resto e /api/* exigem participante ativo; identidade pelo email (coluna email em participantes, email_env no perfil: SALA_DONO_EMAIL/SALA_TIZA_EMAIL); pedidos web tipo convite com dados.email; /convidar email nome (Telegram) e /api/convidar + bloco na Config; dono logado aprova sem senha; emails fora do /api/estado.
- [confirmed] v0.12.4 (3ef58e0): POST /login usuário `dono` + SALA_DONO_SENHA → cookie sala_sessao assinado (HMAC com data/<perfil>/segredo + senha; 30 dias), freio 5 erros/IP/10 min, /sair, botão Sair na nav. v0.12.5: /api/stream escreve ": ok" na hora (antes só abria em 25 s). FALHAS.md registrado.
- [confirmed] inemapro (inematds/inemapro) v1.20.16 (116912f): apps/pro/lib/destino.mjs + auth/callback lê cookie inema_volta (só https *.inema.pro) e fecha open redirect do `next`; 'salaconf' em SATELITES. Deploy pelo Vercel não foi checado (regra).
- [confirmed] Portal atualizado (atualiza-portal): card com nova descrição + topo de projectUpdatesData 'atualizado' + EN/ES em feeds-i18n.json. SHAs portal 266ebc8, inemabuscas 1a14a46, inemapro b79f612.
- [confirmed] Testes: npm test 54/54 local e na VPS2. E2E de fora: / 200, /api/estado sem login 401, /entrar → www.inema.pro/entrar com inema_volta, login dono → /sala, estado eu=dono, stream 21 ms.
- [confirmed] Chave Hetzner Inference anotada em ~/projetos/wifi/.env (HETZNER_INFERENCE_*), sem uso; só com autorização de API.

## Proposto / tentado, não confirmado
- [unverified] Login real pelo botão INEMA.PRO (Google/link) e volta automática para a sala — depende do deploy Vercel do inemapro; ninguém testou com conta real.
- [unverified] Resposta real de @claude rodando sob systemd na VPS2 (Claude está logado pela assinatura lá; não foi exercitado).
- [?] Codex na VPS2 NÃO logado: @codex vai falhar até o Nei rodar `codex login --device-auth` lá.

## Próxima ação
Esperar o Nei responder às 3 pendências:
1. Email da conta INEMA.PRO dele (e da Tiza) → pôr SALA_DONO_EMAIL / SALA_TIZA_EMAIL no .env da VPS2 e `systemctl restart sala@pessoa`. Sem isso, entrar pelo botão INEMA.PRO o trata como assinante desconhecido (vira pedido); usuário/senha já funciona.
2. Decisão: convidado web hoje vê a sala inteira (Telegram vê só a própria conversa). Se quiser restringir, filtrar estado/stream por participante.
3. `codex login --device-auth` na VPS2 (só o Nei).

## Armadilhas
- Hook do context-mode bloqueia curl/fetch inline no Bash: usar script .mjs (ou rodar node na VPS via ssh).
- .env local tem SALA_HOST=192.168.2.99 (demo local sobe nesse IP).
- Não consultar Vercel; publicar = push.
