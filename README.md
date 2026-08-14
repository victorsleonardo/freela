# Painel de Ganhos — Freelancer

PWA para controlar turnos e ganhos de freelancer. Funciona **offline**, sincroniza entre
celular e computador pelo **Supabase** e não depende de nenhum servidor próprio: são
arquivos estáticos que rodam em qualquer hospedagem (GitHub Pages, Netlify, Vercel).

- Lançamento de turnos (Completo/Meio), valor calculado ou personalizado, com observação
- Calendário mensal com modal por dia, heatmap anual e gráficos
- Metas mensais/anuais, de turnos e de dias trabalhados
- "Leituras do mês": ritmo em relação à meta, comparação com o mês anterior, dia mais rentável
- Backup em JSON, exportação em Excel, CSV e PDF
- Português, inglês e espanhol; BRL, USD, EUR e GBP; tema claro, escuro ou do sistema

---

## Como colocar no ar

### 1. Criar o banco no Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Abra **SQL Editor → New query**, cole o conteúdo de [`supabase/schema.sql`](supabase/schema.sql)
   e rode.
3. Confira em **Authentication → Providers** que "Email" está habilitado.

O `schema.sql` cria a tabela `freelancer_data` e — o mais importante — liga o **Row Level
Security** com quatro policies. Sem isso, qualquer usuário autenticado no seu projeto
conseguiria ler os lançamentos de todos os outros. Para verificar depois de rodar:

```sql
select relname, relrowsecurity from pg_class where relname = 'freelancer_data';
select policyname, cmd from pg_policies where tablename = 'freelancer_data';
```

`relrowsecurity` precisa ser `true` e devem aparecer 4 policies.

### 2. Publicar os arquivos

Suba o repositório em qualquer hospedagem estática. No GitHub Pages: **Settings → Pages →
Deploy from a branch**, escolha a branch e a pasta raiz.

> É preciso servir por **http(s)** — service worker e módulos ES não funcionam abrindo o
> `index.html` direto do disco (`file://`).

Para rodar localmente:

```bash
npm run serve     # http://localhost:8080
```

### 3. Conectar o app

Na primeira abertura o app pede a **Project URL** e a chave **anon public**
(Supabase → Settings → API). Essas duas informações ficam no `localStorage` do
aparelho — a chave anon é pública por design; quem protege os dados é o RLS e o login.
O app recusa explicitamente uma chave `service_role` colada por engano.

Depois é criar a conta com e-mail e senha. Use **o mesmo login** no celular e no
computador: é assim que os dados se encontram.

---

## Como os dados são guardados

Dois documentos JSON por usuário, na tabela `freelancer_data`:

| key | conteúdo |
|-----|----------|
| `entries` | `{ v: 2, entries: [...], savedAt }` — a lista de lançamentos |
| `params` | `{ v: 2, params: {...}, updatedAt }` — tarifas, metas e preferências |

Cada lançamento tem esta forma:

```js
{
  id: "e<uuid>",     // gerado com crypto.randomUUID
  date: "2025-03-07",
  turno: "Completo", // ou "Meio"
  custom: null,      // valor personalizado; tem prioridade sobre a tarifa
  note: "",
  updatedAt: 1710000000000,
  deleted: false     // exclusão é tombstone, não remoção
}
```

### Sincronização

Toda gravação é **ler → mesclar → escrever**:

1. lê o documento remoto;
2. une as listas por `id`, mantendo sempre a versão de `updatedAt` maior;
3. grava o resultado.

Isso resolve o cenário que antes causava perda de dados: celular offline lança um turno
enquanto o computador lança outros três; ao reconectar, todos sobrevivem. Exclusão vira
tombstone (`deleted: true`) para não ressuscitar no merge do outro aparelho, e os
tombstones são varridos depois de 45 dias.

Se a leitura falhar, **não há gravação** — o histórico da nuvem fica intocado e a alteração
espera na fila local, com repetição em backoff exponencial. O cache do `localStorage` é
escrito antes da rede, então nada se perde offline.

---

## Desenvolvimento

```
index.html              markup e nada mais
sw.js                   service worker (cache do shell, offline)
manifest.json           PWA
assets/css/app.css      estilos
assets/js/
  constants.js          chaves, padrões, moedas
  i18n.js               dicionário pt-BR / en / es
  format.js             datas, moeda e números (Intl) — puro
  calc.js               toda a matemática do painel — puro
  merge.js              saneamento e merge da sincronização — puro
  state.js              estado + seletores memoizados + cache local
  db.js                 Supabase: auth, leitura, gravação com merge, fila offline
  actions.js            mutações (adicionar, editar, excluir, importar)
  export.js             JSON, CSV, XLSX, PDF
  main.js               bootstrap
  ui/                   uma tela por arquivo + dom/toast/dialog
vendor/                 supabase-js e xlsx vendorizados (sem CDN)
supabase/schema.sql     tabela + RLS
tests/                  unitários (node:test) e e2e (Playwright)
```

`format.js`, `calc.js` e `merge.js` não tocam no DOM e não têm estado global — é por isso
que dá para testá-los direto no Node.

### Testes

```bash
npm test        # 42 testes unitários da lógica pura
npm run test:e2e  # navegador real, com o Supabase substituído por um dublê
```

O E2E cobre o que quebrava antes: merge entre dois aparelhos, falha de rede sem perda de
lançamento, leitura falha não gravando vazio por cima, escape de dado malicioso vindo da
nuvem e abertura offline pelo service worker.

### Decisões que valem explicação

- **Sem build.** Módulos ES nativos. Editar e recarregar; nada para compilar.
- **Bibliotecas vendorizadas.** O `supabase-js` vinha de CDN: se o CDN caísse (ou a rede
  estivesse fora), o app dava tela branca. Agora ele é servido junto e entra no cache do
  service worker. O `xlsx` é carregado sob demanda, só quando alguém exporta Excel.
- **`xlsx.mini`** em vez do build completo: 250 KB no lugar de 880 KB. Só escrevemos
  planilhas, nunca lemos arquivo de terceiro — as CVEs conhecidas da 0.18.5 são no
  caminho de leitura.
- **Escape em tudo.** A interface é montada com template string; qualquer texto de fora
  passa por `esc()` antes de virar HTML.
- **Ano do Resumo é um seletor**, não um parâmetro fixo. Antes existia um "ano de
  referência" salvo nas configurações que valia para o heatmap mas não para as metas —
  dava para ver 2026 num cartão e 2025 no cartão do lado.

---

## Atalhos de teclado

| Tecla | Ação |
|-------|------|
| `N` | novo lançamento |
| `/` | buscar |
| `1`–`6` | ir para a aba |
| `H` | mostrar/ocultar valores |
| `T` | ir para hoje no calendário |
| `Esc` | fechar modal |
| `?` | esta lista |

---

## Licença

Uso pessoal.
