# 🍰 Luminar PWA – Gestão Inteligente para Vendedores de Rua

> **Versão 1.0 (Alpha Pública)**  
> *Encerrada em 12 de Abril de 2026*  
> Este repositório contém a versão pública inicial do Luminar. A partir da **V2.0**, o desenvolvimento continuará em repositório privado, com foco em segurança financeira, alocação de lucros e escalabilidade.

---

## ✨ O que o Luminar V1.0 faz?

O Luminar é um **PWA offline‑first** desenvolvido para vendedores de rua (brigadeiros, brownies, bolos, etc.). Ele substitui cadernos e planilhas por um assistente completo que **sugere o mix de produtos ideal**, controla fiados, acompanha metas e gera relatórios – tudo funcionando perfeitamente sem internet.

### 📊 Dashboard Inteligente
- Metas diárias (Sobrevivência, Confortável, Ideal) com barra de progresso.
- **Sugestão de mix** baseada em clima, dia da semana e histórico de vendas.
- **Abas Hoje / Amanhã** para planejamento com previsão do tempo.
- Gráfico de vendas da semana.
- Cards de faturamento semanal e mensal (já somando recebidos de fiados).

### 📝 Registro Diário Completo
- Formulário idêntico ao registro do Obsidian.
- Entrada de fluxo: Pagos, Fiados e Recebidos.
- **Accordion de categorias** (sanfonas) para evitar rolagem infinita.
- **Pré‑preenchimento inteligente** com sugestão de mix (sem valores automáticos).
- Horário de início já preenchido com a preferência do vendedor (capturada no onboarding).
- Cálculo automático de eficiência geral e por categoria.

### 👥 Controle de Fiados
- Lista de fiados ativos e vencidos.
- **Quitação com confirmação inteligente**: pergunta se o valor deve ser automaticamente adicionado ao caixa do dia.
- Total a receber atualizado em tempo real.

### 📈 Relatórios e Backup
- Estatísticas de dias registrados.
- **Exportação / Importação de backup (JSON)** para compartilhar entre dispositivos.
- Exportação para **Obsidian (Markdown)** compatível com seu formato `#financeiro`.

### 🧠 Motor de Sugestão de Mix (MixEngine)
- Combina **regras configuráveis**, **impacto do clima** e **eficiência histórica**.
- **Modelo de dados avançado**: `unidade_base` e `fator_conversão` (ex: 1 Caixa = 4 Avulsos) – preparado para combos e controle de estoque.
- **Valor mínimo configurável** para o mix (ex: "quero sugestão de pelo menos R$250").

### 🔐 Multi‑usuário e Personalização
- Isolamento total de dados por vendedor (IndexedDB com `userId`).
- Onboarding assistido no primeiro acesso (nome da loja, perfil fixo/ambulante, horário habitual).
- Menu hambúrguer (☰) agrupando configurações, backup e logout.

### 🌦️ Clima e Localização
- Previsão do tempo via **Open‑Meteo** (gratuita, sem API key).
- Busca manual de cidade ou **uso do GPS** do dispositivo.
- Cache de 30 minutos para economia de dados.

### 📦 Arquitetura Offline‑First
- **IndexedDB** para todos os dados (registros, produtos, fiados, configurações).
- **Service Worker** com estratégia cache‑first (assets) e network‑first (HTML).
- Funciona integralmente sem internet – ideal para a rua.

---

## 🛠️ Tecnologias Utilizadas

| Camada | Tecnologia |
| :--- | :--- |
| **Frontend** | HTML5, CSS3, JavaScript (ES6+) |
| **Estilização** | Tailwind CSS (via CDN) |
| **Gráficos** | Chart.js |
| **Banco de Dados** | IndexedDB (gerenciado por `db.js`) |
| **Offline** | Service Worker (`sw.js`) |
| **Clima** | Open‑Meteo API + Nominatim (OpenStreetMap) |
| **PWA** | Manifesto Web, instalável em Android/iOS |

