<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Pet;
use App\Models\Cliente;
use App\Models\Vacina;
use App\Models\Vacinacao;
use App\Models\Consulta;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Exception;

class PetController extends Controller
{
    public function index()
    {
        try {
            $pets = Pet::with('cliente')
                ->select('pets.*')
                ->selectRaw('
                    (SELECT COUNT(*) FROM vacinacoes v 
                     WHERE v.pet_id = pets.id 
                     AND v.proxima_dose > CURRENT_DATE) as vacinas_pendentes
                ')
                ->get()
                ->map(function ($pet) {
                    // Adicionar campos calculados
                    $pet->cliente_nome = $pet->cliente ? $pet->cliente->nome : 'Sem tutor';
                    $pet->cliente_telefone = $pet->cliente ? $pet->cliente->telefone : '';
                    $pet->foto_url = $pet->foto ? asset('storage/' . $pet->foto) : null;
                    $pet->vacinas_em_dia = $pet->vacinas_pendentes > 0;
                    
                    // Calcular idade formatada
                    if ($pet->data_nascimento) {
                        $nascimento = new \DateTime($pet->data_nascimento);
                        $hoje = new \DateTime();
                        $diff = $hoje->diff($nascimento);
                        
                        if ($diff->y > 0) {
                            $pet->idade_formatada = $diff->y . ' ' . ($diff->y == 1 ? 'ano' : 'anos');
                            if ($diff->m > 0) {
                                $pet->idade_formatada .= ' e ' . $diff->m . ' ' . ($diff->m == 1 ? 'mês' : 'meses');
                            }
                        } else {
                            $pet->idade_formatada = $diff->m . ' ' . ($diff->m == 1 ? 'mês' : 'meses');
                        }
                    } else {
                        $pet->idade_formatada = 'Idade desconhecida';
                    }
                    
                    return $pet;
                });

            return response()->json($pets);
        } catch (Exception $e) {
            Log::error('Erro ao listar pets: ' . $e->getMessage());
            return response()->json(['error' => 'Erro ao buscar pets'], 500);
        }
    }

    public function show($id)
    {
        try {
            $pet = Pet::with(['cliente', 'vacinacoes.vacina', 'consultas'])
                ->findOrFail($id);
            
            // Adicionar dados do cliente diretamente no pet
            if ($pet->cliente) {
                $pet->cliente_nome = $pet->cliente->nome;
                $pet->cliente_telefone = $pet->cliente->telefone;
                $pet->cliente_whatsapp = $pet->cliente->whatsapp ?: $pet->cliente->telefone;
                $pet->cliente_email = $pet->cliente->email;
                $pet->cliente_endereco = $this->formatarEndereco($pet->cliente);
            } else {
                $pet->cliente_nome = 'Sem tutor';
                $pet->cliente_telefone = '';
                $pet->cliente_whatsapp = '';
                $pet->cliente_email = '';
                $pet->cliente_endereco = '';
            }
            
            // Calcular idade
            if ($pet->data_nascimento) {
                $nascimento = new \DateTime($pet->data_nascimento);
                $hoje = new \DateTime();
                $diff = $hoje->diff($nascimento);
                
                if ($diff->y > 0) {
                    $pet->idade_formatada = $diff->y . ' ' . ($diff->y == 1 ? 'ano' : 'anos');
                    if ($diff->m > 0) {
                        $pet->idade_formatada .= ' e ' . $diff->m . ' ' . ($diff->m == 1 ? 'mês' : 'meses');
                    }
                } else {
                    $pet->idade_formatada = $diff->m . ' ' . ($diff->m == 1 ? 'mês' : 'meses');
                }
            } else {
                $pet->idade_formatada = 'Idade desconhecida';
            }
            
            $pet->foto_url = $pet->foto ? asset('storage/' . $pet->foto) : null;
            
            return response()->json($pet);
        } catch (Exception $e) {
            Log::error('Erro ao buscar pet ' . $id . ': ' . $e->getMessage());
            return response()->json(['error' => 'Pet não encontrado'], 404);
        }
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'cliente_id' => 'required|exists:clientes,id',
            'nome' => 'required|string|max:255',
            'especie' => 'required|string|max:50',
            'raca' => 'nullable|string|max:100',
            'sexo' => 'required|in:M,F',
            'data_nascimento' => 'nullable|date|before_or_equal:today',
            'peso' => 'nullable|numeric|min:0|max:999.99',
            'castrado' => 'boolean',
            'pelagem' => 'nullable|string|max:100',
            'microchip' => 'nullable|string|max:50',
            'alergias' => 'nullable|string',
            'observacoes' => 'nullable|string',
            'ativo' => 'boolean',
            'foto' => 'nullable|image|max:2048'
        ]);

