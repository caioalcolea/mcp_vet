# 📊 Dashboard de Monitoramento

## 🎯 Visão Geral

O dashboard visual permite acompanhar em tempo real todas as operações do bot de reativação, incluindo:
- Mensagens enviadas
- Status de entregas
- Estatísticas de clientes e pets
- Débitos financeiros
- Execução manual de jobs

---

## 🌐 Acesso

**URL**: https://automacaobs.talkhub.me/dashboard

---

## ✨ Funcionalidades

### 1. **Cards de Estatísticas**

Exibe em tempo real:
- 📨 **Mensagens Hoje** - Total enviado hoje + taxa de sucesso
- 👥 **Total Clientes** - Clientes cadastrados no sistema
- 🐾 **Total Pets** - Pets registrados
- 💰 **Débitos Abertos** - Soma total de valores em aberto

### 2. **Gráficos Interativos**

#### Mensagens por Tipo (Doughnut Chart)
Distribuição das mensagens enviadas hoje por categoria:
- 💉 Vacinas
- 💰 Financeiro
- 🛁 Banhos
- 📅 Consultas
- ⭐ Satisfação

#### Timeline de Mensagens (Line Chart)
Evolução das mensagens nos últimos 7 dias:
- Linha azul: Total de mensagens
- Linha verde: Mensagens com sucesso
- Visualização de tendências

### 3. **Tabela de Mensagens Recentes**

Lista as últimas 20 mensagens enviadas com:
- Data e hora do envio
- Nome do cliente
- Telefone
- Tipo de mensagem (com badge colorido)
- Status (✓ Enviado / ✗ Erro)

### 4. **Execução Manual de Jobs**

Botões para executar jobs sob demanda:
- 💉 **Vacinas** - Processar reativações de vacinas
- 💰 **Financeiro** - Enviar cobranças
- 🛁 **Banhos** - Lembretes de banho/tosa
- 📅 **Consultas** - Confirmações de consulta
- ⭐ **Satisfação** - Pesquisas de satisfação

Feedback visual: ✅ Sucesso / ❌ Erro

---

## 🔄 Atualização Automática

O dashboard atualiza automaticamente a cada **30 segundos**, incluindo:
- Todas as estatísticas
- Gráficos
- Tabela de mensagens
- Timestamp no cabeçalho

---

## 🚀 Como Atualizar no Servidor

### 1. Pull das mudanças

```bash
cd /root/mcp_bs_novo/bot_reativacao
git pull
```

### 2. Rebuild e redeploy

```bash
./deploy_swarm.sh
```

O script automaticamente:
- ✅ Faz build da nova imagem (com dashboard incluído)
- ✅ Faz deploy no Swarm
- ✅ Verifica health

### 3. Verificar

```bash
# Ver logs
docker service logs -f reativa_bicho_solto_bot-reativacao

# Deve mostrar:
# "Servidor rodando na porta 2080"
# "Dashboard disponível em /dashboard"
```

### 4. Acessar

Abra no navegador:
**https://automacaobs.talkhub.me/dashboard**

---

## 🔌 API Endpoints

O dashboard consome os seguintes endpoints:

### GET /api/dashboard/stats
Estatísticas gerais do sistema.

**Resposta**:
```json
{
  "success": true,
  "data": {
    "customers": 150,
    "pets": 230,
    "messages": {
      "today": 45,
      "week": 312,
      "successRate": 96.5
    },
    "messagesByType": [
      { "type": "vaccine", "count": 12 },
      { "type": "financial", "count": 8 }
    ],
    "upcoming": {
      "vaccines": 25,
      "appointments": 10
    },
    "financial": {
      "totalDebts": 15430.50
    }
  }
}
```

### GET /api/dashboard/recent-messages?limit=20
Últimas mensagens enviadas.

