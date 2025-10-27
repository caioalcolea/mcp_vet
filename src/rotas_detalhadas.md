# ROTAS DO SISTEMA VETCARE PRO

## Rotas Web (routes/web.php)
- GET  /             - Página inicial (redireciona para login)
- GET  /login        - Tela de login
- POST /login        - Processar login
- GET  /logout       - Logout
- GET  /dashboard    - Dashboard principal
- GET  /agenda       - Módulo de agenda
- GET  /clientes     - Módulo de clientes
- GET  /pets         - Módulo de pets
- GET  /financeiro   - Módulo financeiro
- GET  /catalogo     - Catálogo de produtos/serviços

## Rotas API (routes/api.php)

### Dashboard
- GET  /api/dashboard/insights    - Dados do dashboard

### Pets
- GET    /api/pets                     - Listar todos os pets
- GET    /api/pets/{id}               - Detalhes de um pet
- POST   /api/pets                    - Criar novo pet
- PUT    /api/pets/{id}               - Atualizar pet
- DELETE /api/pets/{id}               - Excluir pet
- GET    /api/pets/{id}/vacinacoes    - Histórico de vacinações
- POST   /api/pets/{id}/vacinacao     - Registrar vacinação
- GET    /api/pets/{id}/historico-medico - Histórico médico
- GET    /api/pets/{id}/anamnese      - Buscar anamneses
- POST   /api/pets/{id}/anamnese      - Salvar anamnese
- GET    /api/pets/{id}/estatisticas  - Estatísticas do pet

### Clientes
- GET    /api/clientes                 - Listar clientes
- GET    /api/clientes/{id}           - Detalhes do cliente
- POST   /api/clientes                - Criar cliente
- PUT    /api/clientes/{id}           - Atualizar cliente
- DELETE /api/clientes/{id}           - Excluir cliente
- GET    /api/clientes/{id}/pets      - Listar pets do cliente

### Agendamentos
- GET    /api/agendamentos            - Listar agendamentos
- GET    /api/agendamentos/{id}       - Detalhes do agendamento
- POST   /api/agendamentos            - Criar agendamento
- PUT    /api/agendamentos/{id}       - Atualizar agendamento
- DELETE /api/agendamentos/{id}       - Excluir agendamento
- PUT    /api/agendamentos/{id}/status - Mudar status
- PUT    /api/agendamentos/{id}/data  - Remarcar

### Financeiro
- GET    /api/financeiro/dashboard    - Dashboard financeiro
- GET    /api/financeiro/contas-receber - Listar contas a receber
- POST   /api/financeiro/contas-receber - Criar conta a receber
- PUT    /api/financeiro/contas-receber/{id} - Atualizar conta
- DELETE /api/financeiro/contas-receber/{id} - Excluir conta
- POST   /api/financeiro/contas-receber/{id}/pagar - Registrar pagamento
- GET    /api/financeiro/contas-pagar - Listar contas a pagar
- POST   /api/financeiro/contas-pagar - Criar conta a pagar
- PUT    /api/financeiro/contas-pagar/{id} - Atualizar conta
- DELETE /api/financeiro/contas-pagar/{id} - Excluir conta
- POST   /api/financeiro/contas-pagar/{id}/pagar - Registrar pagamento

### Catálogo
- GET    /api/catalogo/dashboard      - Dashboard do catálogo
- GET    /api/catalogo/tipos-servicos - Tipos de serviços
- GET    /api/catalogo/categorias-produtos - Categorias de produtos
- GET    /api/catalogo/servicos       - Listar serviços
- POST   /api/catalogo/servicos       - Criar serviço
- PUT    /api/catalogo/servicos/{id}  - Atualizar serviço
- DELETE /api/catalogo/servicos/{id}  - Excluir serviço
- GET    /api/catalogo/produtos       - Listar produtos
- POST   /api/catalogo/produtos       - Criar produto
- PUT    /api/catalogo/produtos/{id}  - Atualizar produto
- DELETE /api/catalogo/produtos/{id}  - Excluir produto
- POST   /api/catalogo/produtos/{id}/ajustar-estoque - Ajustar estoque
- GET    /api/catalogo/planos         - Listar planos

### Dados Auxiliares
- GET    /api/vacinas                 - Listar vacinas disponíveis
- GET    /api/veterinarios            - Listar veterinários
- GET    /api/servicos                - Listar serviços