*Nenhuma dependência de backend ou bibliotecas pesadas – tudo roda localmente.*

---

## 📂 Estrutura de Arquivos (V1.0)
artemis-pwa/
├── index.html # Página principal (SPA)
├── manifest.json # Configuração PWA
├── sw.js # Service Worker (cache e offline)
├── README.md # Este documento
├── icons/ # Ícones do app
│ ├── icon.svg
│ ├── icon-192x192.png
│ └── icon-512x512.png
└── js/
├── app.js # Controlador principal (monolítico – será modularizado na V2)
├── db.js # Gerenciador do IndexedDB
├── weather.js # Clima e geolocalização
├── mixEngine.js # Motor de sugestão de mix
├── health-check.js # Diagnóstico automático (console)
└── utils.js # Funções auxiliares (escapeHtml, safeNumber, etc.)

---

## 🚀 Deploy Rápido (GitHub Pages)

1. Faça um fork ou clone deste repositório.
2. Acesse **Settings > Pages** no GitHub.
3. Selecione a branch `main` e a pasta `/ (root)`.
4. O app estará disponível em `https://seu-usuario.github.io/luminar-pwa`.

*Também funciona perfeitamente em **Vercel** ou **Netlify** (arraste a pasta).*

---

## 📱 Instalação como App (PWA)

- **Android (Chrome)**: Menu ⋮ > "Adicionar à tela inicial".
- **iOS (Safari)**: Compartilhar > "Adicionar à Tela de Início".

O app abrirá em tela cheia, como um aplicativo nativo.

---

## ✅ Funcionalidades Concluídas na V1.0

- [x] Login multi‑usuário (isolamento de dados)
- [x] Personalização (nome da loja, vendedor)
- [x] CRUD completo de produtos
- [x] Configurações: Metas (diária/semanal/mensal), Indicadores, Localização
- [x] Onboarding guiado (perfil fixo/ambulante, horário)
- [x] Botão Quitar com confirmação e integração automática ao caixa
- [x] Accordion no Registro de Vendas
- [x] Modelo `unidade_base` + `fator_conversao` para embalagens
- [x] Seleção de localização (GPS + busca manual)
- [x] Mix sugerido com valor mínimo configurável e abas Hoje/Amanhã
- [x] Menu Hambúrguer (agrupando ações)
- [x] Correção de bugs: botões "X", temperatura inteira, metas no Dashboard
- [x] Arquitetura Offline First completa

---

## 🔮 O que vem na V2.0? (Desenvolvimento Privado)

A partir da **Versão 2.0**, o projeto entrará em um novo patamar, focado em **saúde financeira** e **segurança**:

- 🔐 **Criptografia de dados sensíveis** (custos fixos, metas, alocações) usando Web Crypto API.
- 💰 **Onboarding Financeiro** para capturar gastos reais do vendedor.
- 🎯 **Metas Recomendadas Inteligentes** calculadas a partir dos custos.
- 📊 **Alocação de Vendas (50/30/10/10)** exibida no Dashboard.
- 🏗️ **Refatoração modular** do `app.js` para escalabilidade.
- 📈 Gráfico de eficiência semanal, CMV, relatórios avançados e muito mais.

*O repositório público será arquivado como referência para a comunidade. Para acompanhar o futuro do Luminar, fique de olho nos anúncios!*

---

## 🤝 Para Desenvolvedores e Entusiastas

Este código é oferecido como **material de estudo e inspiração**. Você pode:

- Estudar a implementação de um PWA offline‑first com IndexedDB.
- Entender como funciona um motor de sugestão baseado em regras e histórico.
- Adaptar a estrutura para o seu próprio negócio (doces, salgados, artesanato, etc.).

Fique à vontade para abrir issues com dúvidas ou sugestões – elas podem influenciar a V2.0!

---

## 📄 Licença

MIT License – Livre para uso pessoal e comercial, com atribuição.

---

**Feito com 💜 por Meph para Doçuras de Artemis**  
*"Transformando vendas de rua em decisões inteligentes."*
