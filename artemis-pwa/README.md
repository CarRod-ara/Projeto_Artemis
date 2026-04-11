# 🍰 Luminar PWA - Sistema de Gestão para Doçuras de Artemis

Sistema completo de gestão de vendas para microempreendedores, com sugestão inteligente de mix de produtos, controle de fiados e análise de eficiência. Funciona 100% offline como PWA (Progressive Web App).

## ✨ Funcionalidades

### 📊 Dashboard
- Metas diárias (Sobrevivência, Confortável, Ideal)
- Barra de progresso visual
- Gráfico de vendas da semana
- Sugestão de mix baseada no clima e histórico
- Previsão do tempo integrada (Open-Meteo)

### 📝 Registro Diário
- Formato idêntico ao seu registro Obsidian atual
- Entrada de fluxo (pagos, fiados, recebidos)
- Tempo operacional (início/fim)
- Itens vendidos por categoria (levado/vendido)
- Cálculo automático de eficiência
- Observações e feedback dos agentes

### 👥 Controle de Fiados
- Cadastro de devedores
- Alerta de fiados vencidos
- Cálculo de total a receber
- Quitação com um clique

### 📈 Relatórios
- Estatísticas de vendas
- Exportação de backup (JSON)
- Exportação para Obsidian (Markdown)
- Importação de dados

### 🧠 Inteligência de Mix
- Regras configuráveis por você
- Ajustes automáticos baseados em:
  - Clima (sol, chuva, temperatura)
  - Dia da semana
  - Histórico de eficiência
- Aprendizado com seus dados

## 🛠️ Tecnologias (Zero Dependências Externas)

- **HTML5 + CSS3** - Estrutura e estilos
- **Vanilla JavaScript** - Lógica da aplicação
- **IndexedDB** - Banco de dados local
- **Service Workers** - Funcionalidade offline
- **Chart.js** - Gráficos (CDN)
- **Tailwind CSS** - Estilos utilitários (CDN)
- **Open-Meteo API** - Previsão do tempo (gratuita, sem API key)

## 🚀 Deploy (Gratuito)

### Opção 1: GitHub Pages (Recomendada)

1. Crie um repositório no GitHub
2. Faça upload de todos os arquivos
3. Vá em **Settings > Pages**
4. Selecione branch `main` e pasta `/ (root)`
5. Seu site estará em `https://seuusuario.github.io/artemis-pwa`

### Opção 2: Vercel (Mais rápido)

1. Acesse [vercel.com](https://vercel.com)
2. Login com GitHub
3. Importe seu repositório
4. Deploy automático a cada push

### Opção 3: Netlify

1. Acesse [netlify.com](https://netlify.com)
2. Arraste a pasta do projeto para a área de deploy
3. Pronto! URL gerada automaticamente

## 📱 Instalação como App

### Android (Chrome)
1. Acesse o site pelo Chrome
2. Toque em **"Adicionar à tela inicial"**
3. O app será instalado como aplicativo nativo

### iOS (Safari)
1. Acesse pelo Safari
2. Toque no botão **Compartilhar**
3. Selecione **"Adicionar à Tela de Início"**

## 🔒 Segurança

- **Dados 100% locais** - Nada sai do seu dispositivo
- **HTTPS obrigatório** - Para funcionar como PWA
- **Sem servidor backend** - Zero risco de vazamento
- **Backup criptografado** - Exportação JSON protegida

## 📂 Estrutura de Arquivos

```
artemis-pwa/
├── index.html          # Página principal
├── manifest.json       # Configuração PWA
├── sw.js              # Service Worker (offline)
├── icons/
│   └── icon.svg       # Ícone do app
├── js/
│   ├── db.js          # IndexedDB manager
│   ├── weather.js     # API de clima
│   ├── mixEngine.js   # Motor de sugestão
│   └── app.js         # Aplicação principal
└── README.md          # Este arquivo
```

## 🎯 Roadmap

### v1.0 (Atual)
- [x] Dashboard com metas
- [x] Registro diário completo
- [x] Controle de fiados
- [x] Gráficos semanais
- [x] Sugestão de mix
- [x] Exportação Obsidian
- [x] Funciona offline

### v1.1 (Futuro)
- [ ] Multi-usuário (até 5)
- [ ] Sync via GitHub Gist
- [ ] Notificações push
- [ ] Relatórios PDF
- [ ] Tema escuro

### v2.0 (Futuro)
- [ ] App nativo (Capacitor)
- [ ] Leitura de QR Code
- [ ] Integração WhatsApp
- [ ] Machine Learning avançado

## 📝 Dados de Exemplo

O sistema já vem com:
- 27 produtos cadastrados (seu catálogo atual)
- 4 regras de mix pré-configuradas
- Metas: R$110 / R$150 / R$260

## 🤝 Contribuição

Este é um projeto pessoal para Doçuras de Artemis, mas sinta-se livre para forkar e adaptar para seu negócio!

## 📄 Licença

MIT License - Livre para uso comercial e pessoal.

---

**Feito com 💜 por Meph para Doçuras de Artemis**