        try {
            DB::beginTransaction();
            
            // CRITICAL: Garantir que data_nascimento seja salva
            $dados = $validated;
            $dados['castrado'] = $request->input('castrado', 0);
            $dados['ativo'] = $request->input('ativo', 1);
            
            // Log para debug
            Log::info('Dados do pet a salvar:', $dados);
            
            // Processar foto se enviada
            if ($request->hasFile('foto')) {
                $path = $request->file('foto')->store('pets', 'public');
                $dados['foto'] = $path;
            }

            $pet = Pet::create($dados);
            
            // Recarregar com relacionamentos
            $pet->load('cliente');
            
            DB::commit();
            
            return response()->json([
                'success' => true,
                'message' => 'Pet cadastrado com sucesso!',
                'pet' => $pet
            ], 201);
            
        } catch (Exception $e) {
            DB::rollback();
            Log::error('Erro ao criar pet: ' . $e->getMessage());
            return response()->json([
                'error' => 'Erro ao cadastrar pet',
                'message' => $e->getMessage()
            ], 500);
        }
    }

    public function update(Request $request, $id)
    {
        $pet = Pet::findOrFail($id);
        
        $validated = $request->validate([
            'cliente_id' => 'required|exists:clientes,id',
            'nome' => 'required|string|max:255',
            'especie' => 'required|string|max:50',
            'raca' => 'nullable|string|max:100',
            'sexo' => 'required|in:M,F',
            'data_nascimento' => 'nullable|date|before_or_equal:today',
            'peso' => 'nullable|numeric|min:0|max:999.99',
            'castrado' => 'boolean',
            'pelagem' => 'nullable|string|max:100',
            'microchip' => 'nullable|string|max:50',
            'alergias' => 'nullable|string',
            'observacoes' => 'nullable|string',
            'ativo' => 'boolean',
            'foto' => 'nullable|image|max:2048'
        ]);

        try {
            DB::beginTransaction();
            
            $dados = $validated;
            $dados['castrado'] = $request->input('castrado', 0);
            $dados['ativo'] = $request->input('ativo', 1);
            
            // CRITICAL: Log para verificar data_nascimento
            Log::info('Atualizando pet ' . $id . ' com dados:', $dados);
            
            // Processar foto se enviada
            if ($request->hasFile('foto')) {
                // Deletar foto antiga se existir
                if ($pet->foto && \Storage::disk('public')->exists($pet->foto)) {
                    \Storage::disk('public')->delete($pet->foto);
                }
                $path = $request->file('foto')->store('pets', 'public');
                $dados['foto'] = $path;
            }

            $pet->update($dados);
            $pet->load('cliente');
            
            DB::commit();
            
            return response()->json([
                'success' => true,
                'message' => 'Pet atualizado com sucesso!',
                'pet' => $pet
            ]);
            
        } catch (Exception $e) {
            DB::rollback();
            Log::error('Erro ao atualizar pet: ' . $e->getMessage());
            return response()->json([
                'error' => 'Erro ao atualizar pet',
                'message' => $e->getMessage()
            ], 500);
        }
    }

    public function historicoVacinacao($id)
    {
        try {
            $vacinacoes = Vacinacao::where('pet_id', $id)
                ->join('vacinas', 'vacinacoes.vacina_id', '=', 'vacinas.id')
                ->leftJoin('funcionarios', 'vacinacoes.veterinario_id', '=', 'funcionarios.id')
                ->select(
                    'vacinacoes.*',
                    'vacinas.nome as vacina',
                    'vacinas.tipo as tipo_vacina',
                    'funcionarios.nome as veterinario'
                )
                ->orderBy('vacinacoes.data_aplicacao', 'desc')
                ->get()
                ->map(function ($vacinacao) {
                    $vacinacao->data_aplicacao = date('d/m/Y', strtotime($vacinacao->data_aplicacao));
                    if ($vacinacao->proxima_dose) {
                        $vacinacao->proxima_dose = date('d/m/Y', strtotime($vacinacao->proxima_dose));
                        
                        // Calcular dias até próxima dose
                        $proxima = new \DateTime($vacinacao->getOriginal('proxima_dose'));
                        $hoje = new \DateTime();
                        $diff = $hoje->diff($proxima);
                        $vacinacao->dias_proxima = $diff->invert ? -$diff->days : $diff->days;
                    }
                    
                    return $vacinacao;
                });

            return response()->json([
                'success' => true,
                'vacinacoes' => $vacinacoes,
                'total' => $vacinacoes->count()
            ]);
        } catch (Exception $e) {
            Log::error('Erro ao buscar vacinações: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'error' => 'Erro ao buscar histórico de vacinação'
            ], 500);
        }
    }

    public function getHistoricoMedico($id)
    {
        try {
            $pet = Pet::findOrFail($id);
            
            // Buscar consultas
            $consultas = Consulta::where('pet_id', $id)
                ->leftJoin('funcionarios', 'consultas.veterinario_id', '=', 'funcionarios.id')
                ->select(
                    'consultas.data_consulta',
                    'consultas.anamnese',
                    'consultas.diagnostico',
                    'consultas.tratamento',
                    'funcionarios.nome as veterinario',
                    DB::raw("'consulta' as tipo")
                )
                ->get();
            
            // Buscar vacinações
            $vacinacoes = Vacinacao::where('pet_id', $id)
                ->join('vacinas', 'vacinacoes.vacina_id', '=', 'vacinas.id')
                ->leftJoin('funcionarios', 'vacinacoes.veterinario_id', '=', 'funcionarios.id')
                ->select(
                    'vacinacoes.data_aplicacao as data_consulta',
                    'vacinas.nome as descricao',
                    'vacinacoes.dose',
                    'funcionarios.nome as veterinario',
                    DB::raw("'vacinacao' as tipo")
                )
                ->get();
            
            // Unir e ordenar
            $historico = $consultas->concat($vacinacoes)
                ->sortByDesc('data_consulta')
                ->values()
                ->map(function ($item) {
                    $item->data = date('d/m/Y', strtotime($item->data_consulta));
                    
                    if ($item->tipo === 'consulta') {
                        $item->descricao = 'Consulta Veterinária';
                    } elseif ($item->tipo === 'vacinacao') {
                        $item->descricao = 'Vacinação: ' . $item->descricao;
                    }
                    
                    return $item;
                });

            return response()->json([
                'success' => true,
                'historico' => $historico
            ]);
            
        } catch (Exception $e) {
            Log::error('Erro ao buscar histórico médico: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'error' => 'Erro ao buscar histórico médico',
                'message' => $e->getMessage()
            ], 500);
        }
    }

