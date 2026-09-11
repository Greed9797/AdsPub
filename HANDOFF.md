# HANDOFF — AdPub

Data: 2026-09-11. Branch `main` limpa, último commit `74e2f61`.

## 1. Estado atual

- UI migrada para Astryx (fases 1–3: fundação, primitivas, shell) + vocabulário PT para leigos (fases A–C).
- Gates verdes: typecheck, eslint, build, **e2e 6/6**, screenshot real conferido.
- Slugs de API e testes intactos — só a camada visual fala PT.

## 2. Como rodar local

```bash
bash tmp/dev-up.sh   # recria colima se morto, sobe compose, migra, liga api/worker/web
open http://localhost:3000/
```

- Web `:3000`, API `:4000` (`/health`). Sem login: entra direto como admin dev.
- Se o Mac dormiu, o colima morre — rode `dev-up.sh` de novo.
- Banco local tem **seed demo** (BM Demo, Demo Store, act_demo, 5 lotes). Apagar antes de teste sério:
  `DELETE FROM batches; DELETE FROM ad_accounts; DELETE FROM clients; DELETE FROM meta_connections;`

## 3. O que falta criar

1. **Deploy produção** — não existe nada: sem Dockerfile, sem manifests, sem CI. `infra/` só tem `docker-compose.yml` local. Definir onde hospeda (web+api+worker+Postgres+Redis+MinIO/S3) e escrever os arquivos.
2. **Piloto e rollout (T098/T100)** — plano humano em `docs/piloto-e-rollout.md`, checkboxes zerados: escolher 3 contas, cadastrar clientes, criar 2 gestores `manager`, rodar 2 semanas.
3. **Meta App Review** — ver `docs/meta-app-review.md`; sem aprovação, token real não opera.
4. **Migrations vs produção** — conferir `packages/db` contra o banco real antes do primeiro deploy (o histórico local foi recriado do zero várias vezes).
5. **Limpeza de demo** —/chave Google real, `AUTH_SECRET`/`MASTER_KEY` de produção, `META_TIER` conferido via `/api/v1/health`.

## 4. Débitos técnicos assumidos (não mexer sem motivo)

- **Inputs nativos mantidos**: Astryx `TextInput` é controlled sem `name` — quebraria os FormData. `inputClass` fica.
- **`ButtonLink`** (`components/button-link.tsx`): `as={Link}` não cruza server→client; wrapper client resolve.
- **Botão primário com texto ink** (não branco): decisão AA 5.91:1 sobre o laranja. Não voltar para texto branco.
- **`next lint` quebrado**: Next 16 removeu o comando; lint válido é `pnpm run lint` (raiz).
- **Playwright browsers**: reinstalar com `pnpm exec playwright install chromium --only-shell` se o cache sumir.
- **Warning Astryx "theme build"**: tema usa runtime injection; pré-compilar com `theme build` quando performance importar.
- **Mapa PT em `ui.tsx`** (`STATUS_PT/CTA_PT/FORMAT_PT/GOAL_PT`): ao adicionar slug novo na API, adicionar o rótulo aqui ou a UI mostra o slug cru (fallback proposital).
- **`tmp/` é ignorado pelo git**: `dev-up.sh` e `dev-logs/dev.env` vivem só nesta máquina.

## 5. Próximos passos sugeridos

1. Deploy + CI (item 1 acima) — caminho crítico.
2. Piloto T098 com 2 gestores.
3. Revisar `docs/erros-meta.md` e `docs/spike-meta.md` antes do App Review.
4. Se criar slug/status novo: atualizar mapa PT + spec e2e correspondente.