**Resposta**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "type": "vaccine",
      "customer": {
        "name": "João Silva",
        "phone": "5519999999999"
      },
      "sentAt": "2025-10-27T16:30:00Z",
      "status": "success",
      "error": null
    }
  ]
}
```

### GET /api/dashboard/stats-by-day?days=7
Estatísticas diárias dos últimos N dias.

### GET /api/dashboard/top-customers?limit=10
Top clientes com mais reativações.

### POST /api/dashboard/run-job/:jobName
Executa um job manualmente.

**Jobs disponíveis**:
- `vaccines`
- `financial`
- `grooming`
- `appointments`
- `satisfaction`

**Exemplo**:
```bash
curl -X POST https://automacaobs.talkhub.me/api/dashboard/run-job/vaccines
```

---

## 🎨 Personalização

### Cores por Tipo de Mensagem

Definidas no código JavaScript do dashboard:

```javascript
const typeColors = {
    vaccine: '#3b82f6',      // Azul
    financial: '#10b981',    // Verde
    grooming: '#8b5cf6',     // Roxo
    appointment: '#f59e0b',  // Amarelo
    satisfaction: '#ec4899'  // Rosa
};
```

### Interval de Atualização

Por padrão: **30 segundos**

Para alterar, edite em `dashboard.html`:
```javascript
// Auto-refresh a cada 30 segundos
setInterval(loadAll, 30000);  // Trocar 30000 por outro valor em ms
```

---

## 📱 Responsividade

O dashboard é totalmente responsivo:
- Desktop: 4 colunas de cards
- Tablet: 2 colunas
- Mobile: 1 coluna
- Gráficos adaptam automaticamente

---

## 🔒 Segurança

### Acesso Público
Atualmente o dashboard está **aberto** (sem autenticação).

### Adicionar Autenticação (Opcional)

Para proteger o dashboard, adicione middleware no `src/index.ts`:

```typescript
// Middleware de autenticação simples
const dashboardAuth = (req, res, next) => {
  const auth = req.headers['authorization'];
  if (auth === 'Bearer MEU_TOKEN_SECRETO') {
    next();
  } else {
    res.status(401).json({ error: 'Não autorizado' });
  }
};

// Aplicar nas rotas do dashboard
app.get('/dashboard', dashboardAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.use('/api/dashboard', dashboardAuth, dashboardRoutes);
```

---

## 🐛 Troubleshooting

### Dashboard não carrega

```bash
# Verificar se serviço está rodando
docker service ps reativa_bicho_solto_bot-reativacao

# Ver logs
docker service logs reativa_bicho_solto_bot-reativacao | grep dashboard

# Testar endpoint diretamente
curl https://automacaobs.talkhub.me/dashboard
```

### API retorna erro 500

```bash
# Ver logs de erro
docker service logs reativa_bicho_solto_bot-reativacao | grep ERROR

# Verificar conexão com banco
docker service logs reativa_bicho_solto_bot-reativacao | grep PostgreSQL
```

### Gráficos não aparecem

1. Abrir DevTools (F12) no navegador
2. Ver console para erros JavaScript
3. Verificar se Chart.js está carregando

### Dados não atualizam

1. Verificar se está em HTTPS (HTTP pode bloquear requests)
2. Ver Network tab no DevTools
3. Verificar se APIs estão respondendo

---

## 📊 Screenshots

### Desktop
- Header com gradiente azul-roxo
- 4 cards de estatísticas lado a lado
- 2 gráficos (doughnut + line) lado a lado
- Botões de ação em linha
- Tabela responsiva

### Mobile
- Stack vertical
- Cards em coluna única
- Gráficos responsivos
- Botões em grid 2 colunas
- Tabela com scroll horizontal

---

## 🆕 Próximas Melhorias

Possíveis adições futuras:
- [ ] Autenticação com usuário/senha
- [ ] Filtros por data
- [ ] Exportar relatórios (PDF/Excel)
- [ ] Notificações push
- [ ] WebSocket para atualização em tempo real
- [ ] Dashboard mobile app (PWA)
- [ ] Múltiplos idiomas
- [ ] Temas claro/escuro
- [ ] Alertas configuráveis

---

## 📞 Suporte

Para problemas ou dúvidas:
1. Verificar logs: `docker service logs reativa_bicho_solto_bot-reativacao`
2. Testar endpoints da API manualmente
3. Ver console do navegador (F12)

---

## ✅ Checklist de Deploy

- [ ] Pull das mudanças: `git pull`
- [ ] Rebuild: `./deploy_swarm.sh`
- [ ] Serviço rodando: `docker stack ps reativa_bicho_solto`
- [ ] Health OK: `curl https://automacaobs.talkhub.me/health`
- [ ] Dashboard acessível: abrir `https://automacaobs.talkhub.me/dashboard`
- [ ] Dados carregam corretamente
- [ ] Gráficos aparecem
- [ ] Botões de jobs funcionam
- [ ] Auto-refresh funciona (aguardar 30s)