public function registrarVacinacao(Request $request, $id)    {        $validated = $request->validate([            "vacina_id" => "required|exists:vacinas,id",            "data_aplicacao" => "required|date",            "dose" => "nullable|string|max:50",            "lote" => "nullable|string|max:50",            "veterinario_id" => "nullable|exists:funcionarios,id",            "proxima_dose" => "nullable|date|after:data_aplicacao",            "observacoes" => "nullable|string"        ]);        try {            $pet = Pet::findOrFail($id);                        $dados = [                "pet_id" => $id,                "vacina_id" => $validated["vacina_id"],                "veterinario_id" => $validated["veterinario_id"] ?? auth()->id() ?? 1,                "data_aplicacao" => $validated["data_aplicacao"]            ];                        if (isset($validated["dose"])) {                $dados["dose"] = $validated["dose"];            }                        if (isset($validated["lote"])) {                $dados["lote"] = $validated["lote"];            }                        if (isset($validated["proxima_dose"])) {                $dados["proxima_dose"] = $validated["proxima_dose"];            }                        if (isset($validated["observacoes"])) {                $dados["observacoes"] = $validated["observacoes"];            }                        $vacinacao = Vacinacao::create($dados);            return response()->json([                "success" => true,                "message" => "Vacinação registrada com sucesso!",                "vacinacao" => $vacinacao            ], 201);                    } catch (Exception $e) {            Log::error("Erro ao registrar vacinação: " . $e->getMessage());            return response()->json([                "error" => "Erro ao registrar vacinação",                "message" => $e->getMessage()            ], 500);        }    }

    public function getAnamnese($id)
    {
        try {
            $consultas = Consulta::where('pet_id', $id)
                ->leftJoin('funcionarios', 'consultas.veterinario_id', '=', 'funcionarios.id')
                ->select(
                    'consultas.*',
                    'funcionarios.nome as veterinario_nome'
                )
                ->orderBy('data_consulta', 'desc')
                ->get()
                ->map(function ($consulta) {
                    $consulta->data = date('d/m/Y', strtotime($consulta->data_consulta));
                    if ($consulta->retorno_em) {
                        $retorno = new \DateTime($consulta->data_consulta);
                        $retorno->modify('+' . $consulta->retorno_em . ' days');
                        $consulta->retorno = $retorno->format('d/m/Y');
                    }
                    return $consulta;
                });

            return response()->json([
                'success' => true,
                'historico_medico' => $consultas
            ]);
            
        } catch (Exception $e) {
            Log::error('Erro ao buscar anamnese: ' . $e->getMessage());
            return response()->json([
                'success' => false,
                'error' => 'Erro ao buscar anamnese'
            ], 500);
        }
    }

    public function saveAnamnese(Request $request, $id)
    {
        $validated = $request->validate([
            'data_consulta' => 'required|date',
            'veterinario_id' => 'nullable|exists:funcionarios,id',
            'queixa_principal' => 'nullable|string',
            'anamnese' => 'nullable|string',
            'exame_fisico' => 'nullable|string',
            'peso_consulta' => 'nullable|numeric',
            'temperatura' => 'nullable|numeric',
            'diagnostico' => 'nullable|string',
            'tratamento' => 'nullable|string',
            'prescricao' => 'nullable|string',
            'retorno' => 'nullable|date'
        ]);

        try {
            DB::beginTransaction();
            
            $pet = Pet::findOrFail($id);
            
            // Calcular dias de retorno
            $retorno_em = null;
            if ($validated['retorno'] ?? null) {
                $dataConsulta = new \DateTime($validated['data_consulta']);
                $dataRetorno = new \DateTime($validated['retorno']);
                $diff = $dataConsulta->diff($dataRetorno);
                $retorno_em = $diff->days;
            }
            
            $consulta = Consulta::create([
                'pet_id' => $id,
                'cliente_id' => $pet->cliente_id,
                'veterinario_id' => $validated['veterinario_id'] ?? auth()->id() ?? 1,
                'data_consulta' => $validated['data_consulta'] . ' ' . date('H:i:s'),
                'peso_atual' => $validated['peso_consulta'] ?? null,
                'temperatura' => $validated['temperatura'] ?? null,
                'anamnese' => $validated['anamnese'] ?? $validated['queixa_principal'] ?? null,
                'exame_fisico' => $validated['exame_fisico'] ?? null,
                'diagnostico' => $validated['diagnostico'] ?? null,
                'tratamento' => $validated['tratamento'] ?? null,
                'prescricao' => $validated['prescricao'] ?? null,
                'retorno_em' => $retorno_em
            ]);
            
            // Atualizar peso do pet se informado
            if ($validated['peso_consulta'] ?? null) {
                $pet->update(['peso' => $validated['peso_consulta']]);
            }
            
            DB::commit();
            
            return response()->json([
                'success' => true,
                'message' => 'Consulta registrada com sucesso!',
                'consulta' => $consulta
            ], 201);
            
        } catch (Exception $e) {
            DB::rollback();
            Log::error('Erro ao salvar anamnese: ' . $e->getMessage());
            return response()->json([
                'error' => 'Erro ao salvar anamnese',
                'message' => $e->getMessage()
            ], 500);
        }
    }

    public function estatisticas($id)
    {
        try {
            $pet = Pet::findOrFail($id);
            
            $stats = [
                'total_consultas' => Consulta::where('pet_id', $id)->count(),
                'total_vacinas' => Vacinacao::where('pet_id', $id)->count(),
                'gasto_total' => 0, // Implementar quando houver módulo financeiro integrado
                'proxima_vacina' => null
            ];
            
            // Buscar próxima vacina
            $proximaVacina = Vacinacao::where('pet_id', $id)
                ->whereNotNull('proxima_dose')
                ->where('proxima_dose', '>', now())
                ->orderBy('proxima_dose')
                ->first();
                
            if ($proximaVacina) {
                $dias = now()->diffInDays($proximaVacina->proxima_dose);
                $stats['proxima_vacina'] = [
                    'data' => $proximaVacina->proxima_dose->format('d/m/Y'),
                    'dias' => $dias
                ];
            }
            
            return response()->json($stats);
            
        } catch (Exception $e) {
            Log::error('Erro ao buscar estatísticas: ' . $e->getMessage());
            return response()->json(['error' => 'Erro ao buscar estatísticas'], 500);
        }
    }
    
    private function formatarEndereco($cliente)
    {
        $partes = [];
        if ($cliente->endereco) $partes[] = $cliente->endereco;
        if ($cliente->numero) $partes[] = $cliente->numero;
        if ($cliente->bairro) $partes[] = $cliente->bairro;
        if ($cliente->cidade) $partes[] = $cliente->cidade;
        if ($cliente->estado) $partes[] = $cliente->estado;
        
        return implode(', ', $partes);
    }
}
