<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Cliente;
use App\Models\Pet;
use App\Models\Agendamento;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Support\Facades\Log;
use Exception;

class ClienteController extends Controller
{
    public function index(Request $request)
    {
        try {
            $query = Cliente::withCount('pets');
            
            if ($request->has('ativo') && $request->ativo !== '') {
                $query->where('ativo', $request->input('ativo'));
            }

            return response()->json($query->get());
        } catch (Exception $e) {
            Log::error("Erro ao listar clientes: " . $e->getMessage());
            return response()->json(['error' => 'Erro ao buscar clientes'], 500);
        }
    }

    public function store(Request $request)
    {
        $validatedData = $request->validate([
            'nome' => 'required|string|max:255',
            'cpf' => 'required|string|unique:clientes,cpf',
            'email' => 'nullable|email|max:255',
            'telefone' => 'required|string|max:20',
            'observacoes' => 'nullable|string',
            'ativo' => 'required|boolean',
        ]);

        try {
            $cliente = Cliente::create($validatedData);
            return response()->json($cliente, 201);
        } catch (Exception $e) {
            Log::error("Erro ao criar cliente: " . $e->getMessage());
            return response()->json(['error' => 'Erro ao salvar o cliente'], 500);
        }
    }

    public function show($id)
    {
        return Cliente::findOrFail($id);
    }

    public function update(Request $request, $id)
    {
        $cliente = Cliente::findOrFail($id);
        $validatedData = $request->validate([
            'nome' => 'required|string|max:255',
            'cpf' => ['required', 'string', Rule::unique('clientes')->ignore($id)],
            'email' => 'nullable|email|max:255',
            'telefone' => 'required|string|max:20',
            'observacoes' => 'nullable|string',
            'ativo' => 'required|boolean',
        ]);

        $cliente->update($validatedData);
        return response()->json($cliente);
    }
}
